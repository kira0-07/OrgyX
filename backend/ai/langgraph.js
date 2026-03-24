const { StateGraph, END } = require('@langchain/langgraph');
const { Recommendation, Performance, User, Meeting, Attendance } = require('../models');
const { chromaClient } = require('../config/chroma');
const { generateEmbedding, cosineSimilarity } = require('./embeddings');
const { recommendationReasoningChain } = require('./langchain');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

const recommendationState = {
  userId: null,
  user: null,
  performanceData: null,
  attendanceData: null,
  taskData: null,
  pulseData: null,
  meetingData: null,
  similarEmployees: null,
  riskScore: null,
  category: null,
  reasoning: null,
  promotionPassOverCount: null
};

async function fetchData(state) {
  logger.info(`Fetching data for user ${state.userId}`);

  try {
    const user = await User.findById(state.userId);
    if (!user) throw new Error('User not found');

    const performance = await Performance.findOne({ user: state.userId });
    if (!performance) throw new Error('Performance record not found');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const attendanceData = await Attendance.find({
      user: state.userId,
      date: { $gte: thirtyDaysAgo }
    }).sort({ date: -1 });

    const meetingData = await Meeting.find({
      'attendees.user': state.userId,
      scheduledDate: { $gte: thirtyDaysAgo },
      status: 'ready'
    }).sort({ scheduledDate: -1 });

    const Task = require('../models/Task');
    const taskData = await Task.find({
      assignee: state.userId,
      createdAt: { $gte: thirtyDaysAgo }
    });

    const previousRecommendations = await Recommendation.find({
      user: state.userId,
      category: 'promote'
    }).sort({ createdAt: -1 }).limit(10);

    const promotionPassOverCount = previousRecommendations.filter(r => r.status === 'dismissed').length;
    const consecutivePromote = previousRecommendations.filter(r => r.status === 'pending').length;

    return {
      ...state,
      user,
      performanceData: performance,
      attendanceData,
      meetingData,
      taskData,
      promotionPassOverCount,
      consecutivePromoteRecommendations: consecutivePromote
    };
  } catch (error) {
    logger.error(`Error in fetchData: ${error.message}`);
    throw error;
  }
}

async function queryChroma(state) {
  logger.info(`Querying ChromaDB for user ${state.userId}`);

  try {
    const employeeSummary = `
      Role: ${state.user.role}
      Performance Score: ${state.performanceData.currentScore}
      Trend: ${state.performanceData.trend}
      Task Completion Rate: ${state.performanceData.taskStats?.completionRate || 0}
      Meeting Contribution: ${state.performanceData.meetingStats?.avgContributionScore || 0}
      Attendance Rate: ${state.performanceData.attendanceStats?.attendanceRate || 0}
    `;

    const embedding = await generateEmbedding(employeeSummary);

    try {
      const collection = await chromaClient.getCollection({ name: 'employee_performance' });

      const results = await collection.query({
        queryEmbeddings: [embedding],
        nResults: 5,
        where: { userId: { $ne: state.userId } }
      });

      const similarEmployees = results.documents[0]?.map((doc, idx) => ({
        metadata: results.metadatas[0][idx],
        similarity: results.distances ? 1 - results.distances[0][idx] : 0.5
      })) || [];

      return { ...state, similarEmployees };
    } catch (chromaError) {
      logger.warn(`ChromaDB query failed: ${chromaError.message}`);
      return { ...state, similarEmployees: [] };
    }
  } catch (error) {
    logger.error(`Error in queryChroma: ${error.message}`);
    return { ...state, similarEmployees: [] };
  }
}

