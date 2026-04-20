# Dashboard Operacional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o dashboard React com inbox priorizada por SLA, impacto financeiro em tempo real via Socket.io, e API REST completa — para que o cliente veja quem atender, quanto está em risco e onde está perdendo em < 5 segundos.

**Architecture:** Backend Express adiciona endpoints REST + Socket.io. Frontend React (Vite) com shadcn/ui consome a API e recebe push em tempo real. SLA e valor financeiro são calculados no backend baseados na config do tenant.

**Tech Stack:** Node.js + Express + Socket.io (backend) · React 18 + Vite + Tailwind + shadcn/ui + react-query (frontend) · Jest (backend tests) · Vitest (frontend tests)

**Spec:** `docs/superpowers/specs/2026-04-20-saas-lead-qualifier-design.md`

**Pré-requisito:** Plano 1 concluído (PostgreSQL + Redis + BullMQ + multi-tenant).

---

## Mapa de arquivos

### Backend — criar
- `prisma/migrations/` — migration: add sla/financeiro ao tenants + tabela events
- `src/api/auth.js` — POST /api/auth/login → JWT
- `src/api/leads.js` — GET /api/leads, GET /api/leads/:id, PATCH /api/leads/:id/status
- `src/api/metrics.js` — GET /api/metrics, GET /api/funil
- `src/api/tenant.js` — GET/PATCH /api/tenant/config
- `src/api/middleware/auth.js` — JWT verify middleware
- `src/realtime/socket.js` — Socket.io setup + emit helpers
- `src/engine/events.js` — emitEvent(tenantId, leadId, event, step)
- `tests/api-leads.test.js`
- `tests/api-metrics.test.js`
- `tests/api-auth.test.js`
- `tests/engine-events.test.js`

### Backend — modificar
- `prisma/schema.prisma` — add sla_minutes, ticket_medio, taxa_conversao to Tenant; add Event model
- `server.js` — montar rotas API + Socket.io
- `src/storage/postgres.js` — add createEvent()
- `package.json` — add jsonwebtoken, bcryptjs, socket.io

### Frontend — criar (novo diretório: `dashboard/`)
- `dashboard/` — projeto Vite React separado
- `dashboard/src/main.jsx`
- `dashboard/src/App.jsx` — router (login / home)
- `dashboard/src/pages/Login.jsx`
- `dashboard/src/pages/Home.jsx` — Camadas 1, 2, 3
- `dashboard/src/components/LeadInbox.jsx` — lista priorizada
- `dashboard/src/components/LeadDetail.jsx` — detalhe + conversa
- `dashboard/src/components/KpiBar.jsx` — contexto + financeiro + SLA
- `dashboard/src/lib/api.js` — fetch wrapper com JWT
- `dashboard/src/lib/socket.js` — Socket.io client
- `dashboard/package.json`
- `dashboard/vite.config.js`

---

## Task 1: Migration — adicionar SLA/financeiro ao tenant + tabela events

**Files:**
- Modify: `prisma/schema.prisma`
- Generate: `prisma/migrations/`

- [ ] **Step 1: Atualizar schema.prisma**

Abrir `prisma/schema.prisma`. No model `Tenant`, adicionar após `criadoEm`:

```prisma
  slaMinutes     Int      @default(15)   @map("sla_minutes")
  ticketMedio    Decimal  @default(1000) @map("ticket_medio")
  taxaConversao  Decimal  @default(0.2)  @map("taxa_conversao")

  events         Event[]
```

Adicionar novo model antes do final do arquivo:

```prisma
model Event {
  id       String   @id @default(uuid())
  tenantId String   @map("tenant_id")
  leadId   String   @map("lead_id")
  event    String
  step     String?
  criadoEm DateTime @default(now()) @map("criado_em")

  tenant Tenant @relation(fields: [tenantId], references: [id])
  lead   Lead   @relation(fields: [leadId], references: [id])

  @@map("events")
}
```

Também adicionar `events Event[]` no model `Lead`.

- [ ] **Step 2: Instalar jsonwebtoken, bcryptjs, socket.io**

```bash
npm install jsonwebtoken bcryptjs socket.io
```

Expected: instalado sem erros.

- [ ] **Step 3: Gerar cliente Prisma**

```bash
npx prisma generate
```

Expected: sem erros.

- [ ] **Step 4: Rodar migration (requer DATABASE_URL configurada)**

Se DATABASE_URL estiver disponível:
```bash
npx prisma migrate dev --name add-sla-financeiro-events
```

Se não (desenvolvimento local sem DB), criar migration manual para deploy:
```bash
npx prisma migrate dev --name add-sla-financeiro-events --create-only
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ package.json package-lock.json
git commit -m "feat: add SLA/financial fields to tenant + events table"
```

