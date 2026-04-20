# Backend Fundação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir inMemory.js + Google Sheets por PostgreSQL + Redis + BullMQ com multi-tenant completo, sem quebrar o bot atual.

**Architecture:** Middleware resolve o token do bot para tenant_id. Redis armazena sessões com TTL 24h. BullMQ faz retry de persistência de leads. PostgreSQL é a fonte de verdade para leads, mensagens e configuração de fluxo.

**Tech Stack:** Node.js (CommonJS), Telegraf, PostgreSQL, Prisma, Redis (ioredis), BullMQ, Jest

**Spec:** `docs/superpowers/specs/2026-04-20-saas-lead-qualifier-design.md`

---

## Mapa de arquivos

### Criar
- `prisma/schema.prisma` — schema completo (tenants, leads, messages, flows)
- `prisma/migrations/` — gerado pelo Prisma
- `prisma/seed.js` — seed com tenant de desenvolvimento
- `src/infra/db.js` — cliente Prisma singleton
- `src/infra/redis.js` — cliente ioredis singleton
- `src/infra/queue.js` — BullMQ worker + producer (persistência de leads)
- `src/tenants/service.js` — resolveTenant(token) → tenant
- `src/storage/postgres.js` — adapter Postgres (createLead, createClient, createOther, createAbandono)
- `src/storage/redisSession.js` — adapter Redis (getSession, updateSession, resetSession)
- `.env.example` — todas as variáveis necessárias
- `tests/tenants.test.js`
- `tests/storage-postgres.test.js`
- `tests/storage-redis.test.js`
- `tests/queue.test.js`

### Modificar
- `src/storage/index.js` — usar adapters Redis/Postgres quando env configurada
- `src/sessionManager.js` — sem alteração de interface (transparente)
- `server.js` — registrar worker BullMQ no startup
- `package.json` — adicionar dependências

---

## Task 1: Instalar dependências e configurar Prisma

**Files:**
- Modify: `package.json`
- Create: `prisma/schema.prisma`
- Create: `.env.example`

- [ ] **Step 1: Instalar dependências**

```bash
cd /Users/Jads/Downloads/bro.cco
npm install prisma @prisma/client ioredis bullmq telegraf
npm install --save-dev @types/node
npx prisma init
```

Expected: pasta `prisma/` criada com `schema.prisma` vazio e `.env` com `DATABASE_URL`.

- [ ] **Step 2: Escrever o schema Prisma**

Substituir conteúdo de `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id        String   @id @default(uuid())
  nome      String
  botToken  String   @unique @map("bot_token")
  plano     String   @default("free")
  ativo     Boolean  @default(true)
  criadoEm  DateTime @default(now()) @map("criado_em")

  leads     Lead[]
  messages  Message[]
  flows     Flow[]

  @@map("tenants")
}

model Lead {
  id             String   @id @default(uuid())
  tenantId       String   @map("tenant_id")
  nome           String?
  telefone       String
  canal          String   @default("telegram")
  fluxo          String?
  score          Int      @default(0)
  prioridade     String   @default("FRIO")
  scoreBreakdown Json?    @map("score_breakdown")
  status         String   @default("novo")
  flagAtencao    Boolean  @default(false) @map("flag_atencao")
  resumo         String?
  criadoEm       DateTime @default(now()) @map("criado_em")
  atualizadoEm   DateTime @updatedAt @map("atualizado_em")

  tenant   Tenant    @relation(fields: [tenantId], references: [id])
  messages Message[]

  @@map("leads")
}

model Message {
  id       String   @id @default(uuid())
  tenantId String   @map("tenant_id")
  leadId   String   @map("lead_id")
  direcao  String
  conteudo String
  estado   String?
  criadoEm DateTime @default(now()) @map("criado_em")

  tenant Tenant @relation(fields: [tenantId], references: [id])
  lead   Lead   @relation(fields: [leadId], references: [id])

  @@map("messages")
}

model Flow {
  id       String  @id @default(uuid())
  tenantId String  @map("tenant_id")
  objetivo String  @default("leads")
  config   Json
  ativo    Boolean @default(true)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@map("flows")
}
```

- [ ] **Step 3: Criar .env.example**