async function calculateRisk(state) {
  logger.info(`Calculating risk for user ${state.userId}`);

  try {
    const performance = state.performanceData;
    const similarEmployees = state.similarEmployees || [];

    const pulseScores = performance.pulseScores || [];
    const avgPulse = pulseScores.length > 0
      ? pulseScores.slice(0, 8).reduce((sum, p) => sum + p.score, 0) / Math.min(pulseScores.length, 8)
      : 3;

    const pulseComponent = 1 - ((avgPulse - 1) / 4);

    let performanceComponent = 0.5;
    if (performance.trend === 'declining') performanceComponent = 1.0;
    else if (performance.trend === 'improving') performanceComponent = 0.0;

    const promotionComponent = Math.min(state.promotionPassOverCount / 4, 1.0);

    const tenureMonths = Math.floor((Date.now() - state.user.joinedAt) / (1000 * 60 * 60 * 24 * 30));
    let tenureComponent = 0.2;
    if (tenureMonths < 6) tenureComponent = 0.8;
    else if (tenureMonths < 18) tenureComponent = 0.4;
    else if (tenureMonths >= 36) tenureComponent = 0.1;

    const meetingComponent = 1 - ((performance.meetingStats?.avgContributionScore || 5) / 10);

    let similarComponent = 0;
    if (similarEmployees.length > 0) {
      const atRiskSimilar = similarEmployees.filter(e =>
        e.metadata?.trend === 'declining' || e.metadata?.score < 60
      );
      if (atRiskSimilar.length > 0) {
        similarComponent = atRiskSimilar[0].similarity * 0.05;
      }
    }

    const riskScore = (
      pulseComponent * 0.30 +
      performanceComponent * 0.20 +
      promotionComponent * 0.25 +
      tenureComponent * 0.10 +
      meetingComponent * 0.10 +
      similarComponent
    );

    return {
      ...state,
      riskScore: Math.min(Math.max(riskScore, 0), 1)
    };
  } catch (error) {
    logger.error(`Error in calculateRisk: ${error.message}`);
    return { ...state, riskScore: 0.5 };
  }
}

async function classifyEmployee(state) {
  logger.info(`Classifying user ${state.userId}`);

  const { currentScore, trend, consecutiveNeutralOrDecliningDays } = state.performanceData;
  const riskScore = state.riskScore;

  let category = 'monitor';

  if (currentScore >= 80 && trend === 'improving') {
    category = 'promote';
  } else if (currentScore >= 80 && trend === 'neutral') {
    category = 'monitor';
  } else if (currentScore >= 60 && currentScore < 80) {
    category = 'monitor';
  } else if (currentScore < 60) {
    category = 'at_risk';
  }

  if (consecutiveNeutralOrDecliningDays >= 14) category = 'at_risk';
  if (riskScore >= 0.65) category = 'at_risk';

  return { ...state, category };
}

async function generateReasoning(state) {
  logger.info(`Generating reasoning for user ${state.userId}`);

  try {
    const reasoning = await recommendationReasoningChain(
      state.performanceData,
      state.category,
      state.riskScore
    );
    return { ...state, reasoning };
  } catch (error) {
    logger.error(`Error generating reasoning: ${error.message}`);
    return {
      ...state,
      reasoning: `Employee categorized as ${state.category} based on performance analysis.`
    };
  }
}

async function checkPromotion(state) {
  logger.info(`Checking promotion history for user ${state.userId}`);

  if (state.category === 'promote') {
    const promotionHistory = await Recommendation.find({
      user: state.userId,
      category: 'promote',
      status: 'acknowledged'
    }).countDocuments();

    return { ...state, previousPromotions: promotionHistory };
  }

  return state;
}

