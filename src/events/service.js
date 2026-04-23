// src/events/service.js
const { getPrisma } = require('../infra/db');

const EVENTS = {
  LEAD_CREATED: 'lead_created',
  FIRST_RESPONSE: 'first_response',
  CLIENT_REPLY: 'client_reply',
  NO_RESPONSE: 'no_response',
  ABANDONED: 'abandoned',
  REACTIVATION_SENT: 'reactivation_sent',
  REACTIVATION_REPLY: 'reactivation_reply',
  CONVERTED: 'converted',
  LOST: 'lost',
  SLA_WARNING: 'sla_warning',
  SLA_RISK: 'sla_risk',
  SLA_CRITICAL: 'sla_critical',
  SLA_LOST: 'sla_lost',
  CLASSIFICATION_CORRECTED: 'classification_corrected',
  CLASSIFICATION_FAILED: 'classification_failed',
};

/**
 * Record an event. Throws on error (unchanged).
 */
async function recordEvent({ tenantId, leadId = null, event, step = null, metadata = null }) {
  if (!tenantId) throw new Error('tenantId é obrigatório para registrar evento');
  if (!event) throw new Error('event é obrigatório para registrar evento');

  const prisma = getPrisma();
  return prisma.event.create({
    data: { tenantId, leadId, event, step, metadata },
  });
}

/**
 * Helper: sleep for ms milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Record event with retry logic (replaces old fire-and-forget).
 * - Retries up to 3 times with exponential backoff (100ms, 200ms, 400ms)
 * - After 3 failures: logs as "[event DLQ]" and returns null
 * - After success: triggers Attention Loop (non-blocking)
 * - Never throws
 */
async function safeRecordEvent(data) {
  const delays = [100, 200, 400];
  let lastError;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const result = await recordEvent(data);

      // Trigger Attention Loop after successful recording (non-blocking)
      try {
        // Lazy require to avoid circular dependency (events → loop → socket)
        const { handleEvent } = require('../attention/loop');
        handleEvent({ ...data, id: result.id });
      } catch (loopErr) {
        console.error('[attention loop error]', loopErr.message);
      }

      return result;
    } catch (err) {
      lastError = err;
      if (attempt < delays.length) {
        await sleep(delays[attempt]);
      }
    }
  }

  // Dead letter: log full event data
  console.error('[event DLQ]', JSON.stringify(data), lastError?.message);
  return null;
}

module.exports = { EVENTS, recordEvent, safeRecordEvent, sleep };
