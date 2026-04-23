const { getPrisma } = require('../infra/db');
const { EVENTS, safeRecordEvent } = require('../events/service');
const { leadSLAStatus, casoSLAStatus } = require('../sla/engine');

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
    estagio: lead.estagio || 'novo',
    intencao: lead.intencao || null,
    activityStatus: lead.activityStatus || 'novo',
    tempoSemResposta: lead.tempoSemResposta || 0,
    segmento: lead.segmento || null,
    tipoAtendimento: lead.tipoAtendimento || null,
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
  const base = buildMetrics({ tenant, leads: [] }).tenant;
  // Include WhatsApp fields for config page
  base.whatsappPhoneId = tenant.whatsappPhoneId || null;
  base.whatsappWabaId = tenant.whatsappWabaId || null;
  base.whatsappToken = tenant.whatsappToken ? true : null; // never expose token value
  base.whatsappVerifyToken = tenant.whatsappVerifyToken || null;
  base.whatsappStatus = tenant.whatsappStatus || 'nao_configurado';
  base.tenantId = tenant.id;
  base.slaContratoHoras = tenant.slaContratoHoras || 48;
  base.slaLeadMinutes = tenant.slaMinutes || 15;
  // Billing info
  base.billingStatus = tenant.billingStatus || 'active';
  base.billingDueDate = tenant.billingDueDate || null;
  base.segmentosEstruturados = tenant.segmentos || [];
  return base;
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

// ═══ Task 10.1: Date range resolution ═══

function startOfWeek(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday-based week
  d.setDate(d.getDate() - diff);
  return d;
}

function resolvePeriodo(periodo, now = new Date()) {
  if (periodo && typeof periodo === 'object' && periodo.start && periodo.end) {
    return { start: new Date(periodo.start), end: new Date(periodo.end) };
  }
  const key = String(periodo || 'mes').toLowerCase();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (key === 'hoje') return { start: startOfDay(now), end: endOfToday };
  if (key === 'semana') return { start: startOfWeek(now), end: endOfToday };
  // default: 'mes'
  return { start: startOfMonth(now), end: endOfToday };
}

// ═══ Task 10.1: Caso-based owner metrics ═══