async function saveResult(state) {
  logger.info(`Saving recommendation for user ${state.userId}`);

  try {
    const riskFactors = [
      { factor: 'Pulse Score Trend', weight: 0.30, value: state.riskScore * 0.30 },
      { factor: 'Performance Trend', weight: 0.20, value: state.performanceData.trend === 'declining' ? 1 : 0 },
      { factor: 'Promotion Pass-Over', weight: 0.25, value: Math.min(state.promotionPassOverCount / 4, 1) },
      { factor: 'Tenure', weight: 0.10, value: state.riskScore * 0.10 },
      { factor: 'Meeting Engagement', weight: 0.10, value: 1 - (state.performanceData.meetingStats?.avgContributionScore / 10 || 0.5) },
      { factor: 'Similar Employee Patterns', weight: 0.05, value: state.similarEmployees?.length > 0 ? state.similarEmployees[0].similarity : 0 }
    ];

    const actionItems = [];
    if (state.category === 'at_risk') {
      actionItems.push({
        action: 'Schedule 1:1 meeting to discuss concerns',
        priority: 'high',
        deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        assignedTo: state.user.superior,
        status: 'pending'
      });
      actionItems.push({
        action: 'Review workload and identify blockers',
        priority: 'high',
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        assignedTo: state.user.superior,
        status: 'pending'
      });
    } else if (state.category === 'promote') {
      actionItems.push({
        action: 'Discuss promotion readiness and timeline',
        priority: 'medium',
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        assignedTo: state.user.superior,
        status: 'pending'
      });
    }

    const recommendation = new Recommendation({
      user: state.userId,
      category: state.category,
      score: state.performanceData.currentScore,
      trend: state.performanceData.trend,
      reasoning: state.reasoning,
      resignationRiskScore: state.riskScore,
      riskFactors,
      promotionPassOverCount: state.promotionPassOverCount,
      consecutivePromoteRecommendations: state.consecutivePromoteRecommendations,
      pulseScores: state.performanceData.pulseScores || [],
      actionItems,
      similarEmployees: state.similarEmployees?.map(e => ({
        employee: e.metadata?.userId,
        similarityScore: e.similarity,
        outcome: e.metadata?.outcome || 'active'
      })) || [],
      status: 'pending'
    });

    await recommendation.save();

    const { Notification } = require('../models');
    await Notification.create({
      user: state.user.superior,
      type: 'recommendation_ready',
      title: `New ${state.category} recommendation for ${state.user.firstName} ${state.user.lastName}`,
      message: state.reasoning.substring(0, 150) + (state.reasoning.length > 150 ? '...' : ''),
      priority: state.category === 'at_risk' ? 'high' : 'medium',
      link: `/recommendations`,
      entityType: 'recommendation',
      entityId: recommendation._id
    });

    logger.info(`Recommendation saved for user ${state.userId}: ${state.category}`);

    return { ...state, recommendationId: recommendation._id, saved: true };
  } catch (error) {
    logger.error(`Error saving recommendation: ${error.message}`);
    throw error;
  }
}

function buildRecommendationGraph() {
  const workflow = new StateGraph({
    channels: recommendationState
  });

  workflow.addNode('fetchData', fetchData);
  workflow.addNode('queryChroma', queryChroma);
  workflow.addNode('calculateRisk', calculateRisk);
  workflow.addNode('classifyEmployee', classifyEmployee);
  workflow.addNode('generateReasoning', generateReasoning);
  workflow.addNode('checkPromotion', checkPromotion);
  workflow.addNode('saveResult', saveResult);

  workflow.addEdge('fetchData', 'queryChroma');
  workflow.addEdge('queryChroma', 'calculateRisk');
  workflow.addEdge('calculateRisk', 'classifyEmployee');

  // ✅ FIX: Removed the conflicting addEdge('classifyEmployee', 'generateReasoning').
  // In LangGraph you cannot have BOTH a direct addEdge AND addConditionalEdges
  // from the same node — having both causes a graph compilation error at runtime
  // because there are two outgoing edges from 'classifyEmployee'.
  // The conditional edge alone handles all routing correctly:
  //   promote/at_risk → checkPromotion → generateReasoning
  //   monitor         → generateReasoning directly
  workflow.addConditionalEdges('classifyEmployee', (state) => {
    if (state.category === 'promote' || state.category === 'at_risk') {
      return 'checkPromotion';
    }
    return 'generateReasoning';
  });

  workflow.addEdge('checkPromotion', 'generateReasoning');
  workflow.addEdge('generateReasoning', 'saveResult');
  workflow.addEdge('saveResult', END);

  workflow.setEntryPoint('fetchData');

  return workflow.compile();
}

async function runRecommendationWorkflow(userId) {
  const graph = buildRecommendationGraph();

  const result = await graph.invoke({
    userId,
    performanceData: null,
    attendanceData: null,
    taskData: null,
    pulseData: null,
    meetingData: null,
    similarEmployees: null,
    riskScore: null,
    category: null,
    reasoning: null,
    promotionPassOverCount: null
  });

  return result;
}

module.exports = {
  runRecommendationWorkflow,
  buildRecommendationGraph
};