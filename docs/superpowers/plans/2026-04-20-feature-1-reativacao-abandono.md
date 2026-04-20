# Feature 1: Reativação de Abandono — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Leads que abandonaram o fluxo recebem automaticamente uma mensagem de reativação 24h depois, via Telegram, recuperando 15-30% dos abandonos.

**Architecture:** Cron job (node-cron) roda a cada hora, busca leads com `status=abandonou` e `criadoEm` entre 23h e 25h atrás que ainda não receberam reativação. Para cada um, envia mensagem via Telegram Bot API usando o token do tenant. Marca o lead com `reativacaoEnviadaEm` para não reenviar.

**Tech Stack:** node-cron, Telegram Bot API (fetch já usado no server.js), Prisma, Jest

---

## Mapa de arquivos

### Criar
- `src/jobs/reativacao.js` — lógica de busca + envio
- `tests/jobs-reativacao.test.js`

### Modificar
- `prisma/schema.prisma` — add `reativacaoEnviadaEm` ao Lead
- `server.js` — registrar cron job no startup
- `package.json` — add node-cron

---

## Task 1: Adicionar campo reativacaoEnviadaEm ao schema

**Files:** `prisma/schema.prisma`

- [ ] **Step 1: Adicionar campo no model Lead**

No `prisma/schema.prisma`, dentro do model `Lead`, após `fechadoEm` (ou após `resumo`), adicionar:

```prisma
  reativacaoEnviadaEm DateTime? @map("reativacao_enviada_em")
```

- [ ] **Step 2: Instalar node-cron**

```bash
cd /Users/Jads/Downloads/bro.cco
npm install node-cron
```

- [ ] **Step 3: Gerar cliente Prisma**

```bash
npx prisma generate
```

- [ ] **Step 4: Criar migration (se DATABASE_URL disponível) ou apenas gerar**

```bash
npx prisma migrate dev --name add-reativacao-field --create-only
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ package.json package-lock.json
git commit -m "feat: add reativacaoEnviadaEm field to leads + install node-cron"
```

---

## Task 2: Criar src/jobs/reativacao.js com TDD

**Files:**
- Create: `src/jobs/reativacao.js`
- Create: `tests/jobs-reativacao.test.js`

- [ ] **Step 1: Escrever teste**

Criar `tests/jobs-reativacao.test.js`:

```javascript
jest.mock('../src/infra/db', () => {
  const leads = [
    {
      id: 'lead-1',
      telefone: '123456789',
      nome: 'Maria',
      status: 'abandonou',
      reativacaoEnviadaEm: null,
      criadoEm: new Date(Date.now() - 24 * 60 * 60 * 1000),
      tenant: { id: 'tenant-1', botToken: 'bot-token-1', nome: 'Escritório X' },
    },
  ];
  return {
    getPrisma: () => ({
      lead: {
        findMany: jest.fn(async () => leads),
        update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
    }),
  };
});

global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));

const { buscarLeadsParaReativar, enviarReativacao, runReativacao } = require('../src/jobs/reativacao');

describe('reativacao job', () => {
  beforeEach(() => jest.clearAllMocks());

  test('buscarLeadsParaReativar retorna leads abandonados sem reativacao', async () => {
    const leads = await buscarLeadsParaReativar();
    expect(leads).toHaveLength(1);
    expect(leads[0].id).toBe('lead-1');
  });

  test('enviarReativacao chama Telegram API com mensagem correta', async () => {
    const lead = {
      id: 'lead-1',
      telefone: '123456789',
      nome: 'Maria',
      tenant: { botToken: 'bot-token-1' },
    };
    await enviarReativacao(lead);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('bot-token-1/sendMessage'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('runReativacao processa lead e marca como reativado', async () => {
    const { getPrisma } = require('../src/infra/db');
    await runReativacao();
    expect(getPrisma().lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({ reativacaoEnviadaEm: expect.any(Date) }),
      })
    );
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
npx jest tests/jobs-reativacao.test.js --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Criar src/jobs/reativacao.js**

```javascript
// src/jobs/reativacao.js
const { getPrisma } = require('../infra/db');

const MENSAGEM_REATIVACAO = (nome) =>
  `Olá${nome ? `, ${nome}` : ''}! 👋\n\nNotei que você iniciou um atendimento conosco mas não chegamos a concluir.\n\nPosso te ajudar agora?\n\n1️⃣ Sim, quero continuar\n2️⃣ Não, obrigado`;

async function enviarTelegram(botToken, chatId, text) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function buscarLeadsParaReativar() {
  const prisma = getPrisma();
  const agora = new Date();
  const limite23h = new Date(agora.getTime() - 23 * 60 * 60 * 1000);
  const limite25h = new Date(agora.getTime() - 25 * 60 * 60 * 1000);

  return prisma.lead.findMany({
    where: {
      status: 'abandonou',
      reativacaoEnviadaEm: null,
      criadoEm: { gte: limite25h, lte: limite23h },
    },
    include: { tenant: { select: { id: true, botToken: true, nome: true } } },
  });
}

async function enviarReativacao(lead) {
  const { botToken } = lead.tenant;
  const chatId = lead.telefone;
  await enviarTelegram(botToken, chatId, MENSAGEM_REATIVACAO(lead.nome));
}

async function runReativacao() {
  const prisma = getPrisma();
  let leads;

  try {
    leads = await buscarLeadsParaReativar();
  } catch (err) {
    console.error('[reativacao] erro ao buscar leads:', err.message);
    return;
  }

  for (const lead of leads) {
    try {
      await enviarReativacao(lead);
      await prisma.lead.update({
        where: { id: lead.id },
        data: { reativacaoEnviadaEm: new Date() },
      });
      console.log(`[reativacao] enviado para lead ${lead.id}`);
    } catch (err) {
      console.error(`[reativacao] erro no lead ${lead.id}:`, err.message);
    }
  }
}

module.exports = { buscarLeadsParaReativar, enviarReativacao, runReativacao };
```

- [ ] **Step 4: Rodar para ver passar**

```bash
npx jest tests/jobs-reativacao.test.js --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/jobs/reativacao.js tests/jobs-reativacao.test.js
git commit -m "feat: add abandonment reactivation job"
```

---

## Task 3: Registrar cron no server.js

**Files:** `server.js`

- [ ] **Step 1: Adicionar import no topo de server.js**

Após os imports existentes, adicionar:

```javascript
const cron = require('node-cron');
const { runReativacao } = require('./src/jobs/reativacao');
```

- [ ] **Step 2: Registrar cron antes do app.listen**

Antes de `const PORT = process.env.PORT || 3000;`, adicionar:

```javascript
// Cron: reativação de leads abandonados (roda a cada hora)
if (process.env.STORAGE_ADAPTER === 'postgres') {
  cron.schedule('0 * * * *', () => {
    console.log('[cron] rodando reativacao de abandonos');
    runReativacao().catch(err => console.error('[cron] reativacao error:', err.message));
  });
  console.log('[cron] reativacao de abandonos agendada (a cada hora)');
}
```

- [ ] **Step 3: Verificar sintaxe**

```bash
node --check server.js && echo "ok"
```

- [ ] **Step 4: Rodar todos os testes**

```bash
npx jest --no-coverage --runInBand 2>&1 | tail -8
```

Expected: todos passando.

- [ ] **Step 5: Commit final**

```bash
git add server.js
git commit -m "feat: schedule hourly reactivation cron job"
```
