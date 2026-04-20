# Relatório Técnico Completo — Santos & Bastos Advogados
**Bot de Atendimento via Telegram**
**Data de entrega:** 16/04/2026
**Versão:** 1.0 — Produção

---

## 1. O que foi construído

Um motor conversacional completo para captação e qualificação de leads jurídicos via Telegram. O sistema recebe mensagens, conduz o usuário por um fluxo de perguntas, calcula prioridade em tempo real e persiste os dados em Google Sheets — tudo de forma automática, sem intervenção humana no atendimento inicial.

**Não é um chatbot simples.** É uma máquina de estados com scoring, detecção de abandono, validação de entrada, tratamento progressivo de áudio e visibilidade de produção em tempo real.

---

## 2. Arquitetura do sistema

```
Telegram
   │
   ▼
server.js  ──── Webhook POST /webhook
   │              ├── detecta Telegram vs n8n/WhatsApp
   │              ├── trata áudio (3 níveis progressivos)
   │              ├── checkAbandono() — antes de processar
   │              └── sendTelegram() — após processar
   │
   ▼
stateMachine.js  ──── Motor principal
   │              ├── 20 estados mapeados
   │              ├── transitar() — lógica de transição
   │              ├── opcao() + repetir() — validação universal
   │              ├── calcularPrioridade() — score → FRIO/MEDIO/QUENTE
   │              ├── persistirFluxo() — retry 3x
   │              └── mensagemFinalizacao() — copy por prioridade
   │
   ▼
sessionManager.js  ──── Gestão de sessão
   │              ├── getSession() — cria ou recupera
   │              ├── updateSession() — atualiza campos
   │              └── resetSession() — reinício limpo
   │
   ▼
storage/
   ├── inMemory.js   ──── Sessões ativas (RAM, Railway)
   └── googleSheets.js ── Persistência final (Sheets API v4)
         ├── createLead()
         ├── createClient()
         ├── createOther()
         └── createAbandono() + ensureAbandonosHeader()
```

---

## 3. Stack técnica

| Componente | Tecnologia |
|---|---|
| Runtime | Node.js 22 |
| Framework | Express 5 |
| Módulos | CommonJS |
| Testes | Jest 30 |
| Deploy | Railway (auto-deploy via GitHub) |
| Canal | Telegram Bot API |
| Persistência | Google Sheets API v4 |
| Auth | Google Service Account (JSON) |
| Sessões | In-memory (Map) |
| Variáveis | dotenv + Railway env vars |

**Dependências de produção:** 4 pacotes (`dotenv`, `express`, `googleapis`, `uuid`)
**Dependências de desenvolvimento:** 1 pacote (`jest`)

---

## 4. Fluxos implementados

### 4.1 Trabalhista (6 perguntas)
```
start → trabalho_status → trabalho_tipo → trabalho_tempo
     → trabalho_salario → trabalho_contrato → trabalho_intencao
     → coleta_nome → contato_confirmacao → [final_lead] → pos_final
```

Scoring:
- Tipo "mais de uma irregularidade" → +2
- Salário acima de R$5k → +2
- Intenção "entrar na Justiça" → +2

### 4.2 Família (3 perguntas)
```
start → familia_tipo → familia_status → familia_urgencia
     → coleta_nome → contato_confirmacao → [final_lead] → pos_final
```

Scoring:
- Urgência declarada → +5 (garante QUENTE automaticamente)

### 4.3 Cliente existente (1 pergunta)
```
start → cliente_identificacao → [final_cliente] → pos_final
```

Mensagem de finalização personalizada com nome da Dra. Raquel.

### 4.4 Advogado (2 perguntas)
```
start → advogado_tipo → advogado_descricao
     → coleta_nome → contato_confirmacao → [final_lead] → pos_final
```

Score inicial: 5 (sempre QUENTE).

### 4.5 Outros (2 perguntas)
```
start → outros_descricao → outros_impacto
     → coleta_nome → contato_confirmacao → [final_lead] → pos_final
```

Scoring:
- Prejuízo declarado → +1

