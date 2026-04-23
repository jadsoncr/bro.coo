// src/auth/service.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getPrisma } = require('../infra/db');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is required');
  return secret;
}

/**
 * Authenticate Owner/Operator by email + password.
 * Returns JWT with {userId, tenantId, role}.
 */
async function login(email, senha) {
  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: { email, ativo: true },
  });
  if (!user) return null;

  const match = await bcrypt.compare(senha, user.senhaHash);
  if (!match) return null;

  const token = jwt.sign(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    getSecret(),
    { expiresIn: '24h' }
  );

  return {
    token,
    user: { id: user.id, nome: user.nome, email: user.email, role: user.role, tenantId: user.tenantId },
  };
}

/**
 * Verify JWT and return claims {userId, tenantId, role}.
 */
function verifyToken(token) {
  const payload = jwt.verify(token, getSecret());
  return { userId: payload.userId, tenantId: payload.tenantId, role: payload.role };
}

/**
 * Verify admin token against AdminUser table.
 * Returns {adminId} or null.
 */
async function verifyAdminToken(token) {
  const prisma = getPrisma();
  const admin = await prisma.adminUser.findUnique({
    where: { token, ativo: true },
  });
  if (!admin) return null;
  return { adminId: admin.id };
}

module.exports = { login, verifyToken, verifyAdminToken };
