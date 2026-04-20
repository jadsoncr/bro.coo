# SaaS Lead Qualifier — Design Spec
**Data:** 2026-04-20
**Status:** Aprovado para implementação

---

## 1. Produto em uma frase

Um bot Telegram que qualifica leads automaticamente e entrega ao cliente um dashboard onde ele identifica quem responder primeiro em menos de 3 segundos.

Ciclo completo:
```
Bot (Telegram) → qualifica → score → dashboard (inbox) → ação do cliente
```

---

## 2. Problema que resolve

O cliente hoje recebe leads pelo Telegram sem saber:
- quem é urgente
- quem já foi atendido
- quem abandonou

O dashboard substitui essa confusão por uma fila priorizada e acionável.

**Métrica de sucesso:**
- Identificar lead prioritário em < 3 segundos
- ≥ 70% dos leads quentes visualizados no dia
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
    │
    ├── Redis      → sessões com TTL 24h (chave: tenant_id:sessao)
    └── BullMQ     → fila de persistência (retry automático)
                        │
                        ▼
                   PostgreSQL
                   ├── tenants
                   ├── leads
                   ├── messages
                   └── flows (JSONB por tenant)
                        │
                        ▼
                   Socket.io → push em tempo real
                        │
                        ▼
                   Dashboard (React + shadcn/ui + Tailwind)
```

### Por que esse stack
- **Telegraf**: middleware nativo, async/await, melhor suporte multi-tenant que o handler manual atual
- **Redis**: resolve perda de sessão no restart (problema real hoje em produção)
- **BullMQ**: nenhum lead se perde em falha de API — fila com retry visível
- **Socket.io**: novo lead aparece no dashboard instantaneamente, sem polling
- **shadcn/ui**: padrão de mercado 2025 para SaaS React (copy-paste, Tailwind, Radix)

---

## 4. Banco de dados

```sql
-- Multi-tenancy
tenants (
  id UUID PK,
  nome TEXT,
  bot_token TEXT UNIQUE,  -- chave de resolução de tenant
  plano TEXT DEFAULT 'free',
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ
)

-- Leads qualificados
leads (
  id UUID PK,
  tenant_id UUID FK tenants,
  nome TEXT,
  telefone TEXT,
  canal TEXT,           -- telegram | whatsapp
  fluxo TEXT,           -- trabalhista | familia | cliente | outros
  score INTEGER DEFAULT 0,
  prioridade TEXT,      -- FRIO | MEDIO | QUENTE
  score_breakdown JSONB, -- {"urgencia":3,"intencao":2,...}
  status TEXT DEFAULT 'novo',  -- novo | em_atendimento | finalizado
  flag_atencao BOOLEAN DEFAULT false,
  criado_em TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ
)

-- Histórico de mensagens (por lead)
messages (
  id UUID PK,
  tenant_id UUID FK tenants,
  lead_id UUID FK leads,
  direcao TEXT,         -- in | out
  conteudo TEXT,
  estado TEXT,          -- estado da máquina no momento
  criado_em TIMESTAMPTZ
)

-- Configuração de fluxo por tenant
flows (
  id UUID PK,
  tenant_id UUID FK tenants,
  objetivo TEXT,        -- leads | agendamento | vendas | suporte
  config JSONB,         -- { "start": { "message": "...", "options": { "1": "proximo_estado" } } }
  ativo BOOLEAN DEFAULT true
)

-- Sessões em Redis (não no Postgres)
-- chave: "session:{tenant_id}:{sessao}"
-- TTL: 86400 (24h)
-- valor: JSON com estadoAtual, fluxo, score, nome, etc.
```

**Segurança:** Row-Level Security no Postgres por `tenant_id`. Tokens criptografados.

---

## 5. Score inteligente

Modelo atual é simples demais (`impacto + intenção + 1`). Novo modelo:

| Sinal | Pontos |
|-------|--------|
| Urgência declarada | +3 |
| Intenção de ação (contratar / processo) | +2 |
| Problema claro e específico | +2 |
| Clicou em "falar com advogado" | +3 |
| Salário alto / caso complexo | +2 |
| Retornou ao menu (hesitação) | -1 |
| Canal WhatsApp (maior intenção) | +1 |

**Bandas:**
- `0–2` → FRIO ⚪
- `3–4` → MÉDIO 🟡
- `5+`  → QUENTE 🔥

**Score é explicado no dashboard** — o cliente vê "QUENTE porque: urgência +3, intenção de processo +2".

---

## 6. Fluxo dinâmico (JSON por tenant)

Substituição das `PERGUNTAS` hardcoded. Estrutura:

```json
{
  "start": {
    "message": "Olá! Como posso te ajudar?\n\n1️⃣ Problema no trabalho\n2️⃣ Família\n3️⃣ Já sou cliente",
    "options": {
      "1": "trabalho_status",
      "2": "familia_tipo",
      "3": "cliente_identificacao"
    }
  },
  "trabalho_status": {
    "message": "Você ainda está trabalhando?\n\n1️⃣ Sim\n2️⃣ Não",
    "options": {
      "1": "trabalho_tipo",
      "2": "trabalho_tipo"
    },
    "score_rules": {
      "2": { "urgencia": 1 }
    }
  }
}
```

Engine lê o JSON do banco. Fallback para fluxo padrão se tenant não tiver customização.

---

## 7. API REST (endpoints para o dashboard)

```
GET    /api/leads                  → lista com filtros (prioridade, status, data)
GET    /api/leads/:id              → detalhe + histórico de mensagens
PATCH  /api/leads/:id/status       → { status: "em_atendimento" | "finalizado" }
GET    /api/metrics                → { hoje, quentes, atendidos, abandonos, funil }
GET    /api/funil                  → { entrada, responderam, qualificados, finalizados, convertidos }

