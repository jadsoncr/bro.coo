// src/infra/redis.js
const Redis = require('ioredis');

let _redis;

function getRedis() {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
  }
  return _redis;
}

async function disconnectRedis() {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}

module.exports = { getRedis, disconnectRedis };