---

## Task 2: Engine de eventos (tracking de abandono)

**Files:**
- Create: `src/engine/events.js`
- Modify: `src/storage/postgres.js`
- Create: `tests/engine-events.test.js`

- [ ] **Step 1: Escrever teste**

Criar `tests/engine-events.test.js`:

```javascript
jest.mock('../src/infra/db', () => ({
  getPrisma: () => ({
    event: {
      create: jest.fn(async ({ data }) => ({ id: 'evt-1', ...data })),
    },
  }),
}));

const { emitEvent } = require('../src/engine/events');

describe('engine/events', () => {
  test('emitEvent persiste evento entered_step', async () => {
    const evt = await emitEvent('tenant-1', 'lead-1', 'entered_step', 'trabalho_status');
    expect(evt.event).toBe('entered_step');
    expect(evt.step).toBe('trabalho_status');
    expect(evt.tenantId).toBe('tenant-1');
    expect(evt.leadId).toBe('lead-1');
  });

  test('emitEvent persiste evento abandoned', async () => {
    const evt = await emitEvent('tenant-1', 'lead-1', 'abandoned', 'coleta_nome');
    expect(evt.event).toBe('abandoned');
  });

  test('emitEvent persiste completed_flow sem step', async () => {
    const evt = await emitEvent('tenant-1', 'lead-1', 'completed_flow', null);
    expect(evt.event).toBe('completed_flow');
    expect(evt.step).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
npx jest tests/engine-events.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Criar src/engine/events.js**

```javascript
// src/engine/events.js
const { getPrisma } = require('../infra/db');

async function emitEvent(tenantId, leadId, event, step) {
  const prisma = getPrisma();
  return prisma.event.create({
    data: {
      tenantId,
      leadId,
      event,
      step: step || null,
    },
  });
}

module.exports = { emitEvent };
```

- [ ] **Step 4: Rodar para ver passar**

```bash
npx jest tests/engine-events.test.js --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/events.js tests/engine-events.test.js
git commit -m "feat: add event emitter for step tracking"
```

---

## Task 3: JWT auth middleware + login endpoint

**Files:**
- Create: `src/api/middleware/auth.js`
- Create: `src/api/auth.js`
- Create: `tests/api-auth.test.js`

- [ ] **Step 1: Escrever testes**

Criar `tests/api-auth.test.js`:

```javascript
const request = require('supertest');
const express = require('express');

jest.mock('../src/infra/db', () => ({
  getPrisma: () => ({
    tenant: {
      findFirst: jest.fn(async ({ where }) => {
        if (where.email === 'admin@test.com') {
          return {
            id: 'tenant-1',
            email: 'admin@test.com',
            senhaHash: '$2b$10$YourHashedPasswordHere',
            ativo: true,
          };
        }
        return null;
      }),
    },
  }),
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(async (plain, hash) => plain === 'senha123'),
  hash: jest.fn(async (plain) => '$2b$10$YourHashedPasswordHere'),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-jwt-token'),
  verify: jest.fn((token) => {
    if (token === 'mock-jwt-token') return { tenantId: 'tenant-1' };
    throw new Error('invalid token');
  }),
}));

const authRouter = require('../src/api/auth');
const { requireAuth } = require('../src/api/middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.get('/protected', requireAuth, (req, res) => res.json({ tenantId: req.tenantId }));

describe('auth', () => {
  test('POST /api/auth/login retorna token com credenciais válidas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', senha: 'senha123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('POST /api/auth/login retorna 401 com credenciais inválidas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@test.com', senha: 'errada' });
    expect(res.status).toBe(401);
  });

  test('requireAuth bloqueia sem token', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
  });

  test('requireAuth passa com token válido', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer mock-jwt-token');
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe('tenant-1');
  });
});
```

- [ ] **Step 2: Instalar supertest**

```bash
npm install --save-dev supertest
```

- [ ] **Step 3: Rodar para ver falhar**

```bash
npx jest tests/api-auth.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 4: Criar src/api/middleware/auth.js**

```javascript
// src/api/middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    req.tenantId = payload.tenantId;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

module.exports = { requireAuth, JWT_SECRET };
```

- [ ] **Step 5: Criar src/api/auth.js**

Adicionar campo `email` e `senhaHash` ao schema Tenant antes:

```prisma
model Tenant {
  ...
  email     String?  @unique
  senhaHash String?  @map("senha_hash")
  ...
}
```

Depois rodar `npx prisma generate`.

Criar `src/api/auth.js`:

