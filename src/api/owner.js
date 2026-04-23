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

// GET /owner/team — list operators for tenant
router.get('/team', async (req, res) => {
  try {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({
      where: { tenantId: req.tenantId },
      select: { id: true, nome: true, email: true, role: true, ativo: true, criadoEm: true },
      orderBy: { criadoEm: 'asc' },
    });
    return res.json({ users });
  } catch (err) {
    console.error('[owner] GET /team error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /owner/team — create operator
router.post('/team', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });

    const prisma = getPrisma();
    const bcrypt = require('bcryptjs');
    const senhaHash = await bcrypt.hash(senha, 10);

    const user = await prisma.user.create({
      data: { tenantId: req.tenantId, nome, email, senhaHash, role: 'OPERATOR', ativo: true },
      select: { id: true, nome: true, email: true, role: true, ativo: true },
    });
    return res.json({ ok: true, user });
  } catch (err) {
    if (err.message.includes('Unique constraint')) return res.status(400).json({ error: 'Email já cadastrado neste tenant' });
    console.error('[owner] POST /team error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /owner/team/:id — toggle operator active status
router.patch('/team/:id', async (req, res) => {
  try {
    const prisma = getPrisma();
    const user = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { ativo: !user.ativo },
      select: { id: true, nome: true, email: true, role: true, ativo: true },
    });
    return res.json({ ok: true, user: updated });
  } catch (err) {
    console.error('[owner] PATCH /team/:id error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /owner/flow/nodes — flow tree for config page
router.get('/flow/nodes', async (req, res) => {
  try {
    const prisma = getPrisma();
    const flow = await prisma.flow.findFirst({
      where: { tenantId: req.tenantId, ativo: true },
      include: { nodes: { orderBy: { ordem: 'asc' } } },
    });
    if (!flow) return res.json({ nodes: [] });
    return res.json({ nodes: flow.nodes });
  } catch (err) {
    console.error('[owner] GET /flow/nodes error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /owner/flow/nodes/:estado — edit node message/options/keywords
router.patch('/flow/nodes/:estado', async (req, res) => {
  try {
    const prisma = getPrisma();
    const flow = await prisma.flow.findFirst({ where: { tenantId: req.tenantId, ativo: true } });
    if (!flow) return res.status(404).json({ error: 'Fluxo não encontrado' });

    const node = await prisma.node.findFirst({ where: { flowId: flow.id, estado: req.params.estado } });
    if (!node) return res.status(404).json({ error: 'Node não encontrado' });

    const { mensagem, opcoes, config } = req.body;
    const data = {};
    if (mensagem !== undefined) data.mensagem = mensagem;
    if (opcoes !== undefined) {
      // Validate: all proxEstado must exist in the flow
      const allEstados = new Set((await prisma.node.findMany({ where: { flowId: flow.id }, select: { estado: true } })).map(n => n.estado));
      for (const op of opcoes) {
        if (op.proxEstado && !allEstados.has(op.proxEstado)) {
          return res.status(400).json({ error: `proxEstado "${op.proxEstado}" não existe no fluxo` });
        }
      }
      data.opcoes = opcoes;
    }
    if (config !== undefined) {
      data.opcoes = node.opcoes; // preserve opcoes if only config changes
      // Merge config into opcoes metadata (stored in node for now)
    }

    const updated = await prisma.node.update({ where: { id: node.id }, data });

    // Invalidate flow cache
    const { invalidateAll } = require('../flow/cache');
    invalidateAll(req.tenantId);

    return res.json({ ok: true, node: updated });
  } catch (err) {
    console.error('[owner] PATCH /flow/nodes error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /owner/flow/validate — validate flow integrity
router.post('/flow/validate', async (req, res) => {
  try {
    const prisma = getPrisma();
    const flow = await prisma.flow.findFirst({
      where: { tenantId: req.tenantId, ativo: true },
      include: { nodes: true },
    });
    if (!flow) return res.json({ valid: false, errors: [{ node: null, message: 'Nenhum fluxo ativo' }] });

    const errors = [];
    const warnings = [];
    const estados = new Set(flow.nodes.map(n => n.estado));

    // Required nodes
    if (!estados.has('start')) errors.push({ node: null, message: 'Node "start" obrigatório não encontrado' });
    if (!flow.nodes.some(n => n.tipo === 'final_lead')) errors.push({ node: null, message: 'Nenhum node final_lead encontrado' });

    // Check proxEstado validity
    for (const node of flow.nodes) {
      if (node.opcoes && Array.isArray(node.opcoes)) {
        for (const op of node.opcoes) {
          if (op.proxEstado && !estados.has(op.proxEstado)) {
            errors.push({ node: node.estado, message: `Opção aponta para "${op.proxEstado}" que não existe` });
          }
        }
      }
    }

    // Reachability check: BFS from start
    const reachable = new Set();
    const queue = ['start'];
    while (queue.length > 0) {
      const current = queue.shift();
      if (reachable.has(current)) continue;
      reachable.add(current);
      const node = flow.nodes.find(n => n.estado === current);
      if (node && node.opcoes) {
        for (const op of node.opcoes) {
          if (op.proxEstado && !reachable.has(op.proxEstado)) queue.push(op.proxEstado);
        }
      }
    }
    for (const node of flow.nodes) {
      if (!reachable.has(node.estado) && node.estado !== 'fallback' && node.estado !== 'pos_final') {
        warnings.push({ node: node.estado, message: `Node "${node.estado}" não é alcançável a partir do start` });
      }
    }

    // Input nodes without destination
    for (const node of flow.nodes) {
      if (node.tipo === 'input' && (!node.opcoes || node.opcoes.length === 0 || !node.opcoes[0]?.proxEstado)) {
        warnings.push({ node: node.estado, message: `Input node "${node.estado}" sem destino definido` });
      }
    }

    // Fallback check
    if (!estados.has('fallback')) {
      warnings.push({ node: null, message: 'Nenhum node "fallback" encontrado (recomendado)' });
    }

    return res.json({ valid: errors.length === 0, errors, warnings });
  } catch (err) {
    console.error('[owner] POST /flow/validate error:', err.message);
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

    // Update segmentos if provided
    if (req.body.segmentos !== undefined) {
      const prisma = getPrisma();
      await prisma.tenant.update({
        where: { id: req.tenantId },
        data: { segmentos: req.body.segmentos },
      });
    }

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
