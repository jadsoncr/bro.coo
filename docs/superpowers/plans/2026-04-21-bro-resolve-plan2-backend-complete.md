# BRO Resolve — Plan 2: Complete Backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete backend for BRO Resolve: Master/Owner/Operator API routes with role enforcement, SLA engine, financial aggregation, realtime Socket.io events, flow cache, and mandatory conversion form.

**Architecture:** All routes are separated into `src/routes/` files (operator.js, owner.js, master.js). SLA calculation is a pure function in `src/sla/service.js`. Financial aggregation lives in `src/financial/service.js`. Socket.io events are emitted from a central `src/realtime/emitter.js` so any service can emit without importing socket directly.

**Tech Stack:** Node.js, Express 5, Prisma v5, Socket.io, node-cron

**Pre-requisite:** Plan 1b must be complete (JWT, req.tenantId, indices, AdminUser model).

---

## File Map

```
Create:
  src/routes/operator.js         ← OPERATOR routes (inbox, chat, status, classify, convert)
  src/routes/owner.js            ← OWNER routes (dashboard, alerts, queues, casos)
  src/routes/master.js           ← MASTER routes (tenants, global metrics, audit log)
  src/sla/service.js             ← SLA calculations (isLeadAtrasado, isCasoAtrasado, getQueues)
  src/financial/service.js       ← Financial aggregation (receita real, em aberto, conversão)
  src/realtime/emitter.js        ← Central event emitter (wraps Socket.io emitToTenant)
  src/casos/service.js           ← Caso CRUD (createCaso, updateCaso, getCaso, closeCaso)
  tests/sla/service.test.js
  tests/financial/service.test.js
  tests/casos/service.test.js
  tests/routes/operator.test.js
  tests/routes/owner.test.js
Modify:
  server.js                      ← mount new route files
  src/realtime/socket.js         ← expose getIO() for emitter
```

---

### Task 1: Realtime emitter

**Files:**
- Modify: `src/realtime/socket.js`
- Create: `src/realtime/emitter.js`

- [ ] **Step 1: Expose getIO in socket.js**

Replace `src/realtime/socket.js`:

```js
const { Server } = require('socket.io');
let _io;

function initSocket(httpServer) {
  _io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });
  _io.on('connection', (socket) => {
    socket.on('join:tenant', (tenantId) => socket.join(`tenant:${tenantId}`));
    socket.on('join:operator', (userId) => socket.join(`operator:${userId}`));
  });
  return _io;
}

function getIO() { return _io; }

function emitToTenant(tenantId, event, data) {
  if (_io) _io.to(`tenant:${tenantId}`).emit(event, data);
}

module.exports = { initSocket, getIO, emitToTenant };
```

- [ ] **Step 2: Create src/realtime/emitter.js**

```js
const { emitToTenant } = require('./socket');

const EVENTS = {
  LEAD_NEW:         'lead:new',
  LEAD_UPDATED:     'lead:updated',
  LEAD_CLASSIFIED:  'lead:classified',
  LEAD_CONVERTED:   'lead:converted',
  LEAD_LOST:        'lead:lost',
  SLA_ALERT:        'sla:alert',
  CASO_UPDATED:     'caso:updated',
};

function emitLeadNew(tenantId, lead) {
  emitToTenant(tenantId, EVENTS.LEAD_NEW, { lead });
}

function emitLeadUpdated(tenantId, lead) {
  emitToTenant(tenantId, EVENTS.LEAD_UPDATED, { lead });
}

function emitLeadConverted(tenantId, leadId, caso) {
  emitToTenant(tenantId, EVENTS.LEAD_CONVERTED, { leadId, caso });
}

function emitLeadLost(tenantId, leadId, motivo) {
  emitToTenant(tenantId, EVENTS.LEAD_LOST, { leadId, motivo });
}

function emitSlaAlert(tenantId, type, items) {
  emitToTenant(tenantId, EVENTS.SLA_ALERT, { type, count: items.length, items });
}

function emitCasoUpdated(tenantId, caso) {
  emitToTenant(tenantId, EVENTS.CASO_UPDATED, { caso });
}

module.exports = {
  EVENTS,
  emitLeadNew,
  emitLeadUpdated,
  emitLeadConverted,
  emitLeadLost,
  emitSlaAlert,
  emitCasoUpdated,
};
```

- [ ] **Step 3: Commit**

```bash
git add src/realtime/
git commit -m "feat: add realtime emitter with typed events (lead, sla, caso)"
```

---

### Task 2: SLA service

**Files:**
- Create: `src/sla/service.js`
- Test: `tests/sla/service.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/sla/service.test.js`:

```js
const { minutesSince, isLeadAtrasado, isCasoAtrasado, calcSlaStatus, buildQueues } = require('../../src/sla/service');

const now = new Date('2026-01-01T12:00:00Z');

test('minutesSince calculates correctly', () => {
  const past = new Date('2026-01-01T11:00:00Z'); // 60 min ago
  expect(minutesSince(past, now)).toBe(60);
});

test('isLeadAtrasado returns true when elapsed > slaLeadMinutes and no first response', () => {
  const lead = {
    criadoEm: new Date('2026-01-01T10:00:00Z'), // 120 min ago
    primeiraRespostaEm: null,
    status: 'em_qualificacao',
  };
  expect(isLeadAtrasado(lead, { slaLeadMinutes: 60 }, now)).toBe(true);
});

test('isLeadAtrasado returns false when first response exists', () => {
  const lead = {
    criadoEm: new Date('2026-01-01T10:00:00Z'),
    primeiraRespostaEm: new Date('2026-01-01T10:30:00Z'),
    status: 'em_atendimento',
  };
  expect(isLeadAtrasado(lead, { slaLeadMinutes: 60 }, now)).toBe(false);
});

test('isCasoAtrasado returns true when no update in slaContratoHoras', () => {
  const caso = {
    atualizadoEm: new Date('2026-01-01T08:00:00Z'), // 4h ago
    status: 'em_andamento',
    dataRecebimento: null,
  };
  expect(isCasoAtrasado(caso, { slaContratoHoras: 2 }, now)).toBe(true);
});

test('calcSlaStatus returns correct status', () => {
  const lead60ago = { criadoEm: new Date('2026-01-01T11:00:00Z'), primeiraRespostaEm: null, status: 'em_qualificacao' };
  const tenant = { slaLeadMinutes: 30 };
  expect(calcSlaStatus(lead60ago, tenant, now)).toBe('atrasado');
});

test('buildQueues separates leads into correct buckets', () => {
  const leads = [
    { id: '1', status: 'em_qualificacao', primeiraRespostaEm: null, criadoEm: new Date('2026-01-01T10:00:00Z') },
    { id: '2', status: 'em_atendimento', primeiraRespostaEm: new Date('2026-01-01T11:30:00Z'), atualizadoEm: new Date('2026-01-01T11:00:00Z'), criadoEm: new Date('2026-01-01T10:00:00Z') },
    { id: '3', status: 'aguardando_retorno', primeiraRespostaEm: new Date('2026-01-01T10:30:00Z'), atualizadoEm: new Date('2026-01-01T09:00:00Z'), criadoEm: new Date('2026-01-01T08:00:00Z') },
  ];
  const tenant = { slaLeadMinutes: 30, slaContratoHoras: 2 };
  const queues = buildQueues(leads, [], tenant, now);
  expect(queues.semResposta).toBeDefined();
  expect(queues.emAtendimento).toBeDefined();
  expect(queues.aguardandoRetorno).toBeDefined();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/sla/
```

Expected: FAIL

- [ ] **Step 3: Implement src/sla/service.js**

```js
function minutesSince(date, now = new Date()) {
  if (!date) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / 60000));
}

function hoursSince(date, now = new Date()) {
  if (!date) return 0;
  return Math.max(0, (now.getTime() - new Date(date).getTime()) / 3600000);
}

function isLeadAtrasado(lead, tenant, now = new Date()) {
  if (lead.primeiraRespostaEm) return false;
  if (!['em_qualificacao', 'em_atendimento'].includes(lead.status)) return false;
  return minutesSince(lead.criadoEm, now) > (tenant.slaLeadMinutes || 60);
}

function isCasoAtrasado(caso, tenant, now = new Date()) {
  if (caso.dataRecebimento) return false; // finalizado
  if (caso.status === 'finalizado') return false;
  return hoursSince(caso.atualizadoEm, now) > (tenant.slaContratoHoras || 48);
}

function calcSlaStatus(lead, tenant, now = new Date()) {
  if (lead.primeiraRespostaEm) return 'respondido';
  const elapsed = minutesSince(lead.criadoEm, now);
  const limit = tenant.slaLeadMinutes || 60;
  if (elapsed >= limit) return 'atrasado';
  if (elapsed >= limit * 0.7) return 'atencao';
  return 'dentro';
}

function buildQueues(leads, casos, tenant, now = new Date()) {
  return {
    semResposta: leads.filter(l =>
      !l.primeiraRespostaEm &&
      ['em_qualificacao', 'em_atendimento'].includes(l.status) &&
      minutesSince(l.criadoEm, now) > (tenant.slaLeadMinutes || 60)
    ).sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm)),

    emAtendimento: leads.filter(l => l.status === 'em_atendimento')
      .sort((a, b) => (b.score || 0) - (a.score || 0)),

    aguardandoRetorno: leads.filter(l => l.status === 'aguardando_retorno')
      .sort((a, b) => new Date(a.atualizadoEm || a.criadoEm) - new Date(b.atualizadoEm || b.criadoEm)),

    casosParados: casos.filter(c => isCasoAtrasado(c, tenant, now))
      .sort((a, b) => new Date(a.atualizadoEm) - new Date(b.atualizadoEm)),
  };
}

module.exports = { minutesSince, hoursSince, isLeadAtrasado, isCasoAtrasado, calcSlaStatus, buildQueues };
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/sla/
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sla/ tests/sla/
git commit -m "feat: add SLA service (isLeadAtrasado, isCasoAtrasado, buildQueues)"
```

---

### Task 3: Caso service

**Files:**
- Create: `src/casos/service.js`
- Test: `tests/casos/service.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/casos/service.test.js`:

```js
const { validateConversao, buildReceitaReal, buildReceitaEmAberto } = require('../../src/casos/service');

test('validateConversao throws when tipoContrato missing', () => {
  expect(() => validateConversao({ valorEntrada: 1000 })).toThrow('tipoContrato');
});

test('validateConversao throws when entrada type has no valorEntrada', () => {
  expect(() => validateConversao({ tipoContrato: 'entrada', valorEntrada: null }))
    .toThrow('valorEntrada');
});

test('validateConversao throws when exito type has no percentualExito or valorCausa', () => {
  expect(() => validateConversao({ tipoContrato: 'exito', percentualExito: null, valorCausa: null }))
    .toThrow('percentualExito');
});

test('validateConversao passes for valid entrada + exito', () => {
  expect(() => validateConversao({
    tipoContrato: 'entrada_exito',
    valorEntrada: 1000,
    percentualExito: 30,
    valorCausa: 50000,
  })).not.toThrow();
});

test('buildReceitaReal sums only casos with valorRecebido + dataRecebimento', () => {
  const casos = [
    { valorConvertido: 1000, valorRecebido: 1000, dataRecebimento: new Date() },
    { valorConvertido: 2000, valorRecebido: null, dataRecebimento: null }, // not counted
    { valorConvertido: 500, valorRecebido: 500, dataRecebimento: new Date() },
  ];
  expect(buildReceitaReal(casos)).toBe(1500);
});

test('buildReceitaEmAberto sums only active casos without valorRecebido', () => {
  const casos = [
    { valorConvertido: null, valorEntrada: 1000, percentualExito: 30, valorCausa: 50000, valorRecebido: null, dataRecebimento: null, status: 'em_andamento' },
    { valorConvertido: 500, valorRecebido: 500, dataRecebimento: new Date(), status: 'finalizado' }, // not counted
  ];
  // 1000 entrada + (30/100 * 50000) = 1000 + 15000 = 16000
  expect(buildReceitaEmAberto(casos)).toBe(16000);
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/casos/
```