```bash
cat > .env.example << 'EOF'
# Bot
TELEGRAM_TOKEN=your_telegram_bot_token

# Banco de dados
DATABASE_URL=postgresql://user:password@localhost:5432/brocco

# Redis
REDIS_URL=redis://localhost:6379

# Storage (memory | postgres)
STORAGE_ADAPTER=postgres

# Admin
ADMIN_TOKEN=your_secret_admin_token
EOF
```

- [ ] **Step 4: Copiar .env.example para .env e preencher DATABASE_URL e REDIS_URL locais**

```bash
cp .env.example .env
# Editar .env com credenciais locais de desenvolvimento
```

- [ ] **Step 5: Commitar**

```bash
git init  # se ainda não for git repo
git add prisma/schema.prisma .env.example package.json package-lock.json
git commit -m "feat: add Prisma schema + BullMQ + ioredis dependencies"
```

---

## Task 2: Criar infra/db.js e infra/redis.js

**Files:**
- Create: `src/infra/db.js`
- Create: `src/infra/redis.js`

- [ ] **Step 1: Escrever teste para db.js**

Criar `tests/infra-db.test.js`:

```javascript
const { getPrisma } = require('../src/infra/db');

describe('db singleton', () => {
  test('returns same instance on multiple calls', () => {
    const a = getPrisma();
    const b = getPrisma();
    expect(a).toBe(b);
  });

  test('has expected model accessors', () => {
    const prisma = getPrisma();
    expect(prisma.tenant).toBeDefined();
    expect(prisma.lead).toBeDefined();
    expect(prisma.message).toBeDefined();
    expect(prisma.flow).toBeDefined();
  });
});
```

- [ ] **Step 2: Rodar teste para ver falhar**

```bash
npx jest tests/infra-db.test.js --no-coverage
```

Expected: FAIL — "Cannot find module '../src/infra/db'"

- [ ] **Step 3: Gerar cliente Prisma e criar db.js**

```bash
npx prisma generate
```

Criar `src/infra/db.js`:

```javascript
// src/infra/db.js
const { PrismaClient } = require('@prisma/client');

let _prisma;

function getPrisma() {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

async function disconnectPrisma() {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}

module.exports = { getPrisma, disconnectPrisma };
```

- [ ] **Step 4: Rodar teste para ver passar**

```bash
npx jest tests/infra-db.test.js --no-coverage
```

Expected: PASS

- [ ] **Step 5: Escrever teste para redis.js**

Criar `tests/infra-redis.test.js`:

```javascript
const { getRedis } = require('../src/infra/redis');

describe('redis singleton', () => {
  test('returns same instance on multiple calls', () => {
    const a = getRedis();
    const b = getRedis();
    expect(a).toBe(b);
  });

  test('instance has set and get methods', () => {
    const redis = getRedis();
    expect(typeof redis.set).toBe('function');
    expect(typeof redis.get).toBe('function');
  });
});
```

- [ ] **Step 6: Rodar para ver falhar**

```bash
npx jest tests/infra-redis.test.js --no-coverage
```

Expected: FAIL — "Cannot find module '../src/infra/redis'"

- [ ] **Step 7: Criar redis.js**

```javascript
// src/infra/redis.js
const Redis = require('ioredis');

let _redis;

function getRedis() {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
  }
  return _redis;
}

async function disconnectRedis() {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}

module.exports = { getRedis, disconnectRedis };
```

- [ ] **Step 8: Rodar teste para ver passar**

```bash
npx jest tests/infra-redis.test.js --no-coverage
```

Expected: PASS

- [ ] **Step 9: Commitar**

```bash
git add src/infra/db.js src/infra/redis.js tests/infra-db.test.js tests/infra-redis.test.js
git commit -m "feat: add db and redis singletons"
```

---

## Task 3: Adapter de sessão no Redis (substitui inMemory para sessões)

**Files:**
- Create: `src/storage/redisSession.js`
- Create: `tests/storage-redis.test.js`

- [ ] **Step 1: Escrever testes**

Criar `tests/storage-redis.test.js`:

```javascript
jest.mock('../src/infra/redis', () => {
  const store = {};
  const mockRedis = {
    set: jest.fn(async (key, value) => { store[key] = value; }),
    get: jest.fn(async (key) => store[key] || null),
    del: jest.fn(async (key) => { delete store[key]; }),
  };
  return { getRedis: () => mockRedis };
});

const { getSession, updateSession, resetSession } = require('../src/storage/redisSession');

describe('redisSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getSession cria sessão nova quando não existe', async () => {
    const sess = await getSession('tenant1', '5511999999999', 'telegram');
    expect(sess.sessao).toBe('5511999999999');
    expect(sess.tenantId).toBe('tenant1');
    expect(sess.estadoAtual).toBe('start');
    expect(sess.score).toBe(0);
  });

  test('updateSession persiste campos', async () => {
    await getSession('tenant1', '5511999999999', 'telegram');
    await updateSession('tenant1', '5511999999999', { nome: 'João', score: 5 });
    const sess = await getSession('tenant1', '5511999999999', 'telegram');
    expect(sess.nome).toBe('João');
    expect(sess.score).toBe(5);
  });

  test('resetSession volta para estado start', async () => {
    await updateSession('tenant1', '5511999999999', { estadoAtual: 'coleta_nome', score: 7 });
    await resetSession('tenant1', '5511999999999', 'telegram');
    const sess = await getSession('tenant1', '5511999999999', 'telegram');
    expect(sess.estadoAtual).toBe('start');
    expect(sess.score).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
npx jest tests/storage-redis.test.js --no-coverage
```

Expected: FAIL — "Cannot find module '../src/storage/redisSession'"

- [ ] **Step 3: Criar redisSession.js**

```javascript
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
```

- [ ] **Step 4: Rodar para ver passar**

```bash
npx jest tests/storage-redis.test.js --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commitar**

```bash
git add src/storage/redisSession.js tests/storage-redis.test.js
git commit -m "feat: add Redis session adapter with TTL 24h"
```

---

## Task 4: Adapter de persistência no Postgres (substitui googleSheets.js)

**Files:**
- Create: `src/storage/postgres.js`
- Create: `tests/storage-postgres.test.js`

- [ ] **Step 1: Escrever testes**

Criar `tests/storage-postgres.test.js`:

```javascript
jest.mock('../src/infra/db', () => {
  const leads = [];
  const messages = [];
  return {
    getPrisma: () => ({
      lead: {
        create: jest.fn(async ({ data }) => {
          const lead = { id: 'uuid-1', ...data };
          leads.push(lead);
          return lead;
        }),
        findMany: jest.fn(async () => leads),
      },
      message: {
        create: jest.fn(async ({ data }) => {
          const msg = { id: 'uuid-m', ...data };
          messages.push(msg);
          return msg;
        }),
      },
    }),
  };
});

const { createLead, createMessage, createAbandono } = require('../src/storage/postgres');

