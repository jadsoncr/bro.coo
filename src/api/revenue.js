const express = require('express');
const {
  getFunil,
  getLeadDetails,
  getMetrics,
  getTenantConfig,
  listLeads,
  markLeadOutcome,
  updateLeadStatus,
  updateTenantConfig,
} = require('../revenue/metrics');

const DASHBOARD_LAYOUT = {
  home: ['leads_quentes', 'sla_estourado', 'dinheiro_em_risco'],
  inbox: ['prioridade', 'tempo', 'sla_status'],
  detalheLead: ['conversa', 'score', 'origem', 'status', 'marcar_resultado'],
  resultados: ['conversao', 'receita', 'perdas', 'impacto_tempo'],
  reativacao: ['enviados', 'responderam', 'convertidos', 'receita'],
  financeiro: ['custo_mensal', 'meta_mensal', 'meta_diaria', 'receita_vs_meta', 'lucro_estimado'],
};

function createRevenueRouter({ resolveTenantId } = {}) {
  const router = express.Router();

  router.use((req, res, next) => {
    const tenantId = resolveTenantId
      ? resolveTenantId(req)
      : req.headers['x-tenant-id'] || process.env.DEFAULT_TENANT_ID;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant não informado.' });
    }

    req.tenantId = tenantId;
    return next();
  });

  router.get('/leads', async (req, res) => {
    const leads = await listLeads(req.tenantId, req.query);
    return res.json({ leads });
  });

  router.get('/leads/:id', async (req, res) => {
    const lead = await getLeadDetails(req.tenantId, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
    return res.json({ lead });
  });

  router.patch('/leads/:id/status', async (req, res) => {
    const result = await updateLeadStatus({
      tenantId: req.tenantId,
      leadId: req.params.id,
      status: req.body.status,
    });
    return res.json({ ok: true, result });
  });

  router.post('/leads/:id/result', async (req, res) => {
    const result = await markLeadOutcome({
      tenantId: req.tenantId,
      leadId: req.params.id,
      statusFinal: req.body.status_final || req.body.statusFinal,
      origemConversao: req.body.origemConversao,
      valorEntrada: req.body.valorEntrada,
      valorExito: req.body.valorExito,
    });
    return res.json({ ok: true, result });
  });

  router.get('/metrics', async (req, res) => {
    return res.json(await getMetrics(req.tenantId));
  });

  router.get('/funil', async (req, res) => {
    return res.json({ funil: await getFunil(req.tenantId) });
  });

  router.get('/reactivation', async (req, res) => {
    const metrics = await getMetrics(req.tenantId);
    return res.json(metrics.reativacao);
  });

  router.get('/tenant/config', async (req, res) => {
    return res.json(await getTenantConfig(req.tenantId));
  });

  router.patch('/tenant/config', async (req, res) => {
    const tenant = await updateTenantConfig(req.tenantId, req.body);
    return res.json({ ok: true, tenant });
  });

  router.get('/dashboard/layout', (_req, res) => {
    return res.json(DASHBOARD_LAYOUT);
  });

  return router;
}

module.exports = { createRevenueRouter, DASHBOARD_LAYOUT };
