// src/jobs/abandono.js
// Periodic abandonment detection — scans sessions for inactivity independently of webhooks.

const sessionManager = require('../sessionManager');
const storage = require('../storage');
const { EVENTS, safeRecordEvent } = require('../events/service');

const ABANDONO_TIMEOUT_MS = 30 * 60 * 1000;   // 30 minutes
const RESET_TIMEOUT_MS    = 24 * 60 * 60 * 1000; // 24 hours

const FINAL_STATUSES  = ['FINALIZADO', 'ABANDONOU'];
const FINAL_STATES    = ['pos_final', 'encerramento', 'final_lead', 'final_cliente'];
const PRECOCE_STATES  = ['start', 'fallback'];
const VALIOSO_STATES  = ['coleta_nome', 'contato_confirmacao', 'contato_numero', 'contato_canal'];

function classificarAbandono(ultimoEstado) {
  if (PRECOCE_STATES.includes(ultimoEstado)) return 'PRECOCE';
  if (VALIOSO_STATES.includes(ultimoEstado)) return 'VALIOSO';
  return 'MEDIO';
}

/**
 * Gather all active sessions from Redis or in-memory fallback.
 * Returns an array of session objects.
 */
async function getAllSessions() {
  // Try Redis first
  const useRedis = process.env.STORAGE_ADAPTER === 'postgres' && !!process.env.REDIS_URL;
  if (useRedis) {
    try {
      const { getRedis } = require('../infra/redis');
      const redis = getRedis();
      const keys = await scanRedisKeys(redis, 'session:*');
      const sessions = [];
      for (const key of keys) {
        try {
          const raw = await redis.get(key);
          if (raw) sessions.push(JSON.parse(raw));
        } catch (_) { /* skip corrupt keys */ }
      }
      return sessions;
    } catch (err) {
      console.warn('[abandono] Redis indisponível, usando memória:', err.message);
    }
  }

  // Fallback: in-memory
  const { sessions } = storage._getAll();
  return Object.values(sessions);
}

/**
 * SCAN Redis keys matching a pattern (cursor-based, non-blocking).
 */
async function scanRedisKeys(redis, pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}

/**
 * Scan all sessions and detect abandonments.
 */
async function scanForAbandonments() {
  const sessions = await getAllSessions();
  const now = Date.now();
  const results = { abandoned: 0, reset: 0, errors: 0 };

  for (const sess of sessions) {
    try {
      // Skip sessions without timestamp
      if (!sess.atualizadoEm) continue;

      // Skip already finished or abandoned
      if (FINAL_STATUSES.includes(sess.statusSessao)) continue;

      // Skip final flow states
      if (FINAL_STATES.includes(sess.estadoAtual)) continue;

      // Skip sessions that never interacted (start + no message)
      if (sess.estadoAtual === 'start' && !sess.ultimaMensagem) continue;

      const diff = now - new Date(sess.atualizadoEm).getTime();
      if (diff < ABANDONO_TIMEOUT_MS) continue;

      // Determine tenantId
      const tenantId = sess.tenantId || global._currentTenantId;
      const canal = sess.canalOrigem || 'desconhecido';
      const classificacao = classificarAbandono(sess.estadoAtual);

      // Try to update existing lead instead of creating duplicate
      let leadUpdated = false;
      if (sess.leadId && tenantId && process.env.STORAGE_ADAPTER === 'postgres') {
        try {
          const { getPrisma } = require('../infra/db');
          const prisma = getPrisma();
          const result = await prisma.lead.updateMany({
            where: { id: sess.leadId, tenantId },
            data: {
              status: 'ABANDONOU',
              statusFinal: 'SEM_SUCESSO',
              abandonedAt: new Date(),
              scoreBreakdown: { classificacao },
              atualizadoEm: new Date(),
            },
          });
          leadUpdated = result.count > 0;
          if (leadUpdated) {
            await safeRecordEvent({
              tenantId,
              leadId: sess.leadId,
              event: EVENTS.ABANDONED,
              step: sess.estadoAtual,
              metadata: { classificacao, origem: 'scanner' },
            });
          }
        } catch (err) {
          console.warn('[abandono] falha ao atualizar lead existente:', err.message);
        }
      }

      // If no existing lead was updated, create abandonment record
      if (!leadUpdated) {
        await storage.createAbandono({
          tenantId,
          sessao: sess.sessao,
          fluxo: sess.fluxo,
          ultimoEstado: sess.estadoAtual,
          score: sess.score,
          prioridade: sess.prioridade,
          nome: sess.nome,
          canalOrigem: canal,
          origem: sess.origem,
          campanha: sess.campanha,
          mensagensEnviadas: sess.mensagensEnviadas || 0,
        });
      }

      // Mark session as abandoned
      await sessionManager.updateSession(sess.sessao, { statusSessao: 'ABANDONOU' });
      results.abandoned++;

      console.log(`[abandono] detectado: sessao=${sess.sessao} estado=${sess.estadoAtual} classificacao=${classificacao}`);

      // Additionally reset if >= 24h
      if (diff >= RESET_TIMEOUT_MS) {
        await sessionManager.resetSession(sess.sessao, canal);
        results.reset++;
        console.log(`[abandono] reset: sessao=${sess.sessao} (inativo >24h)`);
      }
    } catch (err) {
      results.errors++;
      console.error(`[abandono] erro na sessao ${sess.sessao}:`, err.message);
    }
  }

  return results;
}

/**
 * Start periodic scanner.
 * @param {number} intervalMs — scan interval (default 5 min)
 * @returns {NodeJS.Timeout} interval ID
 */
function startAbandonmentScanner(intervalMs = 5 * 60 * 1000) {
  console.log(`[abandono] scanner iniciado (intervalo: ${intervalMs / 1000}s)`);
  return setInterval(() => {
    scanForAbandonments().catch(err =>
      console.error('[abandono] scanner error:', err.message)
    );
  }, intervalMs);
}

/**
 * Stop the scanner.
 */
function stopAbandonmentScanner(intervalId) {
  clearInterval(intervalId);
  console.log('[abandono] scanner parado');
}

module.exports = {
  scanForAbandonments,
  startAbandonmentScanner,
  stopAbandonmentScanner,
  getAllSessions,
  classificarAbandono,
  // Exposed for testing
  ABANDONO_TIMEOUT_MS,
  RESET_TIMEOUT_MS,
  FINAL_STATUSES,
  FINAL_STATES,
};
