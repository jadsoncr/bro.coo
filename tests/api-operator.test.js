// tests/api-operator.test.js
const request = require('supertest');
const express = require('express');

// Mock auth middleware
jest.mock('../src/auth/middleware', () => ({
  requireAuth: (req, _res, next) => {
    req.userId = 'operator-1';
    req.tenantId = 'tenant-1';
    req.role = 'OPERATOR';
    next();
  },
  requireRole: () => (_req, _res, next) => next(),
}));

// Mock dependencies
jest.mock('../src/infra/db', () => ({
  getPrisma: jest.fn(),
}));

jest.mock('../src/sla/queues', () => ({
  getQueues: jest.fn(),
}));

jest.mock('../src/revenue/metrics', () => ({
  listLeads: jest.fn(),
  getLeadDetails: jest.fn(),
  updateLeadStatus: jest.fn(),
}));

jest.mock('../src/conversion/service', () => ({
  convert: jest.fn(),
}));

jest.mock('../src/events/service', () => ({
  safeRecordEvent: jest.fn(async () => ({ id: 'evt-1' })),
  EVENTS: {
    FIRST_RESPONSE: 'first_response',
    LOST: 'lost',
  },
}));

jest.mock('../src/realtime/socket', () => ({
  emitToTenant: jest.fn(),
}));

const { getPrisma } = require('../src/infra/db');
const { getQueues } = require('../src/sla/queues');
const { listLeads, getLeadDetails, updateLeadStatus } = require('../src/revenue/metrics');
const { convert } = require('../src/conversion/service');
const { safeRecordEvent } = require('../src/events/service');
const { emitToTenant } = require('../src/realtime/socket');

const operatorRouter = require('../src/api/operator');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/operator', operatorRouter);
  return app;
}

let app;
beforeEach(() => {
  jest.clearAllMocks();
  app = buildApp();
});

describe('GET /operator/leads', () => {
  test('returns queues and leads', async () => {
    getQueues.mockResolvedValue([{ name: 'Leads sem resposta', count: 1, items: [] }]);
    listLeads.mockResolvedValue([{ id: 'lead-1', nome: 'João' }]);

    const res = await request(app).get('/operator/leads');
    expect(res.status).toBe(200);
    expect(res.body.queues).toHaveLength(1);
    expect(res.body.leads).toHaveLength(1);
    expect(getQueues).toHaveBeenCalledWith('tenant-1');
    expect(listLeads).toHaveBeenCalledWith('tenant-1', {});
  });

  test('returns 500 on error', async () => {
    getQueues.mockRejectedValue(new Error('db down'));
    const res = await request(app).get('/operator/leads');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Erro interno');
  });
});