describe('postgres adapter', () => {
  test('createLead persiste com campos obrigatórios', async () => {
    const lead = await createLead({
      tenantId: 'tenant-1',
      nome: 'João',
      telefone: '5511999',
      canal: 'telegram',
      fluxo: 'trabalhista',
      score: 6,
      prioridade: 'QUENTE',
      scoreBreakdown: { urgencia: 3, intencao: 2 },
    });
    expect(lead.tenantId).toBe('tenant-1');
    expect(lead.prioridade).toBe('QUENTE');
    expect(lead.score).toBe(6);
  });

  test('createMessage persiste mensagem vinculada ao lead', async () => {
    const msg = await createMessage({
      tenantId: 'tenant-1',
      leadId: 'uuid-1',
      direcao: 'in',
      conteudo: 'fui demitido',
      estado: 'start',
    });
    expect(msg.direcao).toBe('in');
    expect(msg.leadId).toBe('uuid-1');
  });

  test('createAbandono persiste com classificacao', async () => {
    const result = await createAbandono({
      tenantId: 'tenant-1',
      sessao: '5511999',
      fluxo: 'trabalhista',
      ultimoEstado: 'coleta_nome',
      score: 4,
      prioridade: 'MEDIO',
    });
    expect(result).toBeDefined();
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
npx jest tests/storage-postgres.test.js --no-coverage
```

Expected: FAIL — "Cannot find module '../src/storage/postgres'"

- [ ] **Step 3: Criar postgres.js**

```javascript
// src/storage/postgres.js
const { getPrisma } = require('../infra/db');

function classificarAbandono(ultimoEstado) {
  const finais = ['coleta_nome', 'contato_confirmacao', 'contato_numero', 'contato_canal'];
  const iniciais = ['start', 'fallback'];
  if (iniciais.includes(ultimoEstado)) return 'PRECOCE';
  if (finais.includes(ultimoEstado)) return 'VALIOSO';
  return 'MEDIO';
}

async function createLead(data) {
  const prisma = getPrisma();
  return prisma.lead.create({
    data: {
      tenantId: data.tenantId,
      nome: data.nome || null,
      telefone: data.telefone,
      canal: data.canal || 'telegram',
      fluxo: data.fluxo || null,
      score: data.score || 0,
      prioridade: data.prioridade || 'FRIO',
      scoreBreakdown: data.scoreBreakdown || {},
      status: data.status || 'novo',
      flagAtencao: data.flagAtencao || false,
      resumo: data.resumo || null,
    },
  });
}

async function updateLeadStatus(tenantId, leadId, status) {
  const prisma = getPrisma();
  return prisma.lead.update({
    where: { id: leadId, tenantId },
    data: { status, atualizadoEm: new Date() },
  });
}

async function createMessage(data) {
  const prisma = getPrisma();
  return prisma.message.create({
    data: {
      tenantId: data.tenantId,
      leadId: data.leadId,
      direcao: data.direcao,
      conteudo: data.conteudo,
      estado: data.estado || null,
    },
  });
}

async function createAbandono(data) {
  // Abandono é um lead com status 'abandonou'
  const prisma = getPrisma();
  return prisma.lead.create({
    data: {
      tenantId: data.tenantId,
      nome: data.nome || null,
      telefone: data.sessao,
      canal: data.canalOrigem || 'telegram',
      fluxo: data.fluxo || null,
      score: data.score || 0,
      prioridade: data.prioridade || 'FRIO',
      scoreBreakdown: { classificacao: classificarAbandono(data.ultimoEstado) },
      status: 'abandonou',
      flagAtencao: false,
      resumo: JSON.stringify({ ultimoEstado: data.ultimoEstado }),
    },
  });
}

module.exports = { createLead, updateLeadStatus, createMessage, createAbandono };
```

- [ ] **Step 4: Rodar para ver passar**

```bash
npx jest tests/storage-postgres.test.js --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commitar**

```bash
git add src/storage/postgres.js tests/storage-postgres.test.js
git commit -m "feat: add Postgres storage adapter"
```

---

## Task 5: Tenant service (resolver token → tenant_id)

**Files:**
- Create: `src/tenants/service.js`
- Create: `tests/tenants.test.js`

- [ ] **Step 1: Escrever testes**

Criar `tests/tenants.test.js`:

```javascript
jest.mock('../src/infra/db', () => ({
  getPrisma: () => ({
    tenant: {
      findUnique: jest.fn(async ({ where }) => {
        if (where.botToken === 'valid-token') {
          return { id: 'tenant-1', nome: 'Santos & Bastos', botToken: 'valid-token', ativo: true };
        }
        return null;
      }),
    },
  }),
}));

const { resolveTenant, getTenantCache } = require('../src/tenants/service');

describe('tenants/service', () => {
  beforeEach(() => getTenantCache().clear());

  test('resolve token válido para tenant', async () => {
    const tenant = await resolveTenant('valid-token');
    expect(tenant.id).toBe('tenant-1');
    expect(tenant.nome).toBe('Santos & Bastos');
  });

  test('retorna null para token inválido', async () => {
    const tenant = await resolveTenant('invalid-token');
    expect(tenant).toBeNull();
  });

  test('usa cache na segunda chamada', async () => {
    const { getPrisma } = require('../src/infra/db');
    await resolveTenant('valid-token');
    await resolveTenant('valid-token');
    expect(getPrisma().tenant.findUnique).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
npx jest tests/tenants.test.js --no-coverage
```

Expected: FAIL — "Cannot find module '../src/tenants/service'"

- [ ] **Step 3: Criar service.js**

```javascript
// src/tenants/service.js
const { getPrisma } = require('../infra/db');

// Cache em memória: token → tenant (TTL simples por processo)
const _cache = new Map();

function getTenantCache() {
  return _cache;
}

async function resolveTenant(botToken) {
  if (_cache.has(botToken)) return _cache.get(botToken);

  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { botToken } });

  if (tenant && tenant.ativo) {
    _cache.set(botToken, tenant);
    return tenant;
  }

  return null;
}

module.exports = { resolveTenant, getTenantCache };
```

- [ ] **Step 4: Rodar para ver passar**

```bash
npx jest tests/tenants.test.js --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commitar**

```bash
git add src/tenants/service.js tests/tenants.test.js
git commit -m "feat: add tenant resolver with in-memory cache"
```

---

## Task 6: BullMQ — fila de persistência de leads

**Files:**
- Create: `src/infra/queue.js`
- Create: `tests/queue.test.js`

- [ ] **Step 1: Escrever testes**

Criar `tests/queue.test.js`:

```javascript
jest.mock('bullmq', () => {
  const jobs = [];
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: jest.fn(async (name, data) => { jobs.push({ name, data }); return { id: '1' }; }),
    })),
    Worker: jest.fn().mockImplementation((name, processor) => ({
      on: jest.fn(),
      _processor: processor,
    })),
    getJobs: () => jobs,
  };
});

