# SaaS Lead Qualifier — Design Spec
**Data:** 2026-04-20
**Status:** Aprovado para implementação (v2 — refinado com SLA + financeiro)

---

## 1. Produto em uma frase

Sistema que organiza, prioriza e monetiza leads automaticamente — mostrando em tempo real quem atender agora, quanto dinheiro está em risco e onde o processo está falhando.

Ciclo completo:
```
Bot (Telegram) → qualifica → score → dashboard (inbox + SLA + financeiro) → ação do cliente
```

**Posicionamento:** não é CRM, não é chatbot. É **priorização de receita em tempo real**.

---

## 2. Problema que resolve

O cliente hoje recebe leads pelo Telegram sem saber:
- quem é urgente (SLA estoura em silêncio)
- quanto dinheiro está em risco em cada minuto sem resposta
- onde no fluxo do bot os leads estão abandonando

O dashboard substitui essa confusão por uma fila priorizada, SLA visível e impacto financeiro explícito.

**Métrica de sucesso:**
- Responder "quem atender agora?" em < 3 segundos
- Responder "quanto estou perdendo?" em < 5 segundos
- Responder "onde estou perdendo?" em < 5 segundos
- Uso diário recorrente pelo cliente

---

## 3. Arquitetura

```
Telegram (Telegraf)
    │
    ▼
POST /webhook → middleware resolveTenant(token → tenant_id)
    │
    ▼
engine.js (stateMachine genérica, lê fluxo do banco)
    │  ├── emite eventos: entered_step, abandoned, completed_flow
    ├── Redis      → sessões com TTL 24h (chave: tenant_id:sessao)
    └── BullMQ     → fila de persistência (retry automático)
                        │
                        ▼
                   PostgreSQL
                   ├── tenants (+ sla_minutes, ticket_medio, taxa_conversao)
                   ├── leads
                   ├── messages
                   ├── events (tracking)
                   └── flows (JSONB por tenant)
                        │
                        ▼
                   Socket.io → push em tempo real
                        │
                        ▼
                   Dashboard (React + shadcn/ui + Tailwind)
```

---

## 4. Banco de dados

```sql
-- Multi-tenancy com config financeira e SLA
tenants (
  id UUID PK,
  nome TEXT,
  bot_token TEXT UNIQUE,
  plano TEXT DEFAULT 'free',
  ativo BOOLEAN DEFAULT true,
  sla_minutes INTEGER DEFAULT 15,       -- ← novo
  ticket_medio DECIMAL DEFAULT 1000,    -- ← novo
  taxa_conversao DECIMAL DEFAULT 0.2,   -- ← novo
  criado_em TIMESTAMPTZ
)

-- Leads qualificados
leads (
  id UUID PK,
  tenant_id UUID FK tenants,
  nome TEXT,
  telefone TEXT,
  canal TEXT,
  fluxo TEXT,
  score INTEGER DEFAULT 0,
  prioridade TEXT,
  score_breakdown JSONB,
  status TEXT DEFAULT 'novo',    -- novo | em_atendimento | finalizado | abandonou
  flag_atencao BOOLEAN DEFAULT false,
  resumo TEXT,
  criado_em TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ
)

-- Histórico de mensagens
messages (
  id UUID PK,
  tenant_id UUID FK tenants,
  lead_id UUID FK leads,
  direcao TEXT,
  conteudo TEXT,
  estado TEXT,
  criado_em TIMESTAMPTZ
)

-- Eventos de tracking (abandono por pergunta, conversão)  ← novo
events (
  id UUID PK,
  tenant_id UUID FK tenants,
  lead_id UUID FK leads,
  event TEXT,       -- entered_step | abandoned | completed_flow
  step TEXT,        -- estado da máquina (ex: "pergunta_2", "coleta_nome")
  criado_em TIMESTAMPTZ
)

-- Configuração de fluxo por tenant
flows (
  id UUID PK,
  tenant_id UUID FK tenants,
  objetivo TEXT DEFAULT 'leads',
  config JSONB,
  ativo BOOLEAN DEFAULT true
)

-- Sessões em Redis
-- chave: "session:{tenant_id}:{sessao}"  TTL: 86400
```

---

## 5. Score inteligente

| Sinal | Pontos |
|-------|--------|
| Urgência declarada | +3 |
| Intenção de ação (contratar / processo) | +2 |
| Problema claro e específico | +2 |
| Clicou em "falar com advogado" | +3 |
| Salário alto / caso complexo | +2 |
| Retornou ao menu (hesitação) | -1 |

**Bandas:** `0–2 FRIO` · `3–4 MÉDIO` · `5+ QUENTE 🔥`

Score é explicado no detalhe do lead.

---

## 6. Lógica de SLA

```
tempo_espera = agora - lead.criado_em (em minutos)
sla_limit    = tenant.sla_minutes

status_sla:
  🟢 dentro  → tempo_espera < sla_limit * 0.7
  🟡 atenção → tempo_espera >= sla_limit * 0.7
  🔴 atrasado → tempo_espera >= sla_limit
```

