# Design: Sistema de Atendimento Jurídico Automatizado

**Data:** 2026-04-15  
**Status:** Aprovado

---

## Objetivo

Sistema de atendimento jurídico baseado em máquina de estados que:
- Recebe mensagens via webhook (WhatsApp/API via n8n)
- Mantém estado por sessão (telefone)
- Conduz o usuário por uma jornada de atendimento
- Classifica leads com score incremental
- Persiste dados via storage adapter plugável
- Responde com JSON estruturado para o n8n

---

## Arquitetura

```
POST /webhook { sessao, mensagem, canal }
    │
    ├── normalizer.js        → limpa e padroniza entrada
    ├── sessionManager.js    → get/update de sessão via storage
    ├── stateMachine.js      → motor de estados + transições + score incremental
    ├── scorer.js            → calcula score e prioridade
    ├── responder.js         → monta resposta JSON final
    └── storage/
        ├── index.js         → exporta adapter ativo (via STORAGE_ADAPTER env)
        ├── inMemory.js      → Map em memória (MVP)
        └── googleSheets.js  → stub para implementação futura
```

### Fluxo de uma requisição

1. n8n faz POST → `server.js` chama `normalizer`
2. `sessionManager.getSession` carrega estado atual
3. `stateMachine.process(sessao, mensagem)` — valida, transita, salva dado, recalcula score se necessário
4. Se finalizado → `storage` persiste lead/cliente/outro
5. `responder` monta resposta
6. n8n recebe e repassa `message` ao WhatsApp

---

## Entrada

```json
{ "sessao": "5511999999999", "mensagem": "texto", "canal": "whatsapp" }
```

### Normalização

- `sessao`: remove não-numéricos, trim
- `mensagem`: trim, lowercase
- `canal`: lowercase
- `dataHora`: ISO 8601

---

## Máquina de Estados

### Estado inicial: `inicio`

Mensagem de boas-vindas com menu numérico. Interpretação inteligente:
- Número `1` ou texto com "sou cliente" → fluxo **cliente**
- Número `2` ou texto com "demitido", "empresa", "trabalho" → fluxo **trabalhista**
- Número `3` ou texto com "guarda", "pensão", "divórcio", "família" → fluxo **familia**
- Número `4` ou qualquer outro → fluxo **outros**

### Fluxo: cliente

```
cliente_nome → cliente_canal_preferido → cliente_mensagem → cliente_finalizado
```

### Fluxo: trabalhista

```
trabalhista_situacao → trabalhista_impacto* → trabalhista_intencao* → trabalhista_nome → trabalhista_canal_preferido → trabalhista_descricao → trabalhista_finalizado
```

### Fluxo: familia

```
familia_situacao → familia_impacto* → familia_intencao* → familia_nome → familia_canal_preferido → familia_descricao → familia_finalizado
```

### Fluxo: outros

```
outro_tipo → outro_intencao* → outro_nome → outro_canal_preferido → outro_descricao → outro_finalizado
```

`*` = estados que disparam recálculo de score imediatamente ao salvar

### Palavras especiais

- **Reinício:** `menu`, `reiniciar`, `voltar` → reseta para `inicio`
- **Interrupção:** `urgente`, `advogado`, `falar com alguém` → ativa `flagAtencao: true`

---

## Score Incremental

Score é recalculado dentro do `stateMachine` a cada vez que `impacto` ou `intencao` são coletados. O resultado fica gravado na sessão imediatamente.

```
score = impacto + intencao + 1

score >= 7 → QUENTE  (prioridade: imediato)
score >= 5 → MEDIO   (prioridade: mesmo dia)
score < 5  → FRIO    (prioridade: fila)
```

Escalas:
- `impacto`: 1–3 (pergunta com opções numeradas)
- `intencao`: 1–3 (pergunta com opções numeradas)

### Detecção precoce de lead QUENTE

`flagAtencao: true` é ativada quando:
- `prioridade === "QUENTE"` em qualquer ponto do fluxo
- Mensagem contém palavra de interrupção

---

## Storage Adapter

### Contrato (interface)

```js
getSession(sessao)          → Promise<Object | null>
updateSession(sessao, data) → Promise<void>
createLead(data)            → Promise<void>
createClient(data)          → Promise<void>
createOther(data)           → Promise<void>
```

### Seleção via variável de ambiente

```js
// storage/index.js
const adapter = process.env.STORAGE_ADAPTER === 'sheets'
  ? require('./googleSheets')
  : require('./inMemory');
```

### Estrutura de sessão

```js
{
  sessao, estadoAtual, fluxo, area, situacao, impacto, intencao,
  nome, canalOrigem, canalPreferido, ultimaMensagem, ultimaPergunta,
  score, prioridade, flagAtencao, atualizadoEm
}
```

### Estrutura das abas (Google Sheets futuro)

**SESSOES:** Sessao | EstadoAtual | Fluxo | Area | Situacao | Impacto | Intencao | Nome | CanalOrigem | CanalPreferido | UltimaMensagem | UltimaPergunta | Score | Prioridade | AtualizadoEm

**LEADS:** DataHora | Nome | Telefone | Area | Situacao | Impacto | Intencao | Score | Prioridade | CanalOrigem | CanalPreferido | Resumo | Status | Origem

**CLIENTES:** DataHora | Nome | Telefone | TipoSolicitacao | CanalOrigem | CanalPreferido | Conteudo | Urgencia | Status | Origem

**OUTROS:** DataHora | Nome | Telefone | Tipo | CanalOrigem | CanalPreferido | Conteudo | Status | Origem

---

## Resposta da API

```json
{
  "message": "Qual é o seu nome?",
  "estado": "trabalhista_nome",
  "fluxo": "trabalhista",
  "sessao": "5511999999999",
  "score": 5,
  "prioridade": "MEDIO",
  "flagAtencao": false
}
```

Mensagens de finalização por prioridade:
- QUENTE: `"Seu caso foi identificado como prioritário. Entraremos em contato o mais breve possível."`
- MEDIO: `"Recebemos suas informações e iremos analisar seu caso."`
- FRIO: `"Registramos sua solicitação."`

---

## Integração n8n

- n8n contém zero lógica de negócio
- Fluxo: `Webhook → HTTP Request (POST /webhook) → Send Message (WhatsApp)`
- n8n usa `response.message` para enviar ao usuário
- n8n pode usar `response.flagAtencao` para roteamento (ex: notificar advogado)

---

## Deploy (Railway)

Variáveis de ambiente:
```
PORT=3000
STORAGE_ADAPTER=memory   # ou 'sheets' no futuro
```

`package.json` deve ter `"start": "node server.js"`.

---

## Decisões registradas

| Decisão | Escolha | Motivo |
|---|---|---|
| Persistência de sessão | In-memory Map | MVP sem dependências externas |
| Perda em restart | Aceita | Sessões são curtas; troca trivial depois |
| Score | Incremental na sessão | Permite detecção precoce de leads quentes |
| Resposta | JSON estendido | n8n usa metadados para roteamento sem lógica |
| Google Sheets | Stub plugável | Sem credenciais agora; adapter pronto para trocar |