async function getOwnerMetrics(tenantId, periodo, now = new Date()) {
  const prisma = getPrisma();
  const tenant = await getTenantOrThrow(tenantId);
  const { start, end } = resolvePeriodo(periodo, now);

  // Query leads within period
  const leads = await prisma.lead.findMany({
    where: { tenantId, criadoEm: { gte: start, lte: end } },
  });

  // Query all Casos for the tenant
  const casos = await prisma.caso.findMany({ where: { tenantId } });

  // Real Revenue: sum of valorRecebido where dataRecebimento is within period AND valorRecebido is not null
  const realRevenue = casos
    .filter(c => c.valorRecebido != null && c.dataRecebimento && new Date(c.dataRecebimento) >= start && new Date(c.dataRecebimento) <= end)
    .reduce((sum, c) => sum + toNumber(c.valorRecebido), 0);

  // Open Revenue: sum from active Casos (status != 'finalizado' AND valorRecebido is null)
  const openRevenue = casos
    .filter(c => c.status !== 'finalizado' && c.valorRecebido == null)
    .reduce((sum, c) => {
      return sum + toNumber(c.valorEntrada) + (toNumber(c.percentualExito) / 100) * toNumber(c.valorCausa) + toNumber(c.valorConsulta);
    }, 0);

  // Conversion rate
  const totalLeads = leads.length;
  const convertedLeads = leads.filter(l => l.statusFinal === 'virou_cliente').length;
  const conversao = totalLeads > 0 ? convertedLeads / totalLeads : 0;

  // Leads sem resposta: primeiraRespostaEm IS NULL AND SLA status is 'atrasado'
  const leadsSemResposta = leads.filter(l => {
    if (l.primeiraRespostaEm) return false;
    if (l.statusFinal) return false;
    return leadSLAStatus(l, tenant, now) === 'atrasado';
  }).length;

  // Casos sem update: SLA status is 'atrasado'
  const casosSemUpdate = casos.filter(c => casoSLAStatus(c, tenant, now) === 'atrasado').length;

  // Tempo médio de resposta (minutes)
  const leadsComResposta = leads.filter(l => l.primeiraRespostaEm);
  const tempoMedioResposta = leadsComResposta.length > 0
    ? leadsComResposta.reduce((sum, l) => sum + minutesSince(l.criadoEm, new Date(l.primeiraRespostaEm)), 0) / leadsComResposta.length
    : 0;

  // Lucro estimado
  const custoMensal = toNumber(tenant.custoMensal);
  const lucroEstimado = realRevenue + openRevenue - custoMensal;

  const metrics = {
    realRevenue,
    openRevenue,
    conversao,
    leadsSemResposta,
    casosSemUpdate,
    tempoMedioResposta,
    lucroEstimado,
    totalLeads,
    periodo: { start, end },
  };

  // ═══ Conversion by priority band ═══
  const priorityBands = ['QUENTE', 'MEDIO', 'FRIO'];
  const conversionByPriority = priorityBands.map(p => {
    const bandLeads = leads.filter(l => l.prioridade === p);
    const bandConverted = bandLeads.filter(l => l.statusFinal === 'virou_cliente').length;
    return {
      priority: p,
      total: bandLeads.length,
      converted: bandConverted,
      rate: bandLeads.length > 0 ? bandConverted / bandLeads.length : 0,
    };
  }).filter(b => b.total > 0);

  // ═══ Revenue by origin ═══
  const originMap = {};
  for (const c of casos.filter(c => c.valorRecebido != null && c.dataRecebimento && new Date(c.dataRecebimento) >= start && new Date(c.dataRecebimento) <= end)) {
    const origin = c.origem || 'Desconhecida';
    originMap[origin] = (originMap[origin] || 0) + toNumber(c.valorRecebido);
  }
  const revenueByOrigin = Object.entries(originMap)
    .map(([origin, revenue]) => ({ origin, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  // ═══ Leads lost by reason ═══
  const reasonMap = {};
  for (const l of leads.filter(l => l.motivoDesistencia)) {
    const reason = l.motivoDesistencia;
    reasonMap[reason] = (reasonMap[reason] || 0) + 1;
  }
  const lostByReason = Object.entries(reasonMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // ═══ Em risco (€ value of SLA-exceeded leads) ═══
  const emRisco = leads
    .filter(l => !l.primeiraRespostaEm && !l.statusFinal && leadSLAStatus(l, tenant, now) === 'atrasado')
    .reduce((sum, l) => sum + leadRevenueValue(l, tenant), 0);

  // Pipeline counts by stage
  const PIPELINE_STAGES = ['novo', 'atendimento', 'qualificado', 'proposta', 'convertido', 'perdido'];
  const pipeline = PIPELINE_STAGES.map(stage => ({
    stage,
    count: leads.filter(l => (l.estagio || 'novo') === stage).length,
    valor: leads.filter(l => (l.estagio || 'novo') === stage).reduce((sum, l) => sum + leadRevenueValue(l, tenant), 0),
  }));

  // Task 10.2: Include alerts
  const alertas = buildAlerts(tenantId, { ...metrics, emRisco });

  return { ...metrics, conversionByPriority, revenueByOrigin, lostByReason, emRisco, pipeline, alertas };
}

// ═══ Task 10.2: Alert generation ═══

function buildAlerts(tenantId, metrics) {
  const alerts = [];

  if (metrics.leadsSemResposta > 0) {
    const valorEmRisco = metrics.emRisco || 0;
    const valorStr = valorEmRisco > 0 ? ` — €${Math.round(valorEmRisco).toLocaleString()} em risco` : '';
    alerts.push({
      type: 'leads_sem_resposta',
      count: metrics.leadsSemResposta,
      severity: metrics.leadsSemResposta >= 5 ? 'critical' : 'warning',
      message: `⚠️ ${metrics.leadsSemResposta} lead(s) sem resposta${valorStr}. Dinheiro parado esperando ação.`,
    });
  }

  if (metrics.casosSemUpdate > 0) {
    alerts.push({
      type: 'contratos_parados',
      count: metrics.casosSemUpdate,
      severity: metrics.casosSemUpdate >= 3 ? 'critical' : 'warning',
      message: `📋 ${metrics.casosSemUpdate} contrato(s) parado(s) sem retorno. Receita travada.`,
    });
  }

  if (metrics.conversao < 0.10 && metrics.totalLeads > 0) {
    alerts.push({
      type: 'queda_conversao',
      count: metrics.totalLeads,
      severity: 'warning',
      message: `📉 Conversão em ${(metrics.conversao * 100).toFixed(1)}% — você está deixando dinheiro na mesa.`,
    });
  }

  return alerts;
}

// ═══ Task 10.3: Global metrics for Master panel ═══

async function getGlobalMetrics() {
  const prisma = getPrisma();
  const tenants = await prisma.tenant.findMany({ where: { ativo: true } });

  const tenantMetrics = [];
  let totalLeads = 0;
  let totalConverted = 0;
  let totalRevenue = 0;
  let totalResponseTime = 0;
  let totalWithResponse = 0;

  for (const tenant of tenants) {
    const leads = await prisma.lead.findMany({ where: { tenantId: tenant.id } });
    const casos = await prisma.caso.findMany({ where: { tenantId: tenant.id } });

    const tLeads = leads.length;
    const tConverted = leads.filter(l => l.statusFinal === 'virou_cliente').length;
    const tConversao = tLeads > 0 ? tConverted / tLeads : 0;
    const tRevenue = casos
      .filter(c => c.valorRecebido != null && c.dataRecebimento)
      .reduce((sum, c) => sum + toNumber(c.valorRecebido), 0);

    const leadsComResposta = leads.filter(l => l.primeiraRespostaEm);
    const tAvgResponse = leadsComResposta.length > 0
      ? leadsComResposta.reduce((sum, l) => sum + minutesSince(l.criadoEm, new Date(l.primeiraRespostaEm)), 0) / leadsComResposta.length
      : 0;

    totalLeads += tLeads;
    totalConverted += tConverted;
    totalRevenue += tRevenue;
    totalResponseTime += leadsComResposta.reduce((sum, l) => sum + minutesSince(l.criadoEm, new Date(l.primeiraRespostaEm)), 0);
    totalWithResponse += leadsComResposta.length;

    tenantMetrics.push({
      id: tenant.id,
      nome: tenant.nome,
      leads: tLeads,
      conversao: tConversao,
      revenue: tRevenue,
      avgResponseTime: tAvgResponse,
    });
  }

  return {
    global: {
      totalLeads,
      overallConversao: totalLeads > 0 ? totalConverted / totalLeads : 0,
      totalRevenue,
      avgResponseTime: totalWithResponse > 0 ? totalResponseTime / totalWithResponse : 0,
    },
    tenants: tenantMetrics,
  };
}

async function getLossPatterns(tenantId) {
  const prisma = getPrisma();
  const leadWhere = tenantId ? { tenantId } : {};
  const eventWhere = tenantId
    ? { tenantId, event: EVENTS.ABANDONED }
    : { event: EVENTS.ABANDONED };

  // Group desistência reasons
  const leads = await prisma.lead.findMany({
    where: { ...leadWhere, motivoDesistencia: { not: null } },
    select: { motivoDesistencia: true },
  });

  const reasonMap = {};
  for (const lead of leads) {
    const reason = lead.motivoDesistencia;
    reasonMap[reason] = (reasonMap[reason] || 0) + 1;
  }
  const byReason = Object.entries(reasonMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // Group abandonment steps from events
  const events = await prisma.event.findMany({
    where: eventWhere,
    select: { step: true },
  });

  const stepMap = {};
  for (const evt of events) {
    const step = evt.step || 'desconhecido';
    stepMap[step] = (stepMap[step] || 0) + 1;
  }
  const byStep = Object.entries(stepMap)
    .map(([step, count]) => ({ step, count }))
    .sort((a, b) => b.count - a.count);

  return { byReason, byStep };
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
  // Task 10.1
  resolvePeriodo,
  getOwnerMetrics,
  // Task 10.2
  buildAlerts,
  // Task 10.3
  getGlobalMetrics,
  getLossPatterns,
};