```javascript
// src/api/auth.js
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPrisma } = require('../infra/db');
const { JWT_SECRET } = require('./middleware/auth');

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    const prisma = getPrisma();
    const tenant = await prisma.tenant.findFirst({ where: { email } });

    if (!tenant || !tenant.ativo) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const valid = await bcrypt.compare(senha, tenant.senhaHash || '');
    if (!valid) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const token = jwt.sign({ tenantId: tenant.id }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token });
  } catch (err) {
    console.error('[auth/login]', err.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
```

- [ ] **Step 6: Rodar para ver passar**

```bash
npx jest tests/api-auth.test.js --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/api/ tests/api-auth.test.js package.json package-lock.json prisma/schema.prisma
git commit -m "feat: add JWT auth middleware and login endpoint"
```

---

## Task 4: API de leads com SLA calculado

**Files:**
- Create: `src/api/leads.js`
- Create: `tests/api-leads.test.js`

- [ ] **Step 1: Escrever testes**

Criar `tests/api-leads.test.js`:

```javascript
const request = require('supertest');
const express = require('express');

jest.mock('../src/api/middleware/auth', () => ({
  requireAuth: (req, res, next) => { req.tenantId = 'tenant-1'; next(); },
  JWT_SECRET: 'test',
}));

jest.mock('../src/infra/db', () => ({
  getPrisma: () => ({
    tenant: {
      findUnique: jest.fn(async () => ({
        id: 'tenant-1',
        slaMinutes: 15,
        ticketMedio: 1000,
        taxaConversao: 0.2,
      })),
    },
    lead: {
      findMany: jest.fn(async () => [
        {
          id: 'lead-1',
          tenantId: 'tenant-1',
          nome: 'João',
          telefone: '5511999',
          score: 7,
          prioridade: 'QUENTE',
          status: 'novo',
          criadoEm: new Date(Date.now() - 20 * 60 * 1000), // 20 min atrás
          scoreBreakdown: { urgencia: 3 },
          messages: [],
        },
      ]),
      findUnique: jest.fn(async ({ where }) => ({
        id: where.id,
        tenantId: 'tenant-1',
        nome: 'João',
        telefone: '5511999',
        score: 7,
        prioridade: 'QUENTE',
        status: 'novo',
        criadoEm: new Date(Date.now() - 20 * 60 * 1000),
        scoreBreakdown: { urgencia: 3 },
        messages: [{ id: 'msg-1', direcao: 'in', conteudo: 'oi', estado: 'start', criadoEm: new Date() }],
      })),
      update: jest.fn(async ({ data }) => ({ id: 'lead-1', ...data })),
    },
  }),
}));

const leadsRouter = require('../src/api/leads');
const app = express();
app.use(express.json());
app.use('/api/leads', leadsRouter);

describe('GET /api/leads', () => {
  test('retorna lista com sla_status calculado', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(200);
    expect(res.body.leads).toHaveLength(1);
    expect(res.body.leads[0].slaStatus).toBeDefined();
    expect(['ok', 'atencao', 'atrasado']).toContain(res.body.leads[0].slaStatus);
  });

  test('retorna leads ordenados: atrasados primeiro', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(200);
    expect(res.body.leads[0].prioridade).toBeDefined();
  });
});

describe('GET /api/leads/:id', () => {
  test('retorna detalhe com mensagens', async () => {
    const res = await request(app).get('/api/leads/lead-1');
    expect(res.status).toBe(200);
    expect(res.body.messages).toBeDefined();
    expect(res.body.slaStatus).toBeDefined();
    expect(res.body.scoreBreakdown).toBeDefined();
  });
});

describe('PATCH /api/leads/:id/status', () => {
  test('atualiza status do lead', async () => {
    const res = await request(app)
      .patch('/api/leads/lead-1/status')
      .send({ status: 'em_atendimento' });
    expect(res.status).toBe(200);
  });

  test('rejeita status inválido', async () => {
    const res = await request(app)
      .patch('/api/leads/lead-1/status')
      .send({ status: 'invalido' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
npx jest tests/api-leads.test.js --no-coverage
```

- [ ] **Step 3: Criar src/api/leads.js**

