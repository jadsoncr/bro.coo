const { getPrisma } = require('../infra/db');
const { EVENTS, safeRecordEvent } = require('../events/service');

const ACTIVE_STATUSES = ['NOVO', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE', 'AGENDADO'];
const FINAL_STATUSES = ['CONVERTIDO', 'PERDIDO', 'SEM_SUCESSO'];

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toNumber === 'function') return value.toNumber();
  return Number(value) || 0;
}

function normalizeStatus(status) {
  const normalized = String(status || 'NOVO').trim().toUpperCase();
  return ACTIVE_STATUSES.includes(normalized) ? normalized : 'NOVO';
}

function normalizeFinalStatus(statusFinal) {
  if (!statusFinal) return null;
  const normalized = String(statusFinal).trim().toUpperCase();
  return FINAL_STATUSES.includes(normalized) ? normalized : null;
}

function startOfDay(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function minutesSince(date, now = new Date()) {
  if (!date) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / 60000));
}

function leadRevenueValue(lead, tenant) {
  const explicit = toNumber(lead.valorEstimado);
  if (explicit > 0) return explicit;

  const entrada = toNumber(lead.valorEntrada);
  const exito = toNumber(lead.valorExito);
  if (entrada + exito > 0) return entrada + exito;

  return toNumber(tenant.ticketMedio) * toNumber(tenant.taxaConversao);
}

function actualRevenueValue(lead, tenant) {
  const entrada = toNumber(lead.valorEntrada);
  const exito = toNumber(lead.valorExito);
  if (entrada + exito > 0) return entrada + exito;
  return leadRevenueValue(lead, tenant);
}

function slaStatus(lead, tenant, now = new Date()) {
  if (lead.statusFinal) return 'finalizado';
  const elapsed = minutesSince(lead.criadoEm, now);
  const limit = Number(tenant.slaMinutes || 15);
  if (elapsed >= limit) return 'atrasado';
  if (elapsed >= limit * 0.7) return 'atencao';
  return 'dentro';
}

function leadDTO(lead, tenant, now = new Date()) {
  return {
    id: lead.id,
    nome: lead.nome,
    telefone: lead.telefone,
    canal: lead.canal,
    origem: lead.origem,
    campanha: lead.campanha,
    fluxo: lead.fluxo,
    score: lead.score || 0,
    prioridade: lead.prioridade || 'FRIO',
    status: lead.status || 'NOVO',
    statusFinal: lead.statusFinal || null,
    origemConversao: lead.origemConversao || null,
    slaStatus: slaStatus(lead, tenant, now),
    minutosEspera: minutesSince(lead.criadoEm, now),
    valorLead: leadRevenueValue(lead, tenant),
    valorEntrada: toNumber(lead.valorEntrada),
    valorExito: toNumber(lead.valorExito),
    valorEstimado: toNumber(lead.valorEstimado),
    resumo: lead.resumo || null,
    criadoEm: lead.criadoEm,
    atualizadoEm: lead.atualizadoEm,
  };
}

function sortLeadsForInbox(a, b) {
  const slaWeight = { atrasado: 0, atencao: 1, dentro: 2, finalizado: 3 };
  const priorityWeight = { QUENTE: 0, MEDIO: 1, FRIO: 2 };
  return (
    (slaWeight[a.slaStatus] ?? 9) - (slaWeight[b.slaStatus] ?? 9) ||
    (priorityWeight[a.prioridade] ?? 9) - (priorityWeight[b.prioridade] ?? 9) ||
    new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime()
  );
}

function buildReactivationMetrics(leads, tenant) {
  const enviados = leads.filter(lead => lead.reativacaoEnviadaEm).length;
  const responderam = leads.filter(lead => lead.reativacaoRespondidaEm).length;
  const convertidos = leads.filter(
    lead => lead.origemConversao === 'reativacao' && lead.statusFinal === 'CONVERTIDO'
  );
  const receitaGerada = convertidos.reduce((sum, lead) => sum + actualRevenueValue(lead, tenant), 0);

  return {
    enviados,
    responderam,
    convertidos: convertidos.length,
    receitaGerada,
  };
}

