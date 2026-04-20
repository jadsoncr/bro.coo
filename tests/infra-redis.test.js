describe('redis singleton', () => {
  beforeEach(() => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  test('returns same instance on multiple calls', () => {
    const { getRedis } = require('../src/infra/redis');
    const a = getRedis();
    const b = getRedis();
    expect(a).toBe(b);
  });

  test('instance has set and get methods', () => {
    const { getRedis } = require('../src/infra/redis');
    const redis = getRedis();
    expect(typeof redis.set).toBe('function');
    expect(typeof redis.get).toBe('function');
  });

  test('throws when REDIS_URL is not set', () => {
    delete process.env.REDIS_URL;
    jest.resetModules();
    const { getRedis } = require('../src/infra/redis');
    expect(() => getRedis()).toThrow('REDIS_URL não configurado');
  });
});
