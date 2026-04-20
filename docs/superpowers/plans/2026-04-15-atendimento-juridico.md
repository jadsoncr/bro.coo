# Sistema de Atendimento Jurídico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir sistema completo de atendimento jurídico automatizado com máquina de estados, score incremental e storage adapter plugável, pronto para deploy no Railway.

**Architecture:** Express.js recebe webhook do n8n, normaliza entrada, carrega sessão via storage adapter (in-memory no MVP), processa estado atual na máquina de estados, recalcula score incrementalmente a cada coleta de impacto/intencao, e responde JSON estendido. Troca de adapter (in-memory → Google Sheets) é feita por variável de ambiente sem tocar na lógica.

**Tech Stack:** Node.js, Express 4, sem banco de dados, sem framework de teste (Jest simples), dotenv para config.

---

## Mapa de Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `server.js` | Entrada HTTP, rota POST /webhook, monta resposta |
| `src/normalizer.js` | Limpa e padroniza entrada do webhook |
| `src/sessionManager.js` | get/update de sessão via storage |
| `src/scorer.js` | Calcula score e prioridade a partir de impacto+intencao |
| `src/stateMachine.js` | Motor de estados, transições, perguntas, flags |
| `src/responder.js` | Monta objeto de resposta final |
| `src/storage/index.js` | Seleciona adapter por STORAGE_ADAPTER env |
| `src/storage/inMemory.js` | Implementação in-memory (Map) |
| `src/storage/googleSheets.js` | Stub comentado para implementação futura |
| `package.json` | Deps: express, dotenv. Scripts: start, test |
| `.env.example` | Variáveis documentadas |
| `tests/normalizer.test.js` | Testes do normalizador |
| `tests/scorer.test.js` | Testes do scorer |
| `tests/stateMachine.test.js` | Testes de transição de estados |

---

## Task 1: Setup do projeto

**Files:**
- Modify: `package.json`
- Create: `.env.example`

- [ ] **Step 1: Instalar dependências**

```bash
cd /Users/Jads/Downloads/santosebastos_atend
npm init -y
npm install express dotenv
npm install --save-dev jest
```

- [ ] **Step 2: Atualizar package.json com scripts**

Substituir o conteúdo de `package.json`:

```json
{
  "name": "atendimento-juridico",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "dotenv": "^16.0.0",
    "express": "^4.18.0"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
```

- [ ] **Step 3: Criar .env.example**

```
PORT=3000
STORAGE_ADAPTER=memory
```

- [ ] **Step 4: Criar pasta src e subpastas**

```bash
mkdir -p src/storage tests
```

- [ ] **Step 5: Commit**

```bash
git init
git add package.json .env.example
git commit -m "chore: setup inicial do projeto"
```

---

## Task 2: Normalizer

**Files:**
- Create: `src/normalizer.js`
- Create: `tests/normalizer.test.js`

- [ ] **Step 1: Escrever testes que falham**

Criar `tests/normalizer.test.js`:

```js
const normalize = require('../src/normalizer');

describe('normalizer', () => {
  test('limpa sessao removendo nao-numericos', () => {
    const result = normalize({ sessao: '+55 (11) 99999-9999', mensagem: 'oi', canal: 'WhatsApp' });
    expect(result.sessao).toBe('5511999999999');
  });

  test('faz trim e lowercase na mensagem', () => {
    const result = normalize({ sessao: '11999', mensagem: '  OLÁ  ', canal: 'whatsapp' });
    expect(result.mensagem).toBe('olá');
  });

  test('normaliza canal para lowercase', () => {
    const result = normalize({ sessao: '11999', mensagem: 'oi', canal: 'WHATSAPP' });
    expect(result.canal).toBe('whatsapp');
  });

  test('adiciona dataHora em formato ISO', () => {
    const result = normalize({ sessao: '11999', mensagem: 'oi', canal: 'whatsapp' });
    expect(result.dataHora).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('mensagem vazia vira string vazia', () => {
    const result = normalize({ sessao: '11999', mensagem: null, canal: 'whatsapp' });
    expect(result.mensagem).toBe('');
  });
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
npx jest tests/normalizer.test.js
```