Expected: FAIL

- [ ] **Step 3: Implement src/casos/service.js**

```js
const { getPrisma } = require('../infra/db');
const crypto = require('crypto');

const VALID_TIPOS_CONTRATO = ['entrada', 'entrada_exito', 'exito', 'consulta', 'outro'];

function validateConversao(data) {
  if (!data.tipoContrato || !VALID_TIPOS_CONTRATO.includes(data.tipoContrato)) {
    throw new Error('tipoContrato é obrigatório e deve ser: ' + VALID_TIPOS_CONTRATO.join(', '));
  }
  if (['entrada', 'entrada_exito'].includes(data.tipoContrato) && !data.valorEntrada) {
    throw new Error('valorEntrada é obrigatório para este tipo de contrato');
  }
  if (['exito', 'entrada_exito'].includes(data.tipoContrato)) {
    if (!data.percentualExito) throw new Error('percentualExito é obrigatório para êxito');
    if (!data.valorCausa) throw new Error('valorCausa é obrigatório para êxito');
  }
  if (data.tipoContrato === 'consulta' && !data.valorConsulta) {
    throw new Error('valorConsulta é obrigatório para consulta');
  }
}

function buildReceitaReal(casos) {
  return casos
    .filter(c => c.valorRecebido != null && c.dataRecebimento != null)
    .reduce((sum, c) => sum + Number(c.valorConvertido || c.valorRecebido || 0), 0);
}

function estimarValorCaso(caso) {
  const entrada = Number(caso.valorEntrada || 0);
  const exito = caso.percentualExito && caso.valorCausa
    ? (Number(caso.percentualExito) / 100) * Number(caso.valorCausa)
    : 0;
  const consulta = Number(caso.valorConsulta || 0);
  return entrada + exito + consulta;
}

function buildReceitaEmAberto(casos) {
  return casos
    .filter(c => !c.valorRecebido && !c.dataRecebimento && c.status !== 'finalizado')
    .reduce((sum, c) => sum + estimarValorCaso(c), 0);
}

async function createCaso(tenantId, leadId, data) {
  validateConversao(data); // throws if invalid — mandatory fields enforced
  const prisma = getPrisma();

  // Update lead status to virou_cliente
  await prisma.lead.updateMany({
    where: { id: leadId, tenantId },
    data: { status: 'virou_cliente', primeiraRespostaEm: data.primeiraRespostaEm || undefined },
  });

  return prisma.caso.create({
    data: {
      id: crypto.randomUUID(),
      tenantId,
      leadId,
      origem: data.origem || null,
      segmento: data.segmento || null,
      tipoProcesso: data.tipoProcesso || null,
      tipoContrato: data.tipoContrato,
      status: 'em_andamento',
      valorEntrada: data.valorEntrada || null,
      percentualExito: data.percentualExito || null,
      valorCausa: data.valorCausa || null,
      valorConsulta: data.valorConsulta || null,
      currency: data.currency || 'BRL',
      valorConvertido: data.valorConvertido || null,
      exchangeRate: data.exchangeRate || null,
    },
  });
}

async function listCasos(tenantId, filters = {}) {
  const where = { tenantId };
  if (filters.status) where.status = filters.status;
  return getPrisma().caso.findMany({
    where,
    orderBy: { criadoEm: 'desc' },
    include: { lead: { select: { nome: true, telefone: true, segmento: true } } },
  });
}

async function getCaso(tenantId, casoId) {
  return getPrisma().caso.findFirst({
    where: { id: casoId, tenantId },
    include: { lead: true },
  });
}

async function closeCaso(tenantId, casoId, { valorRecebido, currency, exchangeRate, dataRecebimento }) {
  if (!valorRecebido) throw new Error('valorRecebido é obrigatório para fechar o caso');
  if (!dataRecebimento) throw new Error('dataRecebimento é obrigatório');

  const moedaBase = (await getPrisma().tenant.findUnique({ where: { id: tenantId }, select: { moedaBase: true } }))?.moedaBase || 'BRL';
  const rate = Number(exchangeRate || 1);
  const valorConvertido = Number(valorRecebido) * rate;

  return getPrisma().caso.update({
    where: { id: casoId },
    data: {
      valorRecebido,
      currency: currency || moedaBase,
      valorConvertido,
      exchangeRate: rate,
      dataRecebimento: new Date(dataRecebimento),
      status: 'finalizado',
    },
  });
}

module.exports = {
  validateConversao,
  buildReceitaReal,
  buildReceitaEmAberto,
  estimarValorCaso,
  createCaso,
  listCasos,
  getCaso,
  closeCaso,
  VALID_TIPOS_CONTRATO,
};
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/casos/
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/casos/ tests/casos/
git commit -m "feat: add caso service (validateConversao, buildReceitaReal, createCaso, closeCaso)"
```

---

### Task 4: Financial service

**Files:**
- Create: `src/financial/service.js`
- Test: `tests/financial/service.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/financial/service.test.js`:

