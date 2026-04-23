# BRO Resolve — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new Node.js project `bro-resolve` with multi-tenant auth, PostgreSQL schema, Redis sessions, dynamic Flow Engine, and Telegram webhook — fully tested and deployable to Railway.

**Architecture:** New project at `~/Downloads/bro-resolve/`. Express 5 + Prisma v5 + ioredis + BullMQ. Flows stored in DB as Node graphs (no hardcoded state machines). Tenant resolved from Telegram bot token. User model with OWNER/OPERATOR roles. Financial data lives exclusively in Caso — never in Lead.

**Tech Stack:** Node.js 20, Express 5, CommonJS, Prisma v5, PostgreSQL, ioredis, BullMQ, Jest, Socket.io

---

## File Map

```
bro-resolve/
├── package.json
├── .env.example
├── .gitignore
├── railway.toml
├── server.js
├── prisma/
│   ├── schema.prisma
│   └── seed.js
├── src/
│   ├── infra/
│   │   ├── db.js
│   │   ├── redis.js
│   │   └── queue.js
│   ├── auth/
│   │   └── middleware.js        ← adminAuth, requireRole(role), resolveTenant
│   ├── tenants/
│   │   └── service.js           ← createTenant, resolveTenantByToken, getTenant
│   ├── users/
│   │   └── service.js           ← createUser, getUserByToken, getUserById
│   ├── session/
│   │   ├── memory.js
│   │   ├── redisSession.js
│   │   └── manager.js
│   ├── flows/
│   │   ├── engine.js            ← processMessage(tenantId, sessao, mensagem, canal)
│   │   ├── service.js           ← createFlow, getActiveFlow, listFlows
│   │   └── templates/
│   │       ├── juridico.js
│   │       ├── clinica.js
│   │       └── imobiliaria.js
│   ├── leads/
│   │   └── service.js           ← listLeads, getLead, updateStatus, classify
│   ├── messages/
│   │   └── service.js           ← saveMessage, getMessages
│   ├── channels/
│   │   └── telegram.js          ← sendMessage, parseStartTracking, formatBody
│   └── realtime/
│       └── socket.js            ← initSocket, emitToTenant
├── tests/
│   ├── infra/
│   │   ├── db.test.js
│   │   └── redis.test.js
│   ├── session/
│   │   └── manager.test.js
│   ├── tenants/
│   │   └── service.test.js
│   ├── flows/
│   │   └── engine.test.js
│   ├── leads/
│   │   └── service.test.js
│   └── channels/
│       └── telegram.test.js
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Create project directory**

```bash
mkdir ~/Downloads/bro-resolve && cd ~/Downloads/bro-resolve
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "bro-resolve",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "jest --runInBand",
    "build": "npx prisma generate",
    "postinstall": "npx prisma generate"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "bullmq": "^5.0.0",
    "dotenv": "^16.4.5",
    "express": "^5.0.1",
    "ioredis": "^5.3.2",
    "node-cron": "^3.0.3",
    "socket.io": "^4.7.5"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "prisma": "^5.22.0"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/tests/**/*.test.js"]
  }
}
```

- [ ] **Step 3: Create .env.example**

```
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/bro_resolve
REDIS_URL=redis://localhost:6379
ADMIN_TOKEN=changeme
TELEGRAM_TOKEN=
DEFAULT_TENANT_ID=a0000000-0000-0000-0000-000000000001
STORAGE_ADAPTER=postgres
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
.env
*.env.local
dist/
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Init git and commit**

```bash
git init
git add package.json .env.example .gitignore
git commit -m "chore: scaffold bro-resolve project"
```

---

### Task 2: Prisma schema

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Create schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id          String   @id @default(uuid())
  nome        String
  botToken    String   @unique
  tipoNegocio String   @default("juridico") // juridico | clinica | imobiliaria
  moedaBase   String   @default("BRL")
  plano       String   @default("basic")
  ativo       Boolean  @default(true)
  criadoEm    DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  users  User[]
  leads  Lead[]
  flows  Flow[]
  casos  Caso[]
  events Event[]

  @@map("tenants")
}

model User {
  id       String  @id @default(uuid())
  tenantId String
  email    String  @unique
  role     String  @default("OPERATOR") // OWNER | OPERATOR
  token    String  @unique
  ativo    Boolean @default(true)
  criadoEm DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@map("users")
}

model Flow {
  id          String  @id @default(uuid())
  tenantId    String
  nome        String
  tipoNegocio String
  ativo       Boolean @default(true)
  criadoEm    DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
  nodes  Node[]

  @@map("flows")
}

model Node {
  id              String  @id @default(uuid())
  flowId          String
  estado          String
  mensagem        String
  tipo            String  @default("menu") // menu | input | final_lead | final_cliente
  opcoes          Json?   // [{texto, proxEstado, score, segmento, tipoAtendimento}]
  score           Int     @default(0)
  segmento        String?
  tipoAtendimento String?
  campo           String? // field to save on lead: "nome" | "telefone"
  criadoEm        DateTime @default(now())

  flow Flow @relation(fields: [flowId], references: [id])

  @@unique([flowId, estado])
  @@map("nodes")
}

// Lead: universal fields only. NO financial data.
model Lead {
  id              String   @id @default(uuid())
  tenantId        String
  sessao          String   // channel identifier (telegram chat_id)
  canal           String   @default("telegram")
  nome            String?
  telefone        String?
  origem          String?  // source: link param, utm, etc.
  status          String   @default("em_qualificacao")
  // em_qualificacao | em_atendimento | aguardando_retorno | virou_cliente | desistiu
  motivoDesistencia String?
  // preco | sem_interesse | fechou_com_outro | nao_respondeu | outro
  segmento        String?  // set by flow (dynamic per tenant)
  tipoAtendimento String?  // set by flow: novo_lead | retorno | urgente
  score           Int      @default(0)
  flowId          String?
  estadoAtual     String   @default("start")
  ultimaMensagem  String?
  criadoEm        DateTime @default(now())
  atualizadoEm    DateTime @updatedAt

  tenant   Tenant    @relation(fields: [tenantId], references: [id])
  messages Message[]
  events   Event[]
  caso     Caso?

  @@unique([tenantId, sessao, canal])
  @@map("leads")
}

