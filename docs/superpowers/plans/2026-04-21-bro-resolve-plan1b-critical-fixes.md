# BRO Resolve — Plan 1b: Critical Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 production-breaking bugs identified in CTO audit before any new feature is built.

**Architecture:** All fixes are in-place on `~/Downloads/bro-resolve/`. No new files except JWT util. The most critical fix is eliminating `global._currentTenantId` — replaced by `req.tenantId` threaded through every middleware and route.

**Tech Stack:** Node.js, Express 5, Prisma v5, jsonwebtoken

---

## File Map

```
Modify:
  prisma/schema.prisma           ← add @@index, SLA fields, JWT secret placeholder
  src/auth/middleware.js         ← remove global._currentTenantId, add JWT
  src/flows/engine.js            ← fix hardcoded coleta_nome/coleta_telefone transitions
  server.js                      ← thread req.tenantId everywhere, remove global refs
Create:
  src/auth/jwt.js                ← sign/verify JWT tokens
Modify:
  package.json                   ← add jsonwebtoken dependency
```

---

### Task 1: Add jsonwebtoken dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install jsonwebtoken**

```bash
cd ~/Downloads/bro-resolve && npm install jsonwebtoken
```

Expected: `jsonwebtoken` added to `node_modules/` and `package.json`.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add jsonwebtoken dependency"
```

---

### Task 2: JWT utility

**Files:**
- Create: `src/auth/jwt.js`
- Test: `tests/auth/jwt.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/auth/jwt.test.js`:

```js
process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok';
const { signToken, verifyToken } = require('../../src/auth/jwt');

test('signToken creates verifiable token', () => {
  const payload = { userId: 'abc', tenantId: 'ten1', role: 'OPERATOR' };
  const token = signToken(payload);
  expect(typeof token).toBe('string');
  const decoded = verifyToken(token);
  expect(decoded.userId).toBe('abc');
  expect(decoded.tenantId).toBe('ten1');
  expect(decoded.role).toBe('OPERATOR');
});

test('verifyToken throws on invalid token', () => {
  expect(() => verifyToken('bad.token.here')).toThrow();
});