Esperado: FAIL (module not found)

- [ ] **Step 3: Implementar normalizer**

Criar `src/normalizer.js`:

```js
/**
 * Normaliza a entrada do webhook.
 * @param {{ sessao: string, mensagem: string, canal: string }} input
 * @returns {{ sessao: string, mensagem: string, canal: string, dataHora: string }}
 */
function normalize(input) {
  const sessao = String(input.sessao || '').replace(/\D/g, '');
  const mensagem = String(input.mensagem || '').trim().toLowerCase();
  const canal = String(input.canal || '').toLowerCase();
  const dataHora = new Date().toISOString();

  return { sessao, mensagem, canal, dataHora };
}

module.exports = normalize;
```

- [ ] **Step 4: Rodar testes para confirmar passou**

```bash
npx jest tests/normalizer.test.js
```

Esperado: 5 testes PASS

- [ ] **Step 5: Commit**

```bash
git add src/normalizer.js tests/normalizer.test.js
git commit -m "feat: normalizer de entrada do webhook"
```

---

## Task 3: Scorer

**Files:**
- Create: `src/scorer.js`
- Create: `tests/scorer.test.js`

- [ ] **Step 1: Escrever testes que falham**

Criar `tests/scorer.test.js`:

```js
const { calcularScore } = require('../src/scorer');

describe('scorer', () => {
  test('score = impacto + intencao + 1', () => {
    const { score } = calcularScore({ impacto: 3, intencao: 3 });
    expect(score).toBe(7);
  });

  test('score >= 7 é QUENTE', () => {
    const { prioridade } = calcularScore({ impacto: 3, intencao: 3 });
    expect(prioridade).toBe('QUENTE');
  });

  test('score >= 5 e < 7 é MEDIO', () => {
    const { prioridade } = calcularScore({ impacto: 2, intencao: 2 });
    expect(prioridade).toBe('MEDIO');
  });

  test('score < 5 é FRIO', () => {
    const { prioridade } = calcularScore({ impacto: 1, intencao: 1 });
    expect(prioridade).toBe('FRIO');
  });

  test('com apenas impacto definido, usa intencao 0', () => {
    const { score } = calcularScore({ impacto: 3, intencao: null });
    expect(score).toBe(4);
  });

  test('com nenhum dado, score é 1', () => {
    const { score } = calcularScore({});
    expect(score).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
npx jest tests/scorer.test.js
```

Esperado: FAIL (module not found)

- [ ] **Step 3: Implementar scorer**

Criar `src/scorer.js`:

```js
/**
 * Calcula score e prioridade de um lead.
 * Pode ser chamado incrementalmente (com apenas impacto ou apenas intencao).
 *
 * @param {{ impacto?: number, intencao?: number }} dados
 * @returns {{ score: number, prioridade: 'QUENTE' | 'MEDIO' | 'FRIO' }}
 */
function calcularScore({ impacto, intencao } = {}) {
  const imp = Number(impacto) || 0;
  const int = Number(intencao) || 0;
  const score = imp + int + 1;

  let prioridade;
  if (score >= 7) prioridade = 'QUENTE';
  else if (score >= 5) prioridade = 'MEDIO';
  else prioridade = 'FRIO';

  return { score, prioridade };
}

module.exports = { calcularScore };
```

- [ ] **Step 4: Rodar testes para confirmar passou**

```bash
npx jest tests/scorer.test.js
```

Esperado: 6 testes PASS

- [ ] **Step 5: Commit**

```bash
git add src/scorer.js tests/scorer.test.js
git commit -m "feat: scorer com cálculo incremental de prioridade"
```

---

## Task 4: Storage Adapter (in-memory + stub sheets)

**Files:**
- Create: `src/storage/inMemory.js`
- Create: `src/storage/googleSheets.js`
- Create: `src/storage/index.js`

- [ ] **Step 1: Criar inMemory.js**

