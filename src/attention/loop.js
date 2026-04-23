// src/attention/loop.js

/**
 * Attention Loop — event-driven retention mechanism.
 * Processes system events and generates WebSocket reactions.
 */

const EVENT_MAP = {
  lead_created: 'lead:new',
  first_response: 'lead:updated',
  converted: 'lead:converted',
  lost: 'lead:lost',
  abandoned: 'lead:updated',
  payment_received: 'caso:updated',
};

/**
 * Process a system event and emit the appropriate WebSocket event.
 * @param {object} event - { tenantId, event, metadata, ... }
 */
function handleEvent(event) {
  if (!event || !event.tenantId || !event.event) return;

  const wsEvent = EVENT_MAP[event.event];
  if (!wsEvent) return;

  const data = { ...event.metadata, event: event.event };

  if (event.event === 'converted' && event.metadata) {
    data.caso = event.metadata.caso || event.metadata;
  }
  if (event.event === 'lost' && event.metadata) {
    data.reason = event.metadata.reason || event.metadata.motivoDesistencia;
  }

  // Lazy require to avoid circular dependency (socket → loop → socket)
  const { emitToTenant } = require('../realtime/socket');
  emitToTenant(event.tenantId, wsEvent, data);
}

/**
 * Recalculate dynamic queue state and emit to tenant room.
 * @param {string} tenantId
 */
async function refreshQueues(tenantId) {
  if (!tenantId) return;

  // Lazy require to avoid circular dependency
  const { getQueues } = require('../sla/queues');
  const { emitToTenant } = require('../realtime/socket');

  const queues = await getQueues(tenantId);
  emitToTenant(tenantId, 'queues:updated', queues);
}

/**
 * Wrapper around emitToTenant for external callers.
 * @param {string} tenantId
 * @param {string} event
 * @param {*} data
 */
function notify(tenantId, event, data) {
  if (!tenantId || !event) return;
  const { emitToTenant } = require('../realtime/socket');
  emitToTenant(tenantId, event, data);
}

module.exports = { handleEvent, refreshQueues, notify, EVENT_MAP };
