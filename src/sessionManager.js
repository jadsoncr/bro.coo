// src/sessionManager.js
// Fachada para operações de sessão. Toda a lógica usa storage via adapter.

const storage = require('./storage');

/**
 * Retorna sessão existente ou cria nova com estado 'inicio'.
 */
async function getSession(sessao, canalOrigem) {
  const existing = await storage.getSession(sessao);
  if (existing) return existing;

  const nova = {
    sessao,
    estadoAtual: 'start',
    fluxo: null,
    area: null,
    situacao: null,
    impacto: null,
    intencao: null,
    nome: null,
    origem: null,
    campanha: null,
    canalOrigem: canalOrigem || 'desconhecido',
    canalPreferido: null,
    ultimaMensagem: null,
    ultimaPergunta: null,
    score: 0,
    prioridade: 'FRIO',
    flagAtencao: false,
    statusSessao: 'ATIVO',
    mensagensEnviadas: 0,
    atualizadoEm: new Date().toISOString(),
  };

  await storage.updateSession(sessao, nova);
  return nova;
}

/**
 * Atualiza campos específicos de uma sessão.
 */
async function updateSession(sessao, data) {
  await storage.updateSession(sessao, {
    ...data,
    atualizadoEm: new Date().toISOString(),
  });
}

/**
 * Reseta sessão para o estado inicial.
 */
async function resetSession(sessao, canalOrigem) {
  const existing = await storage.getSession(sessao);
  await storage.updateSession(sessao, {
    estadoAtual: 'start',
    fluxo: null,
    area: null,
    situacao: null,
    impacto: null,
    intencao: null,
    nome: null,
    origem: existing ? existing.origem : null,
    campanha: existing ? existing.campanha : null,
    canalPreferido: null,
    ultimaMensagem: null,
    ultimaPergunta: null,
    score: 1,
    prioridade: 'FRIO',
    flagAtencao: existing ? existing.flagAtencao : false,
    atualizadoEm: new Date().toISOString(),
  });
  return getSession(sessao, canalOrigem);
}

module.exports = { getSession, updateSession, resetSession };