jest.mock('../src/infra/redis', () => ({
  getRedis: () => ({ options: { host: 'localhost', port: 6379 } }),
}));

jest.mock('../src/storage/postgres', () => ({
  createLead: jest.fn(async (data) => ({ id: 'lead-1', ...data })),
  createAbandono: jest.fn(async (data) => ({ id: 'abnd-1', ...data })),
  createMessage: jest.fn(async (data) => ({ id: 'msg-1', ...data })),
}));

const { enqueueLeadPersist, enqueueAbandono } = require('../src/infra/queue');

describe('queue', () => {
  test('enqueueLeadPersist adiciona job na fila', async () => {
    const job = await enqueueLeadPersist({
      tenantId: 'tenant-1',
      sessao: '55119999',
      nome: 'João',
      score: 6,
      prioridade: 'QUENTE',
    });
    expect(job).toBeDefined();
  });

  test('enqueueAbandono adiciona job na fila', async () => {
    const job = await enqueueAbandono({
      tenantId: 'tenant-1',
      sessao: '55119999',
      ultimoEstado: 'coleta_nome',
    });
    expect(job).toBeDefined();
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
npx jest tests/queue.test.js --no-coverage
```

Expected: FAIL — "Cannot find module '../src/infra/queue'"

- [ ] **Step 3: Criar queue.js**

```javascript
// src/infra/queue.js
const { Queue, Worker } = require('bullmq');
const { getRedis } = require('./redis');
const { createLead, createAbandono } = require('../storage/postgres');

const QUEUE_NAME = 'lead-persist';

let _queue;

function getQueue() {
  if (!_queue) {
    const redis = getRedis();
    _queue = new Queue(QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });
  }
  return _queue;
}

async function enqueueLeadPersist(data) {
  return getQueue().add('persist-lead', data);
}

async function enqueueAbandono(data) {
  return getQueue().add('persist-abandono', data);
}

function startWorker() {
  const redis = getRedis();
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === 'persist-lead') {
        await createLead(job.data);
      } else if (job.name === 'persist-abandono') {
        await createAbandono(job.data);
      }
    },
    { connection: redis }
  );

  worker.on('failed', (job, err) => {
    console.error(`[queue] job ${job?.id} falhou:`, err.message);
  });

  return worker;
}

module.exports = { enqueueLeadPersist, enqueueAbandono, startWorker };
```

- [ ] **Step 4: Rodar para ver passar**

```bash
npx jest tests/queue.test.js --no-coverage
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commitar**

```bash
git add src/infra/queue.js tests/queue.test.js
git commit -m "feat: add BullMQ queue for lead persistence with retry"
```

---

## Task 7: Atualizar storage/index.js para usar os novos adapters

**Files:**
- Modify: `src/storage/index.js`

- [ ] **Step 1: Ler o arquivo atual**

Verificar conteúdo atual de `src/storage/index.js` (já lido durante planejamento — exporta `getSession`, `updateSession`, `createLead`, etc. alternando entre memory e sheets).

- [ ] **Step 2: Substituir conteúdo**

```javascript
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
```

> Nota: `global._currentTenantId` é setado pelo middleware de tenant no `server.js` (Task 8). É uma solução simples para passar tenant_id sem refatorar toda a stateMachine agora.

- [ ] **Step 3: Rodar todos os testes existentes**

```bash
npx jest --no-coverage
```

Expected: todos passando. Se algum test de inMemory quebrar, verificar se o mock ainda cobre o módulo.