function buildMetrics({ tenant, leads, now = new Date() }) {
  const dayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const leadValue = toNumber(tenant.ticketMedio) * toNumber(tenant.taxaConversao);
  const leadsHoje = leads.filter(lead => new Date(lead.criadoEm) >= dayStart);
  const leadsMes = leads.filter(lead => new Date(lead.criadoEm) >= monthStart);
  const leadsAbertos = leads.filter(lead => !lead.statusFinal);
  const atrasados = leadsAbertos.filter(lead => slaStatus(lead, tenant, now) === 'atrasado');
  const convertidos = leads.filter(lead => lead.statusFinal === 'CONVERTIDO');
  const receitaGerada = convertidos.reduce((sum, lead) => sum + actualRevenueValue(lead, tenant), 0);
  const receitaFutura = leadsAbertos.reduce((sum, lead) => sum + leadRevenueValue(lead, tenant), 0);
  const metaMensal = toNumber(tenant.metaMensal);
  const metaDiaria = metaMensal > 0 ? metaMensal / 22 : 0;

  return {
    tenant: {
      id: tenant.id,
      nome: tenant.nome,
      moeda: tenant.moeda || 'BRL',
      slaMinutes: tenant.slaMinutes || 15,
      ticketMedio: toNumber(tenant.ticketMedio),
      taxaConversao: toNumber(tenant.taxaConversao),
      custoMensal: toNumber(tenant.custoMensal),
      metaMensal,
      metaDiaria,
    },
    leadsHoje: leadsHoje.length,
    leadsMes: leadsMes.length,
    leadsTotal: leads.length,
    quentes: leadsAbertos.filter(lead => lead.prioridade === 'QUENTE').length,
    atrasados: atrasados.length,
    potencialHoje: leadsHoje.length * leadValue,
    emRisco: atrasados.reduce((sum, lead) => sum + leadRevenueValue(lead, tenant), 0),
    receitaGerada,
    receitaFutura,
    valorMedioLead: leadValue,
    receitaVsMeta: metaMensal > 0 ? receitaGerada / metaMensal : 0,
    lucroEstimado: receitaGerada + receitaFutura - toNumber(tenant.custoMensal),
    reativacao: buildReactivationMetrics(leads, tenant),
  };
}

async function ensureTenant(tenantId) {
  if (!tenantId) throw new Error('tenantId não informado');
  const prisma = getPrisma();
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (existing) return existing;

  // Auto-cria tenant padrão se não existir (permite primeiro uso sem seed manual)
  console.log(`[ensureTenant] criando tenant ${tenantId}`);
  return prisma.tenant.create({
    data: {
      id: tenantId,
      nome: 'Tenant Padrão',
      botToken: `auto-${tenantId}`,
    },
  });
}

// alias mantido para compatibilidade interna
const getTenantOrThrow = ensureTenant;

async function listLeads(tenantId, filters = {}) {
  const prisma = getPrisma();
  const tenant = await getTenantOrThrow(tenantId);
  const where = { tenantId };

  if (filters.prioridade) where.prioridade = String(filters.prioridade).toUpperCase();
  if (filters.status) where.status = String(filters.status).toUpperCase();
  if (filters.statusFinal) where.statusFinal = String(filters.statusFinal).toUpperCase();

  const leads = await prisma.lead.findMany({ where, orderBy: { criadoEm: 'desc' } });
  let rows = leads.map(lead => leadDTO(lead, tenant));

  if (filters.slaStatus) {
    rows = rows.filter(lead => lead.slaStatus === filters.slaStatus);
  }

  return rows.sort(sortLeadsForInbox);
}

