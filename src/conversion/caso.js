// src/conversion/caso.js

const { getPrisma } = require('../infra/db');
const { safeRecordEvent } = require('../events/service');

/**
 * Close a Caso by recording payment data.
 * @param {string} tenantId
 * @param {string} casoId
 * @param {object} data
 * @param {number} data.valorRecebido - must be > 0
 * @param {string|Date} data.dataRecebimento - must be a valid date
 * @param {number} [data.exchangeRate] - required when currency differs from moedaBase
 * @returns {Promise<object>} updated Caso
 */
async function closeCaso(tenantId, casoId, { valorRecebido, dataRecebimento, exchangeRate } = {}) {
  if (!valorRecebido || Number(valorRecebido) <= 0) {
    throw new Error('valorRecebido é obrigatório e deve ser maior que 0');
  }

  const parsedDate = new Date(dataRecebimento);
  if (!dataRecebimento || isNaN(parsedDate.getTime())) {
    throw new Error('dataRecebimento é obrigatório e deve ser uma data válida');
  }

  const prisma = getPrisma();

  const caso = await prisma.caso.findFirst({
    where: { id: casoId, tenantId },
  });
  if (!caso) {
    throw new Error('Caso não encontrado');
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new Error('Tenant não encontrado');
  }

  const updateData = {
    valorRecebido: Number(valorRecebido),
    dataRecebimento: parsedDate,
    status: 'finalizado',
  };

  // Currency conversion: if caso.currency differs from tenant.moedaBase and exchangeRate is provided
  if (caso.currency !== tenant.moedaBase && exchangeRate) {
    updateData.valorConvertido = Number(valorRecebido) * Number(exchangeRate);
    updateData.exchangeRate = Number(exchangeRate);
  }

  const updated = await prisma.caso.update({
    where: { id: casoId },
    data: updateData,
  });

  // Record PAYMENT_RECEIVED event
  await safeRecordEvent({
    tenantId,
    leadId: caso.leadId,
    event: 'payment_received',
    metadata: {
      casoId,
      valorRecebido: Number(valorRecebido),
      dataRecebimento: parsedDate.toISOString(),
    },
  });

  return updated;
}

/**
 * List Casos for a tenant with optional filters.
 * @param {string} tenantId
 * @param {object} [filters]
 * @param {string} [filters.status] - filter by caso status
 * @returns {Promise<object[]>}
 */
async function getCasosByTenant(tenantId, filters = {}) {
  const prisma = getPrisma();
  const where = { tenantId };

  if (filters.status) {
    where.status = filters.status;
  }

  return prisma.caso.findMany({
    where,
    include: {
      lead: {
        select: {
          id: true,
          nome: true,
          telefone: true,
          canal: true,
          origem: true,
        },
      },
    },
    orderBy: { criadoEm: 'desc' },
  });
}

/**
 * Get a single Caso with full lead info.
 * @param {string} tenantId
 * @param {string} casoId
 * @returns {Promise<object|null>}
 */
async function getCasoDetail(tenantId, casoId) {
  const prisma = getPrisma();

  return prisma.caso.findFirst({
    where: { id: casoId, tenantId },
    include: {
      lead: true,
    },
  });
}

module.exports = { closeCaso, getCasosByTenant, getCasoDetail };
