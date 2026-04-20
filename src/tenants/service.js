// src/tenants/service.js
const { getPrisma } = require('../infra/db');

const _cache = new Map();

function getTenantCache() {
  return _cache;
}

async function resolveTenant(botToken) {
  if (_cache.has(botToken)) return _cache.get(botToken);

  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { botToken } });

  if (tenant && tenant.ativo) {
    _cache.set(botToken, tenant);
    return tenant;
  }

  return null;
}

module.exports = { resolveTenant, getTenantCache };
