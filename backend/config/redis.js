const Redis = require('ioredis');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisOpts = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
};

// Upstash uses rediss:// (TLS) — ioredis needs tls option
if (redisUrl.startsWith('rediss://')) {
  redisOpts.tls = {};
}

const redis = new Redis(redisUrl, redisOpts);

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

redis.on('reconnecting', () => {
  logger.warn('Redis reconnecting...');
});

module.exports = redis;
