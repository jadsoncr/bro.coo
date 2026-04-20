jest.mock('bullmq', () => {
  const jobs = [];
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn(async (name, data) => { jobs.push({ name, data }); return { id: '1' }; }),
    })),
    Worker: jest.fn().mockImplementation((name, processor) => ({
      on: jest.fn(),
      _processor: processor,
    })),
    getJobs: () => jobs,
  };
});

jest.mock('../src/infra/redis', () => ({
  getRedis: () => ({ options: { host: 'localhost', port: 6379 } }),
}));

jest.mock('../src/storage/postgres', () => ({
  createLead: jest.fn(async (data) => ({ id: 'lead-1', ...data })),
  createAbandono: jest.fn(async (data) => ({ id: 'abnd-1', ...data })),
  createMessage: jest.fn(async (data) => ({ id: 'msg-1', ...data })),
}));

const { enqueueLeadPersist, enqueueAbandono } = require('../src/infra/queue');

describe('queue', () => {
  test('enqueueLeadPersist adiciona job na fila', async () => {
    const job = await enqueueLeadPersist({
      tenantId: 'tenant-1',
      sessao: '55119999',
      nome: 'João',
      score: 6,
      prioridade: 'QUENTE',
    });
    expect(job).toBeDefined();
  });

  test('enqueueAbandono adiciona job na fila', async () => {
    const job = await enqueueAbandono({
      tenantId: 'tenant-1',
      sessao: '55119999',
      ultimoEstado: 'coleta_nome',
    });
    expect(job).toBeDefined();
  });
});
