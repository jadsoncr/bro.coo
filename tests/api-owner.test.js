// tests/api-owner.test.js
const request = require('supertest');
const express = require('express');

// Mock auth middleware
jest.mock('../src/auth/middleware', () => ({
  requireAuth: (req, _res, next) => {
    req.userId = 'owner-1';
    req.tenantId = 'tenant-1';
    req.role = 'OWNER';
    next();
  },
  requireRole: () => (_req, _res, next) => next(),
}));

jest.mock('../src/infra/db', () => ({
  getPrisma: jest.fn(),
}));

jest.mock('../src/revenue/metrics', () => ({
  getOwnerMetrics: jest.fn(),
  listLeads: jest.fn(),
  getLeadDetails: jest.fn(),
  getFunil: jest.fn(),
  getTenantConfig: jest.fn(),
  updateTenantConfig: jest.fn(),
}));

jest.mock('../src/conversion/caso', () => ({
  getCasosByTenant: jest.fn(),
  getCasoDetail: jest.fn(),
}));

const { getPrisma } = require('../src/infra/db');
const {
  getOwnerMetrics,
  listLeads,
  getLeadDetails,
  getFunil,
  getTenantConfig,
  updateTenantConfig,
} = require('../src/revenue/metrics');
const { getCasosByTenant, getCasoDetail } = require('../src/conversion/caso');

const ownerRouter = require('../src/api/owner');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/owner', ownerRouter);
  return app;
}

let app;
beforeEach(() => {
  jest.clearAllMocks();
  app = buildApp();
});

describe('GET /owner/metrics', () => {
  test('returns metrics with periodo query param', async () => {
    const mockMetrics = {
      realRevenue: 5000,
      openRevenue: 3000,
      conversao: 0.25,
      alertas: [],
    };
    getOwnerMetrics.mockResolvedValue(mockMetrics);

    const res = await request(app).get('/owner/metrics?periodo=mes');
    expect(res.status).toBe(200);
    expect(res.body.realRevenue).toBe(5000);
    expect(getOwnerMetrics).toHaveBeenCalledWith('tenant-1', 'mes');
  });

  test('returns 500 on error', async () => {
    getOwnerMetrics.mockRejectedValue(new Error('db down'));
    const res = await request(app).get('/owner/metrics');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Erro interno');
  });
});

describe('GET /owner/leads', () => {
  test('returns read-only lead list', async () => {
    listLeads.mockResolvedValue([{ id: 'lead-1', nome: 'Maria' }]);

    const res = await request(app).get('/owner/leads');
    expect(res.status).toBe(200);
    expect(res.body.leads).toHaveLength(1);
    expect(listLeads).toHaveBeenCalledWith('tenant-1', {});
  });

  test('passes query filters', async () => {
    listLeads.mockResolvedValue([]);
    await request(app).get('/owner/leads?status=NOVO');
    expect(listLeads).toHaveBeenCalledWith('tenant-1', { status: 'NOVO' });
  });

  test('returns 500 on error', async () => {
    listLeads.mockRejectedValue(new Error('fail'));
    const res = await request(app).get('/owner/leads');
    expect(res.status).toBe(500);
  });
});

describe('GET /owner/leads/:id', () => {
  test('returns lead detail', async () => {
    getLeadDetails.mockResolvedValue({ id: 'lead-1', nome: 'Maria', messages: [] });

    const res = await request(app).get('/owner/leads/lead-1');
    expect(res.status).toBe(200);
    expect(res.body.lead.id).toBe('lead-1');
  });

  test('returns 404 if not found', async () => {
    getLeadDetails.mockResolvedValue(null);
    const res = await request(app).get('/owner/leads/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Lead não encontrado');
  });
});

describe('GET /owner/casos', () => {
  test('returns casos list', async () => {
    getCasosByTenant.mockResolvedValue([{ id: 'caso-1', status: 'em_andamento' }]);

    const res = await request(app).get('/owner/casos');
    expect(res.status).toBe(200);
    expect(res.body.casos).toHaveLength(1);
    expect(getCasosByTenant).toHaveBeenCalledWith('tenant-1', {});
  });

  test('passes status filter', async () => {
    getCasosByTenant.mockResolvedValue([]);
    await request(app).get('/owner/casos?status=finalizado');
    expect(getCasosByTenant).toHaveBeenCalledWith('tenant-1', { status: 'finalizado' });
  });

  test('returns 500 on error', async () => {
    getCasosByTenant.mockRejectedValue(new Error('fail'));
    const res = await request(app).get('/owner/casos');
    expect(res.status).toBe(500);
  });
});

describe('GET /owner/casos/:id', () => {
  test('returns caso detail', async () => {
    getCasoDetail.mockResolvedValue({ id: 'caso-1', status: 'em_andamento', lead: {} });

    const res = await request(app).get('/owner/casos/caso-1');
    expect(res.status).toBe(200);
    expect(res.body.caso.id).toBe('caso-1');
  });

  test('returns 404 if not found', async () => {
    getCasoDetail.mockResolvedValue(null);
    const res = await request(app).get('/owner/casos/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Caso não encontrado');
  });
});