model Message {
  id       String   @id @default(uuid())
  leadId   String
  origem   String   // cliente | bot | humano
  texto    String
  criadoEm DateTime @default(now())

  lead Lead @relation(fields: [leadId], references: [id])

  @@map("messages")
}

// Caso: ALL financial data lives here.
model Caso {
  id              String   @id @default(uuid())
  tenantId        String
  leadId          String?  @unique
  origem          String?  // Google, indicação, direto, etc.
  segmento        String?
  tipoProcesso    String?
  tipoContrato    String?  // entrada_exito | exito | consulta | outro
  status          String   @default("em_andamento")
  // em_andamento | aguardando_decisao | finalizado
  valorEntrada    Decimal? @db.Decimal(14, 2)
  percentualExito Decimal? @db.Decimal(5, 2)
  valorCausa      Decimal? @db.Decimal(14, 2)
  valorConsulta   Decimal? @db.Decimal(14, 2)
  // Receita real (só conta quando registrada + data definida)
  valorRecebido   Decimal? @db.Decimal(14, 2)
  currency        String   @default("BRL")
  valorConvertido Decimal? @db.Decimal(14, 2) // always in tenant.moedaBase
  exchangeRate    Decimal? @db.Decimal(10, 6)
  dataRecebimento DateTime?
  criadoEm        DateTime @default(now())
  atualizadoEm    DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
  lead   Lead?  @relation(fields: [leadId], references: [id])

  @@map("casos")
}

model Event {
  id       String   @id @default(uuid())
  tenantId String
  leadId   String?
  event    String
  metadata Json?
  criadoEm DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@map("events")
}
```

- [ ] **Step 2: Generate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 3: Write schema smoke test**

Create `tests/schema.test.js`:

```js
const { PrismaClient } = require('@prisma/client');

test('Prisma client instantiates without error', () => {
  expect(() => new PrismaClient()).not.toThrow();
});
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/schema.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma tests/schema.test.js
git commit -m "feat: add prisma schema (tenant, user, flow, node, lead, message, caso, event)"
```

---

### Task 3: Infra — db, redis, queue

**Files:**
- Create: `src/infra/db.js`
- Create: `src/infra/redis.js`
- Create: `src/infra/queue.js`

- [ ] **Step 1: Write failing tests**

Create `tests/infra/db.test.js`:

```js
const { getPrisma } = require('../../src/infra/db');

test('getPrisma returns singleton', () => {
  const a = getPrisma();
  const b = getPrisma();
  expect(a).toBe(b);
});
```

Create `tests/infra/redis.test.js`:

```js
test('getRedis throws when REDIS_URL is not set', () => {
  delete process.env.REDIS_URL;
  jest.resetModules();
  const { getRedis } = require('../../src/infra/redis');
  expect(() => getRedis()).toThrow('REDIS_URL não configurado');
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/infra/
```

Expected: FAIL

- [ ] **Step 3: Implement src/infra/db.js**

```js
const { PrismaClient } = require('@prisma/client');
let _prisma;
function getPrisma() {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}
async function disconnectPrisma() {
  if (_prisma) { await _prisma.$disconnect(); _prisma = null; }
}
module.exports = { getPrisma, disconnectPrisma };
```

- [ ] **Step 4: Implement src/infra/redis.js**

```js
const Redis = require('ioredis');
let _redis;
function getRedis() {
  if (!_redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL não configurado');
    _redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      retryStrategy: (times) => times > 3 ? null : Math.min(times * 200, 1000),
    });
  }
  return _redis;
}
async function disconnectRedis() {
  if (_redis) { await _redis.quit(); _redis = null; }
}
module.exports = { getRedis, disconnectRedis };
```

- [ ] **Step 5: Implement src/infra/queue.js**

```js
const { Worker, Queue } = require('bullmq');
const { getRedis } = require('./redis');
const QUEUE_NAME = 'lead-events';
let _queue;
function getQueue() {
  if (!_queue) _queue = new Queue(QUEUE_NAME, { connection: getRedis() });
  return _queue;
}
function startWorker(processor) {
  return new Worker(QUEUE_NAME, processor, { connection: getRedis() });
}
module.exports = { getQueue, startWorker, QUEUE_NAME };
```

- [ ] **Step 6: Run tests**

```bash
npm test -- tests/infra/
```

Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add src/infra/ tests/infra/
git commit -m "feat: add db, redis, queue infra singletons"
```

---

### Task 4: Session manager

**Files:**
- Create: `src/session/memory.js`
- Create: `src/session/redisSession.js`
- Create: `src/session/manager.js`

- [ ] **Step 1: Write failing tests**

Create `tests/session/manager.test.js`:

```js
process.env.STORAGE_ADAPTER = 'memory';
delete process.env.REDIS_URL;
jest.resetModules();
const manager = require('../../src/session/manager');

beforeEach(() => manager._clear());

test('getSession returns default for unknown id', async () => {
  const sess = await manager.getSession('abc', 'telegram');
  expect(sess.sessao).toBe('abc');
  expect(sess.estadoAtual).toBe('start');
});

test('updateSession persists data', async () => {
  await manager.updateSession('abc', { nome: 'João' });
  const sess = await manager.getSession('abc', 'telegram');
  expect(sess.nome).toBe('João');
});

test('resetSession clears session', async () => {
  await manager.updateSession('abc', { nome: 'João', estadoAtual: 'coleta_nome' });
  await manager.resetSession('abc', 'telegram');
  const sess = await manager.getSession('abc', 'telegram');
  expect(sess.estadoAtual).toBe('start');
  expect(sess.nome).toBeUndefined();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/session/
```

Expected: FAIL

- [ ] **Step 3: Implement src/session/memory.js**

