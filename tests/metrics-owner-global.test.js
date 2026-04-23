const {
  resolvePeriodo,
  buildAlerts,
  toNumber,
  getOwnerMetrics,
  getGlobalMetrics,
  getLossPatterns,
} = require('../src/revenue/metrics');

// ═══ Unit tests for pure functions (no DB) ═══

describe('resolvePeriodo', () => {
  const now = new Date('2026-04-20T15:00:00.000Z');

  test('hoje returns start/end of today', () => {
    const { start, end } = resolvePeriodo('hoje', now);
    expect(start.getDate()).toBe(now.getDate());
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
  });

  test('semana returns Monday-based start of week', () => {
    const { start } = resolvePeriodo('semana', now);
    expect(start.getDay()).toBe(1); // Monday
    expect(start <= now).toBe(true);
  });

  test('mes (default) returns start of month', () => {
    const { start } = resolvePeriodo('mes', now);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(now.getMonth());
  });

  test('defaults to mes when undefined', () => {
    const { start } = resolvePeriodo(undefined, now);
    expect(start.getDate()).toBe(1);
  });

  test('custom date range object', () => {
    const custom = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-03-31T23:59:59Z') };
    const { start, end } = resolvePeriodo(custom, now);
    expect(start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-31T23:59:59.000Z');
  });
});

describe('buildAlerts', () => {
  test('generates leads_sem_resposta alert when > 0', () => {
    const metrics = { leadsSemResposta: 3, casosSemUpdate: 0, conversao: 0.5, totalLeads: 10 };
    const alerts = buildAlerts('t1', metrics);
    expect(alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'leads_sem_resposta', count: 3, severity: 'warning' }),
    ]));
  });

  test('generates contratos_parados alert when > 0', () => {
    const metrics = { leadsSemResposta: 0, casosSemUpdate: 4, conversao: 0.5, totalLeads: 10 };
    const alerts = buildAlerts('t1', metrics);
    expect(alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'contratos_parados', count: 4, severity: 'critical' }),
    ]));
  });

  test('generates queda_conversao alert when < 10%', () => {
    const metrics = { leadsSemResposta: 0, casosSemUpdate: 0, conversao: 0.05, totalLeads: 20 };
    const alerts = buildAlerts('t1', metrics);
    expect(alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'queda_conversao' }),
    ]));
  });

  test('no alerts when everything is fine', () => {
    const metrics = { leadsSemResposta: 0, casosSemUpdate: 0, conversao: 0.25, totalLeads: 10 };
    const alerts = buildAlerts('t1', metrics);
    expect(alerts).toHaveLength(0);
  });

  test('no queda_conversao alert when totalLeads is 0', () => {
    const metrics = { leadsSemResposta: 0, casosSemUpdate: 0, conversao: 0, totalLeads: 0 };
    const alerts = buildAlerts('t1', metrics);
    expect(alerts).toHaveLength(0);
  });

  test('critical severity for leads_sem_resposta >= 5', () => {
    const metrics = { leadsSemResposta: 5, casosSemUpdate: 0, conversao: 0.5, totalLeads: 10 };
    const alerts = buildAlerts('t1', metrics);
    expect(alerts[0].severity).toBe('critical');
  });
});


// ═══ Integration-style tests with mocked Prisma ═══

jest.mock('../src/infra/db', () => {
  const mockPrisma = {
    tenant: { findUnique: jest.fn(), findMany: jest.fn() },
    lead: { findMany: jest.fn() },
    caso: { findMany: jest.fn() },
    event: { findMany: jest.fn() },
  };
  return { getPrisma: () => mockPrisma, __mockPrisma: mockPrisma };
});

jest.mock('../src/events/service', () => ({
  EVENTS: { ABANDONED: 'abandoned' },
  safeRecordEvent: jest.fn(),
}));

jest.mock('../src/attention/loop', () => ({
  handleEvent: jest.fn(),
}));

const { __mockPrisma: prisma } = require('../src/infra/db');

