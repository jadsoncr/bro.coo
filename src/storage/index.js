// src/storage/index.js
// Sessões: Redis quando STORAGE_ADAPTER=postgres E REDIS_URL configurado, inMemory caso contrário
// Persistência: Postgres quando STORAGE_ADAPTER=postgres, inMemory caso contrário

const memory = require('./inMemory');
const postgres = require('./postgres');

const usePostgres = process.env.STORAGE_ADAPTER === 'postgres';
const useRedis = usePostgres && !!process.env.REDIS_URL;

// Carrega redisSession apenas se REDIS_URL estiver configurado
let redisSession = null;
if (useRedis) {
  try {
    redisSession = require('./redisSession');
  } catch (err) {
    console.warn('[storage] redisSession não carregado:', err.message);
  }
}

function tenantId() {
  return global._currentTenantId || process.env.DEFAULT_TENANT_ID || 'default';
}

function withTenant(data) {
  return { ...data, tenantId: data?.tenantId || tenantId() };
}

// Sessão com fallback automático para memória se Redis falhar
async function safeRedisGet(sessao, canal) {
  try {
    return await redisSession.getSession(tenantId(), sessao, canal);
  } catch (err) {
    console.warn('[storage] Redis getSession falhou, usando memória:', err.message);
    return memory.getSession(sessao, canal);
  }
}

async function safeRedisUpdate(sessao, data) {
  try {
    return await redisSession.updateSession(tenantId(), sessao, data);
  } catch (err) {
    console.warn('[storage] Redis updateSession falhou, usando memória:', err.message);
    return memory.updateSession(sessao, data);
  }
}

async function safeRedisReset(sessao, canal) {
  try {
    return await redisSession.resetSession(tenantId(), sessao, canal);
  } catch (err) {
    console.warn('[storage] Redis resetSession falhou, usando memória:', err.message);
    return memory.resetSession(sessao, canal);
  }
}

module.exports = {
  // Sessões
  getSession:    useRedis ? safeRedisGet    : memory.getSession,
  updateSession: useRedis ? safeRedisUpdate : memory.updateSession,
  resetSession:  useRedis ? safeRedisReset  : memory.resetSession,

  // Persistência de leads
  createLead:     usePostgres ? (data) => postgres.createLead(withTenant(data))     : memory.createLead,
  createClient:   usePostgres ? (data) => postgres.createClient(withTenant(data))   : memory.createClient,
  createOther:    usePostgres ? (data) => postgres.createOther(withTenant(data))    : memory.createOther,
  createAbandono: usePostgres ? (data) => postgres.createAbandono(withTenant(data)) : memory.createAbandono,

  // Internos (compatibilidade com /admin/sessions)
  _clear:  memory._clear,
  _getAll: memory._getAll,
};
