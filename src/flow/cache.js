// src/flow/cache.js
// Flow cache with support for: legacy nodes (DB) OR base template + overrides
const { getPrisma } = require('../infra/db');
const { resolveFlow } = require('../engine/resolveNode');

const DEFAULT_TTL_MS = 60 * 1000;
const _cache = new Map();

function cacheKey(tenantId, flowId) {
  return `${tenantId}:${flowId || 'active'}`;
}

/**
 * Get a flow definition with resolved nodes.
 *
 * Priority:
 * 1. If tenant has nodes in DB (legacy or cloned) → use those (current behavior)
 * 2. If tenant has no nodes but has overrides → load base template + apply overrides
 * 3. If neither → return null
 */
async function getFlow(tenantId, flowId) {
  const prisma = getPrisma();

  // Resolve flowId if not provided
  if (!flowId) {
    const flow = await prisma.flow.findFirst({ where: { tenantId, ativo: true } });
    if (!flow) return null;
    flowId = flow.id;
  }

  const key = cacheKey(tenantId, flowId);
  const cached = _cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  // Load flow with nodes from DB
  const flow = await prisma.flow.findFirst({
    where: { id: flowId, tenantId, ativo: true },
    include: {
      nodes: { orderBy: { ordem: 'asc' } },
      tenant: { select: { nome: true, flowSource: true } },
    },
  });

  if (!flow) {
    _cache.delete(key);
    return null;
  }

  // PATH 1: Tenant has nodes in DB → use them (backward compatible)
  if (flow.nodes && flow.nodes.length > 0) {
    // Check for overrides to apply on top of DB nodes
    const overrides = await prisma.flowOverride.findMany({
      where: { flowId: flow.id },
    }).catch(() => []);

    const resolvedNodes = overrides.length > 0
      ? resolveFlow(flow.nodes, overrides)
      : flow.nodes;

    const result = { ...flow, nodes: resolvedNodes };
    _cache.set(key, { data: result, expiresAt: Date.now() + DEFAULT_TTL_MS });
    return result;
  }

  // PATH 2: No nodes in DB → try base template + overrides
  const templateType = flow.config?.tipo;
  if (templateType) {
    try {
      const { getTemplate } = require('../templates/service');
      const template = getTemplate(templateType);
      if (template && template.nodes) {
        const overrides = await prisma.flowOverride.findMany({
          where: { flowId: flow.id },
        }).catch(() => []);

        const resolvedNodes = resolveFlow(template.nodes, overrides);
        const result = { ...flow, nodes: resolvedNodes };
        _cache.set(key, { data: result, expiresAt: Date.now() + DEFAULT_TTL_MS });
        return result;
      }
    } catch { /* template not found, fall through */ }
  }

  _cache.delete(key);
  return null;
}

function invalidateCache(tenantId, flowId) {
  if (flowId) {
    _cache.delete(cacheKey(tenantId, flowId));
  }
  // Also invalidate the 'active' key
  _cache.delete(cacheKey(tenantId, 'active'));
}

function invalidateAll(tenantId) {
  const prefix = `${tenantId}:`;
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

function _clearCache() { _cache.clear(); }
function _getCacheMap() { return _cache; }

module.exports = { getFlow, invalidateCache, invalidateAll, _clearCache, _getCacheMap };
