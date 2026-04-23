// tests/sla-engine.test.js

const { minutesSince, hoursSince, leadSLAStatus, casoSLAStatus, getViolations, tick } = require('../src/sla/engine');

// ── Pure function tests (no mocks needed) ──

describe('minutesSince', () => {
  test('returns 0 for null date', () => {
    expect(minutesSince(null)).toBe(0);
  });

  test('calculates minutes correctly', () => {
    const now = new Date('2025-01-01T01:00:00Z');
    const date = new Date('2025-01-01T00:30:00Z');
    expect(minutesSince(date, now)).toBe(30);
  });

  test('returns 0 for future date', () => {
    const now = new Date('2025-01-01T00:00:00Z');
    const date = new Date('2025-01-01T01:00:00Z');
    expect(minutesSince(date, now)).toBe(0);
  });
});

describe('hoursSince', () => {
  test('returns 0 for null date', () => {
    expect(hoursSince(null)).toBe(0);
  });

  test('calculates hours correctly', () => {
    const now = new Date('2025-01-01T12:00:00Z');
    const date = new Date('2025-01-01T00:00:00Z');
    expect(hoursSince(date, now)).toBe(12);
  });
});

describe('leadSLAStatus', () => {
  const tenant = { slaMinutes: 10 };

  test('returns "finalizado" when lead has statusFinal', () => {
    const lead = { statusFinal: 'virou_cliente', criadoEm: new Date() };
    expect(leadSLAStatus(lead, tenant)).toBe('finalizado');
  });

  test('returns "respondido" when lead has primeiraRespostaEm (never atrasado)', () => {
    const now = new Date();
    const lead = {
      criadoEm: new Date(now.getTime() - 60 * 60000), // 60 min ago — way past SLA
      primeiraRespostaEm: new Date(now.getTime() - 30 * 60000),
    };
    expect(leadSLAStatus(lead, tenant, now)).toBe('respondido');
  });

  test('returns "dentro" when elapsed < 70% of limit', () => {
    const now = new Date();
    const lead = { criadoEm: new Date(now.getTime() - 5 * 60000) }; // 5 min, limit=10, 50%
    expect(leadSLAStatus(lead, tenant, now)).toBe('dentro');
  });

  test('returns "atencao" when elapsed >= 70% and < 100%', () => {
    const now = new Date();
    const lead = { criadoEm: new Date(now.getTime() - 8 * 60000) }; // 8 min, limit=10, 80%
    expect(leadSLAStatus(lead, tenant, now)).toBe('atencao');
  });

  test('returns "atrasado" when elapsed >= 100%', () => {
    const now = new Date();
    const lead = { criadoEm: new Date(now.getTime() - 15 * 60000) }; // 15 min, limit=10
    expect(leadSLAStatus(lead, tenant, now)).toBe('atrasado');
  });

  test('uses default 15 minutes when tenant.slaMinutes is missing', () => {
    const now = new Date();
    const lead = { criadoEm: new Date(now.getTime() - 12 * 60000) }; // 12 min, limit=15, 80%
    expect(leadSLAStatus(lead, {}, now)).toBe('atencao');
  });
});

describe('casoSLAStatus', () => {
  const tenant = { slaContratoHoras: 48 };

  test('returns "finalizado" when caso status is finalizado', () => {
    const caso = { status: 'finalizado', atualizadoEm: new Date() };
    expect(casoSLAStatus(caso, tenant)).toBe('finalizado');
  });

  test('returns "dentro" when elapsed < 70% of limit', () => {
    const now = new Date();
    const caso = { status: 'em_andamento', atualizadoEm: new Date(now.getTime() - 20 * 3600000) }; // 20h, limit=48
    expect(casoSLAStatus(caso, tenant, now)).toBe('dentro');
  });

  test('returns "atencao" when elapsed >= 70% and < 100%', () => {
    const now = new Date();
    const caso = { status: 'em_andamento', atualizadoEm: new Date(now.getTime() - 40 * 3600000) }; // 40h, limit=48, ~83%
    expect(casoSLAStatus(caso, tenant, now)).toBe('atencao');
  });

  test('returns "atrasado" when elapsed >= 100%', () => {
    const now = new Date();
    const caso = { status: 'em_andamento', atualizadoEm: new Date(now.getTime() - 50 * 3600000) }; // 50h, limit=48
    expect(casoSLAStatus(caso, tenant, now)).toBe('atrasado');
  });

  test('uses default 48 hours when tenant.slaContratoHoras is missing', () => {
    const now = new Date();
    const caso = { status: 'em_andamento', atualizadoEm: new Date(now.getTime() - 50 * 3600000) };
    expect(casoSLAStatus(caso, {}, now)).toBe('atrasado');
  });
});

