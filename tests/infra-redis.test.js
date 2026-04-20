const { getRedis } = require('../src/infra/redis');

describe('redis singleton', () => {
  test('returns same instance on multiple calls', () => {
    const a = getRedis();
    const b = getRedis();
    expect(a).toBe(b);
  });

  test('instance has set and get methods', () => {
    const redis = getRedis();
    expect(typeof redis.set).toBe('function');
    expect(typeof redis.get).toBe('function');
  });
});
