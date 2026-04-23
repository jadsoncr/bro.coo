// src/auth/audit.js
const { getPrisma } = require('../infra/db');

/**
 * Record an audit log entry for master admin actions.
 */
async function recordAudit(adminId, acao, tenantId, metadata) {
  const prisma = getPrisma();
  return prisma.adminLog.create({
    data: { adminId, acao, tenantId: tenantId || null, metadata: metadata || null },
  });
}

/**
 * Middleware that auto-records audit entries after the response is sent.
 * Attach to master routes to log every action.
 */
function auditMiddleware(req, res, next) {
  res.on('finish', () => {
    if (!req.adminId) return;
    const acao = `${req.method} ${req.originalUrl}`;
    const tenantId = req.params.id || req.query.tenantId || null;
    recordAudit(req.adminId, acao, tenantId, {
      statusCode: res.statusCode,
      method: req.method,
      path: req.originalUrl,
    }).catch((err) => console.error('Audit log error:', err));
  });
  next();
}

module.exports = { recordAudit, auditMiddleware };
