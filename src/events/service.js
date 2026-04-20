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
};

async function recordEvent({ tenantId, leadId = null, event, step = null, metadata = null }) {
  if (!tenantId) throw new Error('tenantId é obrigatório para registrar evento');
  if (!event) throw new Error('event é obrigatório para registrar evento');

  const prisma = getPrisma();
  return prisma.event.create({
    data: { tenantId, leadId, event, step, metadata },
  });
}

async function safeRecordEvent(data) {
  try {
    const prisma = getPrisma();
    if (!prisma.event || typeof prisma.event.create !== 'function') return null;
    return await recordEvent(data);
  } catch (err) {
    console.error('[event error]', err.message);
    return null;
  }
}

module.exports = { EVENTS, recordEvent, safeRecordEvent };
