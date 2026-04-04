/**
 * Shared Redis/BullMQ connection options.
 * Detects `rediss://` (TLS) URLs (e.g. Upstash) and enables TLS automatically.
 */

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

function getRedisConnection() {
  const connection = { url: redisUrl };

  // Upstash and other cloud Redis providers use rediss:// (TLS)
  if (redisUrl.startsWith('rediss://')) {
    connection.tls = {};
  }

  return connection;
}

module.exports = { getRedisConnection };