```js
// src/storage/inMemory.js
// Implementação in-memory usando Map. Dados perdidos ao reiniciar (aceito para MVP).

const sessions = new Map();
const leads = [];
const clients = [];
const others = [];

async function getSession(sessao) {
  return sessions.get(sessao) || null;
}

async function updateSession(sessao, data) {
  const current = sessions.get(sessao) || {};
  sessions.set(sessao, { ...current, ...data, sessao });
}

async function createLead(data) {
  leads.push({ ...data, dataHora: new Date().toISOString() });
}

async function createClient(data) {
  clients.push({ ...data, dataHora: new Date().toISOString() });
}

async function createOther(data) {
  others.push({ ...data, dataHora: new Date().toISOString() });
}

// Exposto para testes
function _clear() {
  sessions.clear();
  leads.length = 0;
  clients.length = 0;
  others.length = 0;
}

function _getAll() {
  return { sessions: Object.fromEntries(sessions), leads, clients, others };
}

module.exports = { getSession, updateSession, createLead, createClient, createOther, _clear, _getAll };
```

- [ ] **Step 2: Criar googleSheets.js (stub)**

```js
// src/storage/googleSheets.js
// Stub para implementação futura com Google Sheets API.
// Para ativar: defina STORAGE_ADAPTER=sheets e implemente cada função
// usando a biblioteca googleapis com Service Account credentials.
//
// Variáveis de ambiente necessárias:
//   GOOGLE_SERVICE_ACCOUNT_JSON  → JSON da service account (base64 ou raw)
//   SPREADSHEET_ID               → ID da planilha do Google Sheets

async function getSession(sessao) {
  throw new Error('Google Sheets adapter não implementado. Use STORAGE_ADAPTER=memory.');
}

async function updateSession(sessao, data) {
  throw new Error('Google Sheets adapter não implementado.');
}

async function createLead(data) {
  throw new Error('Google Sheets adapter não implementado.');
}

async function createClient(data) {
  throw new Error('Google Sheets adapter não implementado.');
}

async function createOther(data) {
  throw new Error('Google Sheets adapter não implementado.');
}

module.exports = { getSession, updateSession, createLead, createClient, createOther };
```

- [ ] **Step 3: Criar storage/index.js**

```js
// src/storage/index.js
// Seleciona adapter por variável de ambiente STORAGE_ADAPTER.
// Valores aceitos: 'memory' (padrão) | 'sheets'

const adapter = process.env.STORAGE_ADAPTER === 'sheets'
  ? require('./googleSheets')
  : require('./inMemory');

module.exports = adapter;
```

- [ ] **Step 4: Commit**

```bash
git add src/storage/
git commit -m "feat: storage adapter plugável (in-memory MVP + stub Google Sheets)"
```

---

## Task 5: Session Manager

**Files:**
- Create: `src/sessionManager.js`

- [ ] **Step 1: Criar sessionManager.js**

```js
// src/sessionManager.js
// Fachada para operações de sessão. Toda a lógica usa storage via adapter.

const storage = require('./storage');

/**
 * Retorna sessão existente ou cria nova com estado 'inicio'.
 */
async function getSession(sessao, canalOrigem) {
  const existing = await storage.getSession(sessao);
  if (existing) return existing;

  const nova = {
    sessao,
    estadoAtual: 'inicio',
    fluxo: null,
    area: null,
    situacao: null,
    impacto: null,
    intencao: null,
    nome: null,
    canalOrigem: canalOrigem || 'desconhecido',
    canalPreferido: null,
    ultimaMensagem: null,
    ultimaPergunta: null,
    score: 1,
    prioridade: 'FRIO',
    flagAtencao: false,
    atualizadoEm: new Date().toISOString(),
  };

  await storage.updateSession(sessao, nova);
  return nova;
}

/**
 * Atualiza campos específicos de uma sessão.
 */
async function updateSession(sessao, data) {
  await storage.updateSession(sessao, {
    ...data,
    atualizadoEm: new Date().toISOString(),
  });
}

/**
 * Reseta sessão para o estado inicial.
 */
async function resetSession(sessao, canalOrigem) {
  await storage.updateSession(sessao, {
    estadoAtual: 'inicio',
    fluxo: null,
    area: null,
    situacao: null,
    impacto: null,
    intencao: null,
    nome: null,
    canalPreferido: null,
    ultimaMensagem: null,
    ultimaPergunta: null,
    score: 1,
    prioridade: 'FRIO',
    flagAtencao: false,
    atualizadoEm: new Date().toISOString(),
  });
  return getSession(sessao, canalOrigem);
}

module.exports = { getSession, updateSession, resetSession };
```