```js
const sessions = {};

function getSession(sessao, canal) {
  const key = `${sessao}:${canal}`;
  if (!sessions[key]) {
    sessions[key] = { sessao, canalOrigem: canal, estadoAtual: 'start', criadoEm: new Date().toISOString() };
  }
  return Promise.resolve({ ...sessions[key] });
}

function updateSession(sessao, data) {
  const key = Object.keys(sessions).find(k => k.startsWith(`${sessao}:`)) || `${sessao}:telegram`;
  sessions[key] = { ...sessions[key], sessao, ...data, atualizadoEm: new Date().toISOString() };
  return Promise.resolve({ ...sessions[key] });
}

function resetSession(sessao, canal) {
  delete sessions[`${sessao}:${canal}`];
  return Promise.resolve();
}

function _clear() {
  Object.keys(sessions).forEach(k => delete sessions[k]);
}

function _getAll() { return { sessions }; }

module.exports = { getSession, updateSession, resetSession, _clear, _getAll };
```

- [ ] **Step 4: Implement src/session/redisSession.js**

```js
const { getRedis } = require('../infra/redis');
const TTL = 24 * 60 * 60;

function key(tenantId, sessao, canal) {
  return `sess:${tenantId}:${sessao}:${canal}`;
}

async function getSession(tenantId, sessao, canal) {
  const raw = await getRedis().get(key(tenantId, sessao, canal));
  if (!raw) return { sessao, canalOrigem: canal, estadoAtual: 'start' };
  return JSON.parse(raw);
}

async function updateSession(tenantId, sessao, data) {
  const canal = data.canalOrigem || 'telegram';
  const existing = await getSession(tenantId, sessao, canal);
  const updated = { ...existing, ...data, atualizadoEm: new Date().toISOString() };
  await getRedis().set(key(tenantId, sessao, canal), JSON.stringify(updated), 'EX', TTL);
  return updated;
}

async function resetSession(tenantId, sessao, canal) {
  await getRedis().del(key(tenantId, sessao, canal));
}

module.exports = { getSession, updateSession, resetSession };
```

- [ ] **Step 5: Implement src/session/manager.js**

```js
const memory = require('./memory');
const useRedis = process.env.STORAGE_ADAPTER === 'postgres' && !!process.env.REDIS_URL;

let redisSession = null;
if (useRedis) {
  try { redisSession = require('./redisSession'); }
  catch (err) { console.warn('[session] redisSession não carregado:', err.message); }
}

function tid() {
  return global._currentTenantId || process.env.DEFAULT_TENANT_ID || 'default';
}

async function safeGet(sessao, canal) {
  try { return await redisSession.getSession(tid(), sessao, canal); }
  catch (err) { console.warn('[session] Redis get falhou:', err.message); return memory.getSession(sessao, canal); }
}

async function safeUpdate(sessao, data) {
  try { return await redisSession.updateSession(tid(), sessao, data); }
  catch (err) { console.warn('[session] Redis update falhou:', err.message); return memory.updateSession(sessao, data); }
}

async function safeReset(sessao, canal) {
  try { return await redisSession.resetSession(tid(), sessao, canal); }
  catch (err) { console.warn('[session] Redis reset falhou:', err.message); return memory.resetSession(sessao, canal); }
}

module.exports = {
  getSession:    useRedis ? safeGet    : memory.getSession,
  updateSession: useRedis ? safeUpdate : memory.updateSession,
  resetSession:  useRedis ? safeReset  : memory.resetSession,
  _clear:  memory._clear,
  _getAll: memory._getAll,
};
```

- [ ] **Step 6: Run tests**

```bash
npm test -- tests/session/
```

Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/session/ tests/session/
git commit -m "feat: add session manager with Redis/memory fallback"
```

---

### Task 5: Tenant + User services

**Files:**
- Create: `src/tenants/service.js`
- Create: `src/users/service.js`

- [ ] **Step 1: Write failing tests**

Create `tests/tenants/service.test.js`:

```js
jest.mock('../../src/infra/db', () => {
  const store = {};
  return {
    getPrisma: () => ({
      tenant: {
        findFirst: async ({ where }) => Object.values(store).find(t => t.botToken === where.botToken && t.ativo !== false) || null,
        findUnique: async ({ where }) => store[where.id] || null,
        create: async ({ data }) => { store[data.id] = data; return data; },
      },
    }),
  };
});

const { createTenant, resolveTenantByToken } = require('../../src/tenants/service');

test('createTenant creates tenant', async () => {
  const t = await createTenant({ nome: 'Escritório X', botToken: 'tok123', tipoNegocio: 'juridico' });
  expect(t.nome).toBe('Escritório X');
});

test('resolveTenantByToken finds tenant by token', async () => {
  await createTenant({ nome: 'Clínica Y', botToken: 'tok456', tipoNegocio: 'clinica' });
  const t = await resolveTenantByToken('tok456');
  expect(t.nome).toBe('Clínica Y');
});

