// src/flow/cache.js
// In-memory flow cache with TTL invalidation
const { getPrisma } = require('../infra/db');

const DEFAULT_TTL_MS = 60 * 1000; // 60 seconds

// Map<string, { data, expiresAt }>
const _cache = new Map();

/**
 * Build cache key from tenantId and flowId.
 */
function cacheKey(tenantId, flowId) {
  return `${tenantId}:${flowId}`;
}

/**
 * Get a flow definition with its nodes, using cache when available.
 * If flowId is not provided, fetches the first active flow for the tenant.
 */
async function getFlow(tenantId, flowId) {
  const prisma = getPrisma();

  // If no flowId, resolve the active flow for this tenant
  if (!flowId) {
    const flow = await prisma.flow.findFirst({
      where: { tenantId, ativo: true },
    });
    if (!flow) return null;
    flowId = flow.id;
  }

  const key = cacheKey(tenantId, flowId);
  const cached = _cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Cache miss or expired — fetch from DB
  const flow = await prisma.flow.findFirst({
    where: { id: flowId, tenantId, ativo: true },
    include: { nodes: { orderBy: { ordem: 'asc' } } },
  });

  if (!flow) {
    _cache.delete(key);
    return null;
  }

  _cache.set(key, {
    data: flow,
    expiresAt: Date.now() + DEFAULT_TTL_MS,
  });

  return flow;
}

/**
 * Invalidate cache for a specific flow.
 */
function invalidateCache(tenantId, flowId) {
  const key = cacheKey(tenantId, flowId);
  _cache.delete(key);
}

/**
 * Invalidate all cached flows for a tenant.
 */
function invalidateAll(tenantId) {
  const prefix = `${tenantId}:`;
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) {
      _cache.delete(key);
    }
  }
}

/**
 * Clear entire cache (for testing).
 */
function _clearCache() {
  _cache.clear();
}

/**
 * Get raw cache map (for testing).
 */
function _getCacheMap() {
  return _cache;
}

module.exports = { getFlow, invalidateCache, invalidateAll, _clearCache, _getCacheMap };
