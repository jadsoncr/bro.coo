// src/infra/redis.js
const Redis = require('ioredis');

let _redis;

function getRedis() {
  if (!_redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL não configurado');
    _redis = new Redis(url, {
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
