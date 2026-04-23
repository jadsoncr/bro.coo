// tests/api-master.test.js
const request = require('supertest');
const express = require('express');

// Mock auth middleware
jest.mock('../src/auth/middleware', () => ({
  requireAdmin: (req, _res, next) => {
    req.adminId = 'admin-1';
    next();
  },
}));

jest.mock('../src/auth/audit', () => ({
  auditMiddleware: (_req, _res, next) => next(),
}));

jest.mock('../src/infra/db', () => ({
  getPrisma: jest.fn(),
}));

jest.mock('../src/revenue/metrics', () => ({
  getOwnerMetrics: jest.fn(),
  getGlobalMetrics: jest.fn(),
  getLossPatterns: jest.fn(),
  toNumber: (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    return Number(v) || 0;
  },
}));

const { getPrisma } = require('../src/infra/db');
const { getOwnerMetrics, getGlobalMetrics, getLossPatterns } = require('../src/revenue/metrics');
const masterRouter = require('../src/api/master');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/master', masterRouter);
  return app;
}

let app;
beforeEach(() => {
  jest.clearAllMocks();
  app = buildApp();
});

describe('GET /master/tenants', () => {
  test('returns active tenants with key metrics', async () => {
    const mockTenants = [
      { id: 't1', nome: 'Tenant A', plano: 'pro', ativo: true },
    ];
    const mockLeads = [
      { id: 'l1', statusFinal: 'virou_cliente', primeiraRespostaEm: new Date('2025-01-01T00:10:00Z'), criadoEm: new Date('2025-01-01T00:00:00Z') },
      { id: 'l2', statusFinal: null, primeiraRespostaEm: null, criadoEm: new Date('2025-01-01T00:00:00Z') },
    ];
    const mockCasos = [
      { valorRecebido: 5000, dataRecebimento: new Date('2025-01-15') },
    ];

    getPrisma.mockReturnValue({
      tenant: { findMany: jest.fn().mockResolvedValue(mockTenants) },
      lead: { findMany: jest.fn().mockResolvedValue(mockLeads) },
      caso: { findMany: jest.fn().mockResolvedValue(mockCasos) },
    });

    const res = await request(app).get('/master/tenants');
    expect(res.status).toBe(200);
    expect(res.body.tenants).toHaveLength(1);

    const t = res.body.tenants[0];
    expect(t.id).toBe('t1');
    expect(t.nome).toBe('Tenant A');
    expect(t.plano).toBe('pro');
    expect(t.leads).toBe(2);
    expect(t.conversao).toBe(0.5);
    expect(t.revenue).toBe(5000);
    expect(t.avgResponseTime).toBe(10); // 10 minutes
  });

  test('returns empty array when no active tenants', async () => {
    getPrisma.mockReturnValue({
      tenant: { findMany: jest.fn().mockResolvedValue([]) },
    });

    const res = await request(app).get('/master/tenants');
    expect(res.status).toBe(200);
    expect(res.body.tenants).toEqual([]);
  });

  test('returns 500 on error', async () => {
    getPrisma.mockReturnValue({
      tenant: { findMany: jest.fn().mockRejectedValue(new Error('db down')) },
    });

    const res = await request(app).get('/master/tenants');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Erro interno');
  });
});

describe('GET /master/tenants/:id/metrics', () => {
  test('returns detailed metrics for a tenant', async () => {
    const mockMetrics = { realRevenue: 10000, openRevenue: 5000, conversao: 0.3, alertas: [] };
    getOwnerMetrics.mockResolvedValue(mockMetrics);

    const res = await request(app).get('/master/tenants/t1/metrics?periodo=mes');
    expect(res.status).toBe(200);
    expect(res.body.realRevenue).toBe(10000);
    expect(getOwnerMetrics).toHaveBeenCalledWith('t1', 'mes');
  });

  test('returns 500 on error', async () => {
    getOwnerMetrics.mockRejectedValue(new Error('fail'));
    const res = await request(app).get('/master/tenants/t1/metrics');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Erro interno');
  });
});

