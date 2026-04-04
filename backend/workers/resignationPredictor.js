const { Worker } = require('bullmq');
const { Recommendation, User, Performance, Attendance, Task, Meeting } = require('../models');
const { generateEmbedding, cosineSimilarity } = require('../ai/embeddings');
const { chromaClient } = require('../config/chroma');
const { recommendationReasoningChain } = require('../ai/langchain');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Risk factor weights
const RISK_FACTORS = {
  attendanceDecline: { weight: 0.25, threshold: 0.8 },
  performanceDrop: { weight: 0.30, threshold: 0.7 },
  meetingParticipation: { weight: 0.15, threshold: 0.6 },
  taskCompletion: { weight: 0.20, threshold: 0.75 },
  tenure: { weight: 0.10, threshold: 0.5 }
};

/**
 * Calculate resignation risk score for an employee
 * @param {string} userId - User ID
 * @returns {Object} - Risk score and factors
 */
async function calculateResignationRisk(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const performance = await Performance.findOne({ user: userId });
    const attendance = await Attendance.find({ user: userId })
      .sort({ date: -1 })
      .limit(30);

    const factors = [];
    let totalRisk = 0;
    let totalWeight = 0;

    // Factor 1: Attendance decline
    const attendanceScore = await calculateAttendanceRisk(attendance);
    if (attendanceScore.value < RISK_FACTORS.attendanceDecline.threshold) {
      factors.push({
        factor: 'Attendance Decline',
        weight: RISK_FACTORS.attendanceDecline.weight,
        value: attendanceScore.value,
        details: attendanceScore.details
      });
      totalRisk += (1 - attendanceScore.value) * RISK_FACTORS.attendanceDecline.weight;
      totalWeight += RISK_FACTORS.attendanceDecline.weight;
    }

    // Factor 2: Performance drop
    const performanceScore = calculatePerformanceRisk(performance);
    if (performanceScore.value < RISK_FACTORS.performanceDrop.threshold) {
      factors.push({
        factor: 'Performance Drop',
        weight: RISK_FACTORS.performanceDrop.weight,
        value: performanceScore.value,
        details: performanceScore.details
      });
      totalRisk += (1 - performanceScore.value) * RISK_FACTORS.performanceDrop.weight;
      totalWeight += RISK_FACTORS.performanceDrop.weight;
    }

    // Factor 3: Meeting participation decline
    const meetingScore = await calculateMeetingRisk(userId, performance);
    if (meetingScore.value < RISK_FACTORS.meetingParticipation.threshold) {
      factors.push({
        factor: 'Low Meeting Participation',
        weight: RISK_FACTORS.meetingParticipation.weight,
        value: meetingScore.value,
        details: meetingScore.details
      });
      totalRisk += (1 - meetingScore.value) * RISK_FACTORS.meetingParticipation.weight;
      totalWeight += RISK_FACTORS.meetingParticipation.weight;
    }

    // Factor 4: Task completion rate
    const taskScore = await calculateTaskRisk(userId);
    if (taskScore.value < RISK_FACTORS.taskCompletion.threshold) {
      factors.push({
        factor: 'Declining Task Completion',
        weight: RISK_FACTORS.taskCompletion.weight,
        value: taskScore.value,
        details: taskScore.details
      });
      totalRisk += (1 - taskScore.value) * RISK_FACTORS.taskCompletion.weight;
      totalWeight += RISK_FACTORS.taskCompletion.weight;
    }

    // Factor 5: Tenure risk (new employees more likely to leave)
    const tenureScore = calculateTenureRisk(user);
    if (tenureScore.value < RISK_FACTORS.tenure.threshold) {
      factors.push({
        factor: 'Early Tenure Risk',
        weight: RISK_FACTORS.tenure.weight,
        value: tenureScore.value,
        details: tenureScore.details
      });
      totalRisk += (1 - tenureScore.value) * RISK_FACTORS.tenure.weight;
      totalWeight += RISK_FACTORS.tenure.weight;
    }

    // Normalize total risk
    const normalizedRisk = totalWeight > 0 ? totalRisk / totalWeight : 0;

    // Calculate final score (0-1, higher = more likely to resign)
    const resignationRiskScore = Math.min(normalizedRisk, 1);

    return {
      score: resignationRiskScore,
      factors,
      riskLevel: getRiskLevel(resignationRiskScore),
      calculatedAt: new Date()
    };
  } catch (error) {
    logger.error(`Error calculating resignation risk for ${userId}: ${error.message}`);
    throw error;
  }
}

