// src/storage/postgres.js
const { getPrisma } = require('../infra/db');
const { EVENTS, safeRecordEvent } = require('../events/service');

function tenantIdFrom(data) {
  const tenantId = data.tenantId || global._currentTenantId;
  if (!tenantId) {
    throw new Error('tenantId é obrigatório para persistência Postgres');
  }
  return tenantId;
}

function telefoneFrom(data) {
  const telefone = data.telefone || data.sessao;
  if (!telefone) {
    throw new Error('telefone é obrigatório para persistência Postgres');
  }
  return telefone;
}

function normalizeStatus(status) {
  return String(status || 'NOVO').toUpperCase();
}

function normalizeResumo(data) {
  if (data.resumo) return data.resumo;
  if (data.conteudo) return data.conteudo;
  if (data.tipo || data.situacao) {
    return JSON.stringify({
      tipo: data.tipo || null,
      situacao: data.situacao || null,
      impacto: data.impacto || null,
      intencao: data.intencao || null,
    });
  }
  return null;
}

function classificarAbandono(ultimoEstado) {
  const finais = ['coleta_nome', 'contato_confirmacao', 'contato_numero', 'contato_canal'];
  const iniciais = ['start', 'fallback'];
  if (iniciais.includes(ultimoEstado)) return 'PRECOCE';
  if (finais.includes(ultimoEstado)) return 'VALIOSO';
  return 'MEDIO';
}

async function createLead(data) {
  const prisma = getPrisma();
  const tenantId = tenantIdFrom(data);
  const lead = await prisma.lead.create({
    data: {
      tenantId,
      nome: data.nome || null,
      telefone: telefoneFrom(data),
      canal: data.canal || data.canalOrigem || 'telegram',
      origem: data.origem || null,
      campanha: data.campanha || null,
      fluxo: data.fluxo || data.area || null,
      score: data.score || 0,
      prioridade: data.prioridade || data.urgencia || 'FRIO',
      scoreBreakdown: data.scoreBreakdown || {},
      status: normalizeStatus(data.status),
      statusFinal: data.statusFinal || null,
      origemConversao: data.origemConversao || null,
      flagAtencao: data.flagAtencao || false,
      resumo: normalizeResumo(data),
      valorEntrada: data.valorEntrada || 0,
      valorExito: data.valorExito || 0,
      valorEstimado: data.valorEstimado || 0,
      prazoEstimadoDias: data.prazoEstimadoDias || null,
    },
  });
  await safeRecordEvent({ tenantId, leadId: lead.id, event: EVENTS.LEAD_CREATED, metadata: { origem: lead.origem, campanha: lead.campanha } });
  return lead;
}

async function updateLeadStatus(tenantId, leadId, status) {
  const prisma = getPrisma();
  return prisma.lead.updateMany({
    where: { id: leadId, tenantId },
    data: { status: normalizeStatus(status), atualizadoEm: new Date() },
  });
}

async function createClient(data) {
  return createLead({
    ...data,
    fluxo: 'cliente',
    prioridade: data.prioridade || data.urgencia || 'MEDIO',
    resumo: data.resumo || data.conteudo || null,
  });
}

async function createOther(data) {
  return createLead({
    ...data,
    fluxo: 'outros',
    resumo: data.resumo || data.conteudo || data.tipo || null,
  });
}

async function createMessage(data) {
  const prisma = getPrisma();
  return prisma.message.create({
    data: {
      tenantId: tenantIdFrom(data),
      leadId: data.leadId,
      direcao: data.direcao,
      conteudo: data.conteudo,
      estado: data.estado || null,
    },
  });
}

async function createAbandono(data) {
  const prisma = getPrisma();
  const tenantId = tenantIdFrom(data);
  const lead = await prisma.lead.create({
    data: {
      tenantId,
      nome: data.nome || null,
      telefone: telefoneFrom(data),
      canal: data.canalOrigem || 'telegram',
      origem: data.origem || null,
      campanha: data.campanha || null,
      fluxo: data.fluxo || null,
      score: data.score || 0,
      prioridade: data.prioridade || 'FRIO',
      scoreBreakdown: { classificacao: classificarAbandono(data.ultimoEstado) },
      status: 'NOVO',
      statusFinal: 'SEM_SUCESSO',
      flagAtencao: false,
      resumo: JSON.stringify({ ultimoEstado: data.ultimoEstado }),
      abandonedAt: new Date(),
    },
  });
  await safeRecordEvent({ tenantId, leadId: lead.id, event: EVENTS.ABANDONED, step: data.ultimoEstado || null });
  return lead;
}

module.exports = { createLead, createClient, createOther, updateLeadStatus, createMessage, createAbandono };
