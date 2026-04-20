require('dotenv').config();

const http = require('http');
const { resolveTenant } = require('./src/tenants/service');
const { startWorker } = require('./src/infra/queue');
const cron = require('node-cron');
const express = require('express');
const normalize = require('./src/normalizer');
const { process: processar } = require('./src/stateMachine');
const { buildResponse } = require('./src/responder');
const sessionManager = require('./src/sessionManager');
const { createAbandono } = require('./src/storage');
const { registrarRespostaReativacao, runReativacao } = require('./src/jobs/reativacao');
const { createRevenueRouter } = require('./src/api/revenue');
const { initSocket } = require('./src/realtime/socket');

const ABANDONO_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const RESET_TIMEOUT_MS   = 24 * 60 * 60 * 1000; // 24 horas → reinicia sessão
const ESTADOS_FINAIS = ['pos_final', 'encerramento', 'final_lead', 'final_cliente'];

function parseStartTracking(text, canal) {
  const match = String(text || '').trim().match(/^\/start\s+([a-z0-9_-]+)/i);
  if (!match) return null;

  const [origem, ...campanhaParts] = match[1].split('_').filter(Boolean);
  return {
    origem: origem || null,
    campanha: campanhaParts.join('_') || null,
    canal,
  };
}

async function checkAbandono(sess) {
  if (!sess.atualizadoEm) return;
  if (ESTADOS_FINAIS.includes(sess.estadoAtual)) return;
  if (sess.statusSessao === 'ABANDONOU') return;
  if (sess.estadoAtual === 'start' && !sess.ultimaMensagem) return; // nunca interagiu

  const diff = Date.now() - new Date(sess.atualizadoEm).getTime();
  if (diff < ABANDONO_TIMEOUT_MS) return;

  try {
    await createAbandono({
      tenantId: sess.tenantId || global._currentTenantId,
      sessao: sess.sessao,
      fluxo: sess.fluxo,
      ultimoEstado: sess.estadoAtual,
      score: sess.score,
      prioridade: sess.prioridade,
      nome: sess.nome,
      canalOrigem: sess.canalOrigem,
      origem: sess.origem,
      campanha: sess.campanha,
      mensagensEnviadas: sess.mensagensEnviadas || 0,
    });

    if (diff >= RESET_TIMEOUT_MS) {
      // sumiu >24h — reinicia sessão para nova conversa
      await sessionManager.resetSession(sess.sessao, sess.canalOrigem);
    } else {
      await sessionManager.updateSession(sess.sessao, { statusSessao: 'ABANDONOU' });
    }
  } catch (err) {
    console.error('[checkAbandono error]', err.message);
  }
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

async function sendTelegram(chat_id, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text }),
  });
}

const app = express();
app.use(express.json());

// Middleware: resolve tenant pelo token do bot (Telegram)
app.use('/webhook', async (req, res, next) => {
  global._currentTenantId = null;
  const token = process.env.TELEGRAM_TOKEN;
  if (process.env.STORAGE_ADAPTER !== 'postgres') {
    return next();
  }

  if (!token) {
    return res.status(503).json({ error: 'TELEGRAM_TOKEN não configurado.' });
  }

  try {
    const tenant = await resolveTenant(token);
    if (!tenant) {
      return res.status(503).json({ error: 'Tenant não configurado para este bot.' });
    }

    global._currentTenantId = tenant.id;
    req.tenant = tenant;
    return next();
  } catch (err) {
    console.error('[tenant middleware error]', err.message);
    return res.status(503).json({ error: 'Erro ao resolver tenant.' });
  }
});