describe('GET /operator/leads/:id', () => {
  test('returns lead detail', async () => {
    getLeadDetails.mockResolvedValue({
      id: 'lead-1',
      nome: 'João',
      messages: [{ id: 'msg-1' }],
      events: [],
    });

    const res = await request(app).get('/operator/leads/lead-1');
    expect(res.status).toBe(200);
    expect(res.body.lead.id).toBe('lead-1');
    expect(res.body.lead.messages).toHaveLength(1);
  });

  test('returns 404 if not found', async () => {
    getLeadDetails.mockResolvedValue(null);
    const res = await request(app).get('/operator/leads/nope');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /operator/leads/:id/assumir', () => {
  test('assumes lead and sets primeiraRespostaEm if null', async () => {
    const mockLead = { id: 'lead-1', primeiraRespostaEm: null };
    const mockUpdated = { ...mockLead, status: 'EM_ATENDIMENTO', assumidoPorId: 'operator-1' };
    const mockPrisma = {
      lead: {
        findFirst: jest.fn().mockResolvedValue(mockLead),
        update: jest.fn().mockResolvedValue(mockUpdated),
      },
    };
    getPrisma.mockReturnValue(mockPrisma);

    const res = await request(app).patch('/operator/leads/lead-1/assumir');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const updateCall = mockPrisma.lead.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('EM_ATENDIMENTO');
    expect(updateCall.data.assumidoPorId).toBe('operator-1');
    expect(updateCall.data.primeiraRespostaEm).toBeDefined();
    expect(safeRecordEvent).toHaveBeenCalled();
    expect(emitToTenant).toHaveBeenCalledWith('tenant-1', 'lead:updated', { leadId: 'lead-1' });
  });

  test('does not overwrite existing primeiraRespostaEm', async () => {
    const existing = new Date('2024-01-01');
    const mockLead = { id: 'lead-1', primeiraRespostaEm: existing };
    const mockPrisma = {
      lead: {
        findFirst: jest.fn().mockResolvedValue(mockLead),
        update: jest.fn().mockResolvedValue(mockLead),
      },
    };
    getPrisma.mockReturnValue(mockPrisma);

    await request(app).patch('/operator/leads/lead-1/assumir');
    const updateCall = mockPrisma.lead.update.mock.calls[0][0];
    expect(updateCall.data.primeiraRespostaEm).toBeUndefined();
  });

  test('returns 404 if lead not found', async () => {
    getPrisma.mockReturnValue({
      lead: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const res = await request(app).patch('/operator/leads/nope/assumir');
    expect(res.status).toBe(404);
  });
});

describe('POST /operator/leads/:id/messages', () => {
  test('creates message and emits event', async () => {
    const mockMsg = { id: 'msg-1', direcao: 'humano', conteudo: 'Olá' };
    getPrisma.mockReturnValue({
      message: { create: jest.fn().mockResolvedValue(mockMsg) },
    });

    const res = await request(app)
      .post('/operator/leads/lead-1/messages')
      .send({ texto: 'Olá' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message.direcao).toBe('humano');
    expect(emitToTenant).toHaveBeenCalledWith('tenant-1', 'lead:updated', { leadId: 'lead-1' });
  });

  test('rejects empty texto', async () => {
    const res = await request(app)
      .post('/operator/leads/lead-1/messages')
      .send({ texto: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('texto é obrigatório');
  });

  test('rejects missing texto', async () => {
    const res = await request(app)
      .post('/operator/leads/lead-1/messages')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('texto é obrigatório');
  });

  test('rejects whitespace-only texto', async () => {
    const res = await request(app)
      .post('/operator/leads/lead-1/messages')
      .send({ texto: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('texto é obrigatório');
  });
});

describe('POST /operator/leads/:id/converter', () => {
  test('converts lead successfully', async () => {
    convert.mockResolvedValue({
      lead: { id: 'lead-1', statusFinal: 'virou_cliente' },
      caso: { id: 'caso-1', tipoContrato: 'entrada' },
    });

    const res = await request(app)
      .post('/operator/leads/lead-1/converter')
      .send({ tipoContrato: 'entrada', valorEntrada: 5000 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.lead).toBeDefined();
    expect(res.body.caso).toBeDefined();
    expect(convert).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      operatorId: 'operator-1',
      tipoContrato: 'entrada',
      valorEntrada: 5000,
    });
  });

  test('returns 400 on validation error', async () => {
    convert.mockRejectedValue(new Error('valorEntrada é obrigatório para tipo entrada'));

    const res = await request(app)
      .post('/operator/leads/lead-1/converter')
      .send({ tipoContrato: 'entrada' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('valorEntrada');
  });
});

describe('PATCH /operator/leads/:id/status', () => {
  test('updates lead status', async () => {
    updateLeadStatus.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .patch('/operator/leads/lead-1/status')
      .send({ status: 'EM_ATENDIMENTO' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(updateLeadStatus).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      status: 'EM_ATENDIMENTO',
    });
  });
});

describe('PATCH /operator/leads/:id/desistir', () => {
  test('marks lead as lost with valid motivo', async () => {
    const mockUpdated = { id: 'lead-1', statusFinal: 'PERDIDO', motivoDesistencia: 'PRECO_ALTO' };
    getPrisma.mockReturnValue({
      lead: { update: jest.fn().mockResolvedValue(mockUpdated) },
    });

    const res = await request(app)
      .patch('/operator/leads/lead-1/desistir')
      .send({ motivo: 'PRECO_ALTO' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(safeRecordEvent).toHaveBeenCalled();
  });

  test('rejects without motivo', async () => {
    const res = await request(app)
      .patch('/operator/leads/lead-1/desistir')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Motivo obrigatório para desistência');
  });

  test('rejects invalid motivo', async () => {
    const res = await request(app)
      .patch('/operator/leads/lead-1/desistir')
      .send({ motivo: 'INVALIDO' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Motivo obrigatório para desistência');
  });

  test('accepts all valid motivos', async () => {
    const motivos = [
      'SEM_RESPOSTA_48H', 'PRECO_ALTO', 'SEM_INTERESSE',
      'FECHOU_COM_OUTRO', 'FORA_DO_PERFIL', 'CONTATO_INVALIDO', 'OUTRO',
    ];

    for (const motivo of motivos) {
      getPrisma.mockReturnValue({
        lead: { update: jest.fn().mockResolvedValue({ id: 'lead-1' }) },
      });
      const res = await request(app)
        .patch('/operator/leads/lead-1/desistir')
        .send({ motivo });
      expect(res.status).toBe(200);
    }
  });
});