```javascript
// src/api/leads.js
const { Router } = require('express');
const { getPrisma } = require('../infra/db');
const { requireAuth } = require('./middleware/auth');

const router = Router();
const VALID_STATUSES = ['novo', 'em_atendimento', 'finalizado'];

function calcSlaStatus(criadoEm, slaMinutes) {
  const minutesElapsed = (Date.now() - new Date(criadoEm).getTime()) / 60000;
  if (minutesElapsed >= slaMinutes) return 'atrasado';
  if (minutesElapsed >= slaMinutes * 0.7) return 'atencao';
  return 'ok';
}

function enrichLead(lead, slaMinutes) {
  return {
    ...lead,
    slaStatus: calcSlaStatus(lead.criadoEm, slaMinutes),
    minutosEspera: Math.floor((Date.now() - new Date(lead.criadoEm).getTime()) / 60000),
  };
}

function sortLeads(leads) {
  const order = { atrasado: 0, atencao: 1, ok: 2 };
  const prio = { QUENTE: 0, MEDIO: 1, FRIO: 2 };
  return leads.sort((a, b) => {
    if (order[a.slaStatus] !== order[b.slaStatus]) return order[a.slaStatus] - order[b.slaStatus];
    if (prio[a.prioridade] !== prio[b.prioridade]) return prio[a.prioridade] - prio[b.prioridade];
    return new Date(b.criadoEm) - new Date(a.criadoEm);
  });
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const prisma = getPrisma();
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId } });
    const { prioridade, status } = req.query;

    const where = { tenantId: req.tenantId };
    if (prioridade) where.prioridade = prioridade;
    if (status) where.status = status;

    const leads = await prisma.lead.findMany({ where, include: { messages: false } });
    const enriched = sortLeads(leads.map(l => enrichLead(l, tenant.slaMinutes)));

    return res.json({ leads: enriched });
  } catch (err) {
    console.error('[leads/list]', err.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const prisma = getPrisma();
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId } });
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: { messages: { orderBy: { criadoEm: 'asc' } } },
    });

    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });

    return res.json(enrichLead(lead, tenant.slaMinutes));
  } catch (err) {
    console.error('[leads/detail]', err.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use: ${VALID_STATUSES.join(', ')}` });
    }

    const prisma = getPrisma();
    const lead = await prisma.lead.update({
      where: { id: req.params.id, tenantId: req.tenantId },
      data: { status },
    });

    return res.json(lead);
  } catch (err) {
    console.error('[leads/status]', err.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
```

- [ ] **Step 4: Rodar para ver passar**

```bash
npx jest tests/api-leads.test.js --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/leads.js tests/api-leads.test.js
git commit -m "feat: add leads API with SLA status calculation"
```

---

## Task 5: API de métricas (financeiro + funil de abandono)

**Files:**
- Create: `src/api/metrics.js`
- Create: `tests/api-metrics.test.js`

- [ ] **Step 1: Escrever testes**

Criar `tests/api-metrics.test.js`:

```javascript
const request = require('supertest');
const express = require('express');

jest.mock('../src/api/middleware/auth', () => ({
  requireAuth: (req, res, next) => { req.tenantId = 'tenant-1'; next(); },
  JWT_SECRET: 'test',
}));

const hoje = new Date();
hoje.setHours(0, 0, 0, 0);

jest.mock('../src/infra/db', () => ({
  getPrisma: () => ({
    tenant: {
      findUnique: jest.fn(async () => ({
        slaMinutes: 15,
        ticketMedio: { toNumber: () => 1000 },
        taxaConversao: { toNumber: () => 0.2 },
      })),
    },
    lead: {
      count: jest.fn(async ({ where }) => {
        if (where && where.status === 'finalizado') return 3;
        return 12;
      }),
    },
    event: {
      groupBy: jest.fn(async () => [
        { step: 'trabalho_status', _count: { id: 8 } },
        { step: 'coleta_nome', _count: { id: 5 } },
      ]),
    },
  }),
}));

const metricsRouter = require('../src/api/metrics');
const app = express();
app.use(express.json());
app.use('/api', metricsRouter);

describe('GET /api/metrics', () => {
  test('retorna métricas com potencial e em_risco', async () => {
    const res = await request(app).get('/api/metrics');
    expect(res.status).toBe(200);
    expect(res.body.hoje).toBeDefined();
    expect(res.body.potencial).toBeDefined();
    expect(res.body.emRisco).toBeDefined();
    expect(res.body.atrasados).toBeDefined();
  });
});

describe('GET /api/funil', () => {
  test('retorna abandono por step', async () => {
    const res = await request(app).get('/api/funil');
    expect(res.status).toBe(200);
    expect(res.body.abandonoPorStep).toBeDefined();
    expect(Array.isArray(res.body.abandonoPorStep)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
npx jest tests/api-metrics.test.js --no-coverage
```

- [ ] **Step 3: Criar src/api/metrics.js**

```javascript
// src/api/metrics.js
const { Router } = require('express');
const { getPrisma } = require('../infra/db');
const { requireAuth } = require('./middleware/auth');

const router = Router();

function calcSlaStatus(criadoEm, slaMinutes) {
  const minutesElapsed = (Date.now() - new Date(criadoEm).getTime()) / 60000;
  return minutesElapsed >= slaMinutes;
}

router.get('/metrics', requireAuth, async (req, res) => {
  try {
    const prisma = getPrisma();
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId } });

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const [totalHoje, finalizados, quentes] = await Promise.all([
      prisma.lead.count({ where: { tenantId: req.tenantId, criadoEm: { gte: hoje } } }),
      prisma.lead.count({ where: { tenantId: req.tenantId, status: 'finalizado', criadoEm: { gte: hoje } } }),
      prisma.lead.count({ where: { tenantId: req.tenantId, prioridade: 'QUENTE', status: 'novo' } }),
    ]);

    // Leads atrasados: buscar novos e calcular SLA
    const leadsNovos = await prisma.lead.findMany({
      where: { tenantId: req.tenantId, status: 'novo' },
      select: { criadoEm: true },
    });
    const atrasados = leadsNovos.filter(l => calcSlaStatus(l.criadoEm, tenant.slaMinutes)).length;

    const ticketMedio = typeof tenant.ticketMedio === 'object' ? tenant.ticketMedio.toNumber() : Number(tenant.ticketMedio);
    const taxaConversao = typeof tenant.taxaConversao === 'object' ? tenant.taxaConversao.toNumber() : Number(tenant.taxaConversao);
    const valorLead = ticketMedio * taxaConversao;

    return res.json({
      hoje: totalHoje,
      finalizados,
      quentes,
      atrasados,
      potencial: +(totalHoje * valorLead).toFixed(2),
      emRisco: +(atrasados * valorLead).toFixed(2),
      slaMinutes: tenant.slaMinutes,
    });
  } catch (err) {
    console.error('[metrics]', err.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

router.get('/funil', requireAuth, async (req, res) => {
  try {
    const prisma = getPrisma();

    const abandonoPorStep = await prisma.event.groupBy({
      by: ['step'],
      where: { tenantId: req.tenantId, event: 'abandoned', step: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return res.json({
      abandonoPorStep: abandonoPorStep.map(r => ({
        step: r.step,
        quantidade: r._count.id,
      })),
    });
  } catch (err) {
    console.error('[funil]', err.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
```

- [ ] **Step 4: Rodar para ver passar**

```bash
npx jest tests/api-metrics.test.js --no-coverage
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/metrics.js tests/api-metrics.test.js
git commit -m "feat: add metrics API with financial impact and funnel abandonment"
```

---

## Task 6: Socket.io — push em tempo real

**Files:**
- Create: `src/realtime/socket.js`
- Modify: `server.js`

- [ ] **Step 1: Criar src/realtime/socket.js**

```javascript
// src/realtime/socket.js
const { Server } = require('socket.io');

let _io;

function initSocket(httpServer) {
  _io = new Server(httpServer, {
    cors: { origin: process.env.DASHBOARD_URL || 'http://localhost:5173' },
  });

  _io.on('connection', (socket) => {
    const { tenantId } = socket.handshake.auth;
    if (tenantId) {
      socket.join(`tenant:${tenantId}`);
    }
  });

  return _io;
}

function emitToTenant(tenantId, event, data) {
  if (_io) {
    _io.to(`tenant:${tenantId}`).emit(event, data);
  }
}

module.exports = { initSocket, emitToTenant };
```

- [ ] **Step 2: Modificar server.js para usar http + socket.io**

Em `server.js`, no início após os requires existentes, adicionar:

```javascript
const http = require('http');
const { initSocket } = require('./src/realtime/socket');
```

Substituir `app.listen(PORT, ...)` por:

```javascript
const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Storage adapter: ${process.env.STORAGE_ADAPTER || 'memory'}`);
});
```

- [ ] **Step 3: Verificar sintaxe**

```bash
node --check server.js && echo "ok"
```

- [ ] **Step 4: Commit**

```bash
git add src/realtime/socket.js server.js
git commit -m "feat: add Socket.io for real-time dashboard push"
```

---

## Task 7: Montar rotas API no server.js

**Files:**
- Modify: `server.js`
- Create: `src/api/tenant.js`

- [ ] **Step 1: Criar src/api/tenant.js**

```javascript
// src/api/tenant.js
const { Router } = require('express');
const { getPrisma } = require('../infra/db');
const { requireAuth } = require('./middleware/auth');

const router = Router();

router.get('/config', requireAuth, async (req, res) => {
  try {
    const prisma = getPrisma();
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: { slaMinutes: true, ticketMedio: true, taxaConversao: true, nome: true },
    });
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado.' });
    return res.json(tenant);
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

router.patch('/config', requireAuth, async (req, res) => {
  try {
    const { slaMinutes, ticketMedio, taxaConversao } = req.body;
    const data = {};
    if (slaMinutes !== undefined) data.slaMinutes = Number(slaMinutes);
    if (ticketMedio !== undefined) data.ticketMedio = Number(ticketMedio);
    if (taxaConversao !== undefined) data.taxaConversao = Number(taxaConversao);

    const prisma = getPrisma();
    const tenant = await prisma.tenant.update({ where: { id: req.tenantId }, data });
    return res.json(tenant);
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Registrar rotas no server.js**

Após os imports no topo de `server.js`, adicionar:

```javascript
const authRouter = require('./src/api/auth');
const leadsRouter = require('./src/api/leads');
const metricsRouter = require('./src/api/metrics');
const tenantRouter = require('./src/api/tenant');
```

Antes de `app.post('/webhook', ...)`, adicionar:

```javascript
// API REST (dashboard)
app.use('/api/auth', authRouter);
app.use('/api/leads', leadsRouter);
app.use('/api', metricsRouter);
app.use('/api/tenant', tenantRouter);
```

- [ ] **Step 3: Verificar sintaxe e testes**

```bash
node --check server.js && echo "ok"
npx jest --no-coverage 2>&1 | tail -5
```

Expected: sem erros, todos os testes passando.

- [ ] **Step 4: Commit**

```bash
git add server.js src/api/tenant.js
git commit -m "feat: register API routes in server.js"
```

---

## Task 8: Frontend React — scaffold + KpiBar + LeadInbox

**Files:**
- Create: `dashboard/` — projeto Vite completo

- [ ] **Step 1: Criar projeto Vite**

```bash
cd /Users/Jads/Downloads/bro.cco
npm create vite@latest dashboard -- --template react
cd dashboard
npm install
npm install @tanstack/react-query socket.io-client axios
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 2: Configurar Tailwind**

Em `dashboard/tailwind.config.js`:
```javascript
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

Em `dashboard/src/index.css`, substituir pelo:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Criar dashboard/src/lib/api.js**

```javascript
// dashboard/src/lib/api.js
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function login(email, senha) {
  const res = await api.post('/api/auth/login', { email, senha });
  return res.data;
}

export async function fetchLeads(params = {}) {
  const res = await api.get('/api/leads', { params });
  return res.data;
}

export async function fetchLeadDetail(id) {
  const res = await api.get(`/api/leads/${id}`);
  return res.data;
}

export async function updateLeadStatus(id, status) {
  const res = await api.patch(`/api/leads/${id}/status`, { status });
  return res.data;
}

export async function fetchMetrics() {
  const res = await api.get('/api/metrics');
  return res.data;
}

export default api;
```

- [ ] **Step 4: Criar dashboard/src/lib/socket.js**

```javascript
// dashboard/src/lib/socket.js
import { io } from 'socket.io-client';

let _socket;

export function getSocket(tenantId) {
  if (!_socket) {
    _socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3000', {
      auth: { tenantId },
    });
  }
  return _socket;
}

export function disconnectSocket() {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}
```

- [ ] **Step 5: Criar KpiBar.jsx**

Criar `dashboard/src/components/KpiBar.jsx`:

```jsx
// dashboard/src/components/KpiBar.jsx
export default function KpiBar({ metrics }) {
  if (!metrics) return null;
  const { hoje, quentes, atrasados, potencial, emRisco, slaMinutes } = metrics;

  return (
    <div className="space-y-3">
      {atrasados > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-red-700 font-medium">
            🔴 {atrasados} lead{atrasados > 1 ? 's' : ''} sem resposta após SLA de {slaMinutes} min
          </span>
          <span className="text-red-600 font-bold">💸 R$ {emRisco?.toLocaleString('pt-BR')} em risco</span>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Leads hoje" value={hoje} />
        <Card label="Quentes 🔥" value={quentes} highlight />
        <Card label="💰 Potencial" value={`R$ ${potencial?.toLocaleString('pt-BR')}`} />
        <Card label="SLA" value={`${slaMinutes} min`} />
      </div>
    </div>
  );
}

function Card({ label, value, highlight }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${highlight ? 'text-orange-600' : 'text-gray-900'}`}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 6: Criar LeadInbox.jsx**

Criar `dashboard/src/components/LeadInbox.jsx`:

```jsx
// dashboard/src/components/LeadInbox.jsx
import { useState } from 'react';

const SLA_ICON = { ok: '🟢', atencao: '🟡', atrasado: '🔴' };
const PRIO_ICON = { QUENTE: '🔥', MEDIO: '🟡', FRIO: '⚪' };
const FILTERS = [
  { label: '🔥 Quentes', value: 'QUENTE' },
  { label: 'Todos', value: '' },
  { label: 'Não respondidos', value: 'novo' },
];

export default function LeadInbox({ leads, onSelect }) {
  const [filter, setFilter] = useState('');

  const filtered = leads?.filter(l => {
    if (filter === 'QUENTE') return l.prioridade === 'QUENTE';
    if (filter === 'novo') return l.status === 'novo';
    return true;
  }) ?? [];

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center text-gray-400 py-8">Nenhum lead encontrado.</div>
        )}
        {filtered.map(lead => (
          <LeadRow key={lead.id} lead={lead} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function LeadRow({ lead, onSelect }) {
  return (
    <button
      onClick={() => onSelect(lead)}
      className="w-full text-left border border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between"
    >
      <div className="flex items-center gap-3">
        <span className="text-lg">{PRIO_ICON[lead.prioridade]}</span>
        <div>
          <div className="font-medium text-gray-900">{lead.nome || lead.telefone}</div>
          <div className="text-sm text-gray-500">{lead.fluxo || '—'} · score {lead.score}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span>{SLA_ICON[lead.slaStatus]} {lead.minutosEspera} min</span>
        <span className="text-gray-400">›</span>
      </div>
    </button>
  );
}
```

- [ ] **Step 7: Commit**

```bash
cd /Users/Jads/Downloads/bro.cco
git add dashboard/
git commit -m "feat: scaffold React dashboard with KpiBar and LeadInbox"
```

---

## Task 9: Frontend — LeadDetail + Home page + Login

**Files:**
- Create: `dashboard/src/components/LeadDetail.jsx`
- Create: `dashboard/src/pages/Login.jsx`
- Create: `dashboard/src/pages/Home.jsx`
- Create/Modify: `dashboard/src/App.jsx`

- [ ] **Step 1: Criar LeadDetail.jsx**

```jsx
// dashboard/src/components/LeadDetail.jsx
import { useState } from 'react';
import { updateLeadStatus } from '../lib/api';

const SLA_LABEL = { ok: '🟢 No prazo', atencao: '🟡 Atenção', atrasado: '🔴 Atrasado' };

export default function LeadDetail({ lead, onBack, onStatusChange }) {
  const [loading, setLoading] = useState(false);

  async function handleStatus(status) {
    setLoading(true);
    try {
      await updateLeadStatus(lead.id, status);
      onStatusChange?.();
    } finally {
      setLoading(false);
    }
  }

  if (!lead) return null;

  const breakdown = lead.scoreBreakdown
    ? Object.entries(lead.scoreBreakdown)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k} +${v}`)
        .join(' · ')
    : null;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800">
        ← voltar
      </button>

      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{lead.nome || lead.telefone}</h2>
            <div className="text-sm text-gray-500 mt-0.5">
              {lead.prioridade === 'QUENTE' ? '🔥' : lead.prioridade === 'MEDIO' ? '🟡' : '⚪'} {lead.prioridade}
              {' · '}score {lead.score}
              {' · '}
              {SLA_LABEL[lead.slaStatus]} ({lead.minutosEspera} min)
            </div>
          </div>
          <div className="text-sm text-gray-400">{lead.telefone}</div>
        </div>

        {breakdown && (
          <div className="text-sm bg-orange-50 rounded px-3 py-2 text-orange-700 mb-3">
            Por que {lead.prioridade}: {breakdown}
          </div>
        )}

        {lead.messages?.length > 0 && (
          <div className="space-y-2 max-h-80 overflow-y-auto border-t pt-3">
            {lead.messages.map(msg => (
              <div key={msg.id} className={`text-sm ${msg.direcao === 'out' ? 'text-right' : ''}`}>
                <span className={`inline-block rounded px-2 py-1 ${
                  msg.direcao === 'out' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {msg.conteudo}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => handleStatus('em_atendimento')}
          disabled={loading || lead.status === 'em_atendimento'}
          className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          Em atendimento
        </button>
        <button
          onClick={() => handleStatus('finalizado')}
          disabled={loading || lead.status === 'finalizado'}
          className="flex-1 bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          ✓ Marcar como atendido
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar Login.jsx**

```jsx
// dashboard/src/pages/Login.jsx
import { useState } from 'react';
import { login } from '../lib/api';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = await login(email, senha);
      localStorage.setItem('token', token);
      onLogin(token);
    } catch {
      setError('Email ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Entrar</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white rounded-lg px-4 py-2 font-medium hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Criar Home.jsx**

```jsx
// dashboard/src/pages/Home.jsx
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLeads, fetchMetrics } from '../lib/api';
import { getSocket } from '../lib/socket';
import KpiBar from '../components/KpiBar';
import LeadInbox from '../components/LeadInbox';
import LeadDetail from '../components/LeadDetail';

export default function Home({ tenantId }) {
  const [selectedLead, setSelectedLead] = useState(null);
  const queryClient = useQueryClient();

  const { data: metricsData } = useQuery({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    refetchInterval: 30000,
  });

  const { data: leadsData } = useQuery({
    queryKey: ['leads'],
    queryFn: () => fetchLeads(),
    refetchInterval: 15000,
  });

  // Socket.io: atualiza em tempo real
  useEffect(() => {
    const socket = getSocket(tenantId);
    socket.on('lead:new', () => queryClient.invalidateQueries(['leads', 'metrics']));
    socket.on('lead:updated', () => queryClient.invalidateQueries(['leads', 'metrics']));
    socket.on('metrics:update', () => queryClient.invalidateQueries(['metrics']));
    return () => {
      socket.off('lead:new');
      socket.off('lead:updated');
      socket.off('metrics:update');
    };
  }, [tenantId, queryClient]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <KpiBar metrics={metricsData} />

        {selectedLead ? (
          <LeadDetail
            lead={selectedLead}
            onBack={() => setSelectedLead(null)}
            onStatusChange={() => {
              queryClient.invalidateQueries(['leads', 'metrics']);
              setSelectedLead(null);
            }}
          />
        ) : (
          <LeadInbox leads={leadsData?.leads} onSelect={setSelectedLead} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Criar App.jsx**

```jsx
// dashboard/src/App.jsx
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Login from './pages/Login';
import Home from './pages/Home';

const queryClient = new QueryClient();

function parseJwtTenantId(token) {
  try {
    return JSON.parse(atob(token.split('.')[1])).tenantId;
  } catch {
    return null;
  }
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const tenantId = token ? parseJwtTenantId(token) : null;

  function handleLogin(newToken) {
    setToken(newToken);
  }

  if (!token || !tenantId) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Home tenantId={tenantId} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 5: Criar dashboard/.env.example**

```bash
cat > dashboard/.env.example << 'EOF'
VITE_API_URL=http://localhost:3000
EOF
cp dashboard/.env.example dashboard/.env
```

- [ ] **Step 6: Verificar build do frontend**

```bash
cd dashboard && npm run build 2>&1 | tail -10
```

Expected: build sem erros.

- [ ] **Step 7: Commit**

```bash
cd /Users/Jads/Downloads/bro.cco
git add dashboard/
git commit -m "feat: add Login, Home, LeadDetail pages with real-time Socket.io"
```

---

## Task 10: Suite completa + verificação final

**Files:** nenhum

- [ ] **Step 1: Rodar todos os testes do backend**

```bash
cd /Users/Jads/Downloads/bro.cco && npx jest --no-coverage --runInBand 2>&1 | tail -10
```

Expected: todos passando.

- [ ] **Step 2: Verificar build do frontend**

```bash
cd dashboard && npm run build 2>&1 | tail -5
```

Expected: sem erros.

- [ ] **Step 3: Verificar sintaxe do server.js**

```bash
cd /Users/Jads/Downloads/bro.cco && node --check server.js && echo "ok"
```

- [ ] **Step 4: Commit final se necessário**

```bash
git add .
git commit -m "feat: Fase 2 completa — Dashboard operacional com SLA + financeiro + Socket.io"
```

---

## Verificação de cobertura do spec

| Requisito do spec | Task que implementa |
|---|---|
| sla_minutes, ticket_medio, taxa_conversao no tenant | Task 1 |
| Tabela events para tracking | Task 1 |
| emitEvent (entered_step, abandoned, completed_flow) | Task 2 |
| JWT auth + login endpoint | Task 3 |
| GET /api/leads com sla_status calculado | Task 4 |
| Ordenação: atrasado → prioridade → recente | Task 4 |
| GET /api/leads/:id com mensagens + score_breakdown | Task 4 |
| PATCH /api/leads/:id/status | Task 4 |
| GET /api/metrics (potencial, emRisco, atrasados) | Task 5 |
| GET /api/funil (abandono por step) | Task 5 |
| Socket.io push em tempo real | Task 6 |
| Camada 1: KpiBar com financeiro + SLA | Task 8 |
| Camada 2: LeadInbox com filtros + ordenação por SLA | Task 8, 9 |
| Detalhe: conversa + score explicado + ações | Task 9 |
| Login sem fricção | Task 9 |
| Configuração do tenant (SLA, financeiro) | Task 7 |
