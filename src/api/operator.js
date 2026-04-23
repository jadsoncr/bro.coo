// src/api/operator.js
const express = require('express');
const { requireAuth, requireRole } = require('../auth/middleware');
const { loadBillingStatus, requireActiveBilling } = require('../auth/billing');
const { getPrisma } = require('../infra/db');
const { getQueues } = require('../sla/queues');
const { listLeads, getLeadDetails, updateLeadStatus } = require('../revenue/metrics');
const { convert } = require('../conversion/service');
const { safeRecordEvent, EVENTS } = require('../events/service');
const { emitToTenant } = require('../realtime/socket');
const { PIPELINE, ACTIVITY_STATUS, STAGE_ACTIVITY_MAP, PIPELINE_ORDER, calcularPrioridade } = require('../pipeline/constants');

const MOTIVOS_DESISTENCIA = [
  'SEM_RESPOSTA_48H',
  'PRECO_ALTO',
  'SEM_INTERESSE',
  'FECHOU_COM_OUTRO',
  'FORA_DO_PERFIL',
  'CONTATO_INVALIDO',
  'OUTRO',
];

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('OPERATOR'));

// Allow MASTER to view any tenant's data via ?tenantId=xxx
router.use((req, res, next) => {
  if (req.role === 'MASTER' && req.query.tenantId) {
    req.tenantId = req.query.tenantId;
  }
  next();
});

router.use(loadBillingStatus);
router.use(requireActiveBilling);

// GET /operator/leads — inbox with dynamic queues
router.get('/leads', async (req, res) => {
  try {
    const [queues, leads] = await Promise.all([
      getQueues(req.tenantId),
      listLeads(req.tenantId, req.query),
    ]);
    return res.json({ queues, leads });
  } catch (err) {
    console.error('[operator] GET /leads error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /operator/leads/:id — detail with messages and events
router.get('/leads/:id', async (req, res) => {
  try {
    const lead = await getLeadDetails(req.tenantId, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    return res.json({ lead });
  } catch (err) {
    console.error('[operator] GET /leads/:id error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /operator/leads/:id/assumir — assume lead
router.patch('/leads/:id/assumir', async (req, res) => {
  try {
    const prisma = getPrisma();
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
    });
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

    const updateData = {
      status: 'EM_ATENDIMENTO',
      assumidoPorId: req.userId,
    };
    if (!lead.primeiraRespostaEm) {
      updateData.primeiraRespostaEm = new Date();
    }
    if (!lead.estagio || lead.estagio === 'novo') {
      updateData.estagio = 'atendimento';
    }

    const updated = await prisma.lead.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await safeRecordEvent({
      tenantId: req.tenantId,
      leadId: req.params.id,
      event: EVENTS.FIRST_RESPONSE,
      metadata: { operatorId: req.userId },
    });

    emitToTenant(req.tenantId, 'lead:updated', { leadId: req.params.id });

    return res.json({ ok: true, lead: updated });
  } catch (err) {
    console.error('[operator] PATCH /leads/:id/assumir error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /operator/leads/:id/messages — send human message
router.post('/leads/:id/messages', async (req, res) => {
  try {
    if (!req.body.texto || typeof req.body.texto !== 'string' || !req.body.texto.trim()) {
      return res.status(400).json({ error: 'texto é obrigatório' });
    }

    const prisma = getPrisma();
    const message = await prisma.message.create({
      data: {
        tenantId: req.tenantId,
        leadId: req.params.id,
        direcao: 'humano',
        conteudo: req.body.texto,
      },
    });

    emitToTenant(req.tenantId, 'lead:updated', { leadId: req.params.id });

    return res.json({ ok: true, message });
  } catch (err) {
    console.error('[operator] POST /leads/:id/messages error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /operator/leads/:id/converter — convert lead to client
router.post('/leads/:id/converter', async (req, res) => {
  try {
    const { lead, caso } = await convert({
      tenantId: req.tenantId,
      leadId: req.params.id,
      operatorId: req.userId,
      ...req.body,
    });
    return res.json({ ok: true, lead, caso });
  } catch (err) {
    if (err.message && !err.message.includes('Erro interno')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[operator] POST /leads/:id/converter error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /operator/leads/:id/status — change lead status
router.patch('/leads/:id/status', async (req, res) => {
  try {
    await updateLeadStatus({
      tenantId: req.tenantId,
      leadId: req.params.id,
      status: req.body.status,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[operator] PATCH /leads/:id/status error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /operator/leads/:id/estagio — advance pipeline stage
router.patch('/leads/:id/estagio', async (req, res) => {
  try {
    const { estagio } = req.body;
    if (!estagio || !PIPELINE.includes(estagio)) {
      return res.status(400).json({ error: 'Estágio inválido. Use: ' + PIPELINE.join(', ') });
    }
    
    const prisma = getPrisma();
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    
    if (estagio !== 'perdido' && PIPELINE_ORDER[estagio] <= PIPELINE_ORDER[lead.estagio || 'novo']) {
      return res.status(400).json({ error: 'Não é possível retroceder estágio' });
    }
    
    const activityStatus = STAGE_ACTIVITY_MAP[estagio] || lead.activityStatus;
    const updateData = { estagio, activityStatus: activityStatus || 'novo' };
    if (estagio === 'atendimento') updateData.status = 'EM_ATENDIMENTO';
    
    // Recalculate priority
    updateData.prioridade = calcularPrioridade({ ...lead, ...updateData });
    
    const updated = await prisma.lead.update({ where: { id: req.params.id }, data: updateData });
    emitToTenant(req.tenantId, 'lead:updated', { leadId: req.params.id });
    return res.json({ ok: true, lead: updated });
  } catch (err) {
    console.error('[operator] PATCH /leads/:id/estagio error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /operator/leads/:id/activity — update activity status
router.patch('/leads/:id/activity', async (req, res) => {
  try {
    const { activityStatus } = req.body;
    if (!activityStatus || !ACTIVITY_STATUS.includes(activityStatus)) {
      return res.status(400).json({ error: 'Activity status inválido. Use: ' + ACTIVITY_STATUS.join(', ') });
    }
    
    const prisma = getPrisma();
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    
    const updateData = { activityStatus };
    updateData.prioridade = calcularPrioridade({ ...lead, ...updateData });
    
    const updated = await prisma.lead.update({ where: { id: req.params.id }, data: updateData });
    emitToTenant(req.tenantId, 'lead:updated', { leadId: req.params.id });
    return res.json({ ok: true, lead: updated });
  } catch (err) {
    console.error('[operator] PATCH /leads/:id/activity error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /operator/leads/:id/desistir — mark as desistiu
router.patch('/leads/:id/desistir', async (req, res) => {
  try {
    if (!req.body.motivo || !MOTIVOS_DESISTENCIA.includes(req.body.motivo)) {
      return res.status(400).json({ error: 'Motivo obrigatório para desistência' });
    }

    const prisma = getPrisma();
    const updated = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        statusFinal: 'PERDIDO',
        motivoDesistencia: req.body.motivo,
        perdidoEm: new Date(),
        estagio: 'perdido',
      },
    });

    await safeRecordEvent({
      tenantId: req.tenantId,
      leadId: req.params.id,
      event: EVENTS.LOST,
      metadata: { motivo: req.body.motivo },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[operator] PATCH /leads/:id/desistir error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
