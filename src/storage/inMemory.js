// src/storage/inMemory.js
// Implementação in-memory usando Map. Dados perdidos ao reiniciar (aceito para MVP).

const sessions = new Map();
const leads = [];
const clients = [];
const others = [];

async function getSession(sessao) {
  return sessions.get(sessao) || null;
}

async function updateSession(sessao, data) {
  const current = sessions.get(sessao) || {};
  sessions.set(sessao, { ...current, ...data, sessao });
}

async function createLead(data) {
  leads.push({ ...data, dataHora: new Date().toISOString() });
}

async function createClient(data) {
  clients.push({ ...data, dataHora: new Date().toISOString() });
}

async function createOther(data) {
  others.push({ ...data, dataHora: new Date().toISOString() });
}

// Exposto para testes
function _clear() {
  sessions.clear();
  leads.length = 0;
  clients.length = 0;
  others.length = 0;
}

function _getAll() {
  return { sessions: Object.fromEntries(sessions), leads, clients, others };
}

module.exports = { getSession, updateSession, createLead, createClient, createOther, _clear, _getAll };
