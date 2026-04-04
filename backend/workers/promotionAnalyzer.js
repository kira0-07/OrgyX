const { Worker } = require('bullmq');
const { User, Recommendation, Notification } = require('../models');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Analyze promotion patterns
async function analyzePromotions(job) {
  logger.info('Running promotion pattern analysis');

  try {
    // Find superiors with potential promotion blockers
    const superiors = await User.find({
      role: { $in: ['Engineering Manager', 'Director of Engineering', 'VP Engineering'] },
      isActive: true
    });

    const alerts = [];

    for (const superior of superiors) {
      // Get direct reports
      const directReports = await User.find({
        superior: superior._id,
        isActive: true
      });

      // Check each report for promotion recommendations
      let promoteCount = 0;
      const promotedReports = [];

      for (const report of directReports) {
        const recommendations = await Recommendation.find({
          user: report._id,
          category: 'promote'
        }).sort({ createdAt: -1 }).limit(3);

        if (recommendations.length >= 3) {
          const allPending = recommendations.every(r => r.status === 'pending');
          if (allPending) {
            promoteCount++;
            promotedReports.push(report);
          }
        }
      }

      // Alert if 2+ reports have 3+ consecutive promote recommendations
      if (promoteCount >= 2) {
        alerts.push({
          superior: superior._id,
          superiorName: `${superior.firstName} ${superior.lastName}`,
          reports: promotedReports.map(r => r.fullName)
        });

        // Create notification for superior's superior
        if (superior.superior) {
          await Notification.create({
            user: superior.superior,
            type: 'performance_alert',
            title: 'Promotion Pattern Alert',
            message: `${superior.firstName} ${superior.lastName} has ${promoteCount} reports with pending promotion recommendations`,
            priority: 'high',
            link: `/team/${superior._id}`
          });
        }
      }
    }

    logger.info(`Promotion analysis complete. ${alerts.length} alerts generated.`);

    return { alerts };
  } catch (error) {
    logger.error(`Promotion analysis error: ${error.message}`);
    throw error;
  }
}

const { getRedisConnection } = require('../config/redisConnection');

// Create worker
const worker = new Worker('promotion-analysis', analyzePromotions, {
  connection: getRedisConnection()
});

worker.on('completed', (job) => {
  logger.info(`Promotion analysis job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  logger.error(`Promotion analysis job ${job.id} failed: ${err.message}`);
});

module.exports = worker;