/**
 * Calculate attendance-based risk
 */
async function calculateAttendanceRisk(attendanceRecords) {
  if (!attendanceRecords || attendanceRecords.length < 7) {
    return { value: 0.5, details: 'Insufficient data' };
  }

  // Calculate recent vs older attendance rate
  const recent = attendanceRecords.slice(0, 7);
  const older = attendanceRecords.slice(7, 14);

  const recentRate = recent.filter(a => a.status === 'present').length / recent.length;
  const olderRate = older.filter(a => a.status === 'present').length / older.length;

  const decline = olderRate > 0 ? (olderRate - recentRate) / olderRate : 0;

  // Late arrivals trend
  const lateCount = recent.filter(a => a.isLate).length;
  const lateRate = lateCount / recent.length;

  const value = Math.max(0, 1 - decline - (lateRate * 0.5));

  return {
    value,
    details: `Recent attendance: ${(recentRate * 100).toFixed(1)}%, ` +
             `Late arrivals: ${(lateRate * 100).toFixed(1)}%`
  };
}

/**
 * Calculate performance-based risk
 */
function calculatePerformanceRisk(performance) {
  if (!performance || !performance.pulseScores || performance.pulseScores.length < 4) {
    return { value: 0.5, details: 'Insufficient performance data' };
  }

  // Get recent pulse scores
  const recentScores = performance.pulseScores
    .sort((a, b) => new Date(b.week) - new Date(a.week))
    .slice(0, 4);

  const scores = recentScores.map(p => p.score);
  const avgRecent = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Check for declining trend
  const declining = scores[0] < scores[scores.length - 1];
  const drop = Math.max(0, scores[scores.length - 1] - scores[0]);

  // Calculate task completion trend
  const taskRate = performance.taskStats?.completionRate || 0;

  const value = Math.max(0, (avgRecent / 5) * taskRate - (declining ? drop * 0.1 : 0));

  return {
    value,
    details: `Recent avg score: ${avgRecent.toFixed(2)}/5, ` +
             `Task completion: ${(taskRate * 100).toFixed(1)}%, ` +
             `Trend: ${declining ? 'declining' : 'stable'}`
  };
}

/**
 * Calculate meeting participation risk
 */
async function calculateMeetingRisk(userId, performance) {
  const meetingStats = performance?.meetingStats;

  if (!meetingStats || meetingStats.totalMeetings < 3) {
    return { value: 0.5, details: 'Insufficient meeting data' };
  }

  const avgContribution = meetingStats.avgContributionScore || 0;
  const value = avgContribution / 10;

  return {
    value,
    details: `Average contribution score: ${avgContribution.toFixed(1)}/10, ` +
             `Total meetings: ${meetingStats.totalMeetings}`
  };
}

/**
 * Calculate task-based risk
 */
async function calculateTaskRisk(userId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const tasks = await Task.find({
    assignees: userId,
    updatedAt: { $gte: thirtyDaysAgo }
  });

  if (tasks.length === 0) {
    return { value: 0.5, details: 'No recent tasks' };
  }

  const completed = tasks.filter(t => t.status === 'done').length;
  const overdue = tasks.filter(t =>
    t.status !== 'done' && new Date(t.dueDate) < new Date()
  ).length;

  const completionRate = completed / tasks.length;
  const overdueRate = overdue / tasks.length;

  const value = Math.max(0, completionRate - (overdueRate * 0.5));

  return {
    value,
    details: `Completion rate: ${(completionRate * 100).toFixed(1)}%, ` +
             `Overdue tasks: ${overdue}`
  };
}

/**
 * Calculate tenure-based risk
 */
function calculateTenureRisk(user) {
  const joinedAt = new Date(user.joinedAt);
  const now = new Date();
  const monthsEmployed = (now - joinedAt) / (1000 * 60 * 60 * 24 * 30);

  // Higher risk in first 6 months and after 3 years
  let risk = 0.5;
  if (monthsEmployed < 6) {
    risk = 0.7 - (monthsEmployed / 6) * 0.2;
  } else if (monthsEmployed > 36) {
    risk = 0.4 + ((monthsEmployed - 36) / 12) * 0.1;
  } else {
    risk = 0.3;
  }

  return {
    value: 1 - Math.min(risk, 1),
    details: `Tenure: ${monthsEmployed.toFixed(1)} months`
  };
}