```js
const { buildOwnerDashboard, getPeriodRange } = require('../../src/financial/service');

test('getPeriodRange returns correct range for "today"', () => {
  const now = new Date('2026-04-21T15:00:00Z');
  const { start, end } = getPeriodRange('today', now);
  expect(start.getDate()).toBe(21);
  expect(end.getDate()).toBe(21);
});

test('getPeriodRange returns correct range for "month"', () => {
  const now = new Date('2026-04-21T15:00:00Z');
  const { start, end } = getPeriodRange('month', now);
  expect(start.getDate()).toBe(1);
  expect(start.getMonth()).toBe(3); // April = 3
});

test('buildOwnerDashboard calculates correctly', () => {
  const tenant = { slaLeadMinutes: 60, slaContratoHoras: 48 };
  const now = new Date('2026-01-01T12:00:00Z');
  const leads = [
    { id: '1', status: 'virou_cliente', primeiraRespostaEm: new Date('2026-01-01T10:30:00Z'), criadoEm: new Date('2026-01-01T10:00:00Z'), atualizadoEm: new Date() },
    { id: '2', status: 'em_qualificacao', primeiraRespostaEm: null, criadoEm: new Date('2026-01-01T09:00:00Z'), atualizadoEm: new Date() },
    { id: '3', status: 'desistiu', primeiraRespostaEm: new Date('2026-01-01T10:10:00Z'), criadoEm: new Date('2026-01-01T10:00:00Z'), atualizadoEm: new Date() },
  ];
  const casos = [
    { valorRecebido: 1000, valorConvertido: 1000, dataRecebimento: now, status: 'finalizado', valorEntrada: 1000, percentualExito: null, valorCausa: null, atualizadoEm: now },
    { valorRecebido: null, dataRecebimento: null, status: 'em_andamento', valorEntrada: 500, percentualExito: 20, valorCausa: 10000, atualizadoEm: now },
  ];
  const result = buildOwnerDashboard({ tenant, leads, casos, now });
  expect(result.receitaRecebida).toBe(1000);
  expect(result.receitaEmAberto).toBe(2500); // 500 + 20% of 10000
  expect(result.conversao).toBeCloseTo(0.333, 2); // 1 of 3
  expect(result.leadsSemResposta).toBe(1); // lead 2 has no first response > 60min
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/financial/
```

Expected: FAIL

- [ ] **Step 3: Implement src/financial/service.js**

```js
const { getPrisma } = require('../infra/db');
const { buildReceitaReal, buildReceitaEmAberto, estimarValorCaso } = require('../casos/service');
const { isLeadAtrasado, minutesSince } = require('../sla/service');

function getPeriodRange(period, now = new Date()) {
  const start = new Date(now);
  const end = new Date(now);

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'week':
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'month':
    default:
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
  }

  return { start, end };
}

function buildOwnerDashboard({ tenant, leads, casos, now = new Date() }) {
  const receitaRecebida = buildReceitaReal(casos);
  const receitaEmAberto = buildReceitaEmAberto(casos);

  const leadsAtendidos = leads.filter(l => l.status !== 'em_qualificacao');
  const convertidos = leads.filter(l => l.status === 'virou_cliente');
  const conversao = leads.length > 0 ? convertidos.length / leads.length : 0;

  const leadsSemResposta = leads.filter(l => isLeadAtrasado(l, tenant, now)).length;

  const casosParados = casos.filter(c =>
    c.status !== 'finalizado' &&
    !c.dataRecebimento &&
    minutesSince(c.atualizadoEm, now) > (tenant.slaContratoHoras || 48) * 60
  );

  const temposResposta = leads
    .filter(l => l.primeiraRespostaEm)
    .map(l => minutesSince(l.criadoEm, new Date(l.primeiraRespostaEm)));

  const tempoMedioResposta = temposResposta.length > 0
    ? Math.round(temposResposta.reduce((a, b) => a + b, 0) / temposResposta.length)
    : null;

  const alertas = [];
  if (leadsSemResposta > 0) alertas.push({ tipo: 'leads_sem_resposta', count: leadsSemResposta });
  if (casosParados.length > 0) alertas.push({ tipo: 'contratos_parados', count: casosParados.length });
  if (conversao > 0 && conversao < 0.1) alertas.push({ tipo: 'queda_conversao', valor: conversao });

  return {
    receitaRecebida,
    receitaEmAberto,
    conversao,
    leadsSemResposta,
    casosParados: casosParados.length,
    tempoMedioResposta,
    alertas,
    totais: {
      leads: leads.length,
      convertidos: convertidos.length,
      casos: casos.length,
    },
  };
}

async function getOwnerDashboardData(tenantId, period = 'month', customRange = null) {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error('Tenant não encontrado');

  const now = new Date();
  const { start, end } = customRange || getPeriodRange(period, now);

  const [leads, casos] = await Promise.all([
    prisma.lead.findMany({ where: { tenantId, criadoEm: { gte: start, lte: end } } }),
    prisma.caso.findMany({ where: { tenantId, criadoEm: { gte: start, lte: end } } }),
  ]);

  return buildOwnerDashboard({ tenant, leads, casos, now });
}

module.exports = { getPeriodRange, buildOwnerDashboard, getOwnerDashboardData };
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/financial/
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/financial/ tests/financial/
git commit -m "feat: add financial service (buildOwnerDashboard, getPeriodRange, receita real vs em aberto)"
```

---

### Task 5: Operator routes

**Files:**
- Create: `src/routes/operator.js`
- Test: `tests/routes/operator.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/routes/operator.test.js`:

```js
// Unit test the route handlers directly (no HTTP server needed)
const { validateStatusChange } = require('../../src/routes/operator');

test('validateStatusChange throws when desistiu has no motivo', () => {
  expect(() => validateStatusChange('desistiu', null)).toThrow('Motivo obrigatório');
});

test('validateStatusChange passes when desistiu has motivo', () => {
  expect(() => validateStatusChange('desistiu', 'preco')).not.toThrow();
});

test('validateStatusChange throws for invalid status', () => {
  expect(() => validateStatusChange('invalid_status', null)).toThrow('Status inválido');
});

test('validateStatusChange passes for valid non-desistiu status', () => {
  expect(() => validateStatusChange('em_atendimento', null)).not.toThrow();
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/routes/operator.test.js
```

Expected: FAIL

- [ ] **Step 3: Create src/routes/operator.js**

