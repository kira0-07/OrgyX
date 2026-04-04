const { Worker } = require('bullmq');
const { runRecommendationWorkflow } = require('../ai/langgraph');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Generate recommendation
async function generateRecommendation(job) {
  const { userId } = job.data;

  logger.info(`Generating recommendation for user ${userId}`);

  try {
    const result = await runRecommendationWorkflow(userId);
    logger.info(`Recommendation generated for user ${userId}: ${result.category}`);
    return result;
  } catch (error) {
    logger.error(`Recommendation generation error: ${error.message}`);
    throw error;
  }
}

const { getRedisConnection } = require('../config/redisConnection');

// Create worker
const worker = new Worker('recommendation-generation', generateRecommendation, {
  connection: getRedisConnection(),
  concurrency: 3
});

worker.on('completed', (job) => {
  logger.info(`Recommendation job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  logger.error(`Recommendation job ${job.id} failed: ${err.message}`);
});

module.exports = worker;