describe('getOwnerMetrics', () => {
  const now = new Date('2026-04-20T15:00:00.000Z');
  const tenant = {
    id: 't1',
    nome: 'Test',
    slaMinutes: 15,
    slaContratoHoras: 48,
    custoMensal: 500,
    ticketMedio: 1000,
    taxaConversao: 0.2,
    moeda: 'BRL',
    moedaBase: 'BRL',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tenant.findUnique.mockResolvedValue(tenant);
  });

  test('calculates real revenue from Casos with dataRecebimento in period', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.caso.findMany.mockResolvedValue([
      { id: 'c1', valorRecebido: 1000, dataRecebimento: new Date('2026-04-15'), status: 'finalizado' },
      { id: 'c2', valorRecebido: 500, dataRecebimento: new Date('2026-04-18'), status: 'finalizado' },
      { id: 'c3', valorRecebido: 2000, dataRecebimento: new Date('2026-03-01'), status: 'finalizado' }, // outside period
    ]);

    const result = await getOwnerMetrics('t1', 'mes', now);
    expect(result.realRevenue).toBe(1500);
  });

  test('calculates open revenue from active Casos', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.caso.findMany.mockResolvedValue([
      {
        id: 'c1', status: 'em_andamento', valorRecebido: null,
        valorEntrada: 1000, percentualExito: 20, valorCausa: 5000, valorConsulta: 200,
      },
    ]);

    const result = await getOwnerMetrics('t1', 'mes', now);
    // 1000 + (20/100 * 5000) + 200 = 1000 + 1000 + 200 = 2200
    expect(result.openRevenue).toBe(2200);
  });

  test('calculates conversion rate', async () => {
    prisma.lead.findMany.mockResolvedValue([
      { id: 'l1', statusFinal: 'virou_cliente', criadoEm: new Date('2026-04-10') },
      { id: 'l2', statusFinal: null, criadoEm: new Date('2026-04-12') },
      { id: 'l3', statusFinal: null, criadoEm: new Date('2026-04-14') },
      { id: 'l4', statusFinal: 'virou_cliente', criadoEm: new Date('2026-04-16') },
    ]);
    prisma.caso.findMany.mockResolvedValue([]);

    const result = await getOwnerMetrics('t1', 'mes', now);
    expect(result.conversao).toBe(0.5);
  });

  test('calculates leadsSemResposta using SLA engine', async () => {
    prisma.lead.findMany.mockResolvedValue([
      { id: 'l1', primeiraRespostaEm: null, statusFinal: null, criadoEm: new Date('2026-04-20T14:00:00.000Z') }, // 60 min ago → atrasado (sla=15)
      { id: 'l2', primeiraRespostaEm: new Date(), statusFinal: null, criadoEm: new Date('2026-04-20T14:00:00.000Z') }, // has response
    ]);
    prisma.caso.findMany.mockResolvedValue([]);

    const result = await getOwnerMetrics('t1', 'mes', now);
    expect(result.leadsSemResposta).toBe(1);
  });

  test('calculates tempoMedioResposta', async () => {
    prisma.lead.findMany.mockResolvedValue([
      { id: 'l1', primeiraRespostaEm: new Date('2026-04-10T10:10:00Z'), criadoEm: new Date('2026-04-10T10:00:00Z') }, // 10 min
      { id: 'l2', primeiraRespostaEm: new Date('2026-04-11T10:20:00Z'), criadoEm: new Date('2026-04-11T10:00:00Z') }, // 20 min
    ]);
    prisma.caso.findMany.mockResolvedValue([]);

    const result = await getOwnerMetrics('t1', 'mes', now);
    expect(result.tempoMedioResposta).toBe(15); // avg of 10 and 20
  });

  test('calculates lucroEstimado', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.caso.findMany.mockResolvedValue([
      { id: 'c1', valorRecebido: 3000, dataRecebimento: new Date('2026-04-10'), status: 'finalizado' },
      { id: 'c2', status: 'em_andamento', valorRecebido: null, valorEntrada: 500, percentualExito: 0, valorCausa: 0, valorConsulta: 0 },
    ]);

    const result = await getOwnerMetrics('t1', 'mes', now);
    // lucro = 3000 + 500 - 500 = 3000
    expect(result.lucroEstimado).toBe(3000);
  });

  test('includes alerts in response', async () => {
    prisma.lead.findMany.mockResolvedValue([
      { id: 'l1', primeiraRespostaEm: null, statusFinal: null, criadoEm: new Date('2026-04-20T14:00:00.000Z') },
    ]);
    prisma.caso.findMany.mockResolvedValue([]);

    const result = await getOwnerMetrics('t1', 'mes', now);
    expect(result.alertas).toBeDefined();
    expect(Array.isArray(result.alertas)).toBe(true);
  });
});

