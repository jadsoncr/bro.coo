// tests/sla-queues.test.js

const now = new Date('2025-06-01T12:00:00Z');

const mockTenant = {
  id: 'tenant-1',
  nome: 'Test',
  slaMinutes: 10,
  slaContratoHoras: 48,
  ativo: true,
};

const mockLeads = [
  // Unresponded, SLA violated (20 min, limit=10)
  { id: 'lead-1', tenantId: 'tenant-1', nome: 'A', telefone: '111', canal: 'telegram', origem: 'web', score: 80, prioridade: 'QUENTE', status: 'NOVO', statusFinal: null, criadoEm: new Date(now.getTime() - 20 * 60000), atualizadoEm: now, primeiraRespostaEm: null },
  // EM_ATENDIMENTO
  { id: 'lead-2', tenantId: 'tenant-1', nome: 'B', telefone: '222', canal: 'telegram', origem: 'web', score: 50, prioridade: 'MEDIO', status: 'EM_ATENDIMENTO', statusFinal: null, criadoEm: now, atualizadoEm: now, primeiraRespostaEm: now },
];

const mockCasos = [
  // Stale: 50h since update (limit=48)
  { id: 'caso-1', tenantId: 'tenant-1', leadId: 'lead-x', tipoContrato: 'entrada', status: 'em_andamento', criadoEm: now, atualizadoEm: new Date(now.getTime() - 50 * 3600000) },
  // Recent
  { id: 'caso-2', tenantId: 'tenant-1', leadId: 'lead-y', tipoContrato: 'exito', status: 'em_andamento', criadoEm: now, atualizadoEm: new Date(now.getTime() - 10 * 3600000) },
];

jest.mock('../src/infra/db', () => ({
  getPrisma: jest.fn(() => ({
    tenant: {
      findUnique: jest.fn(async () => mockTenant),
    },
    lead: {
      findMany: jest.fn(async ({ where }) => {
        return mockLeads.filter((l) => {
          if (l.tenantId !== where.tenantId) return false;
          if (where.primeiraRespostaEm === null && l.primeiraRespostaEm !== null) return false;
          if (where.statusFinal === null && l.statusFinal !== null) return false;
          if (where.status && l.status !== where.status) return false;
          return true;
        });
      }),
    },
    caso: {
      findMany: jest.fn(async ({ where }) => {
        return mockCasos.filter((c) => {
          if (c.tenantId !== where.tenantId) return false;
          if (where.NOT && where.NOT.status && c.status === where.NOT.status) return false;
          return true;
        });
      }),
    },
  })),
}));

const { getQueues } = require('../src/sla/queues');

describe('getQueues', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: now.getTime() });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('returns four queues with correct items', async () => {
    const queues = await getQueues('tenant-1');

    expect(queues).toHaveLength(4);

    // Queue 1: Leads sem resposta
    expect(queues[0].name).toBe('Leads sem resposta');
    expect(queues[0].count).toBe(1);
    expect(queues[0].items[0].id).toBe('lead-1');

    // Queue 2: Atendimento em andamento
    expect(queues[1].name).toBe('Atendimento em andamento');
    expect(queues[1].count).toBe(1);
    expect(queues[1].items[0].id).toBe('lead-2');

    // Queue 3: Contratos enviados sem retorno
    expect(queues[2].name).toBe('Contratos enviados sem retorno');
    expect(queues[2].count).toBe(1);
    expect(queues[2].items[0].id).toBe('caso-1');

    // Queue 4: Casos sem atualização (non em_andamento)
    expect(queues[3].name).toBe('Casos sem atualização');
    expect(queues[3].count).toBe(0); // caso-1 is em_andamento, goes to queue 3 only
  });

  test('returns empty array when tenant not found', async () => {
    const { getPrisma } = require('../src/infra/db');
    getPrisma.mockReturnValueOnce({
      tenant: { findUnique: jest.fn(async () => null) },
    });

    const queues = await getQueues('nonexistent');
    expect(queues).toEqual([]);
  });
});
