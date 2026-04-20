// tests/api-revenue.test.js
const request = require('supertest');
const express = require('express');

// Mock the metrics module
jest.mock('../src/revenue/metrics', () => ({
  listLeads: jest.fn(async () => [
    {
      id: 'lead-1', nome: 'João', telefone: '5511', canal: null, origem: null,
      campanha: null, fluxo: null, score: 7, prioridade: 'QUENTE', status: 'NOVO',
      statusFinal: null, origemConversao: null,
      slaStatus: 'atrasado', minutosEspera: 20, valorLead: 200,
      valorEntrada: 0, valorExito: 0, valorEstimado: 0,
      resumo: null, criadoEm: new Date(), atualizadoEm: new Date(),
    },
  ]),
  getLeadDetails: jest.fn(async (tenantId, id) => ({
    id, nome: 'João', telefone: '5511', canal: null, origem: null,
    campanha: null, fluxo: null, score: 7, prioridade: 'QUENTE', status: 'NOVO',
    statusFinal: null, origemConversao: null,
    slaStatus: 'atrasado', minutosEspera: 20, valorLead: 200,
    valorEntrada: 0, valorExito: 0, valorEstimado: 0,
    resumo: null, criadoEm: new Date(), atualizadoEm: new Date(),
    messages: [{ id: 'msg-1', direcao: 'in', conteudo: 'oi', criadoEm: new Date() }],
    events: [],
    scoreBreakdown: { urgencia: 3 },
  })),
  updateLeadStatus: jest.fn(async () => ({ count: 1 })),
  markLeadOutcome: jest.fn(async () => ({ count: 1 })),
  getMetrics: jest.fn(async () => ({
    tenant: {
      id: 'tenant-1', nome: 'Test', moeda: 'BRL',
      slaMinutes: 15, ticketMedio: 1000, taxaConversao: 0.2,
      custoMensal: 0, metaMensal: 0, metaDiaria: 0,
    },
    leadsHoje: 5,
    leadsMes: 10,
    leadsTotal: 20,
    quentes: 2,
    atrasados: 1,
    potencialHoje: 1000,
    emRisco: 200,
    receitaGerada: 500,
    receitaFutura: 300,
    valorMedioLead: 200,
    receitaVsMeta: 0,
    lucroEstimado: 800,
    reativacao: { enviados: 3, responderam: 1, convertidos: 0, receitaGerada: 0 },
  })),
  getFunil: jest.fn(async () => [
    { step: 'trabalho_status', abandonos: 8 },
  ]),
  getTenantConfig: jest.fn(async () => ({
    id: 'tenant-1', nome: 'Test', moeda: 'BRL',
    slaMinutes: 15, ticketMedio: 1000, taxaConversao: 0.2,
    custoMensal: 0, metaMensal: 0, metaDiaria: 0,
  })),
  updateTenantConfig: jest.fn(async () => ({
    id: 'tenant-1', slaMinutes: 10, ticketMedio: 1500,
  })),
}));

const { createRevenueRouter } = require('../src/api/revenue');

process.env.ADMIN_TOKEN = 'test-token';

const app = express();
app.use(express.json());

// replicate adminAuth inline for test
app.use((req, res, next) => {
  if (req.headers['x-admin-token'] !== 'test-token') return res.status(401).json({ error: 'Não autorizado.' });
  next();
});

app.use('/api', createRevenueRouter({
  resolveTenantId: (req) => req.headers['x-tenant-id'] || 'tenant-1',
}));

const AUTH = { 'x-admin-token': 'test-token', 'x-tenant-id': 'tenant-1' };

describe('GET /api/leads', () => {
  test('retorna lista de leads', async () => {
    const res = await request(app).get('/api/leads').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.leads).toHaveLength(1);
    expect(res.body.leads[0].prioridade).toBe('QUENTE');
  });

  test('retorna 401 sem token', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/leads/:id', () => {
  test('retorna detalhe do lead com mensagens', async () => {
    const res = await request(app).get('/api/leads/lead-1').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.lead.messages).toHaveLength(1);
    expect(res.body.lead.scoreBreakdown).toBeDefined();
  });

  test('retorna 404 se lead nao encontrado', async () => {
    const { getLeadDetails } = require('../src/revenue/metrics');
    getLeadDetails.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/leads/nao-existe').set(AUTH);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/leads/:id/status', () => {
  test('atualiza status', async () => {
    const res = await request(app).patch('/api/leads/lead-1/status').set(AUTH).send({ status: 'EM_ATENDIMENTO' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('POST /api/leads/:id/result', () => {
  test('marca resultado convertido', async () => {
    const res = await request(app).post('/api/leads/lead-1/result').set(AUTH).send({ status_final: 'CONVERTIDO' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('GET /api/metrics', () => {
  test('retorna métricas financeiras', async () => {
    const res = await request(app).get('/api/metrics').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.potencialHoje).toBeDefined();
    expect(res.body.emRisco).toBeDefined();
    expect(res.body.atrasados).toBeDefined();
    expect(res.body.reativacao).toBeDefined();
  });
});

describe('GET /api/funil', () => {
  test('retorna abandono por step', async () => {
    const res = await request(app).get('/api/funil').set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.funil)).toBe(true);
    expect(res.body.funil[0].abandonos).toBe(8);
  });
});

describe('GET /api/reactivation', () => {
  test('retorna métricas de reativação', async () => {
    const res = await request(app).get('/api/reactivation').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.enviados).toBeDefined();
    expect(res.body.responderam).toBeDefined();
    expect(res.body.convertidos).toBeDefined();
  });
});

describe('GET /api/tenant/config', () => {
  test('retorna configuração do tenant', async () => {
    const res = await request(app).get('/api/tenant/config').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.slaMinutes).toBeDefined();
    expect(res.body.ticketMedio).toBeDefined();
  });
});

describe('PATCH /api/tenant/config', () => {
  test('atualiza configuração', async () => {
    const res = await request(app).patch('/api/tenant/config').set(AUTH).send({ slaMinutes: 10, ticketMedio: 1500 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tenant).toBeDefined();
  });
});

describe('GET /api/dashboard/layout', () => {
  test('retorna layout do dashboard', async () => {
    const res = await request(app).get('/api/dashboard/layout').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.home).toBeDefined();
    expect(res.body.inbox).toBeDefined();
  });
});
