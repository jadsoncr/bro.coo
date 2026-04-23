// src/conversion/service.js

const { getPrisma } = require('../infra/db');
const { EVENTS, safeRecordEvent } = require('../events/service');
const { validateConversion } = require('./validation');

/**
 * Convert a lead into a Caso (financial case).
 * Atomically creates Caso + updates Lead inside a Prisma $transaction.
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.leadId
 * @param {string} params.operatorId
 * @param {string} params.tipoContrato
 * @param {number} [params.valorEntrada]
 * @param {number} [params.percentualExito]
 * @param {number} [params.valorCausa]
 * @param {number} [params.valorConsulta]
 * @param {string} [params.segmento]
 * @param {string} [params.tipoProcesso]
 * @returns {Promise<{lead: object, caso: object}>}
 */
async function convert(params) {
  const {
    tenantId,
    leadId,
    operatorId,
    tipoContrato,
    valorEntrada = 0,
    percentualExito = 0,
    valorCausa = 0,
    valorConsulta = 0,
    segmento,
    tipoProcesso,
  } = params;

  // 1. Validate conversion form
  const validation = validateConversion({ tipoContrato, valorEntrada, percentualExito, valorCausa, valorConsulta });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const prisma = getPrisma();

  // Check pipeline stage — conversion only allowed from 'proposta'
  const existingLead = await prisma.lead.findFirst({ where: { id: leadId, tenantId } });
  if (!existingLead) throw new Error('Lead não encontrado');
  if (existingLead.estagio && existingLead.estagio !== 'proposta' && existingLead.estagio !== 'negociacao' && existingLead.estagio !== 'novo') {
    throw new Error('Conversão só é permitida nos estágios "proposta" ou "negociacao". Estágio atual: ' + existingLead.estagio);
  }

  // Fetch tenant to get moedaBase for currency
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new Error('Tenant não encontrado');
  }

  // 2. Atomic transaction: create Caso + update Lead
  const [caso, lead] = await prisma.$transaction([
    prisma.caso.create({
      data: {
        tenantId,
        leadId,
        tipoContrato,
        status: 'em_andamento',
        valorEntrada: valorEntrada || 0,
        percentualExito: percentualExito || 0,
        valorCausa: valorCausa || 0,
        valorConsulta: valorConsulta || 0,
        currency: tenant.moedaBase || 'BRL',
        segmento: segmento || null,
        tipoProcesso: tipoProcesso || null,
      },
    }),
    prisma.lead.update({
      where: { id: leadId },
      data: {
        statusFinal: 'virou_cliente',
        convertidoEm: new Date(),
        estagio: 'convertido',
      },
    }),
  ]);

  // 3. Record CONVERTED event (after transaction, non-blocking)
  await safeRecordEvent({
    tenantId,
    leadId,
    event: EVENTS.CONVERTED,
    metadata: { casoId: caso.id, operatorId, tipoContrato },
  });

  return { lead, caso };
}

module.exports = { convert };
