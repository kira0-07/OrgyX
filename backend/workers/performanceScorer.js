const { Worker } = require('bullmq');
const { User, Performance, Task, Attendance, Meeting } = require('../models');
const { chromaClient } = require('../config/chroma');
const { generateEmbedding } = require('../ai/embeddings');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Calculate performance score
async function calculatePerformanceScore(userId) {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Get tasks from last 7 days
  const tasks = await Task.find({
    assignee: userId,
    createdAt: { $gte: sevenDaysAgo }
  });

  const completedTasks = tasks.filter(t => t.status === 'done');
  const overdueTasks = tasks.filter(t =>
    t.dueDate && t.dueDate < today && t.status !== 'done'
  );

  const taskCompletionRate = tasks.length > 0
    ? completedTasks.length / tasks.length
    : 1;

  const deadlineAdherenceRate = tasks.length > 0
    ? (tasks.length - overdueTasks.length) / tasks.length
    : 1;

  // Get attendance
  const attendance = await Attendance.find({
    user: userId,
    date: { $gte: sevenDaysAgo }
  });

  const avgHours = attendance.length > 0
    ? attendance.reduce((sum, a) => sum + (a.totalHours || 0), 0) / attendance.length
    : 8;

  const workingHoursNormalized = Math.min(avgHours / 8, 1);

  // Get meeting contributions
  const meetings = await Meeting.find({
    'attendees.user': userId,
    scheduledDate: { $gte: sevenDaysAgo },
    status: 'ready'
  });

  const userMeetings = meetings.map(m => {
    const attendee = m.attendees.find(a => a.user.toString() === userId);
    return attendee?.contributionScore || 5;
  });

  const avgMeetingContribution = userMeetings.length > 0
    ? userMeetings.reduce((a, b) => a + b, 0) / userMeetings.length
    : 5;

  const meetingContributionNormalized = avgMeetingContribution / 10;

  // Calculate weighted score
  const score = (
    taskCompletionRate * 0.40 +
    deadlineAdherenceRate * 0.30 +
    meetingContributionNormalized * 0.20 +
    workingHoursNormalized * 0.10
  ) * 100;

  return {
    score: Math.round(score),
    taskCompletionRate,
    deadlineAdherenceRate,
    meetingContribution: meetingContributionNormalized,
    workingHours: workingHoursNormalized,
    hoursLogged: avgHours
  };
}

// Update performance record
async function updatePerformance(job) {
  const { userId } = job.data;

  logger.info(`Updating performance for user ${userId}`);

  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    let performance = await Performance.findOne({ user: userId });
    if (!performance) {
      performance = new Performance({
        user: userId,
        currentScore: 70,
        trend: 'neutral',
        weeklyScores: []
      });
    }

    // Calculate new score
    const scoreData = await calculatePerformanceScore(userId);

    // Add to weekly scores
    performance.weeklyScores.push({
      date: new Date(),
      score: scoreData.score,
      taskCompletionRate: scoreData.taskCompletionRate,
      deadlineAdherenceRate: scoreData.deadlineAdherenceRate,
      meetingContribution: scoreData.meetingContribution,
      workingHours: scoreData.workingHours,
      hoursLogged: scoreData.hoursLogged
    });

    // Keep only last 90 days
    if (performance.weeklyScores.length > 90) {
      performance.weeklyScores = performance.weeklyScores.slice(-90);
    }

    // Update current score
    performance.currentScore = scoreData.score;

    // Calculate trend
    performance.calculateTrend();

    // Update stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const tasks = await Task.find({
      assignee: userId,
      createdAt: { $gte: thirtyDaysAgo }
    });

    performance.taskStats = {
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'done').length,
      overdueTasks: tasks.filter(t =>
        t.dueDate && t.dueDate < new Date() && t.status !== 'done'
      ).length,
      completionRate: tasks.length > 0
        ? tasks.filter(t => t.status === 'done').length / tasks.length
        : 0
    };

    performance.attendanceStats = {
      avgHoursPerDay: scoreData.hoursLogged,
      attendanceRate: scoreData.workingHours
    };

    performance.lastCalculatedAt = new Date();
    await performance.save();

    // Generate embedding for ChromaDB
    try {
      const summary = `
        Employee: ${user.firstName} ${user.lastName}
        Role: ${user.role}
        Score: ${scoreData.score}/100
        Trend: ${performance.trend}
        Task Completion: ${(scoreData.taskCompletionRate * 100).toFixed(1)}%
        Meeting Contribution: ${(scoreData.meetingContribution * 10).toFixed(1)}/10
        Consecutive Declining Days: ${performance.consecutiveNeutralOrDecliningDays}
      `;

      const embedding = await generateEmbedding(summary);

      const collection = await chromaClient.getCollection({ name: 'employee_performance' });
      await collection.add({
        ids: [`${userId}_${Date.now()}`],
        embeddings: [embedding],
        documents: [summary],
        metadatas: [{
          userId: userId.toString(),
          score: scoreData.score,
          trend: performance.trend,
          week: getCurrentWeek()
        }]
      });
    } catch (chromaError) {
      logger.warn(`Failed to store embedding: ${chromaError.message}`);
    }

    logger.info(`Performance updated for user ${userId}: ${scoreData.score}`);

  } catch (error) {
    logger.error(`Performance update error: ${error.message}`);
    throw error;
  }
}

function getCurrentWeek() {
  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(year, 0, 1);
  const diff = now - start;
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  const week = Math.floor(diff / oneWeek) + 1;
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

const { getRedisConnection } = require('../config/redisConnection');

// Create worker
const worker = new Worker('performance-scoring', updatePerformance, {
  connection: getRedisConnection(),
  concurrency: 5
});

worker.on('completed', (job) => {
  logger.info(`Performance job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  logger.error(`Performance job ${job.id} failed: ${err.message}`);
});

module.exports = worker;