describe('GET /owner/funil', () => {
  test('returns funnel analysis', async () => {
    getFunil.mockResolvedValue([{ step: 'menu_principal', abandonos: 5 }]);

    const res = await request(app).get('/owner/funil');
    expect(res.status).toBe(200);
    expect(res.body.funil).toHaveLength(1);
    expect(res.body.funil[0].step).toBe('menu_principal');
  });

  test('returns 500 on error', async () => {
    getFunil.mockRejectedValue(new Error('fail'));
    const res = await request(app).get('/owner/funil');
    expect(res.status).toBe(500);
  });
});

describe('GET /owner/alerts', () => {
  test('returns only alertas from metrics', async () => {
    const mockAlerts = [
      { type: 'leads_sem_resposta', count: 3, severity: 'warning' },
    ];
    getOwnerMetrics.mockResolvedValue({ realRevenue: 1000, alertas: mockAlerts });

    const res = await request(app).get('/owner/alerts');
    expect(res.status).toBe(200);
    expect(res.body.alertas).toHaveLength(1);
    expect(res.body.alertas[0].type).toBe('leads_sem_resposta');
    // Should not include other metrics fields
    expect(res.body.realRevenue).toBeUndefined();
    expect(getOwnerMetrics).toHaveBeenCalledWith('tenant-1', 'mes');
  });

  test('returns 500 on error', async () => {
    getOwnerMetrics.mockRejectedValue(new Error('fail'));
    const res = await request(app).get('/owner/alerts');
    expect(res.status).toBe(500);
  });
});

describe('GET /owner/tenant/config', () => {
  test('returns tenant config', async () => {
    getTenantConfig.mockResolvedValue({
      id: 'tenant-1',
      nome: 'Test',
      slaMinutes: 15,
      ticketMedio: 1000,
    });

    const res = await request(app).get('/owner/tenant/config');
    expect(res.status).toBe(200);
    expect(res.body.slaMinutes).toBe(15);
  });

  test('returns 500 on error', async () => {
    getTenantConfig.mockRejectedValue(new Error('fail'));
    const res = await request(app).get('/owner/tenant/config');
    expect(res.status).toBe(500);
  });
});

describe('PATCH /owner/tenant/config', () => {
  test('updates config successfully', async () => {
    updateTenantConfig.mockResolvedValue({ id: 'tenant-1', ticketMedio: 2000 });

    const res = await request(app)
      .patch('/owner/tenant/config')
      .send({ ticketMedio: 2000 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(updateTenantConfig).toHaveBeenCalledWith('tenant-1', { ticketMedio: 2000 });
  });

  test('rejects non-positive slaMinutes', async () => {
    const res = await request(app)
      .patch('/owner/tenant/config')
      .send({ slaMinutes: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('slaMinutes');
  });

  test('rejects negative slaMinutes', async () => {
    const res = await request(app)
      .patch('/owner/tenant/config')
      .send({ slaMinutes: -5 });
    expect(res.status).toBe(400);
  });

  test('rejects non-integer slaMinutes', async () => {
    const res = await request(app)
      .patch('/owner/tenant/config')
      .send({ slaMinutes: 3.5 });
    expect(res.status).toBe(400);
  });

  test('rejects non-positive slaContratoHoras', async () => {
    const res = await request(app)
      .patch('/owner/tenant/config')
      .send({ slaContratoHoras: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('slaContratoHoras');
  });

  test('rejects negative slaContratoHoras', async () => {
    const res = await request(app)
      .patch('/owner/tenant/config')
      .send({ slaContratoHoras: -10 });
    expect(res.status).toBe(400);
  });

  test('rejects non-integer slaContratoHoras', async () => {
    const res = await request(app)
      .patch('/owner/tenant/config')
      .send({ slaContratoHoras: 2.5 });
    expect(res.status).toBe(400);
  });

  test('updates slaContratoHoras via Prisma directly', async () => {
    updateTenantConfig.mockResolvedValue({ id: 'tenant-1' });
    const mockUpdated = { id: 'tenant-1', slaContratoHoras: 72 };
    getPrisma.mockReturnValue({
      tenant: { update: jest.fn().mockResolvedValue(mockUpdated) },
    });

    const res = await request(app)
      .patch('/owner/tenant/config')
      .send({ slaContratoHoras: 72 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tenant.slaContratoHoras).toBe(72);
  });

  test('accepts valid positive integer slaMinutes', async () => {
    updateTenantConfig.mockResolvedValue({ id: 'tenant-1', slaMinutes: 30 });

    const res = await request(app)
      .patch('/owner/tenant/config')
      .send({ slaMinutes: 30 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('returns 500 on error', async () => {
    updateTenantConfig.mockRejectedValue(new Error('fail'));
    const res = await request(app)
      .patch('/owner/tenant/config')
      .send({ ticketMedio: 500 });
    expect(res.status).toBe(500);
  });
});