describe('GET /master/global/metrics', () => {
  test('returns aggregated global metrics', async () => {
    const mockData = {
      global: { totalLeads: 100, overallConversao: 0.2, totalRevenue: 50000, avgResponseTime: 8 },
      tenants: [{ id: 't1', nome: 'A', leads: 100, conversao: 0.2, revenue: 50000, avgResponseTime: 8 }],
    };
    getGlobalMetrics.mockResolvedValue(mockData);

    const res = await request(app).get('/master/global/metrics');
    expect(res.status).toBe(200);
    expect(res.body.global.totalLeads).toBe(100);
    expect(res.body.tenants).toHaveLength(1);
  });

  test('returns 500 on error', async () => {
    getGlobalMetrics.mockRejectedValue(new Error('fail'));
    const res = await request(app).get('/master/global/metrics');
    expect(res.status).toBe(500);
  });
});

describe('GET /master/global/loss-patterns', () => {
  test('returns loss patterns without tenantId filter', async () => {
    const mockData = {
      byReason: [{ reason: 'preco', count: 5 }],
      byStep: [{ step: 'menu_principal', count: 3 }],
    };
    getLossPatterns.mockResolvedValue(mockData);

    const res = await request(app).get('/master/global/loss-patterns');
    expect(res.status).toBe(200);
    expect(res.body.byReason).toHaveLength(1);
    expect(res.body.byStep).toHaveLength(1);
    expect(getLossPatterns).toHaveBeenCalledWith(null);
  });

  test('passes tenantId filter when provided', async () => {
    getLossPatterns.mockResolvedValue({ byReason: [], byStep: [] });

    await request(app).get('/master/global/loss-patterns?tenantId=t1');
    expect(getLossPatterns).toHaveBeenCalledWith('t1');
  });

  test('returns 500 on error', async () => {
    getLossPatterns.mockRejectedValue(new Error('fail'));
    const res = await request(app).get('/master/global/loss-patterns');
    expect(res.status).toBe(500);
  });
});

describe('GET /master/global/benchmarks', () => {
  test('returns tenants sorted by revenue desc', async () => {
    const mockData = {
      global: {},
      tenants: [
        { id: 't1', nome: 'A', revenue: 1000 },
        { id: 't2', nome: 'B', revenue: 5000 },
        { id: 't3', nome: 'C', revenue: 3000 },
      ],
    };
    getGlobalMetrics.mockResolvedValue(mockData);

    const res = await request(app).get('/master/global/benchmarks');
    expect(res.status).toBe(200);
    expect(res.body.benchmarks).toHaveLength(3);
    expect(res.body.benchmarks[0].id).toBe('t2');
    expect(res.body.benchmarks[1].id).toBe('t3');
    expect(res.body.benchmarks[2].id).toBe('t1');
  });

  test('returns 500 on error', async () => {
    getGlobalMetrics.mockRejectedValue(new Error('fail'));
    const res = await request(app).get('/master/global/benchmarks');
    expect(res.status).toBe(500);
  });
});

describe('GET /master/audit-log', () => {
  test('returns audit log entries', async () => {
    const mockLogs = [
      { id: 'log-1', adminId: 'admin-1', acao: 'GET /master/tenants', criadoEm: new Date() },
    ];
    getPrisma.mockReturnValue({
      adminLog: { findMany: jest.fn().mockResolvedValue(mockLogs) },
    });

    const res = await request(app).get('/master/audit-log');
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].acao).toBe('GET /master/tenants');
  });

  test('filters by tenantId when provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    getPrisma.mockReturnValue({ adminLog: { findMany } });

    await request(app).get('/master/audit-log?tenantId=t1');
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1' },
      orderBy: { criadoEm: 'desc' },
      take: 100,
    });
  });

  test('queries without filter when no tenantId', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    getPrisma.mockReturnValue({ adminLog: { findMany } });

    await request(app).get('/master/audit-log');
    expect(findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { criadoEm: 'desc' },
      take: 100,
    });
  });

  test('returns 500 on error', async () => {
    getPrisma.mockReturnValue({
      adminLog: { findMany: jest.fn().mockRejectedValue(new Error('fail')) },
    });

    const res = await request(app).get('/master/audit-log');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Erro interno');
  });
});