POST   /api/auth/login             → { email, senha } → JWT
GET    /api/flows                  → fluxo atual do tenant
PUT    /api/flows                  → atualiza config do fluxo

WS     /socket.io                  → eventos: lead:new, lead:updated, metrics:update
```

Todos os endpoints protegidos por JWT. `tenant_id` extraído do token, nunca do body.

---

## 8. Dashboard — telas

### Tela 1 — Home / Inbox (tela principal)

Modelo: **Inbox + Prioridade + Ação** (inspirado em Intercom/Zendesk)

```
┌──────────────────────────────────────────────────────┐
│  🔥 3 leads quentes sem resposta há +2h       [Ver]  │  ← alerta fixo
├──────────────────────────────────────────────────────┤
│  Hoje: 12   Quentes: 4   Atendidos: 7   Abandonos: 2 │  ← cards de KPI
├──────────────────────────────────────────────────────┤
│  Funil: 12 → 9 → 6 → 4 → 2                          │  ← funil simples
│          entrada  resp  qualif  final  convertido     │
├──────────────────────────────────────────────────────┤
│  [🔥 Quentes]  [Todos]  [Não respondidos]            │  ← 3 filtros apenas
│                                                      │
│  🔥 João Silva    Demissão · score 7 · 45min atrás   │
│  🔥 Ana Costa     Horas extras · score 6 · 1h atrás  │
│  🟡 Maria Lima    Divórcio · score 4 · 2h atrás      │
│  ⚪ Pedro Alves   Outro · score 2 · 3h atrás         │
└──────────────────────────────────────────────────────┘
```

Regra de ouro: usuário deve saber o que fazer em **< 3 segundos**.

### Tela 2 — Detalhe do lead

```
← voltar

João Silva  🔥 QUENTE  score: 7
─────────────────────────────────
Por que QUENTE:  urgência +3 · intenção de processo +2 · salário alto +2

Jornada:  start → trabalho_status → trabalho_tipo → ... → final_lead

Conversa:
  [bot]  Olá! Como posso te ajudar?
  [João] fui demitido sem justa causa
  [bot]  Você ainda está trabalhando?
  [João] 2
  ...

──────────────────────────────────
[Marcar como atendido]  [Exportar]
```

### Tela 3 — Configuração do fluxo (diferencial SaaS)

- Escolher objetivo: Leads / Agendamento / Vendas / Suporte
- Editar texto das perguntas
- Definir score mínimo para QUENTE
- Preview da conversa ao editar

---

## 9. Ritual do atendimento (o que o produto ensina)

O dashboard induz um comportamento diário:

1. **Abertura** → alerta de leads quentes parados → ação imediata
2. **Priorização** → fila ordenada por score → QUENTE primeiro sempre
3. **Atendimento** → abrir lead → ver histórico → marcar como atendido
4. **Fechamento do dia** → funil do dia → onde perdeu, onde converteu
5. **Melhoria** → estado com mais drop-off → ajustar pergunta no fluxo

Loop de vício:
```
Trigger (notificação novo lead quente)
  → Ação (abrir dashboard)
    → Recompensa (ver lead qualificado, pronto para responder)
      → Retorno (resposta rápida, conversão)
```

---

## 10. O que NÃO construir agora

- WhatsApp oficial (Telegram é camada de validação)
- NLP / IA para texto livre
- Relatórios PDF / analytics avançado
- App mobile
- Integração com CRM externo
- Chat interno entre advogados
- Agendamento / vendas (fases futuras)

---

## 11. Fases de implementação

### Fase 1 — Fundação (sem isso nada funciona)
1. PostgreSQL + Prisma com `tenant_id` em tudo
2. Redis para sessões com TTL 24h
3. BullMQ para fila de persistência
4. Middleware de tenant por token do bot
5. Salvar `messages` (histórico por lead)

### Fase 2 — Dashboard operacional
6. Socket.io para push em tempo real
7. API REST (leads, metrics, funil, auth)
8. React + shadcn/ui: Home/Inbox, Detalhe, Filtros
9. JWT por tenant

### Fase 3 — Produto completo
10. Editor de fluxo JSON por tenant
11. Score explicado no detalhe do lead
12. Ritual: alerta de leads quentes parados
13. Funil com drop-off por estado
14. Tela de configuração do fluxo