```js
const { Router } = require('express');
const { attachTenantFromJWT, requireRole } = require('../auth/middleware');
const { listLeads, getLead, updateStatus, classifyLead } = require('../leads/service');
const { getMessages, saveMessage } = require('../messages/service');
const { createCaso, VALID_TIPOS_CONTRATO } = require('../casos/service');
const { buildQueues } = require('../sla/service');
const { emitLeadUpdated, emitLeadConverted, emitLeadLost } = require('../realtime/emitter');
const { getPrisma } = require('../infra/db');

const VALID_STATUSES = ['em_atendimento', 'aguardando_retorno', 'virou_cliente', 'desistiu'];
const VALID_MOTIVOS = ['preco', 'sem_interesse', 'fechou_com_outro', 'nao_respondeu', 'outro'];

function validateStatusChange(status, motivoDesistencia) {
  if (!VALID_STATUSES.includes(status)) throw new Error(`Status inválido: ${status}. Válidos: ${VALID_STATUSES.join(', ')}`);
  if (status === 'desistiu' && !motivoDesistencia) throw new Error('Motivo obrigatório para desistência');
  if (status === 'desistiu' && !VALID_MOTIVOS.includes(motivoDesistencia)) {
    throw new Error(`Motivo inválido. Válidos: ${VALID_MOTIVOS.join(', ')}`);
  }
}

const router = Router();

// All operator routes require JWT + OPERATOR role
router.use(attachTenantFromJWT);
router.use(requireRole('OPERATOR'));

// GET /operator/inbox — filtered lead list with SLA info
router.get('/inbox', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const tenant = await getPrisma().tenant.findUnique({ where: { id: tenantId } });
    const leads = await listLeads(tenantId, req.query);
    const now = new Date();
    const leadsWithSla = leads.map(lead => ({
      ...lead,
      slaStatus: lead.primeiraRespostaEm ? 'respondido'
        : (now - new Date(lead.criadoEm)) / 60000 > (tenant?.slaLeadMinutes || 60) ? 'atrasado' : 'dentro',
    }));
    // Sort: sem resposta atrasados first, then by score desc, then oldest first
    leadsWithSla.sort((a, b) => {
      if (a.slaStatus === 'atrasado' && b.slaStatus !== 'atrasado') return -1;
      if (b.slaStatus === 'atrasado' && a.slaStatus !== 'atrasado') return 1;
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      return new Date(a.criadoEm) - new Date(b.criadoEm);
    });
    return res.json(leadsWithSla);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// GET /operator/queues — SLA queues
router.get('/queues', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const tenant = await getPrisma().tenant.findUnique({ where: { id: tenantId } });
    const [leads, casos] = await Promise.all([
      getPrisma().lead.findMany({ where: { tenantId }, orderBy: { criadoEm: 'asc' } }),
      getPrisma().caso.findMany({ where: { tenantId, status: { not: 'finalizado' } } }),
    ]);
    return res.json(buildQueues(leads, casos, tenant || {}));
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// GET /operator/leads/:id — lead detail with messages
router.get('/leads/:id', async (req, res) => {
  try {
    const lead = await getLead(req.tenantId, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    return res.json(lead);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// GET /operator/leads/:id/messages
router.get('/leads/:id/messages', async (req, res) => {
  try {
    const lead = await getLead(req.tenantId, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    const messages = await getMessages(req.params.id);
    return res.json(messages);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// POST /operator/leads/:id/assumir — human takeover (pauses bot)
router.post('/leads/:id/assumir', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const leadId = req.params.id;
    const now = new Date();

    await getPrisma().lead.updateMany({
      where: { id: leadId, tenantId },
      data: {
        status: 'em_atendimento',
        assumidoPorId: req.user.userId,
        primeiraRespostaEm: (await getLead(tenantId, leadId))?.primeiraRespostaEm || now,
      },
    });

    const updatedLead = await getLead(tenantId, leadId);
    emitLeadUpdated(tenantId, updatedLead);
    return res.json({ ok: true, lead: updatedLead });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// PATCH /operator/leads/:id/status — change status
router.patch('/leads/:id/status', async (req, res) => {
  try {
    const { status, motivoDesistencia } = req.body;
    validateStatusChange(status, motivoDesistencia);
    await updateStatus(req.tenantId, req.params.id, status, motivoDesistencia);
    const lead = await getLead(req.tenantId, req.params.id);
    if (status === 'desistiu') emitLeadLost(req.tenantId, req.params.id, motivoDesistencia);
    else emitLeadUpdated(req.tenantId, lead);
    return res.json({ ok: true });
  } catch (err) { return res.status(400).json({ error: err.message }); }
});

// PATCH /operator/leads/:id/classify — reclassify
router.patch('/leads/:id/classify', async (req, res) => {
  try {
    const { segmento, tipoAtendimento } = req.body;
    await classifyLead(req.tenantId, req.params.id, { segmento, tipoAtendimento });
    const lead = await getLead(req.tenantId, req.params.id);
    emitLeadUpdated(req.tenantId, lead);
    return res.json({ ok: true });
  } catch (err) { return res.status(400).json({ error: err.message }); }
});

// POST /operator/leads/:id/converter — MANDATORY conversion form
// This is the critical gate: no caso created without valid contract data
router.post('/leads/:id/converter', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const leadId = req.params.id;
    // validateConversao is called inside createCaso — will throw if fields missing
    const caso = await createCaso(tenantId, leadId, req.body);
    const lead = await getLead(tenantId, leadId);
    emitLeadConverted(tenantId, leadId, caso);
    return res.status(201).json({ caso, lead });
  } catch (err) { return res.status(400).json({ error: err.message }); }
});

// POST /operator/leads/:id/messages — send message as human
router.post('/leads/:id/messages', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ error: 'texto é obrigatório' });
    const lead = await getLead(req.tenantId, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
    const message = await saveMessage({ leadId: req.params.id, origem: 'humano', texto });
    // Emit realtime update so other operators see the message
    emitLeadUpdated(req.tenantId, { ...lead, ultimaMensagem: texto });
    return res.status(201).json(message);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.validateStatusChange = validateStatusChange;
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/routes/operator.test.js
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/routes/operator.js tests/routes/operator.test.js
git commit -m "feat: add operator routes (inbox, queues, assumir, status, classify, converter)"
```

---