- [ ] **Step 2: Commit**

```bash
git add src/sessionManager.js
git commit -m "feat: session manager com get/update/reset"
```

---

## Task 6: State Machine

**Files:**
- Create: `src/stateMachine.js`
- Create: `tests/stateMachine.test.js`

- [ ] **Step 1: Escrever testes de transição que falham**

Criar `tests/stateMachine.test.js`:

```js
const { process: processar } = require('../src/stateMachine');
const storage = require('../src/storage/inMemory');

beforeEach(() => storage._clear());

describe('stateMachine — inicio', () => {
  test('estado inicio retorna mensagem de boas-vindas', async () => {
    const result = await processar('11999', 'oi', 'whatsapp');
    expect(result.estado).toBe('inicio');
    expect(result.message).toContain('Digite');
  });

  test('"1" no inicio direciona para cliente_nome', async () => {
    await processar('11999', 'oi', 'whatsapp'); // inicializa sessão
    const result = await processar('11999', '1', 'whatsapp');
    expect(result.estado).toBe('cliente_nome');
    expect(result.fluxo).toBe('cliente');
  });

  test('"2" no inicio direciona para trabalhista_situacao', async () => {
    await processar('11999', 'oi', 'whatsapp');
    const result = await processar('11999', '2', 'whatsapp');
    expect(result.estado).toBe('trabalhista_situacao');
    expect(result.fluxo).toBe('trabalhista');
  });

  test('"3" no inicio direciona para familia_situacao', async () => {
    await processar('11999', 'oi', 'whatsapp');
    const result = await processar('11999', '3', 'whatsapp');
    expect(result.estado).toBe('familia_situacao');
  });

  test('"4" no inicio direciona para outro_tipo', async () => {
    await processar('11999', 'oi', 'whatsapp');
    const result = await processar('11999', '4', 'whatsapp');
    expect(result.estado).toBe('outro_tipo');
  });

  test('texto "demitido" no inicio vai para trabalhista', async () => {
    await processar('11999', 'oi', 'whatsapp');
    const result = await processar('11999', 'fui demitido', 'whatsapp');
    expect(result.fluxo).toBe('trabalhista');
  });

  test('"reiniciar" reseta o estado', async () => {
    await processar('11999', 'oi', 'whatsapp');
    await processar('11999', '2', 'whatsapp'); // entra em trabalhista
    const result = await processar('11999', 'reiniciar', 'whatsapp');
    expect(result.estado).toBe('inicio');
  });
});

describe('stateMachine — score incremental', () => {
  test('score é atualizado após coleta de impacto', async () => {
    await processar('11999', 'oi', 'whatsapp');
    await processar('11999', '2', 'whatsapp'); // trabalhista_situacao
    await processar('11999', 'fui demitido sem justa causa', 'whatsapp'); // trabalhista_impacto
    const result = await processar('11999', '3', 'whatsapp'); // impacto = 3
    expect(result.score).toBeGreaterThan(1);
  });
});

describe('stateMachine — flag de atenção', () => {
  test('mensagem com "urgente" ativa flagAtencao', async () => {
    await processar('11999', 'oi', 'whatsapp');
    const result = await processar('11999', 'preciso urgente de ajuda', 'whatsapp');
    expect(result.flagAtencao).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
npx jest tests/stateMachine.test.js
```

Esperado: FAIL (module not found)

- [ ] **Step 3: Implementar stateMachine.js**

Criar `src/stateMachine.js`:

```js
// src/stateMachine.js
const sessionManager = require('./sessionManager');
const { calcularScore } = require('./scorer');
const storage = require('./storage');

const RESET_KEYWORDS = ['menu', 'reiniciar', 'voltar'];
const URGENT_KEYWORDS = ['urgente', 'advogado', 'falar com alguém', 'falar com alguem'];

// ─── Perguntas por estado ──────────────────────────────────────────────────
const PERGUNTAS = {
  inicio: `Olá. Posso direcionar seu atendimento.\n\nDigite:\n1 - Já sou cliente\n2 - Trabalhista\n3 - Família\n4 - Outro assunto`,

  cliente_nome: 'Qual é o seu nome completo?',
  cliente_canal_preferido: 'Como prefere ser contatado? (WhatsApp / Telefone / E-mail)',
  cliente_mensagem: 'Descreva brevemente sua solicitação:',
  cliente_finalizado: null,

  trabalhista_situacao: 'Descreva brevemente sua situação trabalhista:',
  trabalhista_impacto: 'Qual o impacto financeiro estimado?\n1 - Baixo\n2 - Médio\n3 - Alto',
  trabalhista_intencao: 'Qual sua intenção?\n1 - Buscar acordo\n2 - Entrar na Justiça\n3 - Ainda não sei',
  trabalhista_nome: 'Qual é o seu nome completo?',
  trabalhista_canal_preferido: 'Como prefere ser contatado? (WhatsApp / Telefone / E-mail)',
  trabalhista_descricao: 'Descreva mais detalhes do seu caso:',
  trabalhista_finalizado: null,

  familia_situacao: 'Descreva brevemente sua situação familiar:',
  familia_impacto: 'Qual o impacto estimado?\n1 - Baixo\n2 - Médio\n3 - Alto',
  familia_intencao: 'Qual sua intenção?\n1 - Buscar acordo\n2 - Processo judicial\n3 - Ainda não sei',
  familia_nome: 'Qual é o seu nome completo?',
  familia_canal_preferido: 'Como prefere ser contatado? (WhatsApp / Telefone / E-mail)',
  familia_descricao: 'Descreva mais detalhes do seu caso:',
  familia_finalizado: null,

  outro_tipo: 'Qual tipo de assunto você precisa tratar?',
  outro_intencao: 'Qual sua intenção?\n1 - Informação\n2 - Contratar serviço\n3 - Reclamação',
  outro_nome: 'Qual é o seu nome completo?',
  outro_canal_preferido: 'Como prefere ser contatado? (WhatsApp / Telefone / E-mail)',
  outro_descricao: 'Descreva sua solicitação:',
  outro_finalizado: null,
};

// ─── Classificação por texto livre ────────────────────────────────────────
function classificarPorTexto(mensagem) {
  if (/sou cliente|já cliente/.test(mensagem)) return 'cliente';
  if (/demitido|empresa|trabalhista|emprego|salário|salario|rescisão|rescisao|fgts/.test(mensagem)) return 'trabalhista';
  if (/guarda|pensão|pensao|divórcio|divorcio|família|familia|cônjuge|conjuge/.test(mensagem)) return 'familia';
  return null;
}

// ─── Detectar flag de atenção ──────────────────────────────────────────────
function temUrgencia(mensagem) {
  return URGENT_KEYWORDS.some(k => mensagem.includes(k));
}

// ─── Recalcular score na sessão ────────────────────────────────────────────
async function recalcularScore(sessao, dados) {
  const { score, prioridade } = calcularScore({
    impacto: dados.impacto,
    intencao: dados.intencao,
  });
  const flagAtencao = dados.flagAtencao || prioridade === 'QUENTE';
  await sessionManager.updateSession(sessao, { score, prioridade, flagAtencao });
  return { score, prioridade, flagAtencao };
}

// ─── Mensagem de finalização ──────────────────────────────────────────────
function mensagemFinalizacao(prioridade) {
  if (prioridade === 'QUENTE') return 'Seu caso foi identificado como prioritário. Entraremos em contato o mais breve possível.';
  if (prioridade === 'MEDIO') return 'Recebemos suas informações e iremos analisar seu caso.';
  return 'Registramos sua solicitação.';
}

// ─── Persistência por tipo de fluxo ───────────────────────────────────────
async function persistirFluxo(sessao) {
  const s = await storage.getSession(sessao);
  if (!s) return;

  if (s.fluxo === 'cliente') {
    await storage.createClient({
      nome: s.nome,
      telefone: s.sessao,
      tipoSolicitacao: 'Atendimento cliente existente',
      canalOrigem: s.canalOrigem,
      canalPreferido: s.canalPreferido,
      conteudo: s.ultimaMensagem,
      urgencia: s.prioridade,
      status: 'NOVO',
      origem: 'whatsapp-bot',
    });
    return;
  }

  if (s.fluxo === 'trabalhista' || s.fluxo === 'familia') {
    await storage.createLead({
      nome: s.nome,
      telefone: s.sessao,
      area: s.fluxo,
      situacao: s.situacao,
      impacto: s.impacto,
      intencao: s.intencao,
      score: s.score,
      prioridade: s.prioridade,
      canalOrigem: s.canalOrigem,
      canalPreferido: s.canalPreferido,
      resumo: s.ultimaMensagem,
      status: 'NOVO',
      origem: 'whatsapp-bot',
    });
    return;
  }

  await storage.createOther({
    nome: s.nome,
    telefone: s.sessao,
    tipo: s.situacao,
    canalOrigem: s.canalOrigem,
    canalPreferido: s.canalPreferido,
    conteudo: s.ultimaMensagem,
    status: 'NOVO',
    origem: 'whatsapp-bot',
  });
}

// ─── Transições por estado ────────────────────────────────────────────────
async function transitar(sessao, estado, mensagem) {
  switch (estado) {

    // ── INICIO ──
    case 'inicio': {
      let fluxo = null;
      if (mensagem === '1') fluxo = 'cliente';
      else if (mensagem === '2') fluxo = 'trabalhista';
      else if (mensagem === '3') fluxo = 'familia';
      else if (mensagem === '4') fluxo = 'outros';
      else fluxo = classificarPorTexto(mensagem);

      if (!fluxo) return { proximoEstado: 'inicio', salvar: {} };

      const mapaEstado = {
        cliente: 'cliente_nome',
        trabalhista: 'trabalhista_situacao',
        familia: 'familia_situacao',
        outros: 'outro_tipo',
      };
      return { proximoEstado: mapaEstado[fluxo], salvar: { fluxo, area: fluxo } };
    }

    // ── CLIENTE ──
    case 'cliente_nome':
      return { proximoEstado: 'cliente_canal_preferido', salvar: { nome: mensagem } };

    case 'cliente_canal_preferido':
      return { proximoEstado: 'cliente_mensagem', salvar: { canalPreferido: mensagem } };

    case 'cliente_mensagem':
      return { proximoEstado: 'cliente_finalizado', salvar: { ultimaMensagem: mensagem } };

    // ── TRABALHISTA ──
    case 'trabalhista_situacao':
      return { proximoEstado: 'trabalhista_impacto', salvar: { situacao: mensagem } };

    case 'trabalhista_impacto': {
      const impacto = Math.min(3, Math.max(1, parseInt(mensagem) || 1));
      const sess = await storage.getSession(sessao);
      const score = await recalcularScore(sessao, { ...sess, impacto });
      return { proximoEstado: 'trabalhista_intencao', salvar: { impacto, ...score } };
    }

    case 'trabalhista_intencao': {
      const intencao = Math.min(3, Math.max(1, parseInt(mensagem) || 1));
      const sess = await storage.getSession(sessao);
      const score = await recalcularScore(sessao, { ...sess, intencao });
      return { proximoEstado: 'trabalhista_nome', salvar: { intencao, ...score } };
    }

    case 'trabalhista_nome':
      return { proximoEstado: 'trabalhista_canal_preferido', salvar: { nome: mensagem } };

    case 'trabalhista_canal_preferido':
      return { proximoEstado: 'trabalhista_descricao', salvar: { canalPreferido: mensagem } };

    case 'trabalhista_descricao':
      return { proximoEstado: 'trabalhista_finalizado', salvar: { ultimaMensagem: mensagem } };

    // ── FAMÍLIA ──
    case 'familia_situacao':
      return { proximoEstado: 'familia_impacto', salvar: { situacao: mensagem } };

    case 'familia_impacto': {
      const impacto = Math.min(3, Math.max(1, parseInt(mensagem) || 1));
      const sess = await storage.getSession(sessao);
      const score = await recalcularScore(sessao, { ...sess, impacto });
      return { proximoEstado: 'familia_intencao', salvar: { impacto, ...score } };
    }

    case 'familia_intencao': {
      const intencao = Math.min(3, Math.max(1, parseInt(mensagem) || 1));
      const sess = await storage.getSession(sessao);
      const score = await recalcularScore(sessao, { ...sess, intencao });
      return { proximoEstado: 'familia_nome', salvar: { intencao, ...score } };
    }

    case 'familia_nome':
      return { proximoEstado: 'familia_canal_preferido', salvar: { nome: mensagem } };

    case 'familia_canal_preferido':
      return { proximoEstado: 'familia_descricao', salvar: { canalPreferido: mensagem } };

    case 'familia_descricao':
      return { proximoEstado: 'familia_finalizado', salvar: { ultimaMensagem: mensagem } };

    // ── OUTROS ──
    case 'outro_tipo':
      return { proximoEstado: 'outro_intencao', salvar: { situacao: mensagem } };

    case 'outro_intencao': {
      const intencao = Math.min(3, Math.max(1, parseInt(mensagem) || 1));
      const sess = await storage.getSession(sessao);
      const score = await recalcularScore(sessao, { ...sess, intencao });
      return { proximoEstado: 'outro_nome', salvar: { intencao, ...score } };
    }

    case 'outro_nome':
      return { proximoEstado: 'outro_canal_preferido', salvar: { nome: mensagem } };

    case 'outro_canal_preferido':
      return { proximoEstado: 'outro_descricao', salvar: { canalPreferido: mensagem } };

    case 'outro_descricao':
      return { proximoEstado: 'outro_finalizado', salvar: { ultimaMensagem: mensagem } };

    default:
      return { proximoEstado: estado, salvar: {} };
  }
}

// ─── Ponto de entrada principal ───────────────────────────────────────────
async function process(sessao, mensagem, canal) {
  // 1. Carregar sessão
  let sessaoObj = await sessionManager.getSession(sessao, canal);

  // 2. Detectar urgência em qualquer momento
  const urgente = temUrgencia(mensagem);
  if (urgente && !sessaoObj.flagAtencao) {
    await sessionManager.updateSession(sessao, { flagAtencao: true });
    sessaoObj = { ...sessaoObj, flagAtencao: true };
  }

  // 3. Palavras de reinício
  if (RESET_KEYWORDS.includes(mensagem)) {
    sessaoObj = await sessionManager.resetSession(sessao, canal);
    return {
      message: PERGUNTAS.inicio,
      estado: 'inicio',
      fluxo: null,
      sessao,
      score: 1,
      prioridade: 'FRIO',
      flagAtencao: sessaoObj.flagAtencao,
    };
  }

  // 4. Estado inicio: mostrar menu sem transitar (só exibe na primeira vez)
  if (sessaoObj.estadoAtual === 'inicio' && !mensagem) {
    return buildResposta(sessaoObj, PERGUNTAS.inicio);
  }

  // 5. Salvar última mensagem
  await sessionManager.updateSession(sessao, { ultimaMensagem: mensagem });

  // 6. Processar transição
  const { proximoEstado, salvar } = await transitar(sessao, sessaoObj.estadoAtual, mensagem);
  await sessionManager.updateSession(sessao, { ...salvar, estadoAtual: proximoEstado });

  // 7. Recarregar sessão atualizada
  const sessaoAtualizada = await storage.getSession(sessao);

  // 8. Finalização
  const finalStates = ['cliente_finalizado', 'trabalhista_finalizado', 'familia_finalizado', 'outro_finalizado'];
  if (finalStates.includes(proximoEstado)) {
    await persistirFluxo(sessao);
    const msg = mensagemFinalizacao(sessaoAtualizada.prioridade);
    await sessionManager.updateSession(sessao, { ultimaPergunta: msg });
    return buildResposta(sessaoAtualizada, msg);
  }

  // 9. Próxima pergunta
  const pergunta = PERGUNTAS[proximoEstado] || PERGUNTAS.inicio;
  await sessionManager.updateSession(sessao, { ultimaPergunta: pergunta });
  return buildResposta(sessaoAtualizada, pergunta);
}

function buildResposta(sessao, message) {
  return {
    message,
    estado: sessao.estadoAtual,
    fluxo: sessao.fluxo,
    sessao: sessao.sessao,
    score: sessao.score,
    prioridade: sessao.prioridade,
    flagAtencao: sessao.flagAtencao || false,
  };
}

module.exports = { process };
```

