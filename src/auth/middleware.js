// src/auth/middleware.js
const { verifyToken, verifyAdminToken } = require('./service');

/**
 * JWT auth middleware for Owner/Operator routes.
 * Extracts Bearer token from Authorization header, verifies JWT,
 * and sets req.userId, req.tenantId, req.role.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }

  const token = header.slice(7);
  try {
    const claims = verifyToken(token);
    req.userId = claims.userId;
    req.tenantId = claims.tenantId;
    req.role = claims.role;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

/**
 * Role-based access middleware.
 * MASTER role can access any role-protected route.
 * Returns 403 "Acesso negado" if req.role is not in the allowed list.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (req.role === 'MASTER' || roles.includes(req.role)) {
      return next();
    }
    return res.status(403).json({ error: 'Acesso negado' });
  };
}

/**
 * Admin token middleware for Master routes.
 * First tries JWT Bearer token (MASTER role), then falls back to x-admin-token header.
 */
async function requireAdmin(req, res, next) {
  // First try JWT (MASTER role)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const claims = verifyToken(authHeader.slice(7));
      if (claims.role === 'MASTER') {
        req.adminId = claims.userId;
        req.tenantId = claims.tenantId;
        req.role = 'MASTER';
        return next();
      }
    } catch { /* fall through to admin token */ }
  }

  // Then try x-admin-token header
  const token = req.headers['x-admin-token'];
  if (!token) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }

  try {
    const result = await verifyAdminToken(token);
    if (!result) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    req.adminId = result.adminId;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

module.exports = { requireAuth, requireRole, requireAdmin };