async function getLeadDetails(tenantId, leadId) {
  const prisma = getPrisma();
  const tenant = await getTenantOrThrow(tenantId);
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId },
    include: {
      messages: { orderBy: { criadoEm: 'asc' } },
      events: { orderBy: { criadoEm: 'asc' } },
    },
  });

  if (!lead) return null;

  return {
    ...leadDTO(lead, tenant),
    scoreBreakdown: lead.scoreBreakdown || {},
    messages: lead.messages || [],
    events: lead.events || [],
  };
}

async function getMetrics(tenantId) {
  const prisma = getPrisma();
  const tenant = await getTenantOrThrow(tenantId);
  const leads = await prisma.lead.findMany({ where: { tenantId } });
  return buildMetrics({ tenant, leads });
}

async function getFunil(tenantId) {
  const prisma = getPrisma();
  const events = await prisma.event.findMany({
    where: { tenantId, event: EVENTS.ABANDONED },
    orderBy: { criadoEm: 'desc' },
  });
  const byStep = {};

  for (const event of events) {
    const step = event.step || 'desconhecido';
    byStep[step] = (byStep[step] || 0) + 1;
  }

  return Object.entries(byStep)
    .map(([step, abandonos]) => ({ step, abandonos }))
    .sort((a, b) => b.abandonos - a.abandonos);
}

async function getTenantConfig(tenantId) {
  const tenant = await getTenantOrThrow(tenantId);
  return buildMetrics({ tenant, leads: [] }).tenant;
}

async function updateTenantConfig(tenantId, data) {
  const prisma = getPrisma();
  const allowed = {};
  for (const field of ['slaMinutes', 'ticketMedio', 'taxaConversao', 'custoMensal', 'metaMensal', 'moeda']) {
    if (data[field] !== undefined) allowed[field] = data[field];
  }
  return prisma.tenant.update({ where: { id: tenantId }, data: allowed });
}

async function updateLeadStatus({ tenantId, leadId, status }) {
  const prisma = getPrisma();
  const updated = await prisma.lead.updateMany({
    where: { id: leadId, tenantId },
    data: { status: normalizeStatus(status) },
  });
  await safeRecordEvent({ tenantId, leadId, event: EVENTS.FIRST_RESPONSE, metadata: { status } });
  return updated;
}

async function markLeadOutcome({ tenantId, leadId, statusFinal, origemConversao, valorEntrada, valorExito }) {
  const prisma = getPrisma();
  const normalizedFinal = normalizeFinalStatus(statusFinal);
  if (!normalizedFinal) throw new Error('status_final invalido');

  const now = new Date();
  const data = {
    statusFinal: normalizedFinal,
    origemConversao: origemConversao || null,
  };

  if (valorEntrada !== undefined) data.valorEntrada = valorEntrada;
  if (valorExito !== undefined) data.valorExito = valorExito;
  if (normalizedFinal === 'CONVERTIDO') data.convertidoEm = now;
  if (normalizedFinal === 'PERDIDO') data.perdidoEm = now;
  if (normalizedFinal === 'SEM_SUCESSO') data.abandonedAt = now;

  const updated = await prisma.lead.updateMany({ where: { id: leadId, tenantId }, data });
  const event = normalizedFinal === 'CONVERTIDO'
    ? EVENTS.CONVERTED
    : normalizedFinal === 'SEM_SUCESSO'
      ? EVENTS.NO_RESPONSE
      : EVENTS.LOST;
  await safeRecordEvent({ tenantId, leadId, event, metadata: { statusFinal: normalizedFinal, origemConversao } });
  return updated;
}

module.exports = {
  ACTIVE_STATUSES,
  FINAL_STATUSES,
  toNumber,
  normalizeStatus,
  normalizeFinalStatus,
  buildMetrics,
  leadDTO,
  ensureTenant,
  listLeads,
  getLeadDetails,
  getMetrics,
  getFunil,
  getTenantConfig,
  updateTenantConfig,
  updateLeadStatus,
  markLeadOutcome,
};
