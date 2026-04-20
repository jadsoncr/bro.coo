// src/storage/redisSession.js
const { getRedis } = require('../infra/redis');

const TTL = 86400; // 24h

function sessionKey(tenantId, sessao) {
  return `session:${tenantId}:${sessao}`;
}

async function getSession(tenantId, sessao, canalOrigem) {
  const redis = getRedis();
  const raw = await redis.get(sessionKey(tenantId, sessao));
  if (raw) return JSON.parse(raw);

  const nova = {
    tenantId,
    sessao,
    estadoAtual: 'start',
    fluxo: null,
    nome: null,
    origem: null,
    campanha: null,
    telefoneContato: null,
    canalOrigem: canalOrigem || 'desconhecido',
    canalPreferido: null,
    ultimaMensagem: null,
    ultimaPergunta: null,
    score: 0,
    prioridade: 'FRIO',
    scoreBreakdown: {},
    flagAtencao: false,
    statusSessao: 'ATIVO',
    mensagensEnviadas: 0,
    leadId: null,
    atualizadoEm: new Date().toISOString(),
  };

  await redis.set(sessionKey(tenantId, sessao), JSON.stringify(nova), 'EX', TTL);
  return nova;
}

async function updateSession(tenantId, sessao, data) {
  const redis = getRedis();
  const existing = await getSession(tenantId, sessao);
  const updated = { ...existing, ...data, atualizadoEm: new Date().toISOString() };
  await redis.set(sessionKey(tenantId, sessao), JSON.stringify(updated), 'EX', TTL);
}

async function resetSession(tenantId, sessao, canalOrigem) {
  const redis = getRedis();
  const existing = JSON.parse(await redis.get(sessionKey(tenantId, sessao)) || '{}');
  const reset = {
    tenantId,
    sessao,
    estadoAtual: 'start',
    fluxo: null,
    nome: null,
    origem: existing.origem || null,
    campanha: existing.campanha || null,
    telefoneContato: null,
    canalOrigem: canalOrigem || existing.canalOrigem || 'desconhecido',
    canalPreferido: null,
    ultimaMensagem: null,
    ultimaPergunta: null,
    score: 0,
    prioridade: 'FRIO',
    scoreBreakdown: {},
    flagAtencao: existing.flagAtencao || false,
    statusSessao: 'ATIVO',
    mensagensEnviadas: 0,
    leadId: null,
    atualizadoEm: new Date().toISOString(),
  };
  await redis.set(sessionKey(tenantId, sessao), JSON.stringify(reset), 'EX', TTL);
  return reset;
}

module.exports = { getSession, updateSession, resetSession };