// ── Database-dependent tests (mocked) ──

const mockTenant = {
  id: 'tenant-1',
  nome: 'Test',
  slaMinutes: 10,
  slaContratoHoras: 48,
  ativo: true,
};

const now = new Date('2025-06-01T12:00:00Z');

const mockLeads = [
  // Violated: no response, created 20 min ago (limit=10)
  { id: 'lead-1', tenantId: 'tenant-1', criadoEm: new Date(now.getTime() - 20 * 60000), primeiraRespostaEm: null, statusFinal: null },
  // Not violated: has response
  { id: 'lead-2', tenantId: 'tenant-1', criadoEm: new Date(now.getTime() - 20 * 60000), primeiraRespostaEm: new Date(), statusFinal: null },
  // Not violated: has statusFinal
  { id: 'lead-3', tenantId: 'tenant-1', criadoEm: new Date(now.getTime() - 20 * 60000), primeiraRespostaEm: null, statusFinal: 'virou_cliente' },
];

const mockCasos = [
  // Violated: 50h since update (limit=48)
  { id: 'caso-1', tenantId: 'tenant-1', status: 'em_andamento', atualizadoEm: new Date(now.getTime() - 50 * 3600000) },
  // Not violated: finalizado
  { id: 'caso-2', tenantId: 'tenant-1', status: 'finalizado', atualizadoEm: new Date(now.getTime() - 100 * 3600000) },
  // Not violated: recent update
  { id: 'caso-3', tenantId: 'tenant-1', status: 'em_andamento', atualizadoEm: new Date(now.getTime() - 10 * 3600000) },
];

jest.mock('../src/infra/db', () => ({
  getPrisma: jest.fn(() => ({
    tenant: {
      findUnique: jest.fn(async () => mockTenant),
      findMany: jest.fn(async () => [mockTenant]),
    },
    lead: {
      findMany: jest.fn(async ({ where }) => {
        return mockLeads.filter((l) => {
          if (where.primeiraRespostaEm === null && l.primeiraRespostaEm !== null) return false;
          if (where.statusFinal === null && l.statusFinal !== null) return false;
          return l.tenantId === where.tenantId;
        });
      }),
      update: jest.fn(async () => ({})),
    },
    caso: {
      findMany: jest.fn(async ({ where }) => {
        return mockCasos.filter((c) => {
          if (where.NOT && where.NOT.status && c.status === where.NOT.status) return false;
          return c.tenantId === where.tenantId;
        });
      }),
    },
  })),
}));

describe('getViolations', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: now.getTime() });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('returns only violated leads and casos', async () => {
    const result = await getViolations('tenant-1');

    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].id).toBe('lead-1');
    expect(result.casos).toHaveLength(1);
    expect(result.casos[0].id).toBe('caso-1');
  });
});

describe('tick', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: now.getTime() });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('generates alerts for violations', async () => {
    const alerts = await tick('tenant-1');

    expect(alerts).toHaveLength(2);
    expect(alerts[0].type).toBe('leads_sem_resposta');
    expect(alerts[0].count).toBe(1);
    expect(alerts[0].items).toEqual(['lead-1']);
    expect(alerts[0].severity).toBe('warning');
    expect(alerts[1].type).toBe('contratos_parados');
    expect(alerts[1].count).toBe(1);
    expect(alerts[1].items).toEqual(['caso-1']);
  });
});
