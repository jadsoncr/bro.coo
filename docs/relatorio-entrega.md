# Relatório de Entrega — Sistema de Atendimento Jurídico
**Santos & Bastos Advogados**
**Data:** 16/04/2026
**Repositório:** https://github.com/jadsoncr/santosebastos_aten
**Deploy:** Railway (autodeploy via push em `main`)

---

## 1. Objetivo

Construir um sistema automatizado de atendimento jurídico via WhatsApp, capaz de:

- Receber mensagens do n8n via webhook
- Classificar e qualificar leads com score incremental
- Conduzir o usuário por fluxos de atendimento específicos
- Identificar urgência e priorizar casos automaticamente
- Persistir dados no Google Sheets para triagem pelo time de advogados

---

## 2. Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 22 |
| Framework | Express 5 |
| Módulos | CommonJS |
| Testes | Jest 29 |
| Persistência | Google Sheets API v4 (googleapis) |
| Auth Sheets | Service Account (JSON inline) |
| IDs únicos | crypto.randomUUID() (built-in Node) |
| Deploy | Railway (autodeploy via git push) |
| Integração | n8n → webhook POST |

---

## 3. Arquitetura

```
WhatsApp → n8n → POST /webhook
                      │
                 normalizer.js
                      │
               sessionManager.js
                      │
               stateMachine.js
                      │
                  scorer.js
                      │
               storage/index.js
               ┌──────┴──────┐
          inMemory.js    googleSheets.js
               │                │
          sessões ativas    Leads / Clientes / Outros
```

**Princípio de armazenamento híbrido:**
- Sessões (estado conversacional) → sempre em memória (stateful, por conversa)
- Persistência final (lead qualificado) → Google Sheets via `STORAGE_ADAPTER=sheets`

---

## 4. Módulos Entregues

### 4.1 `server.js`
Servidor Express com dois endpoints:
- `POST /webhook` — recebe mensagem, processa e retorna resposta estruturada
- `GET /health` — healthcheck para Railway

### 4.2 `src/normalizer.js`
Normaliza entrada do webhook:
- Aceita `sessao`, `telefone` ou `Telefone` como identificador
- Remove caracteres não numéricos do identificador
- Trim + lowercase na mensagem
- Adiciona `dataHora` ISO

### 4.3 `src/scorer.js`
Calcula score incremental:
```
score = impacto (1-3) + intencao (1-3) + 1
QUENTE  ≥ 7
MEDIO   5-6
FRIO    < 5
```

### 4.4 `src/sessionManager.js`
Gerencia sessões em memória:
- `getSession` — cria sessão nova se não existir
- `updateSession` — merge de campos
- `resetSession` — preserva `flagAtencao` entre resets

### 4.5 `src/stateMachine.js`
Máquina de estados com 4 fluxos principais:

| Fluxo | Trigger | Destino |
|---|---|---|
| Trabalhista | "fui demitido", "horas extras", etc | trabalhista_* |
| Previdenciário | "INSS", "aposentadoria", etc | previdenciario_* |
| Consumidor | "produto com defeito", "cobrado", etc | consumidor_* |
| Outros | "contrato", "dúvida geral" | outros_* |
| Cliente existente | "já sou cliente", "meu processo" | cliente_* |

**Jornada de abertura (híbrida):**
1. `inicio` → pergunta aberta: "Me conta o que aconteceu"
2. `inicio_detalhe` → se resposta vaga: "Pode me dar mais detalhes?"
3. `inicio_menu` → fallback com menu numerado

**Estado `quente_humano`:** quando score ≥ 7, oferece transferência para advogado antes de finalizar.

### 4.6 `src/storage/googleSheets.js`
Adapter de persistência no Google Sheets:
- Auth via `GOOGLE_SERVICE_ACCOUNT_JSON` (JSON inline, compatível com Railway)
- 3 abas separadas: **Leads**, **Clientes**, **Outros**
- Formatação automática de booleanos (`SIM`/`NAO`) e nulos (string vazia)
- UUID gerado via `crypto.randomUUID()`

### 4.7 `src/storage/index.js`
Router de storage:
```
STORAGE_ADAPTER=memory  → tudo em memória (dev/teste)
STORAGE_ADAPTER=sheets  → persistência no Google Sheets
```
Sessões sempre em memória independente do adapter.

### 4.8 `src/responder.js`
Normaliza saída do webhook para o n8n.

---

## 5. Estrutura da Planilha Google Sheets

### Aba: Leads
| data_hora | lead_id | status | nome | telefone | area | situacao | impacto | intencao | score | prioridade | flag_atencao | canal_origem | resumo |

### Aba: Clientes
| data_hora | lead_id | status | nome | telefone | tipo | situacao | impacto | intencao | score | urgencia | flag_atencao | canal_origem | conteudo |

### Aba: Outros
| data_hora | lead_id | status | nome | telefone | tipo | assunto | impacto | intencao | score | prioridade | flag_atencao | canal_origem | conteudo |

---