### Task 6: Owner routes

**Files:**
- Create: `src/routes/owner.js`
- Test: `tests/routes/owner.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/routes/owner.test.js`:

```js
const { buildAlertas } = require('../../src/routes/owner');

test('buildAlertas returns leads_sem_resposta alert', () => {
  const alertas = buildAlertas({ leadsSemResposta: 3, casosParados: 0, conversao: 0.5 });
  expect(alertas.some(a => a.tipo === 'leads_sem_resposta')).toBe(true);
});

test('buildAlertas returns contratos_parados alert', () => {
  const alertas = buildAlertas({ leadsSemResposta: 0, casosParados: 2, conversao: 0.5 });
  expect(alertas.some(a => a.tipo === 'contratos_parados')).toBe(true);
});

test('buildAlertas returns queda_conversao when below 10%', () => {
  const alertas = buildAlertas({ leadsSemResposta: 0, casosParados: 0, conversao: 0.05 });
  expect(alertas.some(a => a.tipo === 'queda_conversao')).toBe(true);
});

test('buildAlertas returns empty when all good', () => {
  const alertas = buildAlertas({ leadsSemResposta: 0, casosParados: 0, conversao: 0.3 });
  expect(alertas).toHaveLength(0);
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/routes/owner.test.js
```

Expected: FAIL

- [ ] **Step 3: Create src/routes/owner.js**

```js
const { Router } = require('express');
const { attachTenantFromJWT, requireRole } = require('../auth/middleware');
const { getOwnerDashboardData, getPeriodRange } = require('../financial/service');
const { listCasos, getCaso, closeCaso } = require('../casos/service');
const { buildQueues } = require('../sla/service');
const { emitCasoUpdated } = require('../realtime/emitter');
const { getPrisma } = require('../infra/db');

function buildAlertas({ leadsSemResposta, casosParados, conversao }) {
  const alertas = [];
  if (leadsSemResposta > 0) alertas.push({ tipo: 'leads_sem_resposta', count: leadsSemResposta });
  if (casosParados > 0) alertas.push({ tipo: 'contratos_parados', count: casosParados });
  if (conversao > 0 && conversao < 0.1) alertas.push({ tipo: 'queda_conversao', valor: (conversao * 100).toFixed(1) + '%' });
  return alertas;
}

const router = Router();

// All owner routes require JWT + OWNER role
router.use(attachTenantFromJWT);
router.use(requireRole('OWNER'));

// GET /owner/dashboard?period=month|today|week&start=&end=
router.get('/dashboard', async (req, res) => {
  try {
    const { period = 'month', start, end } = req.query;
    const customRange = start && end ? { start: new Date(start), end: new Date(end) } : null;
    const data = await getOwnerDashboardData(req.tenantId, period, customRange);
    data.alertas = buildAlertas(data);
    return res.json(data);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// GET /owner/queues — read-only view of SLA queues
router.get('/queues', async (req, res) => {
  try {
    const tenant = await getPrisma().tenant.findUnique({ where: { id: req.tenantId } });
    const [leads, casos] = await Promise.all([
      getPrisma().lead.findMany({ where: { tenantId: req.tenantId }, orderBy: { criadoEm: 'asc' } }),
      getPrisma().caso.findMany({ where: { tenantId: req.tenantId, status: { not: 'finalizado' } } }),
    ]);
    return res.json(buildQueues(leads, casos, tenant || {}));
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// GET /owner/casos — all casos (read-only)
router.get('/casos', async (req, res) => {
  try {
    const casos = await listCasos(req.tenantId, req.query);
    return res.json(casos);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// GET /owner/casos/:id
router.get('/casos/:id', async (req, res) => {
  try {
    const caso = await getCaso(req.tenantId, req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso não encontrado' });
    return res.json(caso);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// POST /owner/casos/:id/fechar — register real revenue
router.post('/casos/:id/fechar', async (req, res) => {
  try {
    const caso = await closeCaso(req.tenantId, req.params.id, req.body);
    emitCasoUpdated(req.tenantId, caso);
    return res.json(caso);
  } catch (err) { return res.status(400).json({ error: err.message }); }
});

// GET /owner/leads — read-only lead list (for "ver problema" button)
router.get('/leads', async (req, res) => {
  try {
    const { listLeads } = require('../leads/service');
    const leads = await listLeads(req.tenantId, req.query);
    return res.json(leads);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.buildAlertas = buildAlertas;
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/routes/owner.test.js
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/routes/owner.js tests/routes/owner.test.js
git commit -m "feat: add owner routes (dashboard, queues, casos, fechar, leads read-only)"
```

---

### Task 7: Master routes

**Files:**
- Create: `src/routes/master.js`

- [ ] **Step 1: Create src/routes/master.js**

