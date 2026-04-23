// src/api/simulate.js
// Simulation endpoint — uses engine/classify as single source of truth
const express = require('express');
const { requireAuth } = require('../auth/middleware');
const { getFlow } = require('../flow/cache');
const { classifyLead } = require('../engine/classify');
const { calculatePriority } = require('../engine/priority');
const { proximoPasso } = require('../pipeline/constants');
const { getPrisma } = require('../infra/db');

const router = express.Router();

/**
 * POST /simulate
 * Body: { message }
 * Returns classification without creating a lead.
 * Uses engine/classify as single source of truth.
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message é obrigatório' });
    }

    // Load flow nodes and tenant segments
    let flowNodes = [];
    let segments = [];
    try {
      const flow = await getFlow(req.tenantId);
      if (flow && flow.nodes) flowNodes = flow.nodes;
    } catch { /* no flow available */ }

    try {
      const tenant = await getPrisma().tenant.findUnique({
        where: { id: req.tenantId },
        select: { segmentos: true, slaMinutes: true },
      });
      if (tenant?.segmentos && Array.isArray(tenant.segmentos)) segments = tenant.segmentos;
    } catch { /* no tenant config */ }

    // Classify using single source of truth
    const classification = classifyLead(message, flowNodes, segments);

    // Find segment values
    const seg = segments.find(s => s.nome === classification.segmento);
    const valorMin = classification.valorEstimadoMin || seg?.valorMin || 200;
    const valorMax = classification.valorEstimadoMax || seg?.valorMax || 1000;

    // Calculate priority
    const lead = { estagio: 'novo', activityStatus: 'novo', valorEstimado: valorMin };
    const priority = calculatePriority(lead);

    return res.json({
      segmento: classification.segmento,
      subtipo: classification.segmento,
      intencao: classification.intencao,
      valorMin,
      valorMax,
      prioridade: priority.prioridade,
      proximoPasso: proximoPasso('novo'),
      risco: valorMin,
      slaMinutos: 30,
      explicacao: classification.explicacao,
      matchedKeywords: classification.matchedKeywords,
    });
  } catch (err) {
    console.error('POST /simulate error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
