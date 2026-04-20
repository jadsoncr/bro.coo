// src/storage/index.js
// Sessões: Redis quando STORAGE_ADAPTER=postgres, inMemory caso contrário
// Persistência: Postgres quando STORAGE_ADAPTER=postgres, inMemory caso contrário

const memory = require('./inMemory');
const redisSession = require('./redisSession');
const postgres = require('./postgres');

const usePostgres = process.env.STORAGE_ADAPTER === 'postgres';

module.exports = {
  // Sessões
  getSession: usePostgres
    ? (sessao, canal) => {
        const tenantId = global._currentTenantId || 'default';
        return redisSession.getSession(tenantId, sessao, canal);
      }
    : memory.getSession,

  updateSession: usePostgres
    ? (sessao, data) => {
        const tenantId = global._currentTenantId || 'default';
        return redisSession.updateSession(tenantId, sessao, data);
      }
    : memory.updateSession,

  resetSession: usePostgres
    ? (sessao, canal) => {
        const tenantId = global._currentTenantId || 'default';
        return redisSession.resetSession(tenantId, sessao, canal);
      }
    : memory.resetSession,

  // Persistência de leads
  createLead:    usePostgres ? postgres.createLead   : memory.createLead,
  createClient:  usePostgres ? postgres.createLead   : memory.createClient,
  createOther:   usePostgres ? postgres.createLead   : memory.createOther,

  // Internos (compatibilidade com /admin/sessions)
  _clear:  memory._clear,
  _getAll: memory._getAll,
};
