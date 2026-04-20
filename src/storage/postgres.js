// src/storage/postgres.js
const { getPrisma } = require('../infra/db');

function classificarAbandono(ultimoEstado) {
  const finais = ['coleta_nome', 'contato_confirmacao', 'contato_numero', 'contato_canal'];
  const iniciais = ['start', 'fallback'];
  if (iniciais.includes(ultimoEstado)) return 'PRECOCE';
  if (finais.includes(ultimoEstado)) return 'VALIOSO';
  return 'MEDIO';
}

async function createLead(data) {
  const prisma = getPrisma();
  return prisma.lead.create({
    data: {
      tenantId: data.tenantId,
      nome: data.nome || null,
      telefone: data.telefone,
      canal: data.canal || 'telegram',
      fluxo: data.fluxo || null,
      score: data.score || 0,
      prioridade: data.prioridade || 'FRIO',
      scoreBreakdown: data.scoreBreakdown || {},
      status: data.status || 'novo',
      flagAtencao: data.flagAtencao || false,
      resumo: data.resumo || null,
    },
  });
}

async function updateLeadStatus(tenantId, leadId, status) {
  const prisma = getPrisma();
  return prisma.lead.update({
    where: { id: leadId, tenantId },
    data: { status, atualizadoEm: new Date() },
  });
}

async function createMessage(data) {
  const prisma = getPrisma();
  return prisma.message.create({
    data: {
      tenantId: data.tenantId,
      leadId: data.leadId,
      direcao: data.direcao,
      conteudo: data.conteudo,
      estado: data.estado || null,
    },
  });
}

async function createAbandono(data) {
  const prisma = getPrisma();
  return prisma.lead.create({
    data: {
      tenantId: data.tenantId,
      nome: data.nome || null,
      telefone: data.sessao,
      canal: data.canalOrigem || 'telegram',
      fluxo: data.fluxo || null,
      score: data.score || 0,
      prioridade: data.prioridade || 'FRIO',
      scoreBreakdown: { classificacao: classificarAbandono(data.ultimoEstado) },
      status: 'abandonou',
      flagAtencao: false,
      resumo: JSON.stringify({ ultimoEstado: data.ultimoEstado }),
    },
  });
}

module.exports = { createLead, updateLeadStatus, createMessage, createAbandono };
