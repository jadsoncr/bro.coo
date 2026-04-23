// src/jobs/reativacao.js
const { getPrisma } = require('../infra/db');
const { EVENTS, safeRecordEvent, sleep } = require('../events/service');

const MENSAGEM_REATIVACAO = (nome) =>
  `Olá${nome ? `, ${nome}` : ''}! 👋\n\nNotei que você iniciou um atendimento conosco mas não chegamos a concluir.\n\nPosso te ajudar agora?\n\n1️⃣ Sim, quero continuar\n2️⃣ Não, obrigado`;

/**
 * Validate phone number: not empty, at least 8 digits after removing non-digits.
 */
function isValidPhone(telefone) {
  if (!telefone) return false;
  const digits = String(telefone).replace(/\D/g, '');
  return digits.length >= 8;
}

async function enviarTelegram(botToken, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!response.ok) {
    throw new Error(`Telegram API retornou ${response.status || 'erro'}`);
  }
}

async function buscarLeadsParaReativar() {
  const prisma = getPrisma();
  const agora = new Date();
  const limite24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  const limite48h = new Date(agora.getTime() - 48 * 60 * 60 * 1000);
  const limite3d = new Date(agora.getTime() - 3 * 24 * 60 * 60 * 1000);
  const limite7d = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);

  return prisma.lead.findMany({
    where: {
      reativacaoEnviadaEm: null,
      reativacaoRespondidaEm: null,
      reativacaoCount: { lt: 2 },
      OR: [
        {
          statusFinal: 'SEM_SUCESSO',
          prioridade: 'MEDIO',
          abandonedAt: { gte: limite48h, lte: limite24h },
        },
        {
          statusFinal: 'SEM_SUCESSO',
          prioridade: 'FRIO',
          abandonedAt: { gte: limite7d, lte: limite3d },
        },
        {
          status: 'abandonou',
          criadoEm: { gte: limite48h, lte: limite24h },
        },
      ],
    },
    include: { tenant: { select: { id: true, botToken: true, nome: true } } },
  });
}

async function enviarReativacao(lead) {
  const { botToken } = lead.tenant;
  const chatId = lead.telefone;
  await enviarTelegram(botToken, chatId, MENSAGEM_REATIVACAO(lead.nome));
}

/**
 * Send Telegram message with one retry after 2 seconds on failure.
 * Returns true on success, false if both attempts fail.
 */
async function enviarComRetry(lead) {
  try {
    await enviarReativacao(lead);
    return true;
  } catch (firstErr) {
    console.warn(`[reativacao] primeiro envio falhou para lead ${lead.id}: ${firstErr.message}, retentando em 2s...`);
    await sleep(2000);
    try {
      await enviarReativacao(lead);
      return true;
    } catch (retryErr) {
      console.error(`[reativacao DLQ] lead ${lead.id}: ${retryErr.message}`);
      return false;
    }
  }
}

async function runReativacao() {
  const prisma = getPrisma();
  let leads;

  try {
    leads = await buscarLeadsParaReativar();
  } catch (err) {
    console.error('[reativacao] erro ao buscar leads:', err.message);
    return;
  }

  for (const lead of leads) {
    // Phone validation — skip leads with invalid phone numbers
    if (!isValidPhone(lead.telefone)) {
      console.warn(`[reativacao] telefone inválido para lead ${lead.id}: "${lead.telefone}", pulando`);
      continue;
    }

    const sent = await enviarComRetry(lead);
    if (!sent) continue;

    try {
      const enviadaEm = new Date();
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          reativacaoEnviadaEm: enviadaEm,
          reativacaoCount: { increment: 1 },
        },
      });
      await safeRecordEvent({
        tenantId: lead.tenant.id,
        leadId: lead.id,
        event: EVENTS.REACTIVATION_SENT,
        metadata: { prioridade: lead.prioridade },
      });
      console.log(`[reativacao] enviado para lead ${lead.id}`);
    } catch (err) {
      console.error(`[reativacao] erro no lead ${lead.id}:`, err.message);
    }
  }
}

async function registrarRespostaReativacao({ tenantId, telefone }) {
  if (!tenantId || !telefone) return null;

  const prisma = getPrisma();
  const lead = await prisma.lead.findFirst({
    where: {
      tenantId,
      telefone,
      reativacaoEnviadaEm: { not: null },
      reativacaoRespondidaEm: null,
    },
    orderBy: { reativacaoEnviadaEm: 'desc' },
  });

  if (!lead) return null;

  const respondidaEm = new Date();
  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      reativacaoRespondidaEm: respondidaEm,
      status: 'EM_ATENDIMENTO',
      statusFinal: null,
      prioridade: 'QUENTE',
      origemConversao: 'reativacao',
    },
  });

  await safeRecordEvent({
    tenantId,
    leadId: lead.id,
    event: EVENTS.REACTIVATION_REPLY,
    metadata: { telefone },
  });

  return updated;
}

module.exports = {
  buscarLeadsParaReativar,
  enviarReativacao,
  runReativacao,
  registrarRespostaReativacao,
  isValidPhone,
  enviarComRetry,
};
