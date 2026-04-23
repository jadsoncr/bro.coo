// src/sla/engine.js

const { getPrisma } = require('../infra/db');

/**
 * Calculate minutes elapsed between a date and now.
 * @param {Date|string} date
 * @param {Date} [now]
 * @returns {number}
 */
function minutesSince(date, now = new Date()) {
  if (!date) return 0;
  return Math.max(0, (now.getTime() - new Date(date).getTime()) / 60000);
}

/**
 * Calculate hours elapsed between a date and now.
 * @param {Date|string} date
 * @param {Date} [now]
 * @returns {number}
 */
function hoursSince(date, now = new Date()) {
  if (!date) return 0;
  return Math.max(0, (now.getTime() - new Date(date).getTime()) / 3600000);
}

/**
 * Calculate SLA status for a lead based on response time.
 * - If lead has statusFinal → "finalizado"
 * - If lead has primeiraRespostaEm → "respondido" (NEVER "atrasado")
 * - Otherwise calculate elapsed vs slaMinutes thresholds
 * @param {object} lead
 * @param {object} tenant
 * @param {Date} [now]
 * @returns {'dentro'|'atencao'|'atrasado'|'finalizado'|'respondido'}
 */
function leadSLAStatus(lead, tenant, now = new Date()) {
  if (lead.statusFinal) return 'finalizado';
  if (lead.primeiraRespostaEm) return 'respondido';

  const elapsed = minutesSince(lead.criadoEm, now);
  const limit = Number(tenant.slaMinutes) || 15;

  if (elapsed >= limit) return 'atrasado';
  if (elapsed >= limit * 0.7) return 'atencao';
  return 'dentro';
}

/**
 * Calculate SLA status for a Caso based on time since last update.
 * - If caso.status === "finalizado" → "finalizado"
 * - Otherwise calculate elapsed hours vs slaContratoHoras thresholds
 * @param {object} caso
 * @param {object} tenant
 * @param {Date} [now]
 * @returns {'dentro'|'atencao'|'atrasado'|'finalizado'}
 */
function casoSLAStatus(caso, tenant, now = new Date()) {
  if (caso.status === 'finalizado') return 'finalizado';

  const elapsed = hoursSince(caso.atualizadoEm, now);
  const limit = Number(tenant.slaContratoHoras) || 48;

  if (elapsed >= limit) return 'atrasado';
  if (elapsed >= limit * 0.7) return 'atencao';
  return 'dentro';
}

/**
 * Query leads and casos that exceed SLA for a tenant.
 * @param {string} tenantId
 * @returns {Promise<{leads: object[], casos: object[]}>}
 */
async function getViolations(tenantId) {
  const prisma = getPrisma();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { leads: [], casos: [] };

  const now = new Date();

  // Leads: primeiraRespostaEm IS NULL AND statusFinal IS NULL
  const openLeads = await prisma.lead.findMany({
    where: {
      tenantId,
      primeiraRespostaEm: null,
      statusFinal: null,
    },
  });

  const violatedLeads = openLeads.filter(
    (lead) => leadSLAStatus(lead, tenant, now) === 'atrasado'
  );

  // Casos: status != "finalizado"
  const openCasos = await prisma.caso.findMany({
    where: {
      tenantId,
      NOT: { status: 'finalizado' },
    },
  });

  const violatedCasos = openCasos.filter(
    (caso) => casoSLAStatus(caso, tenant, now) === 'atrasado'
  );

  return { leads: violatedLeads, casos: violatedCasos };
}

/**
 * Check all items for a tenant and generate Alert objects.
 * @param {string} tenantId
 * @returns {Promise<object[]>}
 */
async function tick(tenantId) {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return [];

  const now = new Date();
  const slaMinutes = Number(tenant.slaMinutes) || 15;
  const slaAtencao = slaMinutes * 0.7;

  // Update tempoSemResposta and activityStatus for open leads
  const openLeads = await prisma.lead.findMany({
    where: { tenantId, statusFinal: null },
  });

  for (const lead of openLeads) {
    const elapsed = Math.floor(minutesSince(lead.criadoEm, now));
    const updates = { tempoSemResposta: elapsed };

    // Only auto-update activityStatus if not manually set to follow_up or em_negociacao
    if (lead.activityStatus !== 'follow_up' && lead.activityStatus !== 'em_negociacao') {
      if (!lead.primeiraRespostaEm) {
        if (elapsed >= slaMinutes) updates.activityStatus = 'sem_resposta';
        else if (elapsed >= slaAtencao) updates.activityStatus = 'aguardando_cliente';
      }
    }

    // Recalculate priority
    const { calcularPrioridade } = require('../pipeline/constants');
    const newPrioridade = calcularPrioridade({ ...lead, ...updates });
    updates.prioridade = newPrioridade;

    await prisma.lead.update({ where: { id: lead.id }, data: updates }).catch(() => {});
  }

  // Generate alerts
  const { leads, casos } = await getViolations(tenantId);
  const alerts = [];

  if (leads.length > 0) {
    alerts.push({
      type: 'leads_sem_resposta',
      tenantId,
      count: leads.length,
      items: leads.map((l) => l.id),
      severity: leads.length >= 5 ? 'critical' : 'warning',
    });
  }

  if (casos.length > 0) {
    alerts.push({
      type: 'contratos_parados',
      tenantId,
      count: casos.length,
      items: casos.map((c) => c.id),
      severity: casos.length >= 3 ? 'critical' : 'warning',
    });
  }

  return alerts;
}

module.exports = {
  minutesSince,
  hoursSince,
  leadSLAStatus,
  casoSLAStatus,
  getViolations,
  tick,
};