---

## 7. Lógica financeira

```
valor_lead  = tenant.ticket_medio × tenant.taxa_conversao
potencial   = leads_hoje × valor_lead
em_risco    = leads_atrasados × valor_lead
```

Exemplo com config padrão (ticket=1000, conversão=20%):
- 12 leads hoje → potencial R$ 2.400
- 4 atrasados → R$ 800 em risco

---

## 8. Tracking de eventos

O engine emite eventos ao persistir:

```json
{ "event": "entered_step", "step": "trabalho_status" }
{ "event": "abandoned",    "step": "coleta_nome" }
{ "event": "completed_flow" }
```

Usado pela Camada 3 do dashboard para mostrar abandono por pergunta.

---

## 9. API REST

```
GET    /api/leads                  → lista com filtros (prioridade, status, sla_status)
GET    /api/leads/:id              → detalhe + mensagens + score_breakdown
PATCH  /api/leads/:id/status       → { status: "em_atendimento" | "finalizado" }
GET    /api/metrics                → { hoje, quentes, atrasados, potencial, em_risco, tempo_medio }
GET    /api/funil                  → abandono por step (da tabela events)

POST   /api/auth/login             → { email, senha } → JWT
GET    /api/tenant/config          → { sla_minutes, ticket_medio, taxa_conversao }
PATCH  /api/tenant/config          → atualiza config financeira e SLA

WS     /socket.io                  → eventos: lead:new, lead:updated, metrics:update
```

Todos protegidos por JWT. `tenant_id` extraído do token.

---

## 10. Dashboard — 3 camadas

### Camada 1 — Contexto (orientação rápida, topo)

```
Leads hoje: 12   Leads mês: 180   Leads total: 1.240
💰 Potencial hoje: R$ 2.400   💸 Em risco (SLA): R$ 800
SLA: 15 min  |  🔴 4 leads atrasados
```

Sem gráficos aqui. Só números + alerta de SLA.

---

### Camada 2 — Ação (inbox operacional, centro)

```
[🔥 Quentes]  [Todos]  [Não respondidos]

🔥 Maria   QUENTE   🔴 32 min   [Ver]
🟡 João    MÉDIO    🟡 18 min   [Ver]
⚪ Ana     FRIO     🟢 5 min    [Ver]
```

**Ordenação:** SLA estourado primeiro → prioridade → mais recente

**Detalhe do lead (ao clicar):**
```
João Silva  🔥 QUENTE  score: 7  🟡 18 min (SLA: 15 min)
─────────────────────────────────────────────────────
Por que QUENTE: urgência +3 · intenção de processo +2 · salário alto +2

Jornada: start → trabalho_status → trabalho_tipo → coleta_nome

Conversa:
  [bot]  Olá! Como posso te ajudar?
  [João] fui demitido sem justa causa
  ...

─────────────────────────────────────────────────────
[Marcar como atendido]  [Exportar]
```

---

### Camada 3 — Aprendizado (onde está perdendo dinheiro)

```
Abandono total: 35%

Pontos críticos:
  Pergunta 2 (trabalho_status)  → 40% abandonam aqui
  Pergunta 3 (trabalho_tipo)    → 25% abandonam aqui

Qualidade da qualificação:
  QUENTE → 30% convertem
  MÉDIO  → 10% convertem
  FRIO   → 2% convertem

Tempo médio de resposta: 5 min
```

---

## 11. Tela de configuração (diferencial SaaS)

- `sla_minutes` — tempo máximo de resposta
- `ticket_medio` — valor médio de um cliente fechado
- `taxa_conversao` — % de leads que viram clientes
- Editor do fluxo de perguntas (template + texto configurável)

---

## 12. O que NÃO construir agora

- WhatsApp oficial
- NLP / IA para texto livre
- Relatórios PDF / analytics avançado
- App mobile
- Integração com CRM externo
- Chat interno entre advogados
- Agendamento / vendas (fases futuras)

---

## 13. Fases de implementação

### Fase 1 — Fundação ✅ CONCLUÍDA
- PostgreSQL + Prisma + tenant_id em tudo
- Redis para sessões TTL 24h
- BullMQ fila de persistência
- Middleware de tenant por token

### Fase 2 — Dashboard operacional (próxima)
1. Adicionar `sla_minutes`, `ticket_medio`, `taxa_conversao` ao schema (migration)
2. Adicionar tabela `events` ao schema
3. Engine emite eventos `entered_step`, `abandoned`, `completed_flow`
4. Socket.io push em tempo real
5. API REST (leads, metrics, funil, auth, tenant config)
6. React + shadcn/ui: Camada 1 (contexto), Camada 2 (inbox), detalhe do lead
7. JWT por tenant

### Fase 3 — Produto completo
8. Camada 3: abandono por pergunta, qualidade da qualificação
9. Editor de fluxo JSON por tenant
10. Tela de configuração (SLA, financeiro)
11. Score breakdown visual no detalhe