app.post('/webhook', async (req, res) => {
  try {
    // Detectar origem: Telegram ou padrão (n8n/WhatsApp)
    const isTelegram = !!(req.body.message || req.body.edited_message);
    const tgMsg = req.body.message || req.body.edited_message;

    let body = req.body;
    if (isTelegram) {
      if (!tgMsg.text) {
        // áudio, foto, sticker, etc — tratamento progressivo por nível
        const chatId = String(tgMsg.chat.id);
        const sess = await sessionManager.getSession(chatId, 'telegram');
        const count = (sess.audioCount || 0) + 1;
        await sessionManager.updateSession(chatId, { audioCount: count });

        let msg;
        if (count === 1) {
          msg = 'Perfeito 👍 recebi seu áudio.\n\nVou encaminhar para um advogado ouvir — mas pra agilizar, me diz:\n\n1️⃣ Problema no trabalho\n2️⃣ Questão de família\n3️⃣ Já sou cliente\n4️⃣ Quero falar com advogado\n5️⃣ Outro assunto';
        } else if (count === 2) {
          msg = 'Recebi 👍 Um advogado vai ouvir seu áudio.\n\nEnquanto isso, qual opção descreve melhor seu caso?\n\n1️⃣ Trabalho\n2️⃣ Família\n3️⃣ Já sou cliente\n4️⃣ Falar com advogado\n5️⃣ Outro';
        } else {
          msg = 'Pra te ajudar agora 👍\n\nPreciso que escolha uma opção:\n\n1 - Trabalho\n2 - Família\n3 - Já sou cliente\n4 - Advogado\n5 - Outro';
        }

        await sendTelegram(chatId, msg);
        return res.sendStatus(200);
      }
      const tracking = parseStartTracking(tgMsg.text, 'telegram');
      if (tracking) {
        await sessionManager.updateSession(String(tgMsg.chat.id), tracking);
      }
      body = {
        sessao: String(tgMsg.chat.id),
        mensagem: tgMsg.text,
        canal: 'telegram',
      };
    }

    const { sessao, mensagem, canal } = normalize(body);

    if (!sessao) {
      return res.status(400).json({ error: 'Campo "sessao" é obrigatório.' });
    }

    // Detecta abandono antes de processar nova mensagem
    const sessAntes = await sessionManager.getSession(sessao, canal);
    await checkAbandono(sessAntes);
    if (process.env.STORAGE_ADAPTER === 'postgres') {
      await registrarRespostaReativacao({ tenantId: global._currentTenantId, telefone: sessao });
    }

    const resultado = await processar(sessao, mensagem, canal);

    // Incrementa contador de mensagens
    await sessionManager.updateSession(sessao, {
      mensagensEnviadas: (sessAntes.mensagensEnviadas || 0) + 1,
      statusSessao: ESTADOS_FINAIS.includes(resultado.estado) ? 'FINALIZADO' : 'ATIVO',
    });
    const resposta = buildResponse(resultado);

    if (isTelegram) {
      await sendTelegram(tgMsg.chat.id, resposta.message);
      return res.sendStatus(200);
    }

    return res.json(resposta);

  } catch (err) {
    console.error('[webhook error]', err);
    if (req.body.message || req.body.edited_message) return res.sendStatus(200);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// Health check para Railway
app.get('/health', (_req, res) => {
  const payload = {
    status: 'ok',
    env: {
      storage: process.env.STORAGE_ADAPTER || 'memory',
      database: !!process.env.DATABASE_URL,
      redis: !!process.env.REDIS_URL,
      adminToken: !!process.env.ADMIN_TOKEN,
      telegramToken: !!process.env.TELEGRAM_TOKEN,
    },
  };
  if (!process.env.ADMIN_TOKEN) payload._setup = { adminToken: _adminToken };
  return res.json(payload);
});

// ── Admin: visibilidade de sessões em produção ──────────────────────────────
// ADMIN_TOKEN: se não configurado, gera um aleatório no boot e loga no console
let _adminToken = process.env.ADMIN_TOKEN;
if (!_adminToken) {
  _adminToken = require('crypto').randomBytes(16).toString('hex');
  console.warn(`[auth] ADMIN_TOKEN não configurado. Token temporário: ${_adminToken}`);
}

function adminAuth(req, res, next) {
  if (req.headers['x-admin-token'] !== _adminToken) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  next();
}

// Tenant padrão fixo gerado deterministicamente do nome do app (UUID v5-like)
const DEFAULT_TENANT_FALLBACK = process.env.DEFAULT_TENANT_ID || 'a0000000-0000-0000-0000-000000000001';

app.use('/api', adminAuth, createRevenueRouter({
  resolveTenantId: (req) => req.headers['x-tenant-id'] || global._currentTenantId || DEFAULT_TENANT_FALLBACK,
}));

app.get('/admin/sessions', adminAuth, async (_req, res) => {
  const storage = require('./src/storage/inMemory');
  const { sessions } = storage._getAll();
  const agora = Date.now();

  const lista = Object.values(sessions).map(s => ({
    sessao:           s.sessao,
    estado:           s.estadoAtual,
    fluxo:            s.fluxo || '—',
    score:            s.score || 0,
    prioridade:       s.prioridade || 'FRIO',
    status:           s.statusSessao || 'ATIVO',
    nome:             s.nome || '—',
    canal:            s.canalOrigem || '—',
    mensagens:        s.mensagensEnviadas || 0,
    ultimaMensagem:   s.ultimaMensagem || '—',
    inatividade_min:  s.atualizadoEm
      ? Math.floor((agora - new Date(s.atualizadoEm).getTime()) / 60000)
      : null,
    atualizadoEm:     s.atualizadoEm || null,
  }));

  // ordena por mais recente
  lista.sort((a, b) => new Date(b.atualizadoEm) - new Date(a.atualizadoEm));

  const resumo = {
    total:       lista.length,
    ativos:      lista.filter(s => s.status === 'ATIVO').length,
    finalizados: lista.filter(s => s.status === 'FINALIZADO').length,
    abandonados: lista.filter(s => s.status === 'ABANDONOU').length,
    quentes:     lista.filter(s => s.prioridade === 'QUENTE').length,
  };

  return res.json({ resumo, sessoes: lista });
});


if (process.env.STORAGE_ADAPTER === 'postgres' && process.env.REDIS_URL) {
  startWorker();
  console.log('[queue] BullMQ worker iniciado');

  cron.schedule('0 * * * *', () => {
    console.log('[cron] rodando reativacao de abandonos');
    runReativacao().catch(err => console.error('[cron] reativacao error:', err.message));
  });
  console.log('[cron] reativacao de abandonos agendada (a cada hora)');
} else if (process.env.STORAGE_ADAPTER === 'postgres') {
  console.log('[queue] REDIS_URL não configurado — worker e cron desativados');
}

// JSON error handler (Express 5 — deve ser registrado antes de listen)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[error]', err.message, err.stack?.split('\n')[1]?.trim());
  return res.status(500).json({ error: err.message || 'Erro interno.' });
});

const PORT = process.env.PORT || 3000;
const httpServer = http.createServer(app);
initSocket(httpServer);

async function start() {
  // Roda migration em produção antes de subir
  if (process.env.STORAGE_ADAPTER === 'postgres' && process.env.DATABASE_URL) {
    try {
      const { execSync } = require('child_process');
      execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
      console.log('[db] schema aplicado');
    } catch (err) {
      console.error('[db] db push falhou:', err.message);
    }
  }

  httpServer.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Storage adapter: ${process.env.STORAGE_ADAPTER || 'memory'}`);
  });
}

start();
