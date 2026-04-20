const { getPrisma } = require('../src/infra/db');

describe('db singleton', () => {
  test('returns same instance on multiple calls', () => {
    const a = getPrisma();
    const b = getPrisma();
    expect(a).toBe(b);
  });

  test('has expected model accessors', () => {
    const prisma = getPrisma();
    expect(prisma.tenant).toBeDefined();
    expect(prisma.lead).toBeDefined();
    expect(prisma.message).toBeDefined();
    expect(prisma.flow).toBeDefined();
  });
});
