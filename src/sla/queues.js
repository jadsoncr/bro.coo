// src/sla/queues.js

const { getPrisma } = require('../infra/db');
const { leadSLAStatus, casoSLAStatus, hoursSince } = require('./engine');

const LEAD_SELECT = {
  id: true,
  nome: true,
  telefone: true,
  canal: true,
  origem: true,
  score: true,
  prioridade: true,
  status: true,
  statusFinal: true,
  criadoEm: true,
  atualizadoEm: true,
  primeiraRespostaEm: true,
};

const CASO_SELECT = {
  id: true,
  leadId: true,
  tipoContrato: true,
  status: true,
  criadoEm: true,
  atualizadoEm: true,
};

/**
 * Return four pre-calculated queues for a tenant.
 * @param {string} tenantId
 * @returns {Promise<object[]>}
 */
async function getQueues(tenantId) {
  const prisma = getPrisma();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return [];

  const now = new Date();
  const slaHoras = Number(tenant.slaContratoHoras) || 48;

  // 1. Leads sem resposta (SLA atrasado)
  const unrespondedLeads = await prisma.lead.findMany({
    where: {
      tenantId,
      primeiraRespostaEm: null,
      statusFinal: null,
    },
    select: LEAD_SELECT,
  });

  const leadsSemResposta = unrespondedLeads.filter(
    (lead) => leadSLAStatus(lead, tenant, now) === 'atrasado'
  );

  // 2. Atendimento em andamento
  const emAtendimento = await prisma.lead.findMany({
    where: {
      tenantId,
      status: 'EM_ATENDIMENTO',
    },
    select: LEAD_SELECT,
  });

  // 3. Contratos enviados sem retorno
  const openCasos = await prisma.caso.findMany({
    where: {
      tenantId,
      NOT: { status: 'finalizado' },
    },
    select: CASO_SELECT,
  });

  // 3. Contratos enviados sem retorno (casos com status em_andamento e SLA estourado)
  const contratosSemRetorno = openCasos.filter(
    (caso) => caso.status === 'em_andamento' && hoursSince(caso.atualizadoEm, now) > slaHoras
  );

  // 4. Casos sem atualização (todos os casos abertos com SLA estourado)
  const casosSemAtualizacao = openCasos.filter(
    (caso) => caso.status !== 'em_andamento' && hoursSince(caso.atualizadoEm, now) > slaHoras
  );

  return [
    { name: 'Leads sem resposta', count: leadsSemResposta.length, items: leadsSemResposta },
    { name: 'Atendimento em andamento', count: emAtendimento.length, items: emAtendimento },
    { name: 'Contratos enviados sem retorno', count: contratosSemRetorno.length, items: contratosSemRetorno },
    { name: 'Casos sem atualização', count: casosSemAtualizacao.length, items: casosSemAtualizacao },
  ];
}

module.exports = { getQueues };