describe('getGlobalMetrics', () => {
  beforeEach(() => jest.clearAllMocks());

  test('aggregates metrics across all active tenants', async () => {
    const t1 = { id: 't1', nome: 'T1', ativo: true };
    const t2 = { id: 't2', nome: 'T2', ativo: true };
    prisma.tenant.findMany.mockResolvedValue([t1, t2]);

    prisma.lead.findMany
      .mockResolvedValueOnce([
        { id: 'l1', statusFinal: 'virou_cliente', primeiraRespostaEm: new Date('2026-04-10T10:05:00Z'), criadoEm: new Date('2026-04-10T10:00:00Z') },
        { id: 'l2', statusFinal: null, primeiraRespostaEm: null, criadoEm: new Date('2026-04-10T10:00:00Z') },
      ])
      .mockResolvedValueOnce([
        { id: 'l3', statusFinal: 'virou_cliente', primeiraRespostaEm: new Date('2026-04-11T10:15:00Z'), criadoEm: new Date('2026-04-11T10:00:00Z') },
      ]);

    prisma.caso.findMany
      .mockResolvedValueOnce([
        { id: 'c1', valorRecebido: 1000, dataRecebimento: new Date('2026-04-10') },
      ])
      .mockResolvedValueOnce([
        { id: 'c2', valorRecebido: 2000, dataRecebimento: new Date('2026-04-11') },
      ]);

    const result = await getGlobalMetrics();

    expect(result.global.totalLeads).toBe(3);
    expect(result.global.overallConversao).toBeCloseTo(2 / 3);
    expect(result.global.totalRevenue).toBe(3000);
    // avg response: (5 + 15) / 2 = 10
    expect(result.global.avgResponseTime).toBe(10);
    expect(result.tenants).toHaveLength(2);
    expect(result.tenants[0].id).toBe('t1');
    expect(result.tenants[1].id).toBe('t2');
  });

  test('handles empty tenants', async () => {
    prisma.tenant.findMany.mockResolvedValue([]);
    const result = await getGlobalMetrics();
    expect(result.global.totalLeads).toBe(0);
    expect(result.global.overallConversao).toBe(0);
    expect(result.tenants).toHaveLength(0);
  });
});

describe('getLossPatterns', () => {
  beforeEach(() => jest.clearAllMocks());

  test('groups desistência reasons and abandonment steps for a tenant', async () => {
    prisma.lead.findMany.mockResolvedValue([
      { motivoDesistencia: 'preco' },
      { motivoDesistencia: 'preco' },
      { motivoDesistencia: 'sem_interesse' },
    ]);
    prisma.event.findMany.mockResolvedValue([
      { step: 'nome' },
      { step: 'nome' },
      { step: 'contato' },
    ]);

    const result = await getLossPatterns('t1');

    expect(result.byReason).toEqual([
      { reason: 'preco', count: 2 },
      { reason: 'sem_interesse', count: 1 },
    ]);
    expect(result.byStep).toEqual([
      { step: 'nome', count: 2 },
      { step: 'contato', count: 1 },
    ]);
  });

  test('works without tenantId (global)', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.event.findMany.mockResolvedValue([]);

    const result = await getLossPatterns(null);
    expect(result.byReason).toEqual([]);
    expect(result.byStep).toEqual([]);
  });
});