## 6. Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|---|---|---|
| `PORT` | Porta do servidor (padrão: 3000) | Não |
| `STORAGE_ADAPTER` | `memory` ou `sheets` | Sim |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON completo da service account (inline) | Quando `sheets` |
| `GOOGLE_SHEETS_ID` | ID da planilha extraído da URL | Quando `sheets` |

---

## 7. Testes

**66 testes automatizados** em 3 suites (Jest):

| Suite | Testes | Cobertura |
|---|---|---|
| `stateMachine.test.js` | 53 | Todos os fluxos, fallbacks, 29 variações linguísticas |
| `scorer.test.js` | 7 | Todos os thresholds e combinações de score |
| `storage.test.js` | 6 | CRUD em memória, reset, listagem |

**Variações linguísticas cobertas (trabalhista):**
"fui demitido", "me mandaram embora", "fui dispensado", "fui desligado", "perdi meu emprego", "rescisão", "aviso prévio", "horas extras", "adicional noturno", "assédio", "acidente de trabalho", e mais 18 variações coloquiais do português brasileiro.

---

## 8. Bugs Corrigidos Durante QA

| # | Bug | Fix |
|---|---|---|
| 1 | `flagAtencao` zerava no reset da sessão | `resetSession` preserva valor anterior |
| 2 | Prioridade não refletia na resposta após persistência | Sessão recarregada após `persistirFluxo()` |
| 3 | `inicio_detalhe` não aceitava menu numérico | Adicionado check de dígitos `1/2/3/4` |
| 4 | Mensagem de abertura retornava prompt errado | Case especial na transição `inicio → inicio_detalhe` |
| 5 | `uuid` v13 incompatível com Jest (ESM) | Substituído por `crypto.randomUUID()` built-in |
| 6 | `try` sem `catch` em `persistirFluxo()` | Adicionado `catch` com log de erro |

---

## 9. Deploy — Railway

**Variáveis configuradas no Railway:**
```
STORAGE_ADAPTER=sheets
GOOGLE_SHEETS_ID=1DsJMSMdHigZ4j7GF4b1Qwy78OD2oZoyQBVWW9zyr-30
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

**Endpoints de produção:**
```
POST https://<app>.railway.app/webhook
GET  https://<app>.railway.app/health
```

**Autodeploy:** ativado via push na branch `main`.

---

## 10. Integração n8n

Payload esperado pelo webhook:

```json
{
  "sessao": "5521999999999",
  "mensagem": "fui demitido sem justa causa",
  "canal": "whatsapp"
}
```

Resposta retornada:

```json
{
  "resposta": "Entendo, é uma situação difícil...",
  "estado": "trabalhista_impacto",
  "prioridade": "QUENTE",
  "encerrado": false
}
```

Quando `encerrado: true`, o n8n encaminha o lead para a planilha e notifica o time.

---

## 11. Service Account Google

- **Email:** `sheets-backend@gen-lang-client-0312396046.iam.gserviceaccount.com`
- **Projeto GCP:** `gen-lang-client-0312396046`
- **Permissão na planilha:** Editor
- **API habilitada:** Google Sheets API v4

---

## 12. Histórico de Commits

| Hash | Descrição |
|---|---|
| `130637c` | feat: Google Sheets adapter com UUID, storage híbrido e try/catch |
| `a144731` | docs: relatório de entrega |
| `7b81bb9` | test: QA completo com 66 testes + fix de 2 bugs |
| `1e7f9c5` | feat: finalização FRIO, impacto em outros, cliente como MEDIO |
| `2a7274b` | feat: jornada híbrida com abertura conversacional e humano QUENTE |
| `33413da` | refactor: renomear canal_preferido para canal_contato |
| `0e58ae0` | feat: aceitar telefone/Telefone como alias de sessao |
| `d7fd913` | feat: server.js final com responder e health check |
| `9f17561` | feat: máquina de estados com score incremental e flagAtencao |
| `c0513d6` | feat: session manager com get/update/reset |
| `ef25701` | feat: storage adapter plugável |
| `53f5e84` | feat: scorer com cálculo incremental de prioridade |
| `0b3ca2e` | feat: normalizer de entrada do webhook |
| `317d250` | chore: setup inicial do projeto |

---

## 13. Checklist de Entrega

- [x] Backend Node.js/Express com webhook funcional
- [x] Máquina de estados com 4 fluxos + cliente existente
- [x] Jornada híbrida com abertura conversacional
- [x] Score incremental com 3 níveis de prioridade (FRIO / MEDIO / QUENTE)
- [x] Flag de atenção persistente entre resets de sessão
- [x] Oferta de humano para leads QUENTE
- [x] 66 testes automatizados passando
- [x] Storage adapter plugável (memory / sheets)
- [x] Google Sheets adapter com autenticação via service account
- [x] 3 abas na planilha com cabeçalhos (Leads, Clientes, Outros)
- [x] Variáveis de ambiente documentadas
- [x] Deploy no Railway configurado
- [x] Integração validada com 13 registros reais na planilha

---

*Entregue por Claude Code — Santos & Bastos Advogados © 2026*