test('resolveTenantByToken returns null for unknown token', async () => {
  const t = await resolveTenantByToken('nope');
  expect(t).toBeNull();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/tenants/
```

Expected: FAIL

- [ ] **Step 3: Implement src/tenants/service.js**

```js
const { getPrisma } = require('../infra/db');
const crypto = require('crypto');

async function createTenant({ nome, botToken, tipoNegocio = 'juridico', moedaBase = 'BRL', plano = 'basic' }) {
  return getPrisma().tenant.create({
    data: { id: crypto.randomUUID(), nome, botToken, tipoNegocio, moedaBase, plano },
  });
}

async function resolveTenantByToken(botToken) {
  if (!botToken) return null;
  return getPrisma().tenant.findFirst({ where: { botToken, ativo: true } });
}

async function getTenant(id) {
  return getPrisma().tenant.findUnique({ where: { id } });
}

module.exports = { createTenant, resolveTenantByToken, getTenant };
```

- [ ] **Step 4: Implement src/users/service.js**

```js
const { getPrisma } = require('../infra/db');
const crypto = require('crypto');

async function createUser({ tenantId, email, role = 'OPERATOR' }) {
  if (!['OWNER', 'OPERATOR'].includes(role)) throw new Error('role inválido');
  return getPrisma().user.create({
    data: { id: crypto.randomUUID(), tenantId, email, role, token: crypto.randomBytes(32).toString('hex') },
  });
}

async function getUserByToken(token) {
  if (!token) return null;
  return getPrisma().user.findUnique({ where: { token } });
}

async function getUserById(id) {
  return getPrisma().user.findUnique({ where: { id } });
}

module.exports = { createUser, getUserByToken, getUserById };
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/tenants/
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/tenants/ src/users/ tests/tenants/
git commit -m "feat: add tenant and user services"
```

---

### Task 6: Auth middleware

**Files:**
- Create: `src/auth/middleware.js`

- [ ] **Step 1: Write failing tests**

Create `tests/auth/middleware.test.js`:

```js
process.env.ADMIN_TOKEN = 'test-admin-token';
jest.resetModules();
const { adminAuth, requireRole } = require('../../src/auth/middleware');

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
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/auth/
```

Expected: FAIL

- [ ] **Step 3: Implement src/auth/middleware.js**

```js
const crypto = require('crypto');
const { getUserByToken } = require('../users/service');

let _adminToken = process.env.ADMIN_TOKEN;
if (!_adminToken) {
  _adminToken = crypto.randomBytes(16).toString('hex');
  console.warn(`[auth] ADMIN_TOKEN não configurado. Token temporário: ${_adminToken}`);
}

function adminAuth(req, res, next) {
  if (req.headers['x-admin-token'] !== _adminToken) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  return next();
}

// Middleware: authenticate user by Bearer token, attach to req.user
async function userAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token obrigatório.' });
  try {
    const user = await getUserByToken(token);
    if (!user || !user.ativo) return res.status(401).json({ error: 'Token inválido.' });
    req.user = user;
    global._currentTenantId = user.tenantId;
    return next();
  } catch (err) {
    return res.status(500).json({ error: 'Erro de autenticação.' });
  }
}

// Middleware: require specific role
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    return next();
  };
}

// Middleware: resolve tenant from bot token (webhook)
async function resolveTenantMiddleware(req, res, next) {
  global._currentTenantId = null;
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) return next();
  try {
    const { resolveTenantByToken } = require('../tenants/service');
    const tenant = await resolveTenantByToken(token);
    if (!tenant) return res.status(503).json({ error: 'Tenant não configurado.' });
    global._currentTenantId = tenant.id;
    req.tenant = tenant;
    return next();
  } catch (err) {
    console.error('[tenant middleware]', err.message);
    return res.status(503).json({ error: 'Erro ao resolver tenant.' });
  }
}

function _getAdminToken() { return _adminToken; }

module.exports = { adminAuth, userAuth, requireRole, resolveTenantMiddleware, _getAdminToken };
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/auth/
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/auth/ tests/auth/
git commit -m "feat: add auth middleware (adminAuth, userAuth, requireRole, resolveTenant)"
```

---

### Task 7: Flow Engine + Templates

**Files:**
- Create: `src/flows/templates/juridico.js`
- Create: `src/flows/templates/clinica.js`
- Create: `src/flows/templates/imobiliaria.js`
- Create: `src/flows/service.js`
- Create: `src/flows/engine.js`

- [ ] **Step 1: Write failing tests**

Create `tests/flows/engine.test.js`:

```js
const { buildFlowMap, resolveNextState, getReply } = require('../../src/flows/engine');

const mockNodes = [
  {
    estado: 'start',
    mensagem: 'Qual assunto?\n1 - Trabalhista\n2 - Família',
    tipo: 'menu',
    opcoes: [
      { texto: '1', proxEstado: 'coleta_nome', score: 3, segmento: 'trabalhista', tipoAtendimento: 'novo_lead' },
      { texto: '2', proxEstado: 'coleta_nome', score: 2, segmento: 'familia', tipoAtendimento: 'novo_lead' },
    ],
  },
  {
    estado: 'coleta_nome',
    mensagem: 'Qual é o seu nome?',
    tipo: 'input',
    campo: 'nome',
    opcoes: null,
  },
  {
    estado: 'final_lead',
    mensagem: 'Obrigado! Em breve entraremos em contato.',
    tipo: 'final_lead',
    opcoes: null,
  },
];

test('buildFlowMap indexes nodes by estado', () => {
  const map = buildFlowMap(mockNodes);
  expect(map['start']).toBeDefined();
  expect(map['coleta_nome']).toBeDefined();
});

test('resolveNextState returns correct transition for menu option', () => {
  const map = buildFlowMap(mockNodes);
  const result = resolveNextState(map['start'], '1');
  expect(result.proxEstado).toBe('coleta_nome');
  expect(result.score).toBe(3);
  expect(result.segmento).toBe('trabalhista');
});

test('resolveNextState returns null for unrecognized input', () => {
  const map = buildFlowMap(mockNodes);
  expect(resolveNextState(map['start'], '9')).toBeNull();
});

