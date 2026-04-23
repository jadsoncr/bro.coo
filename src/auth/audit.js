// src/auth/audit.js
const { getPrisma } = require('../infra/db');

/**
 * Record an audit log entry for master admin actions.
 * Tolerant to FK errors — if adminId doesn't exist in admin_users, skip silently.
 */
async function recordAudit(adminId, acao, tenantId, metadata) {
  if (!adminId) return null;

  const prisma = getPrisma();

  // Check if adminId exists in admin_users table
  // If MASTER authenticated via JWT, adminId is a User.id, not AdminUser.id
  const adminExists = await prisma.adminUser.findUnique({ where: { id: adminId } }).catch(() => null);

  if (!adminExists) {
    // Try to find or create an AdminUser linked to this user
    try {
      const user = await prisma.user.findUnique({ where: { id: adminId }, select: { id: true, email: true } });
      if (user) {
        // Find existing AdminUser by email, or skip
        const existing = await prisma.adminUser.findUnique({ where: { email: user.email } }).catch(() => null);
        if (existing) {
          return prisma.adminLog.create({
            data: { adminId: existing.id, acao, tenantId: tenantId || null, metadata: metadata || null },
          });
        }
      }
    } catch { /* skip audit if we can't resolve admin */ }

    // Can't resolve admin — log to console only
    console.log(`[audit] ${acao} (adminId=${adminId}, tenantId=${tenantId || 'n/a'})`);
    return null;
  }

  return prisma.adminLog.create({
    data: { adminId, acao, tenantId: tenantId || null, metadata: metadata || null },
  });
}

/**
 * Middleware that auto-records audit entries after the response is sent.
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
    }).catch((err) => console.error('Audit log error:', err.message));
  });
  next();
}

module.exports = { recordAudit, auditMiddleware };