```js
const { Router } = require('express');
const { getPrisma } = require('../infra/db');
const crypto = require('crypto');

const router = Router();

// Master auth: separate from User JWT — uses MASTER_TOKEN env var
// Separate auth model entirely (AdminUser in DB)
async function masterAuth(req, res, next) {
  const token = req.headers['x-master-token'];
  if (!token) return res.status(401).json({ error: 'Master token obrigatório.' });

  try {
    const admin = await getPrisma().adminUser.findUnique({ where: { token, ativo: true } });
    if (!admin) return res.status(401).json({ error: 'Master token inválido.' });

    req.adminId = admin.id;
    req.adminEmail = admin.email;

    // Audit log every master access
    await getPrisma().adminLog.create({
      data: {
        id: crypto.randomUUID(),
        adminId: admin.id,
        acao: `${req.method} ${req.path}`,
        tenantId: req.headers['x-tenant-id'] || req.query.tenantId || null,
        metadata: { ip: req.ip, userAgent: req.headers['user-agent'] },
      },
    });

    return next();
  } catch (err) {
    console.error('[masterAuth]', err.message);
    return res.status(500).json({ error: 'Erro de autenticação.' });
  }
}

// GET /master/tenants — list all tenants
router.get('/tenants', masterAuth, async (req, res) => {
  try {
    const tenants = await getPrisma().tenant.findMany({
      orderBy: { criadoEm: 'desc' },
      include: {
        _count: { select: { leads: true, casos: true, users: true } },
      },
    });
    return res.json(tenants);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// GET /master/tenants/:id — tenant detail
router.get('/tenants/:id', masterAuth, async (req, res) => {
  try {
    const tenant = await getPrisma().tenant.findUnique({
      where: { id: req.params.id },
      include: {
        users: { select: { id: true, email: true, role: true, ativo: true, criadoEm: true } },
        flows: { select: { id: true, nome: true, ativo: true, criadoEm: true } },
        _count: { select: { leads: true, casos: true } },
      },
    });
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });
    return res.json(tenant);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// GET /master/metrics — global metrics across all tenants
router.get('/metrics', masterAuth, async (req, res) => {
  try {
    const prisma = getPrisma();
    const [tenantCount, leadCount, casoCount, receitaResult] = await Promise.all([
      prisma.tenant.count({ where: { ativo: true } }),
      prisma.lead.count(),
      prisma.caso.count(),
      prisma.caso.aggregate({
        _sum: { valorConvertido: true },
        where: { valorRecebido: { not: null }, dataRecebimento: { not: null } },
      }),
    ]);

    return res.json({
      tenants: tenantCount,
      leads: leadCount,
      casos: casoCount,
      receitaGlobal: Number(receitaResult._sum.valorConvertido || 0),
    });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// GET /master/logs — audit log
router.get('/logs', masterAuth, async (req, res) => {
  try {
    const logs = await getPrisma().adminLog.findMany({
      where: req.query.tenantId ? { tenantId: req.query.tenantId } : {},
      orderBy: { criadoEm: 'desc' },
      take: 100,
      include: { admin: { select: { email: true } } },
    });
    return res.json(logs);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// POST /master/tenants — create new tenant + seed flow
router.post('/tenants', masterAuth, async (req, res) => {
  try {
    const { nome, botToken, tipoNegocio = 'juridico', moedaBase = 'BRL', ownerEmail } = req.body;
    if (!nome) throw new Error('nome é obrigatório');
    if (!botToken) throw new Error('botToken é obrigatório');
    if (!ownerEmail) throw new Error('ownerEmail é obrigatório');

    const { createTenant } = require('../tenants/service');
    const { createUser } = require('../users/service');
    const { createFlow } = require('../flows/service');

    const templateNodes = require(`../flows/templates/${tipoNegocio}`);

    const tenant = await createTenant({ nome, botToken, tipoNegocio, moedaBase });
    const owner = await createUser({ tenantId: tenant.id, email: ownerEmail, role: 'OWNER' });
    await createFlow({ tenantId: tenant.id, nome: `Template ${tipoNegocio}`, tipoNegocio, nodes: templateNodes });

    return res.status(201).json({ tenant, ownerToken: owner.token });
  } catch (err) { return res.status(400).json({ error: err.message }); }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/master.js
git commit -m "feat: add master routes (tenants, metrics, audit log, create tenant)"
```

---

### Task 8: SLA cron job

**Files:**
- Create: `src/jobs/sla.js`

- [ ] **Step 1: Create src/jobs/sla.js**

```js
const cron = require('node-cron');
const { getPrisma } = require('../infra/db');
const { isLeadAtrasado, isCasoAtrasado } = require('../sla/service');
const { emitSlaAlert } = require('../realtime/emitter');

async function checkSlaAlerts() {
  const prisma = getPrisma();
  const tenants = await prisma.tenant.findMany({ where: { ativo: true } });

  for (const tenant of tenants) {
    const [leads, casos] = await Promise.all([
      prisma.lead.findMany({
        where: { tenantId: tenant.id, status: { in: ['em_qualificacao', 'em_atendimento'] } },
      }),
      prisma.caso.findMany({
        where: { tenantId: tenant.id, status: { not: 'finalizado' } },
      }),
    ]);

    const leadsAtrasados = leads.filter(l => isLeadAtrasado(l, tenant));
    const casosAtrasados = casos.filter(c => isCasoAtrasado(c, tenant));

    if (leadsAtrasados.length > 0) {
      emitSlaAlert(tenant.id, 'leads_sem_resposta', leadsAtrasados.map(l => ({
        id: l.id, nome: l.nome, minutosEspera: Math.floor((Date.now() - new Date(l.criadoEm)) / 60000),
      })));
    }

    if (casosAtrasados.length > 0) {
      emitSlaAlert(tenant.id, 'contratos_parados', casosAtrasados.map(c => ({
        id: c.id, segmento: c.segmento, horasSemUpdate: Math.floor((Date.now() - new Date(c.atualizadoEm)) / 3600000),
      })));
    }
  }
}

function startSlaJob() {
  // Check SLA every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    checkSlaAlerts().catch(err => console.error('[sla-cron] error:', err.message));
  });
  console.log('[sla-cron] iniciado (a cada 5 minutos)');
}

module.exports = { startSlaJob, checkSlaAlerts };
```

- [ ] **Step 2: Commit**

```bash
git add src/jobs/sla.js
git commit -m "feat: add SLA cron job (checks every 5min, emits alerts via socket)"
```

---

### Task 9: Flow cache

**Files:**
- Modify: `src/flows/service.js`

The flow is loaded from DB on every single message. It changes rarely. Cache it with a 5-minute TTL.

- [ ] **Step 1: Update src/flows/service.js with in-memory cache**

Replace the `getActiveFlow` function:

```js
const { getPrisma } = require('../infra/db');
const crypto = require('crypto');

// In-memory cache: tenantId → { flow, cachedAt }
const flowCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getActiveFlow(tenantId) {
  const cached = flowCache.get(tenantId);
  if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
    return cached.flow;
  }
  const flow = await getPrisma().flow.findFirst({
    where: { tenantId, ativo: true },
    include: { nodes: true },
    orderBy: { criadoEm: 'desc' },
  });
  flowCache.set(tenantId, { flow, cachedAt: Date.now() });
  return flow;
}

function invalidateFlowCache(tenantId) {
  flowCache.delete(tenantId);
}

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
  invalidateFlowCache(tenantId); // bust cache after creating new flow
  return flow;
}

async function listFlows(tenantId) {
  return getPrisma().flow.findMany({ where: { tenantId }, orderBy: { criadoEm: 'desc' } });
}

module.exports = { createFlow, getActiveFlow, listFlows, invalidateFlowCache };
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/flows/service.js
git commit -m "perf: add in-memory flow cache (5min TTL, invalidated on createFlow)"
```

---

### Task 10: Mount routes in server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Update server.js to mount new routes**

Add after the existing API routes section in `server.js`:

```js
// Mount at top of file (after existing requires):
const operatorRouter = require('./src/routes/operator');
const ownerRouter = require('./src/routes/owner');
const masterRouter = require('./src/routes/master');
const { startSlaJob } = require('./src/jobs/sla');

// Mount routes (add before error handler):
app.use('/operator', operatorRouter);
app.use('/owner', ownerRouter);
app.use('/master', masterRouter);
```

And in the `start()` function, add SLA job startup:

```js
async function start() {
  if (process.env.STORAGE_ADAPTER === 'postgres' && process.env.DATABASE_URL) {
    try {
      const { execSync } = require('child_process');
      execSync('npx prisma migrate deploy 2>/dev/null || npx prisma db push', { stdio: 'inherit' });
      console.log('[db] schema aplicado');
    } catch (err) {
      console.error('[db] schema falhou:', err.message);
    }

    startSlaJob();
  }
  httpServer.listen(PORT, () => {
    console.log(`[BRO Resolve] porta ${PORT} — storage: ${process.env.STORAGE_ADAPTER || 'memory'}`);
  });
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: mount operator/owner/master routes, start SLA cron job"
```

---

### Task 11: Auth — token-based login endpoint

**Files:**
- Create: `src/routes/auth.js`

Users need a way to get a JWT from their static token (stored in DB during seed).

- [ ] **Step 1: Create src/routes/auth.js**

```js
const { Router } = require('express');
const { getPrisma } = require('../infra/db');
const { signToken } = require('../auth/jwt');

const router = Router();

// POST /auth/login — exchange static user token for JWT
// Body: { token: "<user.token from seed>" }
router.post('/login', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token é obrigatório' });

    const user = await getPrisma().user.findUnique({ where: { token, ativo: true } });
    if (!user) return res.status(401).json({ error: 'Token inválido.' });

    const jwt = signToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    return res.json({ jwt, role: user.role, tenantId: user.tenantId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

Mount in `server.js`:
```js
const authRouter = require('./src/routes/auth');
app.use('/auth', authRouter);
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/auth.js server.js
git commit -m "feat: add auth login endpoint (token → JWT)"
```

---

### Final verification

- [ ] **Run full test suite**

```bash
cd ~/Downloads/bro-resolve && npm test
```

Expected: All 35+ tests PASS.

- [ ] **Verify route structure**

```bash
grep -n "app.use\|router\." server.js
```

Expected output includes:
```
app.use('/webhook', ...)
app.use('/auth', authRouter)
app.use('/operator', operatorRouter)
app.use('/owner', ownerRouter)
app.use('/master', masterRouter)
```

- [ ] **Verify no global._currentTenantId anywhere**

```bash
grep -r "global\._currentTenantId" src/ server.js
```

Expected: No output.

---

## API Surface After Plan 2

```
POST   /auth/login                         → get JWT from user token

POST   /webhook                            → Telegram (public)
GET    /health                             → health check (public)

GET    /operator/inbox                     → lead list with SLA (OPERATOR)
GET    /operator/queues                    → SLA queues (OPERATOR)
GET    /operator/leads/:id                 → lead detail (OPERATOR)
GET    /operator/leads/:id/messages        → message history (OPERATOR)
POST   /operator/leads/:id/assumir         → human takeover (OPERATOR)
PATCH  /operator/leads/:id/status          → change status (OPERATOR)
PATCH  /operator/leads/:id/classify        → reclassify (OPERATOR)
POST   /operator/leads/:id/converter       → mandatory conversion form (OPERATOR)
POST   /operator/leads/:id/messages        → send message (OPERATOR)

GET    /owner/dashboard?period=            → financial dashboard (OWNER)
GET    /owner/queues                       → SLA queues read-only (OWNER)
GET    /owner/leads?status=                → leads read-only (OWNER)
GET    /owner/casos                        → all casos (OWNER)
GET    /owner/casos/:id                    → caso detail (OWNER)
POST   /owner/casos/:id/fechar             → register real revenue (OWNER)

GET    /master/tenants                     → all tenants (MASTER)
GET    /master/tenants/:id                 → tenant detail (MASTER)
POST   /master/tenants                     → create tenant + seed flow (MASTER)
GET    /master/metrics                     → global metrics (MASTER)
GET    /master/logs                        → audit log (MASTER)
```

---

## Summary

After Plan 2:
- ✅ 3 access levels with full backend enforcement (OPERATOR, OWNER, MASTER)
- ✅ Mandatory conversion form (can't create Caso without valid contract data)
- ✅ Financial separation: receita real vs em aberto, never mixed
- ✅ SLA engine with automatic queue building
- ✅ Realtime events via Socket.io (lead updates, SLA alerts, caso updates)
- ✅ SLA cron job (every 5 min, emits to tenants with delayed items)
- ✅ Flow cache (5min TTL, no DB hit on every message)
- ✅ Master audit log (every access recorded)
- ✅ JWT login endpoint
- ✅ Multi-moeda on Caso (valorConvertido always in moedaBase)
- ✅ Zero global state (req.tenantId everywhere)

**Next:** Plan 3 — Operator React UI (3-column layout, realtime chat, WhatsApp-style)
**Next:** Plan 4 — Owner React dashboard (5 blocks, period filter, alerts, "ver problema" button)
