// src/auth/billing.js
// Billing enforcement middleware — blocks operations based on billingStatus

const { getPrisma } = require('../infra/db');

const BILLING_MESSAGES = {
  past_due: 'Pagamento pendente. Atualize seu pagamento para evitar interrupção.',
  suspended: 'Operação pausada por falta de pagamento.',
  canceled: 'Conta cancelada. Entre em contato para reativar.',
};

/**
 * Middleware: require active billing for full operations.
 * - active: tudo funciona
 * - past_due: funciona com aviso (header x-billing-warning)
 * - suspended: bloqueia escrita, permite leitura
 * - canceled: bloqueia tudo
 */
function requireActiveBilling(req, res, next) {
  // MASTER role bypasses billing checks
  if (req.role === 'MASTER') return next();

  const tenant = req._billingTenant;
  if (!tenant) return next(); // billing not loaded yet, skip

  const status = tenant.billingStatus || 'active';

  if (status === 'active') return next();

  if (status === 'canceled') {
    return res.status(403).json({ error: BILLING_MESSAGES.canceled, billingStatus: 'canceled' });
  }

  if (status === 'suspended') {
    return res.status(403).json({ error: BILLING_MESSAGES.suspended, billingStatus: 'suspended' });
  }

  // past_due: allow but warn
  res.setHeader('x-billing-warning', BILLING_MESSAGES.past_due);
  return next();
}

/**
 * Middleware: allow read-only access for suspended tenants.
 * Use on GET endpoints that should still work when suspended.
 */
function allowReadWhenSuspended(req, res, next) {
  // MASTER role bypasses billing checks
  if (req.role === 'MASTER') return next();

  const tenant = req._billingTenant;
  if (!tenant) return next();

  const status = tenant.billingStatus || 'active';

  if (status === 'canceled') {
    return res.status(403).json({ error: BILLING_MESSAGES.canceled, billingStatus: 'canceled' });
  }

  if (status === 'past_due' || status === 'suspended') {
    res.setHeader('x-billing-warning', BILLING_MESSAGES[status]);
  }

  return next();
}

/**
 * Middleware: load tenant billing info onto req._billingTenant.
 * Must run after requireAuth (needs req.tenantId).
 */
async function loadBillingStatus(req, res, next) {
  try {
    if (!req.tenantId) return next();

    const prisma = getPrisma();
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: { billingStatus: true, billingDueDate: true },
    });

    req._billingTenant = tenant || { billingStatus: 'active' };
    return next();
  } catch (err) {
    // Don't block on billing check failure — degrade gracefully
    console.error('[billing] loadBillingStatus error:', err.message);
    req._billingTenant = { billingStatus: 'active' };
    return next();
  }
}

/**
 * Calculate days since billing became past_due.
 */
function daysSinceDue(billingDueDate) {
  if (!billingDueDate) return 0;
  const diff = Date.now() - new Date(billingDueDate).getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

/**
 * Get billing info for frontend display.
 */
function getBillingInfo(tenant) {
  const status = tenant.billingStatus || 'active';
  if (status === 'active') return { billingStatus: 'active' };

  const days = daysSinceDue(tenant.billingDueDate);
  let daysUntilSuspension = null;
  let daysUntilCancellation = null;

  if (status === 'past_due') {
    daysUntilSuspension = Math.max(0, 7 - days);
    daysUntilCancellation = Math.max(0, 14 - days);
  } else if (status === 'suspended') {
    daysUntilCancellation = Math.max(0, 14 - days);
  }

  return {
    billingStatus: status,
    message: BILLING_MESSAGES[status],
    daysSinceDue: days,
    daysUntilSuspension,
    daysUntilCancellation,
  };
}

module.exports = {
  requireActiveBilling,
  allowReadWhenSuspended,
  loadBillingStatus,
  daysSinceDue,
  getBillingInfo,
  BILLING_MESSAGES,
};
