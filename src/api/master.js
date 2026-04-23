// src/api/master.js
const { Router } = require('express');
const { requireAdmin } = require('../auth/middleware');
const { auditMiddleware } = require('../auth/audit');
const { getPrisma } = require('../infra/db');
const { getOwnerMetrics, getGlobalMetrics, getLossPatterns, toNumber } = require('../revenue/metrics');
const { listTemplates, createTenantFromTemplate } = require('../templates/service');

const router = Router();

// All routes require admin auth + audit logging
router.use(requireAdmin);
router.use(auditMiddleware);

// GET /master/templates — list available templates
router.get('/templates', (_req, res) => {
  return res.json({ templates: listTemplates() });
});

// POST /master/tenants — create tenant from template
router.post('/tenants', async (req, res) => {
  try {
    const { templateId, nome, ownerEmail, ownerSenha, ownerNome, moeda, botToken } = req.body;
    if (!templateId || !nome || !ownerEmail || !ownerSenha) {
      return res.status(400).json({ error: 'templateId, nome, ownerEmail e ownerSenha são obrigatórios' });
    }
    const result = await createTenantFromTemplate({ templateId, nome, ownerEmail, ownerSenha, ownerNome, moeda, botToken });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('POST /master/tenants error:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// GET /master/tenants — list all active tenants with key metrics
router.get('/tenants', async (req, res) => {
  try {
    const prisma = getPrisma();
    const tenants = await prisma.tenant.findMany({ where: { ativo: true } });

    const result = [];
    for (const tenant of tenants) {
      const leads = await prisma.lead.findMany({ where: { tenantId: tenant.id } });
      const casos = await prisma.caso.findMany({ where: { tenantId: tenant.id } });

      const totalLeads = leads.length;
      const converted = leads.filter(l => l.statusFinal === 'virou_cliente').length;
      const conversao = totalLeads > 0 ? converted / totalLeads : 0;
      const revenue = casos
        .filter(c => c.valorRecebido != null && c.dataRecebimento)
        .reduce((sum, c) => sum + toNumber(c.valorRecebido), 0);

      const leadsComResposta = leads.filter(l => l.primeiraRespostaEm);
      const avgResponseTime = leadsComResposta.length > 0
        ? leadsComResposta.reduce((sum, l) => {
            const elapsed = Math.max(0, Math.floor((new Date(l.primeiraRespostaEm).getTime() - new Date(l.criadoEm).getTime()) / 60000));
            return sum + elapsed;
          }, 0) / leadsComResposta.length
        : 0;

      result.push({
        id: tenant.id,
        nome: tenant.nome,
        plano: tenant.plano,
        billingStatus: tenant.billingStatus || 'active',
        leads: totalLeads,
        conversao,
        revenue,
        avgResponseTime,
      });
    }

    res.json({ tenants: result });
  } catch (err) {
    console.error('GET /master/tenants error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});


// GET /master/tenants/:id/metrics — detailed metrics for one tenant
router.get('/tenants/:id/metrics', async (req, res) => {
  try {
    const metrics = await getOwnerMetrics(req.params.id, req.query.periodo);
    res.json(metrics);
  } catch (err) {
    console.error('GET /master/tenants/:id/metrics error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /master/global/metrics — aggregated cross-tenant metrics
router.get('/global/metrics', async (req, res) => {
  try {
    const data = await getGlobalMetrics();
    res.json({ global: data.global, tenants: data.tenants });
  } catch (err) {
    console.error('GET /master/global/metrics error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /master/global/loss-patterns — aggregate desistência reasons and abandonment steps
router.get('/global/loss-patterns', async (req, res) => {
  try {
    const tenantId = req.query.tenantId || null;
    const data = await getLossPatterns(tenantId);
    res.json({ byReason: data.byReason, byStep: data.byStep });
  } catch (err) {
    console.error('GET /master/global/loss-patterns error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /master/global/benchmarks — tenant comparison sorted by revenue desc
router.get('/global/benchmarks', async (req, res) => {
  try {
    const data = await getGlobalMetrics();
    const benchmarks = data.tenants.sort((a, b) => b.revenue - a.revenue);
    res.json({ benchmarks });
  } catch (err) {
    console.error('GET /master/global/benchmarks error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /master/tenants/:id/billing — update billing status
router.patch('/tenants/:id/billing', async (req, res) => {
  try {
    const prisma = getPrisma();
    const { billingStatus } = req.body;
    const valid = ['active', 'past_due', 'suspended', 'canceled'];
    if (!valid.includes(billingStatus)) {
      return res.status(400).json({ error: `billingStatus deve ser: ${valid.join(', ')}` });
    }

    const data = { billingStatus };

    // Set billingDueDate when transitioning to past_due
    if (billingStatus === 'past_due') {
      const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id }, select: { billingDueDate: true } });
      if (!tenant?.billingDueDate) {
        data.billingDueDate = new Date();
      }
    }

    // Reactivate if setting back to active
    if (billingStatus === 'active') {
      data.billingDueDate = null;
      data.ativo = true;
    }

    // Deactivate on cancel
    if (billingStatus === 'canceled') {
      data.ativo = false;
    }

    const updated = await prisma.tenant.update({
      where: { id: req.params.id },
      data,
      select: { id: true, nome: true, billingStatus: true, billingDueDate: true, ativo: true },
    });

    return res.json({ ok: true, tenant: updated });
  } catch (err) {
    console.error('PATCH /master/tenants/:id/billing error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /master/audit-log — audit log entries
router.get('/audit-log', async (req, res) => {
  try {
    const prisma = getPrisma();
    const where = {};
    if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }
    const logs = await prisma.adminLog.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: 100,
    });
    res.json({ logs });
  } catch (err) {
    console.error('GET /master/audit-log error:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