- [ ] **Step 4: Rodar testes**

```bash
npx jest tests/stateMachine.test.js
```

Esperado: todos os testes PASS

- [ ] **Step 5: Commit**

```bash
git add src/stateMachine.js tests/stateMachine.test.js
git commit -m "feat: máquina de estados com score incremental e flag de atenção"
```

---

## Task 7: Responder + Server.js final

**Files:**
- Create: `src/responder.js`
- Modify: `server.js`

- [ ] **Step 1: Criar responder.js**

```js
// src/responder.js
// Garante formato consistente de saída, independente de como a stateMachine respondeu.

function buildResponse(resultado) {
  return {
    message: resultado.message || '',
    estado: resultado.estado || null,
    fluxo: resultado.fluxo || null,
    sessao: resultado.sessao || null,
    score: resultado.score ?? 1,
    prioridade: resultado.prioridade || 'FRIO',
    flagAtencao: resultado.flagAtencao || false,
  };
}

module.exports = { buildResponse };
```

- [ ] **Step 2: Reescrever server.js**

```js
// server.js
require('dotenv').config();

const express = require('express');
const normalize = require('./src/normalizer');
const { process: processar } = require('./src/stateMachine');
const { buildResponse } = require('./src/responder');

const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
  try {
    const { sessao, mensagem, canal } = normalize(req.body);

    if (!sessao) {
      return res.status(400).json({ error: 'Campo "sessao" é obrigatório.' });
    }

    const resultado = await processar(sessao, mensagem, canal);
    return res.json(buildResponse(resultado));

  } catch (err) {
    console.error('[webhook error]', err);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// Health check para Railway
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Storage adapter: ${process.env.STORAGE_ADAPTER || 'memory'}`);
});
```

- [ ] **Step 3: Rodar todos os testes**

```bash
npx jest --runInBand
```

Esperado: todos os testes PASS

- [ ] **Step 4: Testar manualmente**

```bash
node server.js &
curl -s -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"sessao":"5511999999999","mensagem":"oi","canal":"whatsapp"}' | jq .
```

Esperado:
```json
{
  "message": "Olá. Posso direcionar seu atendimento...",
  "estado": "inicio",
  "fluxo": null,
  "sessao": "5511999999999",
  "score": 1,
  "prioridade": "FRIO",
  "flagAtencao": false
}
```

- [ ] **Step 5: Matar servidor de teste**

```bash
kill %1
```

- [ ] **Step 6: Commit final**

```bash
git add server.js src/responder.js
git commit -m "feat: server.js final com responder e health check"
```

---

## Task 8: Verificação final e Railway-ready

**Files:**
- Verify: `package.json`
- Verify: `.env.example`

- [ ] **Step 1: Rodar todos os testes**

```bash
npx jest --runInBand --verbose
```

Esperado: todos PASS, 0 failing

- [ ] **Step 2: Verificar start script funciona**

```bash
node server.js &
sleep 1
curl -s http://localhost:3000/health
kill %1
```

Esperado: `{"status":"ok"}`

- [ ] **Step 3: Verificar .env.example está completo**

Conteúdo esperado:
```
PORT=3000
STORAGE_ADAPTER=memory
```

- [ ] **Step 4: Commit de fechamento**

```bash
git add .
git commit -m "chore: sistema completo pronto para deploy no Railway"
```