### 4.6 Pós-final
```
pos_final →
   1: "Novo atendimento" → resetSession() → "Tudo certo 👍" + start
   2: "Falar com advogado" → advogado_tipo
   3: "Encerrar" → encerramento
```

---

## 5. Sistema de scoring e priorização

O score é **cumulativo** — acumula pontos ao longo do fluxo conforme as respostas.

| Score | Prioridade | Critério |
|---|---|---|
| ≥ 5 | 🔥 QUENTE | Caso urgente ou alto impacto financeiro |
| 3–4 | 🟡 MEDIO | Interesse real, ainda avaliando |
| 0–2 | ⚪ FRIO | Dúvida inicial, baixo impacto |

A mensagem de finalização muda conforme a prioridade:
- **QUENTE:** "Já estou acionando um advogado... fique atento ao telefone"
- **MEDIO/FRIO:** "Encaminhando para análise... retorno em até 24h úteis"
- **Cliente:** "A Dra. Raquel ou alguém do time deve falar com você em breve"

---

## 6. Validação de entrada

Todo estado que espera opção numérica usa `opcao(msg, max)`:

```
entrada inválida → repete a pergunta (não avança, não quebra)
```

Estados validados: `trabalho_status`, `trabalho_tipo`, `trabalho_tempo`, `trabalho_salario`, `trabalho_contrato`, `trabalho_intencao`, `familia_tipo`, `familia_status`, `familia_urgencia`, `advogado_tipo`, `outros_impacto`, `contato_confirmacao`, `contato_canal`, `pos_final` — **14 estados**.

Estados com texto livre validam comprimento mínimo (3 chars) e rejeitam entradas óbvias como "oi", "1", "ok".

---

## 7. Tratamento de áudio (3 níveis progressivos)

Quando o usuário envia áudio, foto ou sticker:

| Contagem | Nível | Comportamento |
|---|---|---|
| 1º áudio | ACOLHE | Recebe com empatia + menu completo |
| 2º áudio | DIRECIONA | Reconhece + menu resumido |
| 3º+ áudio | CONTROLA | Direto ao ponto + menu mínimo |

O contador `audioCount` é mantido por sessão e persiste entre interações.

---

## 8. Detecção de abandono

Quando o usuário retorna após inatividade, o sistema detecta o abandono **antes** de processar a nova mensagem:

| Inatividade | Ação |
|---|---|
| < 30 min | Nada — fluxo continua normalmente |
| 30 min – 24h | Registra abandono + marca `statusSessao = ABANDONOU` |
| > 24h | Registra abandono + `resetSession()` — nova conversa |

Guardrails que evitam falsos positivos:
- Sessão sem nenhuma interação anterior → ignorada
- Estado já finalizado (`pos_final`, `encerramento`) → ignorado
- Já marcado como `ABANDONOU` → não duplica
- Erro no Sheets → loga e continua (não quebra o atendimento)

---

## 9. Persistência — Google Sheets

### Abas e estrutura

**Leads** (trabalhista, família, advogado):
`data_hora | lead_id | status | nome | telefone | area | situacao | impacto | intencao | score | prioridade | flag_atencao | canal_origem | resumo`

**Clientes** (já clientes):
`data_hora | lead_id | status | nome | telefone | tipo | ... | urgencia | ... | canal_origem | conteudo`

**Outros**:
`data_hora | lead_id | status | nome | telefone | tipo | descricao | ... | canal_origem | conteudo`

**Abandonos** (gerado automaticamente):
`data_hora | sessao_id | fluxo | ultimo_estado | score | prioridade | nome | canal_origem | mensagens_enviadas | classificacao`

A classificação de abandono é automática:
- `PRECOCE` → parou em `start` ou `fallback`
- `VALIOSO` → parou em `coleta_nome`, `contato_confirmacao`, `contato_numero`, `contato_canal`
- `MEDIO` → qualquer estado intermediário

Retry automático 3x em caso de falha na API do Sheets.

---

## 10. Visibilidade de produção

**Endpoint:** `GET /admin/sessions`
**Auth:** header `x-admin-token`

Retorna em tempo real:

```json
{
  "resumo": {
    "total": 12,
    "ativos": 4,
    "finalizados": 6,
    "abandonados": 2,
    "quentes": 3
  },
  "sessoes": [
    {
      "sessao": "123456789",
      "estado": "trabalho_salario",
      "fluxo": "trabalhista",
      "score": 2,
      "prioridade": "FRIO",
      "status": "ATIVO",
      "nome": "—",
      "canal": "telegram",
      "mensagens": 4,
      "ultimaMensagem": "1",
      "inatividade_min": 3
    }
  ]
}
```

---

## 11. Cobertura de testes

**40 testes / 3 suites — 100% passando**

| Suite | Testes | O que cobre |
|---|---|---|
| `stateMachine.test.js` | 29 | Todos os fluxos, score, pos_final, transições |
| `scorer.test.js` | 6 | Lógica de cálculo de prioridade |
| `storage.test.js` | 5 | Persistência in-memory |

Cenários cobertos por fluxo:
- Trabalhista: ordem de estados, bonuses de score, finalização, contato alternativo
- Família: ordem, urgência QUENTE, finalização
- Cliente: finalização rápida, não passa por coleta_nome
- Advogado: score inicial, caso novo, já é cliente, QUENTE
- Outros: ordem, impacto com score
- Pós-final: todas as 3 opções

---

## 12. Histórico de entregas

| Data | Commit | Entrega |
|---|---|---|
| 16/04/2026 | `317d250` | Setup inicial do projeto |
| 16/04/2026 | `9f17561` | Máquina de estados com score incremental |
| 16/04/2026 | `c0513d6` | Session manager |
| 16/04/2026 | `ef25701` | Storage adapter plugável |
| 16/04/2026 | `29669cb` | Integração Telegram |
| 16/04/2026 | `130637c` | Google Sheets adapter |
| 16/04/2026 | `42600ee` | Retry 3x na persistência |
| 16/04/2026 | `60b1ffa` | UX conversacional — áudio, abertura, menu |
| 16/04/2026 | `7b0270c` | **Jornada completa redesenhada** — 5 fluxos, copy definitivo |
| 16/04/2026 | `69f12c9` | Áudio progressivo 3 níveis + detecção de abandono |
| 16/04/2026 | `c39fb8b` | **Validação universal** — 14 estados, transição pos_final |
| 16/04/2026 | `7b42d55` | Endpoint `/admin/sessions` — visibilidade em produção |
| 16/04/2026 | `18790d8` | Guia operacional para o escritório |

**Total:** 28 commits, 917 linhas de código de produção.

---

## 13. Variáveis de ambiente (Railway)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `TELEGRAM_TOKEN` | ✅ | Token do bot Telegram |
| `GOOGLE_SHEETS_ID` | ✅ | ID da planilha |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | ✅ | JSON da service account |
| `STORAGE_ADAPTER` | ✅ | `google_sheets` em produção |
| `ADMIN_TOKEN` | ✅ | Token para `/admin/sessions` |
| `PORT` | auto | Railway define automaticamente |

---

## 14. O que não existe ainda (próxima fase)

| Item | Impacto | Complexidade |
|---|---|---|
| Reengajamento automático de abandonos | Alto | Médio — precisa de cron ou trigger externo |
| Testes para áudio progressivo e abandono | Médio | Baixo — estrutura já existe |
| `scorer.js` como dead code | Baixo | Baixo — remover ou integrar |
| Sessões persistidas entre deploys | Médio | Médio — Redis ou Sheets para sessões |
| Redução do fluxo trabalhista (9→6 perguntas) | Alto na retenção | Baixo — decisão de negócio |

---

## 15. Como verificar que tudo está funcionando

```bash
# Testes locais
npm test

# Health check em produção
curl https://sua-url.railway.app/health

# Sessões ativas em produção
curl -H "x-admin-token: SEU_TOKEN" https://sua-url.railway.app/admin/sessions

# Simular conversa local
node -e "
const { process: p } = require('./src/stateMachine');
(async () => {
  await p('99', 'oi', 'telegram');
  await p('99', '1', 'telegram');
  const r = await p('99', '2', 'telegram');
  console.log(r.estado, r.score, r.prioridade);
})();
"
```
