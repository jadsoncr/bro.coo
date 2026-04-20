// src/jobs/reativacao.js
const { getPrisma } = require('../infra/db');

const MENSAGEM_REATIVACAO = (nome) =>
  `Olá${nome ? `, ${nome}` : ''}! 👋\n\nNotei que você iniciou um atendimento conosco mas não chegamos a concluir.\n\nPosso te ajudar agora?\n\n1️⃣ Sim, quero continuar\n2️⃣ Não, obrigado`;

async function enviarTelegram(botToken, chatId, text) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function buscarLeadsParaReativar() {
  const prisma = getPrisma();
  const agora = new Date();
  const limite23h = new Date(agora.getTime() - 23 * 60 * 60 * 1000);
  const limite25h = new Date(agora.getTime() - 25 * 60 * 60 * 1000);

  return prisma.lead.findMany({
    where: {
      status: 'abandonou',
      reativacaoEnviadaEm: null,
      criadoEm: { gte: limite25h, lte: limite23h },
    },
    include: { tenant: { select: { id: true, botToken: true, nome: true } } },
  });
}

async function enviarReativacao(lead) {
  const { botToken } = lead.tenant;
  const chatId = lead.telefone;
  await enviarTelegram(botToken, chatId, MENSAGEM_REATIVACAO(lead.nome));
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
    try {
      await enviarReativacao(lead);
      await prisma.lead.update({
        where: { id: lead.id },
        data: { reativacaoEnviadaEm: new Date() },
      });
      console.log(`[reativacao] enviado para lead ${lead.id}`);
    } catch (err) {
      console.error(`[reativacao] erro no lead ${lead.id}:`, err.message);
    }
  }
}

module.exports = { buscarLeadsParaReativar, enviarReativacao, runReativacao };
