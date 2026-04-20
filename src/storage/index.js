// src/storage/index.js
// Sessões: Redis quando STORAGE_ADAPTER=postgres, inMemory caso contrário
// Persistência: Postgres quando STORAGE_ADAPTER=postgres, inMemory caso contrário

const memory = require('./inMemory');
const redisSession = require('./redisSession');
const postgres = require('./postgres');

const usePostgres = process.env.STORAGE_ADAPTER === 'postgres';

function tenantId() {
  return global._currentTenantId || process.env.DEFAULT_TENANT_ID || 'default';
}

function withTenant(data) {
  return { ...data, tenantId: data?.tenantId || tenantId() };
}

module.exports = {
  // Sessões
  getSession: usePostgres
    ? (sessao, canal) => {
        return redisSession.getSession(tenantId(), sessao, canal);
      }
    : memory.getSession,

  updateSession: usePostgres
    ? (sessao, data) => {
        return redisSession.updateSession(tenantId(), sessao, data);
      }
    : memory.updateSession,

  resetSession: usePostgres
    ? (sessao, canal) => {
        return redisSession.resetSession(tenantId(), sessao, canal);
      }
    : memory.resetSession,

  // Persistência de leads
  createLead:     usePostgres ? (data) => postgres.createLead(withTenant(data))     : memory.createLead,
  createClient:   usePostgres ? (data) => postgres.createClient(withTenant(data))   : memory.createClient,
  createOther:    usePostgres ? (data) => postgres.createOther(withTenant(data))    : memory.createOther,
  createAbandono: usePostgres ? (data) => postgres.createAbandono(withTenant(data)) : memory.createAbandono,

  // Internos (compatibilidade com /admin/sessions)
  _clear:  memory._clear,
  _getAll: memory._getAll,
};
