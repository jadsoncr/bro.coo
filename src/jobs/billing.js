// src/jobs/billing.js
// Billing enforcement job — progressive restriction based on days past due
// Dia 0: past_due | Dia 7: suspended | Dia 14: canceled

const { getPrisma } = require('../infra/db');
const { daysSinceDue } = require('../auth/billing');

/**
 * Run billing enforcement for all tenants.
 * Called by cron (daily).
 */
async function runBillingEnforcement() {
  const prisma = getPrisma();

  // Find all past_due or suspended tenants
  const tenants = await prisma.tenant.findMany({
    where: {
      ativo: true,
      billingStatus: { in: ['past_due', 'suspended'] },
      billingDueDate: { not: null },
    },
    select: { id: true, nome: true, billingStatus: true, billingDueDate: true },
  });

  let suspended = 0;
  let canceled = 0;

  for (const tenant of tenants) {
    const days = daysSinceDue(tenant.billingDueDate);

    if (days >= 14 && tenant.billingStatus !== 'canceled') {
      // Dia 14+: cancelar
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { billingStatus: 'canceled', ativo: false },
      });
      canceled++;
      console.log(`[billing] Tenant ${tenant.id} (${tenant.nome}) cancelado — ${days} dias inadimplente`);
    } else if (days >= 7 && tenant.billingStatus === 'past_due') {
      // Dia 7+: suspender
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { billingStatus: 'suspended' },
      });
      suspended++;
      console.log(`[billing] Tenant ${tenant.id} (${tenant.nome}) suspenso — ${days} dias inadimplente`);
    }
  }

  if (suspended > 0 || canceled > 0) {
    console.log(`[billing] Enforcement: ${suspended} suspensos, ${canceled} cancelados`);
  }

  return { checked: tenants.length, suspended, canceled };
}

module.exports = { runBillingEnforcement };