/**
 * Get risk level label
 */
function getRiskLevel(score) {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

/**
 * Find similar employees who have resigned
 */
async function findSimilarResignedEmployees(userId, limit = 3) {
  try {
    const user = await User.findById(userId);
    if (!user) return [];

    // Get user's performance embedding
    const performance = await Performance.findOne({ user: userId });
    if (!performance) return [];

    const userEmbedding = await generateEmbedding(
      `${user.role} ${performance.skills?.join(' ') || ''} ${performance.notes || ''}`
    );

    // Query performance collection
    const collection = await chromaClient.getCollection({ name: 'employee_performance' });

    const results = await collection.query({
      queryEmbeddings: [userEmbedding],
      nResults: limit * 2,
      where: { isActive: false }
    });

    if (!results.documents[0]) return [];

    const similar = [];
    for (let i = 0; i < results.documents[0].length; i++) {
      const meta = results.metadatas[0][i];
      if (meta.userId !== userId) {
        similar.push({
          userId: meta.userId,
          role: meta.role,
          similarity: 1 - (results.distances[0][i] / 2),
          outcome: 'resigned'
        });
      }
    }

    return similar.slice(0, limit);
  } catch (error) {
    logger.error(`Error finding similar employees: ${error.message}`);
    return [];
  }
}

/**
 * Process resignation prediction job
 */
async function processResignationPrediction(job) {
  const { userId, triggerType } = job.data;

  logger.info(`Processing resignation prediction for ${userId}, trigger: ${triggerType}`);

  try {
    // Calculate risk
    const riskResult = await calculateResignationRisk(userId);

    // Find similar employees
    const similarEmployees = await findSimilarResignedEmployees(userId);

    // Get existing recommendation
    let recommendation = await Recommendation.findOne({
      user: userId,
      status: { $in: ['pending', 'acknowledged'] }
    });

    // Generate reasoning using LLM
    const performance = await Performance.findOne({ user: userId });
    const reasoning = await recommendationReasoningChain(
      {
        currentScore: performance?.pulseScores?.slice(-1)[0]?.score * 20 || 50,
        trend: riskResult.factors.some(f => f.value < 0.5) ? 'declining' : 'neutral',
        consecutiveNeutralOrDecliningDays: riskResult.factors.length,
        taskStats: performance?.taskStats,
        meetingStats: performance?.meetingStats,
        attendanceStats: performance?.attendanceStats
      },
      riskResult.score > 0.6 ? 'at_risk' : 'monitor',
      riskResult.score
    );

    const recData = {
      user: userId,
      category: riskResult.score > 0.6 ? 'at_risk' : (riskResult.score > 0.4 ? 'monitor' : 'promote'),
      score: Math.round((1 - riskResult.score) * 100),
      trend: riskResult.factors.some(f => f.value < 0.5) ? 'declining' : 'neutral',
      reasoning: reasoning || `Risk analysis indicates ${riskResult.riskLevel} resignation probability ` +
                  `based on ${riskResult.factors.length} contributing factors.`,
      resignationRiskScore: riskResult.score,
      riskFactors: riskResult.factors,
      similarEmployees: similarEmployees.map(s => ({
        employee: s.userId,
        similarityScore: parseFloat(s.similarity),
        outcome: s.outcome
      })),
      status: 'pending'
    };

    if (recommendation) {
      // Update existing
      Object.assign(recommendation, recData);
      await recommendation.save();
    } else {
      // Create new
      recommendation = await Recommendation.create(recData);
    }

    logger.info(`Resignation prediction complete for ${userId}: risk=${riskResult.score.toFixed(3)}`);

    return {
      userId,
      riskScore: riskResult.score,
      riskLevel: riskResult.riskLevel,
      recommendationId: recommendation._id
    };
  } catch (error) {
    logger.error(`Resignation prediction failed for ${userId}: ${error.message}`);
    throw error;
  }
}

const { getRedisConnection } = require('../config/redisConnection');

// Create worker
const worker = new Worker('resignation-prediction', processResignationPrediction, {
  connection: getRedisConnection(),
  concurrency: 2
});

worker.on('completed', (job) => {
  logger.info(`Resignation prediction job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  logger.error(`Resignation prediction job ${job.id} failed: ${err.message}`);
});

module.exports = worker;