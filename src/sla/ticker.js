// src/sla/ticker.js

const { getPrisma } = require('../infra/db');
const { tick } = require('./engine');
const { emitToTenant } = require('../realtime/socket');

let _interval = null;

/**
 * Start the SLA ticker that runs every 60 seconds.
 * Queries all active tenants, calls tick() for each,
 * and emits WebSocket alerts.
 */
function startSLATicker() {
  if (_interval) return;

  _interval = setInterval(async () => {
    try {
      const prisma = getPrisma();
      const tenants = await prisma.tenant.findMany({
        where: { ativo: true },
        select: { id: true, nome: true },
      });

      for (const tenant of tenants) {
        const alerts = await tick(tenant.id);
        for (const alert of alerts) {
          console.log(`[SLA] ${alert.type} tenant=${tenant.id} count=${alert.count}`);
          emitToTenant(tenant.id, 'sla:alert', alert);
        }
      }
    } catch (err) {
      console.error('[SLA ticker error]', err.message);
    }
  }, 60_000);
}

/**
 * Stop the SLA ticker (for testing/shutdown).
 */
function stopSLATicker() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

module.exports = { startSLATicker, stopSLATicker };