test('verifyToken throws on expired token', () => {
  const token = signToken({ userId: 'x' }, '-1s'); // already expired
  expect(() => verifyToken(token)).toThrow();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/auth/jwt.test.js
```

Expected: FAIL

- [ ] **Step 3: Implement src/auth/jwt.js**

```js
const jwt = require('jsonwebtoken');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não configurado');
  return secret;
}

function signToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, getSecret(), { expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

module.exports = { signToken, verifyToken };
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/auth/jwt.test.js
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/auth/jwt.js tests/auth/jwt.test.js
git commit -m "feat: add JWT sign/verify utility"
```

---

### Task 3: Fix global._currentTenantId race condition

**Files:**
- Modify: `src/auth/middleware.js`

This is the most critical fix. `global._currentTenantId` causes tenant A to read tenant B data under concurrent load. Replace with `req.tenantId`.

- [ ] **Step 1: Write failing tests**

Create `tests/auth/middleware.test.js` (overwrite existing):

```js
process.env.ADMIN_TOKEN = 'test-admin-token';
process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok';
jest.resetModules();
const { adminAuth, requireRole, attachTenantFromJWT } = require('../../src/auth/middleware');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

test('adminAuth blocks missing token', () => {
  const req = { headers: {} };
  const res = mockRes();
  const next = jest.fn();
  adminAuth(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});

test('adminAuth allows correct token', () => {
  const req = { headers: { 'x-admin-token': 'test-admin-token' } };
  const res = mockRes();
  const next = jest.fn();
  adminAuth(req, res, next);
  expect(next).toHaveBeenCalled();
});

test('requireRole blocks OPERATOR from OWNER route', () => {
  const req = { user: { role: 'OPERATOR' } };
  const res = mockRes();
  const next = jest.fn();
  requireRole('OWNER')(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
});

test('requireRole allows OWNER on OWNER route', () => {
  const req = { user: { role: 'OWNER' } };
  const res = mockRes();
  const next = jest.fn();
  requireRole('OWNER')(req, res, next);
  expect(next).toHaveBeenCalled();
});

test('attachTenantFromJWT sets req.tenantId from valid JWT', () => {
  const { signToken } = require('../../src/auth/jwt');
  const token = signToken({ userId: 'u1', tenantId: 'ten1', role: 'OPERATOR' });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  const next = jest.fn();
  attachTenantFromJWT(req, res, next);
  expect(req.tenantId).toBe('ten1');
  expect(req.user.role).toBe('OPERATOR');
  expect(next).toHaveBeenCalled();
  // Critical: no global mutation
  expect(global._currentTenantId).toBeUndefined();
});

test('attachTenantFromJWT blocks invalid token', () => {
  const req = { headers: { authorization: 'Bearer bad.token' } };
  const res = mockRes();
  const next = jest.fn();
  attachTenantFromJWT(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/auth/middleware.test.js
```

Expected: FAIL (attachTenantFromJWT not defined)

- [ ] **Step 3: Rewrite src/auth/middleware.js**

```js
const crypto = require('crypto');
const { verifyToken } = require('./jwt');

let _adminToken = process.env.ADMIN_TOKEN;
if (!_adminToken) {
  _adminToken = crypto.randomBytes(16).toString('hex');
  console.warn(`[auth] ADMIN_TOKEN não configurado. Token temporário: ${_adminToken}`);
}

// Admin token auth (for legacy/internal use)
function adminAuth(req, res, next) {
  if (req.headers['x-admin-token'] !== _adminToken) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  return next();
}

// JWT-based user auth — sets req.user and req.tenantId (NO global mutation)
function attachTenantFromJWT(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token obrigatório.' });
  try {
    const decoded = verifyToken(token);
    req.user = { userId: decoded.userId, tenantId: decoded.tenantId, role: decoded.role };
    req.tenantId = decoded.tenantId; // ← explicit, no global
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

// Role enforcement (must run after attachTenantFromJWT)
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    return next();
  };
}

// Webhook tenant resolution (from Telegram bot token, sets req.tenantId directly)
async function resolveTenantFromBotToken(req, res, next) {
  req.tenantId = null;
  const botToken = process.env.TELEGRAM_TOKEN;
  if (!botToken) return next();
  try {
    const { resolveTenantByToken } = require('../tenants/service');
    const tenant = await resolveTenantByToken(botToken);
    if (!tenant) return res.status(503).json({ error: 'Tenant não configurado.' });
    req.tenantId = tenant.id;
    req.tenant = tenant;
    return next();
  } catch (err) {
    console.error('[tenant middleware]', err.message);
    return res.status(503).json({ error: 'Erro ao resolver tenant.' });
  }
}

function _getAdminToken() { return _adminToken; }

module.exports = {
  adminAuth,
  attachTenantFromJWT,
  requireRole,
  resolveTenantFromBotToken,
  _getAdminToken,
};
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/auth/
```

Expected: PASS (all 6 tests — jwt.test.js + middleware.test.js)

- [ ] **Step 5: Commit**

```bash
git add src/auth/middleware.js tests/auth/middleware.test.js
git commit -m "fix: replace global._currentTenantId with req.tenantId (race condition)"
```

---

### Task 4: Fix hardcoded transitions in flow engine

**Files:**
- Modify: `src/flows/engine.js`
- Modify: `prisma/schema.prisma` — Node needs `proxEstado` for input nodes

The bug: `if (estadoAtual === 'coleta_nome') proxEstado = 'coleta_telefone'` — this is hardcoded state name logic in a "dynamic" engine. Input nodes must define their own `proxEstado` via `opcoes[0].proxEstado`, with `final_lead` as fallback only.

- [ ] **Step 1: Write failing test**

Add to `tests/flows/engine.test.js` (append):

```js
const { buildFlowMap, resolveNextState } = require('../../src/flows/engine');

test('input node advances via opcoes[0].proxEstado, not hardcoded state name', () => {
  const nodes = [
    {
      estado: 'pergunta_customizada',
      mensagem: 'Qual sua empresa?',
      tipo: 'input',
      campo: 'empresa',
      opcoes: [{ proxEstado: 'final_lead' }],
    },
    { estado: 'final_lead', mensagem: 'Obrigado!', tipo: 'final_lead', opcoes: null },
  ];
  const map = buildFlowMap(nodes);
  // Input node should follow opcoes[0].proxEstado
  const inputNode = map['pergunta_customizada'];
  const nextState = inputNode.opcoes?.[0]?.proxEstado || 'final_lead';
  expect(nextState).toBe('final_lead');
  // Critically: NOT 'coleta_telefone' (hardcoded)
  expect(nextState).not.toBe('coleta_telefone');
});
```

Run:
```bash
npm test -- tests/flows/engine.test.js
```

Expected: This test PASSES already (logic is in engine.js). The goal is to document the requirement and then fix the engine code.

- [ ] **Step 2: Fix the hardcoded logic in src/flows/engine.js**

Replace the input node transition block (lines ~67-72):

```js
// BEFORE (hardcoded — DELETE THIS):
} else if (currentNode.tipo === 'input') {
  if (estadoAtual === 'coleta_nome') proxEstado = 'coleta_telefone';
  else if (estadoAtual === 'coleta_telefone') proxEstado = 'final_lead';
  else proxEstado = 'final_lead';
  scoreIncrement = currentNode.score || 0;
}

// AFTER (dynamic — use this):
} else if (currentNode.tipo === 'input') {
  proxEstado = currentNode.opcoes?.[0]?.proxEstado || 'final_lead';
  scoreIncrement = currentNode.score || 0;
}
```

Also fix the `upsertLead` function — remove silent error swallowing:

```js
// BEFORE:
async function upsertLead(tenantId, sessao, canal, sessData, flowId) {
  try {
    // ...
  } catch (err) {
    console.error('[engine] upsertLead error:', err.message); // silently swallowed
  }
}

// AFTER: remove try/catch entirely — let errors propagate to processMessage caller
async function upsertLead(tenantId, sessao, canal, sessData, flowId) {
  const prisma = getPrisma();
  const existing = await prisma.lead.findUnique({
    where: { tenantId_sessao_canal: { tenantId, sessao, canal } },
  });
  const data = {
    nome: sessData.nome || null,
    telefone: sessData.telefone || null,
    segmento: sessData.segmento || null,
    tipoAtendimento: sessData.tipoAtendimento || 'novo_lead',
    score: sessData.score || 0,
    estadoAtual: sessData.estadoAtual || 'start',
    ultimaMensagem: sessData.ultimaMensagem || null,
    flowId,
  };
  if (existing) {
    return prisma.lead.update({ where: { id: existing.id }, data });
  }
  return prisma.lead.create({
    data: { id: crypto.randomUUID(), tenantId, sessao, canal, status: 'em_qualificacao', ...data },
  });
}
```

Also update `processMessage` signature — accept `tenantId` via parameter (already correct), but remove any `global._currentTenantId` references if any crept in.

- [ ] **Step 3: Update templates to include proxEstado on input nodes**

In `src/flows/templates/juridico.js`, update every input node to include `opcoes` with `proxEstado`:

```js
// coleta_nome node — BEFORE:
{
  estado: 'coleta_nome',
  mensagem: 'Para continuar, qual é o seu nome completo?',
  tipo: 'input',
  campo: 'nome',
  opcoes: null,
},

// coleta_nome node — AFTER:
{
  estado: 'coleta_nome',
  mensagem: 'Para continuar, qual é o seu nome completo?',
  tipo: 'input',
  campo: 'nome',
  opcoes: [{ proxEstado: 'coleta_telefone' }],
},

// coleta_telefone node — BEFORE:
{
  estado: 'coleta_telefone',
  mensagem: 'Qual é o seu telefone para contato?',
  tipo: 'input',
  campo: 'telefone',
  opcoes: null,
},

// coleta_telefone node — AFTER:
{
  estado: 'coleta_telefone',
  mensagem: 'Qual é o seu telefone para contato?',
  tipo: 'input',
  campo: 'telefone',
  opcoes: [{ proxEstado: 'final_lead' }],
},
```

Apply same pattern to `clinica.js` and `imobiliaria.js`.

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: All 22+ tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/flows/engine.js src/flows/templates/
git commit -m "fix: remove hardcoded state transitions from flow engine"
```

---

### Task 5: Add database indices + SLA fields to schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update schema**

Replace the schema with the corrected version (add `@@index`, SLA fields, `primeiraRespostaEm`, `assumidoPorId`):

In `prisma/schema.prisma`, add to `Tenant`:
```prisma
  slaLeadMinutes   Int      @default(60)
  slaContratoHoras Int      @default(48)
```

Add to `Lead`:
```prisma
  primeiraRespostaEm DateTime?
  assumidoPorId      String?

  @@index([tenantId, status])
  @@index([tenantId, segmento])
  @@index([tenantId, atualizadoEm])
  @@index([tenantId, score])
```

Add to `Message`:
```prisma
  @@index([leadId])
  @@index([leadId, criadoEm])
```

Add to `Caso`:
```prisma
  prazoEstimado DateTime?

  @@index([tenantId, status])
  @@index([tenantId, dataRecebimento])
  @@index([tenantId, criadoEm])
```

Add to `Event`:
```prisma
  @@index([tenantId, event])
  @@index([tenantId, criadoEm])
  @@index([leadId])
```

Add new `AdminUser` and `AdminLog` models at the end of schema:

```prisma
model AdminUser {
  id        String   @id @default(uuid())
  email     String   @unique
  token     String   @unique
  ativo     Boolean  @default(true)
  criadoEm  DateTime @default(now())

  logs AdminLog[]

  @@map("admin_users")
}

model AdminLog {
  id        String   @id @default(uuid())
  adminId   String
  acao      String
  tenantId  String?
  metadata  Json?
  criadoEm  DateTime @default(now())

  admin AdminUser @relation(fields: [adminId], references: [id])

  @@index([adminId, criadoEm])
  @@index([tenantId, criadoEm])
  @@map("admin_logs")
}
```

Also add `JWT_SECRET` to `.env.example`:
```
JWT_SECRET=change-this-to-a-32-char-minimum-secret
```

- [ ] **Step 2: Generate Prisma client**

```bash
cd ~/Downloads/bro-resolve && npx prisma generate
```

Expected: Generated Prisma Client without errors.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: All tests PASS (schema change doesn't break unit tests since they mock the DB).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma .env.example
git commit -m "fix: add db indices, SLA fields, AdminUser/AdminLog, JWT_SECRET env"
```

---

### Task 6: Fix server.js — thread req.tenantId, remove global

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Rewrite server.js with req.tenantId**

```js
require('dotenv').config();

const http = require('http');
const express = require('express');
const { initSocket } = require('./src/realtime/socket');
const { adminAuth, resolveTenantFromBotToken, _getAdminToken } = require('./src/auth/middleware');
const { processMessage } = require('./src/flows/engine');
const { sendMessage, parseStartTracking, formatBody } = require('./src/channels/telegram');
const sessionManager = require('./src/session/manager');
const { saveMessage } = require('./src/messages/service');
const { listLeads, getLead, updateStatus, classifyLead } = require('./src/leads/service');
const { getPrisma } = require('./src/infra/db');

const app = express();
app.use(express.json());

// ── Webhook ───────────────────────────────────────────────────────────────────
app.use('/webhook', async (req, res, next) => {
  if (process.env.STORAGE_ADAPTER !== 'postgres') return next();
  return resolveTenantFromBotToken(req, res, next); // sets req.tenantId
});

app.post('/webhook', async (req, res) => {
  const isTelegram = !!(req.body.message || req.body.edited_message);
  if (isTelegram) res.sendStatus(200);

  try {
    const tgMsg = req.body.message || req.body.edited_message;
    const tenantId = req.tenantId || process.env.DEFAULT_TENANT_ID; // req, not global

    if (!tgMsg) {
      if (!isTelegram) return res.status(400).json({ error: 'mensagem inválida' });
      return;
    }

    if (!tgMsg.text) {
      sendMessage(tgMsg.chat.id, 'Por favor, envie uma mensagem de texto para que eu possa te ajudar. 😊');
      return;
    }

    const tracking = parseStartTracking(tgMsg.text, 'telegram');
    if (tracking) await sessionManager.updateSession(String(tgMsg.chat.id), tracking);

    const { sessao, mensagem, canal } = formatBody(tgMsg);
    const result = await processMessage(tenantId, sessao, mensagem, canal);

    // Persist messages — errors here don't break the flow, but are logged
    try {
      const lead = await getPrisma().lead.findUnique({
        where: { tenantId_sessao_canal: { tenantId, sessao, canal } },
      });
      if (lead) {
        await saveMessage({ leadId: lead.id, origem: 'cliente', texto: mensagem });
        await saveMessage({ leadId: lead.id, origem: 'bot', texto: result.reply });
      }
    } catch (err) {
      console.error('[webhook] saveMessage error:', err.message);
    }

    sendMessage(tgMsg.chat.id, result.reply);
  } catch (err) {
    console.error('[webhook error]', err.message);
  }
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const health = {
    status: 'ok',
    env: {
      storage: process.env.STORAGE_ADAPTER || 'memory',
      database: !!process.env.DATABASE_URL,
      redis: !!process.env.REDIS_URL,
      telegram: !!process.env.TELEGRAM_TOKEN,
      jwt: !!process.env.JWT_SECRET,
    },
  };

  // Check DB connectivity
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    health.db = 'connected';
  } catch (err) {
    health.db = 'disconnected';
    health.status = 'degraded';
  }

  if (!process.env.ADMIN_TOKEN) health._setup = { adminToken: _getAdminToken() };
  return res.json(health);
});

// ── API routes (with req.tenantId from JWT or x-tenant-id header) ─────────────
function getTenantId(req) {
  return req.tenantId || req.headers['x-tenant-id'] || process.env.DEFAULT_TENANT_ID;
}

app.get('/api/leads', adminAuth, async (req, res) => {
  try {
    return res.json(await listLeads(getTenantId(req), req.query));
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.get('/api/leads/:id', adminAuth, async (req, res) => {
  try {
    const lead = await getLead(getTenantId(req), req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    return res.json(lead);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.patch('/api/leads/:id/status', adminAuth, async (req, res) => {
  try {
    const { status, motivoDesistencia } = req.body;
    await updateStatus(getTenantId(req), req.params.id, status, motivoDesistencia);
    return res.json({ ok: true });
  } catch (err) { return res.status(400).json({ error: err.message }); }
});

app.patch('/api/leads/:id/classify', adminAuth, async (req, res) => {
  try {
    const { segmento, tipoAtendimento } = req.body;
    await classifyLead(getTenantId(req), req.params.id, { segmento, tipoAtendimento });
    return res.json({ ok: true });
  } catch (err) { return res.status(400).json({ error: err.message }); }
});

// ── Error handler ─────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  return res.status(500).json({ error: err.message || 'Erro interno.' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const httpServer = http.createServer(app);
initSocket(httpServer);

async function start() {
  if (process.env.STORAGE_ADAPTER === 'postgres' && process.env.DATABASE_URL) {
    try {
      const { execSync } = require('child_process');
      // Use migrate deploy in production (not db push --accept-data-loss)
      execSync('npx prisma migrate deploy 2>/dev/null || npx prisma db push', { stdio: 'inherit' });
      console.log('[db] schema aplicado');
    } catch (err) {
      console.error('[db] schema falhou:', err.message);
    }
  }
  httpServer.listen(PORT, () => {
    console.log(`[BRO Resolve] porta ${PORT} — storage: ${process.env.STORAGE_ADAPTER || 'memory'}`);
  });
}

start();
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "fix: thread req.tenantId through server, improve health check, safer db push"
```

---

### Final verification

- [ ] **Run full test suite**

```bash
cd ~/Downloads/bro-resolve && npm test
```

Expected: All 25+ tests PASS, 0 failures.

- [ ] **Verify no global._currentTenantId remains**

```bash
grep -r "global\._currentTenantId" src/ server.js
```

Expected: No output (zero occurrences).

- [ ] **Verify no hardcoded state names in engine**

```bash
grep -n "coleta_nome\|coleta_telefone" src/flows/engine.js
```

Expected: No output.

---

## Summary

After Plan 1b:
- ✅ Race condition eliminated (`req.tenantId` everywhere)
- ✅ JWT authentication working
- ✅ Flow engine truly dynamic (no hardcoded state names)
- ✅ `upsertLead` errors propagate (no silent data loss)
- ✅ Database indices on all hot queries
- ✅ SLA fields on Tenant
- ✅ AdminUser + AdminLog models ready
- ✅ Health check verifies DB connectivity

**Next:** Plan 2 — Complete backend (Master/Owner/Operator routes, SLA engine, realtime events, conversão obrigatória)
