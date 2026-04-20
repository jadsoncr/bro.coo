jest.mock('../src/infra/redis', () => {
  const store = {};
  const mockRedis = {
    set: jest.fn(async (key, value) => { store[key] = value; }),
    get: jest.fn(async (key) => store[key] || null),
    del: jest.fn(async (key) => { delete store[key]; }),
  };
  return { getRedis: () => mockRedis };
});

const { getSession, updateSession, resetSession } = require('../src/storage/redisSession');

describe('redisSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getSession cria sessão nova quando não existe', async () => {
    const sess = await getSession('tenant1', '5511999999999', 'telegram');
    expect(sess.sessao).toBe('5511999999999');
    expect(sess.tenantId).toBe('tenant1');
    expect(sess.estadoAtual).toBe('start');
    expect(sess.score).toBe(0);
  });

  test('updateSession persiste campos', async () => {
    await getSession('tenant1', '5511999999999', 'telegram');
    await updateSession('tenant1', '5511999999999', { nome: 'João', score: 5 });
    const sess = await getSession('tenant1', '5511999999999', 'telegram');
    expect(sess.nome).toBe('João');
    expect(sess.score).toBe(5);
  });

  test('resetSession volta para estado start', async () => {
    await updateSession('tenant1', '5511999999999', { estadoAtual: 'coleta_nome', score: 7 });
    await resetSession('tenant1', '5511999999999', 'telegram');
    const sess = await getSession('tenant1', '5511999999999', 'telegram');
    expect(sess.estadoAtual).toBe('start');
    expect(sess.score).toBe(0);
  });
});