- [ ] **Step 4: Commitar**

```bash
git add src/storage/index.js
git commit -m "feat: route storage to Redis/Postgres when STORAGE_ADAPTER=postgres"
```

---

## Task 8: Middleware de tenant no server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Adicionar imports e middleware no topo do server.js**

Abrir `server.js`. Após `require('dotenv').config();`, adicionar:

```javascript
const { resolveTenant } = require('./src/tenants/service');
const { startWorker } = require('./src/infra/queue');
```

- [ ] **Step 2: Adicionar middleware de tenant antes do route /webhook**

Antes da linha `app.post('/webhook', async (req, res) => {`, adicionar:

```javascript
// Middleware: resolve tenant pelo token do bot (Telegram)
app.use('/webhook', async (req, res, next) => {
  const token = process.env.TELEGRAM_TOKEN;
  if (process.env.STORAGE_ADAPTER === 'postgres' && token) {
    const tenant = await resolveTenant(token);
    if (tenant) {
      global._currentTenantId = tenant.id;
      req.tenant = tenant;
    }
  }
  next();
});
```

- [ ] **Step 3: Iniciar worker BullMQ no final do server.js**

Antes de `app.listen(...)`, adicionar:

```javascript
if (process.env.STORAGE_ADAPTER === 'postgres') {
  startWorker();
  console.log('[queue] BullMQ worker iniciado');
}
```

- [ ] **Step 4: Criar migration e seed**

```bash
npx prisma migrate dev --name init
```

Criar `prisma/seed.js`:

```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { botToken: process.env.TELEGRAM_TOKEN || 'dev-token' },
    update: {},
    create: {
      nome: 'Santos & Bastos Advogados',
      botToken: process.env.TELEGRAM_TOKEN || 'dev-token',
      plano: 'free',
      ativo: true,
    },
  });
  console.log('Tenant criado:', tenant.nome, tenant.id);
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

Adicionar ao `package.json`:
```json
"prisma": {
  "seed": "node prisma/seed.js"
}
```

```bash
npx prisma db seed
```

- [ ] **Step 5: Testar end-to-end local**

```bash
STORAGE_ADAPTER=postgres node server.js
# Em outro terminal:
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"sessao":"5511999999999","mensagem":"oi","canal":"telegram"}'
```

Expected: resposta JSON com a mensagem de boas-vindas do bot e sem erros no console.

- [ ] **Step 6: Verificar lead no banco**

```bash
npx prisma studio
# Acessar http://localhost:5555 e verificar tabela leads
```

- [ ] **Step 7: Commitar**

```bash
git add server.js prisma/seed.js package.json
git commit -m "feat: add tenant middleware + BullMQ worker startup + Prisma seed"
```

---

## Task 9: Rodar suite completa + ajustes finais

**Files:**
- Modify: `package.json` (jest config se necessário)

- [ ] **Step 1: Rodar todos os testes**

```bash
npx jest --no-coverage --runInBand
```

Expected: todos passando.

- [ ] **Step 2: Checar variáveis de ambiente documentadas**

```bash
diff .env .env.example
```

Garantir que `.env.example` tem todas as variáveis usadas no código.

- [ ] **Step 3: Verificar que bot ainda funciona sem Postgres (modo memory)**

```bash
STORAGE_ADAPTER=memory node server.js
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"sessao":"5511999999999","mensagem":"oi","canal":"telegram"}'
```

Expected: funciona exatamente como antes.

- [ ] **Step 4: Commit final**

```bash
git add .
git commit -m "feat: Fase 1 completa — multi-tenant + Redis sessions + Postgres + BullMQ"
```

---

## Verificação de cobertura do spec

| Requisito do spec | Task que implementa |
|---|---|
| PostgreSQL + Prisma com tenant_id em tudo | Tasks 1, 4, 7 |
| Redis para sessões com TTL 24h | Tasks 2, 3 |
| BullMQ para fila de persistência | Tasks 6, 8 |
| Middleware de tenant por token do bot | Task 5, 8 |
| Salvar messages (histórico por lead) | Task 4 (createMessage) |
| Fallback para memory quando sem Postgres | Task 7 |
| Schema: tenants, leads, messages, flows | Task 1 |
| Score breakdown persistido | Task 4 (scoreBreakdown) |
| Seed de tenant de desenvolvimento | Task 8 |