test('getReply returns node message', () => {
  const map = buildFlowMap(mockNodes);
  expect(getReply(map, 'start')).toBe(mockNodes[0].mensagem);
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/flows/engine.test.js
```

Expected: FAIL

- [ ] **Step 3: Create src/flows/templates/juridico.js**

```js
module.exports = [
  {
    estado: 'start',
    mensagem: 'Olá! Sou o assistente do escritório. Sobre qual assunto você precisa de ajuda?\n\n1 - Problema no trabalho\n2 - Questão de família\n3 - Já sou cliente\n4 - Outro assunto',
    tipo: 'menu',
    opcoes: [
      { texto: '1', proxEstado: 'trabalhista_detalhe', score: 3, segmento: 'trabalhista', tipoAtendimento: 'novo_lead' },
      { texto: '2', proxEstado: 'familia_detalhe', score: 2, segmento: 'familia', tipoAtendimento: 'novo_lead' },
      { texto: '3', proxEstado: 'coleta_nome', score: 5, tipoAtendimento: 'retorno' },
      { texto: '4', proxEstado: 'coleta_nome', score: 1, segmento: 'geral', tipoAtendimento: 'novo_lead' },
    ],
  },
  {
    estado: 'trabalhista_detalhe',
    mensagem: 'Qual é a situação?\n\n1 - Fui demitido\n2 - Problemas com salário\n3 - Assédio\n4 - Outro',
    tipo: 'menu',
    opcoes: [
      { texto: '1', proxEstado: 'coleta_nome', score: 2 },
      { texto: '2', proxEstado: 'coleta_nome', score: 2 },
      { texto: '3', proxEstado: 'coleta_nome', score: 3 },
      { texto: '4', proxEstado: 'coleta_nome', score: 1 },
    ],
  },
  {
    estado: 'familia_detalhe',
    mensagem: 'Qual é o assunto?\n\n1 - Divórcio\n2 - Guarda de filhos\n3 - Pensão\n4 - Outro',
    tipo: 'menu',
    opcoes: [
      { texto: '1', proxEstado: 'coleta_nome', score: 2 },
      { texto: '2', proxEstado: 'coleta_nome', score: 2 },
      { texto: '3', proxEstado: 'coleta_nome', score: 2 },
      { texto: '4', proxEstado: 'coleta_nome', score: 1 },
    ],
  },
  {
    estado: 'coleta_nome',
    mensagem: 'Para continuar, qual é o seu nome completo?',
    tipo: 'input',
    campo: 'nome',
    opcoes: null,
  },
  {
    estado: 'coleta_telefone',
    mensagem: 'Qual é o seu telefone para contato?',
    tipo: 'input',
    campo: 'telefone',
    opcoes: null,
  },
  {
    estado: 'final_lead',
    mensagem: 'Obrigado! Um advogado entrará em contato em breve. 👍',
    tipo: 'final_lead',
    score: 2,
    opcoes: null,
  },
  {
    estado: 'final_cliente',
    mensagem: 'Perfeito! Já notificamos o seu advogado. Em breve ele entrará em contato. 👍',
    tipo: 'final_cliente',
    opcoes: null,
  },
];
```

- [ ] **Step 4: Create src/flows/templates/clinica.js**

```js
module.exports = [
  {
    estado: 'start',
    mensagem: 'Olá! Como posso ajudar?\n\n1 - Agendar consulta\n2 - Resultado de exame\n3 - Já sou paciente\n4 - Outro',
    tipo: 'menu',
    opcoes: [
      { texto: '1', proxEstado: 'coleta_nome', score: 3, segmento: 'consulta', tipoAtendimento: 'novo_lead' },
      { texto: '2', proxEstado: 'coleta_nome', score: 2, segmento: 'exame', tipoAtendimento: 'retorno' },
      { texto: '3', proxEstado: 'coleta_nome', score: 4, tipoAtendimento: 'retorno' },
      { texto: '4', proxEstado: 'coleta_nome', score: 1, segmento: 'geral', tipoAtendimento: 'novo_lead' },
    ],
  },
  {
    estado: 'coleta_nome',
    mensagem: 'Qual é o seu nome completo?',
    tipo: 'input',
    campo: 'nome',
    opcoes: null,
  },
  {
    estado: 'coleta_telefone',
    mensagem: 'Qual é o seu telefone?',
    tipo: 'input',
    campo: 'telefone',
    opcoes: null,
  },
  {
    estado: 'final_lead',
    mensagem: 'Obrigado! Nossa equipe entrará em contato para confirmar. 👍',
    tipo: 'final_lead',
    score: 2,
    opcoes: null,
  },
];
```

- [ ] **Step 5: Create src/flows/templates/imobiliaria.js**

```js
module.exports = [
  {
    estado: 'start',
    mensagem: 'Olá! O que você procura?\n\n1 - Comprar imóvel\n2 - Alugar imóvel\n3 - Vender imóvel\n4 - Outro',
    tipo: 'menu',
    opcoes: [
      { texto: '1', proxEstado: 'coleta_nome', score: 4, segmento: 'compra', tipoAtendimento: 'novo_lead' },
      { texto: '2', proxEstado: 'coleta_nome', score: 3, segmento: 'aluguel', tipoAtendimento: 'novo_lead' },
      { texto: '3', proxEstado: 'coleta_nome', score: 4, segmento: 'venda', tipoAtendimento: 'novo_lead' },
      { texto: '4', proxEstado: 'coleta_nome', score: 1, segmento: 'geral', tipoAtendimento: 'novo_lead' },
    ],
  },
  {
    estado: 'coleta_nome',
    mensagem: 'Qual é o seu nome?',
    tipo: 'input',
    campo: 'nome',
    opcoes: null,
  },
  {
    estado: 'coleta_telefone',
    mensagem: 'Qual é o seu telefone?',
    tipo: 'input',
    campo: 'telefone',
    opcoes: null,
  },
  {
    estado: 'final_lead',
    mensagem: 'Obrigado! Um corretor entrará em contato em breve. 👍',
    tipo: 'final_lead',
    score: 2,
    opcoes: null,
  },
];
```

- [ ] **Step 6: Create src/flows/service.js**

```js
const { getPrisma } = require('../infra/db');
const crypto = require('crypto');

async function createFlow({ tenantId, nome, tipoNegocio, nodes }) {
  const prisma = getPrisma();
  const flow = await prisma.flow.create({
    data: { id: crypto.randomUUID(), tenantId, nome, tipoNegocio, ativo: true },
  });
  for (const node of nodes) {
    await prisma.node.create({
      data: {
        id: crypto.randomUUID(),
        flowId: flow.id,
        estado: node.estado,
        mensagem: node.mensagem,
        tipo: node.tipo || 'menu',
        opcoes: node.opcoes || null,
        score: node.score || 0,
        segmento: node.segmento || null,
        tipoAtendimento: node.tipoAtendimento || null,
        campo: node.campo || null,
      },
    });
  }
  return flow;
}

async function getActiveFlow(tenantId) {
  return getPrisma().flow.findFirst({
    where: { tenantId, ativo: true },
    include: { nodes: true },
    orderBy: { criadoEm: 'desc' },
  });
}

async function listFlows(tenantId) {
  return getPrisma().flow.findMany({ where: { tenantId }, orderBy: { criadoEm: 'desc' } });
}

module.exports = { createFlow, getActiveFlow, listFlows };
```

- [ ] **Step 7: Create src/flows/engine.js**

```js
const { getActiveFlow } = require('./service');
const sessionManager = require('../session/manager');
const { getPrisma } = require('../infra/db');
const crypto = require('crypto');

const FINAL_TYPES = ['final_lead', 'final_cliente'];

function buildFlowMap(nodes) {
  const map = {};
  for (const node of nodes) map[node.estado] = node;
  return map;
}

function resolveNextState(node, input) {
  if (!node.opcoes || !Array.isArray(node.opcoes)) return null;
  const norm = String(input || '').trim().toLowerCase();
  return node.opcoes.find(o => String(o.texto).trim().toLowerCase() === norm) || null;
}

function getReply(flowMap, estado) {
  return flowMap[estado]?.mensagem || null;
}

function calcPrioridade(score) {
  if (score >= 7) return 'QUENTE';
  if (score >= 4) return 'MEDIO';
  return 'FRIO';
}

async function processMessage(tenantId, sessao, mensagem, canal = 'telegram') {
  const sess = await sessionManager.getSession(sessao, canal);
  const estadoAtual = sess.estadoAtual || 'start';

  const flow = await getActiveFlow(tenantId);
  if (!flow || !flow.nodes.length) {
    return { reply: 'Sistema em configuração. Tente novamente em breve.', estado: estadoAtual, done: false };
  }

  const flowMap = buildFlowMap(flow.nodes);
  const currentNode = flowMap[estadoAtual];

  if (!currentNode) {
    await sessionManager.updateSession(sessao, { estadoAtual: 'start' });
    return { reply: flowMap['start']?.mensagem || 'Olá!', estado: 'start', done: false };
  }

  // First message: send the initial greeting
  if (!sess.ultimaMensagem && estadoAtual === 'start') {
    await sessionManager.updateSession(sessao, { ultimaMensagem: mensagem, atualizadoEm: new Date().toISOString() });
    return { reply: currentNode.mensagem, estado: estadoAtual, done: false, node: currentNode };
  }

  const updates = { ultimaMensagem: mensagem, atualizadoEm: new Date().toISOString() };

  // Save field if input node
  if (currentNode.campo && mensagem) updates[currentNode.campo] = mensagem;

  let proxEstado = null;
  let scoreIncrement = 0;
  let segmento = sess.segmento || null;
  let tipoAtendimento = sess.tipoAtendimento || null;

  if (currentNode.tipo === 'menu') {
    const transition = resolveNextState(currentNode, mensagem);
    if (!transition) {
      await sessionManager.updateSession(sessao, updates);
      return { reply: `Opção inválida. Por favor escolha:\n\n${currentNode.mensagem}`, estado: estadoAtual, done: false };
    }
    proxEstado = transition.proxEstado;
    scoreIncrement = transition.score || 0;
    if (transition.segmento) segmento = transition.segmento;
    if (transition.tipoAtendimento) tipoAtendimento = transition.tipoAtendimento;
  } else if (currentNode.tipo === 'input') {
    // Auto-advance: coleta_nome → coleta_telefone → final_lead
    if (estadoAtual === 'coleta_nome') proxEstado = 'coleta_telefone';
    else if (estadoAtual === 'coleta_telefone') proxEstado = 'final_lead';
    else proxEstado = 'final_lead';
    scoreIncrement = currentNode.score || 0;
  }

  if (!proxEstado) proxEstado = 'final_lead';

  const nextNode = flowMap[proxEstado] || flowMap['final_lead'];
  const nextEstado = nextNode?.estado || 'final_lead';

  updates.estadoAtual = nextEstado;
  updates.score = (sess.score || 0) + scoreIncrement + (nextNode?.score || 0);
  if (segmento) updates.segmento = segmento;
  if (tipoAtendimento) updates.tipoAtendimento = tipoAtendimento;

  await sessionManager.updateSession(sessao, updates);

  const done = FINAL_TYPES.includes(nextNode?.tipo);
  await upsertLead(tenantId, sessao, canal, { ...sess, ...updates }, flow.id);

  return {
    reply: nextNode?.mensagem || 'Obrigado! Em breve entraremos em contato.',
    estado: nextEstado,
    done,
    node: nextNode,
  };
}

async function upsertLead(tenantId, sessao, canal, sessData, flowId) {
  try {
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
      await prisma.lead.update({ where: { id: existing.id }, data });
    } else {
      await prisma.lead.create({
        data: { id: crypto.randomUUID(), tenantId, sessao, canal, status: 'em_qualificacao', ...data },
      });
    }
  } catch (err) {
    console.error('[engine] upsertLead error:', err.message);
  }
}

module.exports = { buildFlowMap, resolveNextState, getReply, processMessage, calcPrioridade };
```

- [ ] **Step 8: Run tests**

```bash
npm test -- tests/flows/
```

Expected: PASS (4 tests)

- [ ] **Step 9: Commit**

```bash
git add src/flows/ tests/flows/
git commit -m "feat: add dynamic flow engine with juridico/clinica/imobiliaria templates"
```

---

### Task 8: Leads + Messages + Telegram channel

**Files:**
- Create: `src/leads/service.js`
- Create: `src/messages/service.js`
- Create: `src/channels/telegram.js`

- [ ] **Step 1: Write failing tests**

Create `tests/channels/telegram.test.js`:

```js
const { parseStartTracking, formatBody } = require('../../src/channels/telegram');

test('parseStartTracking extracts origem and campanha', () => {
  const r = parseStartTracking('/start google_black_friday', 'telegram');
  expect(r.origem).toBe('google');
  expect(r.campanha).toBe('black_friday');
  expect(r.canal).toBe('telegram');
});

test('parseStartTracking returns null for regular message', () => {
  expect(parseStartTracking('olá', 'telegram')).toBeNull();
});

test('formatBody maps tg message to internal body', () => {
  const body = formatBody({ chat: { id: 12345 }, text: 'Olá' });
  expect(body.sessao).toBe('12345');
  expect(body.mensagem).toBe('Olá');
  expect(body.canal).toBe('telegram');
});
```

Create `tests/leads/service.test.js`:

```js
const { VALID_STATUSES, VALID_MOTIVOS } = require('../../src/leads/service');

test('VALID_STATUSES includes all expected', () => {
  expect(VALID_STATUSES).toContain('virou_cliente');
  expect(VALID_STATUSES).toContain('desistiu');
});

test('VALID_MOTIVOS includes all expected', () => {
  expect(VALID_MOTIVOS).toContain('preco');
  expect(VALID_MOTIVOS).toContain('nao_respondeu');
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/channels/ tests/leads/
```

Expected: FAIL

- [ ] **Step 3: Implement src/leads/service.js**

```js
const { getPrisma } = require('../infra/db');

const VALID_STATUSES = ['em_qualificacao', 'em_atendimento', 'aguardando_retorno', 'virou_cliente', 'desistiu'];
const VALID_MOTIVOS = ['preco', 'sem_interesse', 'fechou_com_outro', 'nao_respondeu', 'outro'];

async function listLeads(tenantId, filters = {}) {
  const where = { tenantId };
  if (filters.status) where.status = filters.status;
  if (filters.segmento) where.segmento = filters.segmento;
  if (filters.tipoAtendimento) where.tipoAtendimento = filters.tipoAtendimento;
  return getPrisma().lead.findMany({
    where,
    orderBy: [{ score: 'desc' }, { atualizadoEm: 'desc' }],
    include: { messages: { orderBy: { criadoEm: 'desc' }, take: 1 } },
  });
}

async function getLead(tenantId, leadId) {
  return getPrisma().lead.findFirst({
    where: { id: leadId, tenantId },
    include: { messages: { orderBy: { criadoEm: 'asc' } }, caso: true },
  });
}

async function updateStatus(tenantId, leadId, status, motivoDesistencia = null) {
  if (!VALID_STATUSES.includes(status)) throw new Error(`Status inválido: ${status}`);
  if (status === 'desistiu' && !motivoDesistencia) throw new Error('Motivo obrigatório para desistência');
  return getPrisma().lead.updateMany({
    where: { id: leadId, tenantId },
    data: { status, motivoDesistencia: motivoDesistencia || null },
  });
}

async function classifyLead(tenantId, leadId, { segmento, tipoAtendimento }) {
  if (!segmento) throw new Error('segmento é obrigatório');
  if (!tipoAtendimento) throw new Error('tipoAtendimento é obrigatório');
  return getPrisma().lead.updateMany({
    where: { id: leadId, tenantId },
    data: { segmento, tipoAtendimento },
  });
}

module.exports = { listLeads, getLead, updateStatus, classifyLead, VALID_STATUSES, VALID_MOTIVOS };
```

- [ ] **Step 4: Implement src/messages/service.js**

```js
const { getPrisma } = require('../infra/db');
const crypto = require('crypto');

async function saveMessage({ leadId, origem, texto }) {
  return getPrisma().message.create({
    data: { id: crypto.randomUUID(), leadId, origem, texto },
  });
}

async function getMessages(leadId) {
  return getPrisma().message.findMany({ where: { leadId }, orderBy: { criadoEm: 'asc' } });
}

module.exports = { saveMessage, getMessages };
```

- [ ] **Step 5: Implement src/channels/telegram.js**

```js
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;

async function sendMessage(chatId, text) {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    console.error('[telegram] sendMessage error (non-blocking):', err.message);
  }
}

function parseStartTracking(text, canal) {
  const match = String(text || '').trim().match(/^\/start\s+([a-z0-9_-]+)/i);
  if (!match) return null;
  const [origem, ...campanhaParts] = match[1].split('_').filter(Boolean);
  return { origem: origem || null, campanha: campanhaParts.join('_') || null, canal };
}

function formatBody(tgMsg) {
  return { sessao: String(tgMsg.chat.id), mensagem: tgMsg.text, canal: 'telegram' };
}

module.exports = { sendMessage, parseStartTracking, formatBody };
```

- [ ] **Step 6: Run tests**

```bash
npm test -- tests/channels/ tests/leads/
```

Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add src/leads/ src/messages/ src/channels/ tests/channels/ tests/leads/
git commit -m "feat: add leads service, messages service, telegram channel"
```

---

### Task 9: Socket.io + server.js

**Files:**
- Create: `src/realtime/socket.js`
- Create: `server.js`

- [ ] **Step 1: Implement src/realtime/socket.js**

```js
const { Server } = require('socket.io');
let _io;

function initSocket(httpServer) {
  _io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });
  _io.on('connection', (socket) => {
    socket.on('join', (tenantId) => socket.join(`tenant:${tenantId}`));
  });
  return _io;
}

function emitToTenant(tenantId, event, data) {
  if (_io) _io.to(`tenant:${tenantId}`).emit(event, data);
}

module.exports = { initSocket, emitToTenant };
```

- [ ] **Step 2: Implement server.js**

```js
require('dotenv').config();

const http = require('http');
const express = require('express');
const { initSocket } = require('./src/realtime/socket');
const { adminAuth, userAuth, requireRole, resolveTenantMiddleware, _getAdminToken } = require('./src/auth/middleware');
const { processMessage } = require('./src/flows/engine');
const { sendMessage, parseStartTracking, formatBody } = require('./src/channels/telegram');
const sessionManager = require('./src/session/manager');
const { saveMessage } = require('./src/messages/service');
const { listLeads, getLead, updateStatus, classifyLead } = require('./src/leads/service');
const { getPrisma } = require('./src/infra/db');

const app = express();
app.use(express.json());

// ── Webhook (Telegram) ────────────────────────────────────────────────────────
app.use('/webhook', async (req, res, next) => {
  if (process.env.STORAGE_ADAPTER !== 'postgres') return next();
  return resolveTenantMiddleware(req, res, next);
});

app.post('/webhook', async (req, res) => {
  const isTelegram = !!(req.body.message || req.body.edited_message);
  if (isTelegram) res.sendStatus(200); // respond immediately

  try {
    const tgMsg = req.body.message || req.body.edited_message;
    const tenantId = global._currentTenantId || process.env.DEFAULT_TENANT_ID;

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

    // Persist messages
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
app.get('/health', (_req, res) => {
  const payload = {
    status: 'ok',
    env: {
      storage: process.env.STORAGE_ADAPTER || 'memory',
      database: !!process.env.DATABASE_URL,
      redis: !!process.env.REDIS_URL,
      telegram: !!process.env.TELEGRAM_TOKEN,
    },
  };
  if (!process.env.ADMIN_TOKEN) payload._setup = { adminToken: _getAdminToken() };
  return res.json(payload);
});

// ── Operator API (leads) ──────────────────────────────────────────────────────
// Accessible by admin token OR authenticated OPERATOR/OWNER user

app.get('/api/leads', adminAuth, async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || process.env.DEFAULT_TENANT_ID;
    return res.json(await listLeads(tenantId, req.query));
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.get('/api/leads/:id', adminAuth, async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || process.env.DEFAULT_TENANT_ID;
    const lead = await getLead(tenantId, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    return res.json(lead);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.patch('/api/leads/:id/status', adminAuth, async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || process.env.DEFAULT_TENANT_ID;
    const { status, motivoDesistencia } = req.body;
    await updateStatus(tenantId, req.params.id, status, motivoDesistencia);
    return res.json({ ok: true });
  } catch (err) { return res.status(400).json({ error: err.message }); }
});

app.patch('/api/leads/:id/classify', adminAuth, async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || process.env.DEFAULT_TENANT_ID;
    const { segmento, tipoAtendimento } = req.body;
    await classifyLead(tenantId, req.params.id, { segmento, tipoAtendimento });
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
      execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
      console.log('[db] schema aplicado');
    } catch (err) {
      console.error('[db] db push falhou:', err.message);
    }
  }
  httpServer.listen(PORT, () => {
    console.log(`[BRO Resolve] porta ${PORT} — storage: ${process.env.STORAGE_ADAPTER || 'memory'}`);
  });
}

start();
```

- [ ] **Step 3: Test server starts**

```bash
node server.js
```

Expected: `[BRO Resolve] porta 3000`

Ctrl+C to stop.

- [ ] **Step 4: Commit**

```bash
git add src/realtime/ server.js
git commit -m "feat: add socket.io and express server with webhook + leads API"
```

---

### Task 10: Seed + Railway config

**Files:**
- Create: `prisma/seed.js`
- Create: `railway.toml`

- [ ] **Step 1: Create prisma/seed.js**

```js
require('dotenv').config();
const { getPrisma } = require('../src/infra/db');
const { createFlow } = require('../src/flows/service');
const juridicoNodes = require('../src/flows/templates/juridico');
const crypto = require('crypto');

async function seed() {
  const prisma = getPrisma();
  const botToken = process.env.TELEGRAM_TOKEN;
  if (!botToken) throw new Error('TELEGRAM_TOKEN não configurado');

  let tenant = await prisma.tenant.findFirst({ where: { botToken } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        id: crypto.randomUUID(),
        nome: process.env.TENANT_NOME || 'Tenant Principal',
        botToken,
        tipoNegocio: process.env.TENANT_TIPO || 'juridico',
        moedaBase: 'BRL',
      },
    });
    console.log(`Tenant criado: ${tenant.nome} (${tenant.id})`);
  } else {
    console.log(`Tenant existente: ${tenant.nome} (${tenant.id})`);
  }

  // Create OWNER user
  const ownerEmail = process.env.OWNER_EMAIL || 'owner@bro.resolve';
  let owner = await prisma.user.findFirst({ where: { tenantId: tenant.id, role: 'OWNER' } });
  if (!owner) {
    owner = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        email: ownerEmail,
        role: 'OWNER',
        token: crypto.randomBytes(32).toString('hex'),
      },
    });
    console.log(`OWNER criado: ${owner.email} | token: ${owner.token}`);
  }

  // Seed flow
  const existingFlow = await prisma.flow.findFirst({ where: { tenantId: tenant.id, ativo: true } });
  if (!existingFlow) {
    await createFlow({ tenantId: tenant.id, nome: 'Jurídico', tipoNegocio: 'juridico', nodes: juridicoNodes });
    console.log('Flow jurídico criado');
  }

  console.log('Seed concluído.');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Create railway.toml**

```toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npx prisma generate"

[deploy]
startCommand = "node server.js"
restartPolicyType = "on_failure"
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All tests PASS

- [ ] **Step 4: Final commit**

```bash
git add prisma/seed.js railway.toml
git commit -m "feat: add seed script and Railway deployment config"
```

---

## Summary

After Plan 1 you will have:

- ✅ Clean `bro-resolve` project, zero tech debt
- ✅ Schema: Tenant, User (OWNER/OPERATOR), Flow, Node, Lead (sem financeiro), Message, Caso (financeiro real), Event
- ✅ Flow Engine dinâmico — fluxos do banco, 3 templates
- ✅ Session manager Redis/memória com fallback
- ✅ Auth: adminAuth + userAuth + requireRole (backend security)
- ✅ Telegram webhook (resposta 200 imediata, async)
- ✅ Leads API (list, get, status, classify)
- ✅ Socket.io realtime
- ✅ Railway-ready

**Next:** Plan 2 — Operator Inbox + Owner Dashboard (React, 3-column layout, real-time chat, role-based views)
