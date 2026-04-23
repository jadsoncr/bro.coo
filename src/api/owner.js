// src/api/owner.js
const express = require('express');
const { requireAuth, requireRole } = require('../auth/middleware');
const { loadBillingStatus, allowReadWhenSuspended } = require('../auth/billing');
const { getPrisma } = require('../infra/db');
const {
  getOwnerMetrics,
  listLeads,
  getLeadDetails,
  getFunil,
  getTenantConfig,
  updateTenantConfig,
} = require('../revenue/metrics');
const { getCasosByTenant, getCasoDetail } = require('../conversion/caso');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('OWNER'));

// Allow MASTER to view any tenant's data via ?tenantId=xxx
router.use((req, res, next) => {
  if (req.role === 'MASTER' && req.query.tenantId) {
    req.tenantId = req.query.tenantId;
  }
  next();
});

router.use(loadBillingStatus);
router.use(allowReadWhenSuspended);

// GET /owner/metrics — dashboard metrics with date filter
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await getOwnerMetrics(req.tenantId, req.query.periodo);
    return res.json(metrics);
  } catch (err) {
    console.error('[owner] GET /metrics error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /owner/leads — read-only lead list
router.get('/leads', async (req, res) => {
  try {
    const leads = await listLeads(req.tenantId, req.query);
    return res.json({ leads });
  } catch (err) {
    console.error('[owner] GET /leads error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /owner/leads/:id — read-only lead detail
router.get('/leads/:id', async (req, res) => {
  try {
    const lead = await getLeadDetails(req.tenantId, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    return res.json({ lead });
  } catch (err) {
    console.error('[owner] GET /leads/:id error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /owner/casos — list of Casos for tenant
router.get('/casos', async (req, res) => {
  try {
    const casos = await getCasosByTenant(req.tenantId, req.query);
    return res.json({ casos });
  } catch (err) {
    console.error('[owner] GET /casos error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /owner/casos/:id — Caso detail
router.get('/casos/:id', async (req, res) => {
  try {
    const caso = await getCasoDetail(req.tenantId, req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso não encontrado' });
    return res.json({ caso });
  } catch (err) {
    console.error('[owner] GET /casos/:id error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /owner/funil — funnel analysis
router.get('/funil', async (req, res) => {
  try {
    const funil = await getFunil(req.tenantId);
    return res.json({ funil });
  } catch (err) {
    console.error('[owner] GET /funil error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /owner/alerts — active alerts
router.get('/alerts', async (req, res) => {
  try {
    const result = await getOwnerMetrics(req.tenantId, 'mes');
    return res.json({ alertas: result.alertas });
  } catch (err) {
    console.error('[owner] GET /alerts error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /owner/tenant/config — tenant configuration
router.get('/tenant/config', async (req, res) => {
  try {
    const config = await getTenantConfig(req.tenantId);
    return res.json(config);
  } catch (err) {
    console.error('[owner] GET /tenant/config error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /owner/tenant/config — update config
router.patch('/tenant/config', async (req, res) => {
  try {
    // Validate slaMinutes if provided
    if (req.body.slaMinutes !== undefined) {
      const val = Number(req.body.slaMinutes);
      if (!Number.isInteger(val) || val <= 0) {
        return res.status(400).json({ error: 'slaMinutes deve ser um inteiro positivo' });
      }
    }

    // Validate slaContratoHoras if provided
    if (req.body.slaContratoHoras !== undefined) {
      const val = Number(req.body.slaContratoHoras);
      if (!Number.isInteger(val) || val <= 0) {
        return res.status(400).json({ error: 'slaContratoHoras deve ser um inteiro positivo' });
      }
    }

    const tenant = await updateTenantConfig(req.tenantId, req.body);

    // Also update slaContratoHoras directly via Prisma if provided
    if (req.body.slaContratoHoras !== undefined) {
      const prisma = getPrisma();
      const updated = await prisma.tenant.update({
        where: { id: req.tenantId },
        data: { slaContratoHoras: Number(req.body.slaContratoHoras) },
      });
      return res.json({ ok: true, tenant: updated });
    }

    return res.json({ ok: true, tenant });
  } catch (err) {
    console.error('[owner] PATCH /tenant/config error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
