# Relatório de Entrega — BRO Resolve MVP

**Data:** 22 de Abril de 2026
**Versão:** MVP v1.0
**Status:** Base funcional operando — evolução SaaS especificada

---

## 1. Resumo Executivo

O BRO Resolve é uma plataforma SaaS de atendimento, conversão de leads e gestão financeira, focada em negócios de serviços (jurídico, saúde, imobiliária). O sistema qualifica leads automaticamente via bot (Telegram), prioriza por valor estimado, e fornece dashboards operacionais e financeiros.

**Estado atual:** Protótipo funcional single-tenant com bot operando, qualificação automática, storage multi-adapter, revenue metrics, reativação de leads, e dashboard React. Pronto para evolução SaaS multi-tenant com 3 níveis de acesso.

**Próximo passo:** Implementar as 24 tasks do spec para transformar em plataforma SaaS completa.

---

## 2. O Que Existe Hoje (Inventário Técnico)

### 2.1 Backend (Node.js + Express)

| Módulo | Arquivo | Linhas | Status | Descrição |
|--------|---------|--------|--------|-----------|
| Server | `server.js` | 308 | ✅ Funcional | Express + webhook Telegram + health check + admin auth |
| State Machine | `src/stateMachine.js` | 390 | ✅ Funcional | Fluxo de qualificação completo (trabalhista, família, cliente, advogado, outros) |
| Scorer | `src/scorer.js` | 47 | ✅ Funcional | Cálculo de score + prioridade (QUENTE/MEDIO/FRIO) |
| Normalizer | `src/normalizer.js` | 15 | ✅ Funcional | Normalização de input do webhook |
| Responder | `src/responder.js` | 16 | ✅ Funcional | Formatação de resposta |
| Session Manager | `src/sessionManager.js` | 76 | ✅ Funcional | Gestão de sessões (get/update/reset) |
| Revenue Metrics | `src/revenue/metrics.js` | 312 | ✅ Funcional | Métricas, SLA, inbox sort, funil, config tenant |
| API Revenue | `src/api/revenue.js` | 99 | ✅ Funcional | Rotas REST: leads, metrics, funil, config |
| Reativação | `src/jobs/reativacao.js` | 129 | ✅ Funcional | Job cron: busca leads abandonados, envia mensagem, registra resposta |
| Events | `src/events/service.js` | 36 | ✅ Funcional | Registro de eventos (lead_created, abandoned, converted, etc.) |
| Tenants | `src/tenants/service.js` | 24 | ✅ Funcional | Resolução de tenant por botToken (com cache) |
| WebSocket | `src/realtime/socket.js` | 34 | ✅ Funcional | Socket.io com rooms por tenant |
| Storage Index | `src/storage/index.js` | 72 | ✅ Funcional | Adapter pattern: postgres/redis/memory |
| Storage Postgres | `src/storage/postgres.js` | 141 | ✅ Funcional | Persistência de leads, mensagens, abandonos |
| Storage Redis | `src/storage/redisSession.js` | 78 | ✅ Funcional | Sessões em Redis com fallback para memória |
| Storage Memory | `src/storage/inMemory.js` | 48 | ✅ Funcional | Fallback para desenvolvimento |
| Queue | `src/infra/queue.js` | 53 | ✅ Funcional | BullMQ: enqueue lead persist + abandono |
| DB | `src/infra/db.js` | 20 | ✅ Funcional | Prisma client singleton |
| Redis | `src/infra/redis.js` | 27 | ✅ Funcional | IORedis com retry strategy |

**Total backend:** ~2.100 linhas de código fonte

### 2.2 Database (PostgreSQL + Prisma)

| Modelo | Status | Campos principais |
|--------|--------|-------------------|
| Tenant | ✅ Existe | id, nome, botToken, plano, slaMinutes, ticketMedio, taxaConversao, custoMensal, metaMensal, moeda |
| Lead | ✅ Existe | id, tenantId, nome, telefone, canal, score, prioridade, status, statusFinal, valorEntrada, valorExito, valorEstimado, abandonedAt, reativação timestamps |
| Message | ✅ Existe | id, tenantId, leadId, direcao, conteudo |
| Event | ✅ Existe | id, tenantId, leadId, event, step, metadata (com índices) |
| Flow | ✅ Existe | id, tenantId, objetivo, config (JSON), ativo |

**Modelos que faltam (spec):** AdminUser, AdminLog, User, Caso, Node, Contact

### 2.3 Dashboard (React + Vite)

| Componente | Status | Função |
|-----------|--------|--------|
| App.jsx | ✅ Funcional | Layout principal com tabs |
| LeadInbox.jsx | ✅ Funcional | Lista de leads com filtros e sort |
| LeadDetail.jsx | ✅ Funcional | Detalhe do lead com mensagens e eventos |
| KpiBar.jsx | ✅ Funcional | KPIs: leads hoje, quentes, atrasados, potencial |
| FinanceConfig.jsx | ✅ Funcional | Config financeira do tenant |
| DecisionBanner.jsx | ✅ Funcional | Banner de decisão (lead mais urgente) |
| ReactivationBox.jsx | ✅ Funcional | Métricas de reativação |
| api.js | ✅ Funcional | Client HTTP para API |
| socket.js | ✅ Funcional | Client Socket.io |
| dayZero.js | ✅ Funcional | Dados de demonstração |

### 2.4 Testes

| Arquivo | Linhas | Cobertura |
|---------|--------|-----------|
| stateMachine.test.js | 307 | Fluxo completo de qualificação |
| api-revenue.test.js | 183 | Rotas REST (leads, metrics, funil, config) |
| jobs-reativacao.test.js | 110 | Busca, envio, resposta de reativação |
| storage-postgres.test.js | 103 | Persistência de leads e abandonos |
| revenue-metrics.test.js | 92 | Cálculos de métricas e SLA |
| storage-index-postgres.test.js | 72 | Adapter pattern |
| scorer.test.js | 47 | Score e prioridade |
| queue.test.js | 47 | BullMQ enqueue/worker |
| storage-redis.test.js | 41 | Sessões Redis |
| tenants.test.js | 40 | Resolução de tenant |
| events-service.test.js | 34 | Registro de eventos |
| infra-redis.test.js | 31 | Conexão Redis |
| normalizer.test.js | 28 | Normalização de input |
| infra-db.test.js | 18 | Conexão Prisma |

**Total:** 14 arquivos de teste, 1.153 linhas

### 2.5 Infraestrutura

| Componente | Tecnologia | Status |
|-----------|-----------|--------|
| Runtime | Node.js | ✅ |
| Framework | Express 5 | ✅ |
| ORM | Prisma 5 | ✅ |
| Database | PostgreSQL (Neon) | ✅ |
| Cache/Sessions | Redis (IORedis) | ✅ |
| Job Queue | BullMQ | ✅ |
| WebSocket | Socket.io | ✅ |
| Bot | Telegram API (fetch direto) | ✅ |
| Frontend | React + Vite | ✅ |
| Deploy | Railway (railway.toml) | ✅ Configurado |

---

## 3. O Que Funciona Hoje (Fluxo Operacional)

### Jornada atual completa:

1. Lead envia mensagem no Telegram
2. Bot qualifica automaticamente (5-7 perguntas)
3. Sistema calcula score (0-10) e prioridade (QUENTE/MEDIO/FRIO)
4. Lead é persistido no PostgreSQL via BullMQ
5. Evento LEAD_CREATED registrado
6. WebSocket emite notificação para dashboard
7. Dashboard mostra lead na inbox (ordenado por SLA → score → tempo)
8. Admin pode ver métricas: leads hoje, quentes, atrasados, potencial em risco
9. Admin pode marcar resultado: CONVERTIDO ou PERDIDO
10. Job cron (hourly) reativa leads abandonados
11. Lead reativado que responde volta como QUENTE

### O que o dashboard mostra hoje:

- Leads por prioridade e SLA
- Potencial financeiro (estimado por ticketMedio × taxaConversao)
- Receita gerada vs. meta
- Funil de abandono (por step)
- Métricas de reativação
- Config financeira editável

---

## 4. O Que Falta Para SaaS Completo

### 4.1 Falhas Críticas Identificadas (do design)

| # | Falha | Impacto | Severidade |
|---|-------|---------|-----------|
| F1 | `global._currentTenantId` como variável global | Vazamento de dados entre tenants em requests concorrentes | 🔴 CRÍTICA |
| F2 | Sem modelo Caso (financeiro no Lead) | Receita real misturada com estimada, sem separação | 🔴 CRÍTICA |
| F3 | Abandono só detectado na próxima mensagem | Leads fantasma nunca contabilizados | 🔴 CRÍTICA |
| F4 | Sem autenticação JWT (Owner/Operator) | Qualquer pessoa com admin token acessa tudo | 🔴 CRÍTICA |
| F5 | Sem audit log para Master | Acesso a dados de clientes sem rastreabilidade | 🟠 ALTA |
| F6 | State machine hardcoded | Cada tenant novo exige mudança de código | 🟠 ALTA |
| F7 | Conversion form inexistente | Lead convertido sem dados financeiros reais | 🟠 ALTA |
| F8 | `safeRecordEvent` engole erros | Eventos perdidos, funil incorreto | 🟡 MÉDIA |
| F9 | SLA calculado on-the-fly, não proativo | Ninguém é notificado até abrir dashboard | 🟡 MÉDIA |
| F10 | `ensureTenant` auto-cria tenant fantasma | JWT corrompido cria lixo no banco | 🟡 MÉDIA |

### 4.2 Modelos que faltam

| Modelo | Propósito | Prioridade |
|--------|-----------|-----------|
| User | Login Owner/Operator com JWT | 🔴 Obrigatório |
| AdminUser | Login Master separado | 🔴 Obrigatório |
| AdminLog | Audit trail do Master | 🔴 Obrigatório |
| Caso | Financeiro real (receita real vs. futura) | 🔴 Obrigatório |
| Node | Flow Engine dinâmico (substituir stateMachine.js) | 🟠 Alta |
| Contact | Identidade separada do Lead (mesmo telefone, múltiplos leads) | 🟡 Média |

### 4.3 Features que faltam

| Feature | Requisito | Prioridade |
|---------|-----------|-----------|
| JWT auth (Owner/Operator) | Req 1, 16 | 🔴 |
| Role-based access control | Req 1, 16 | 🔴 |
| Conversion Form obrigatório | Req 5 | 🔴 |
| Caso management (receita real vs. futura) | Req 6 | 🔴 |
| Master Panel (cross-tenant) | Req 2, 20 | 🟠 |
| Dynamic Flow Engine | Req 7 | 🟠 |
| SLA Engine proativo (ticker) | Req 8 | 🟠 |
| Attention Loop (event-driven) | Req 9 | 🟠 |
| Operator Interface (3 colunas) | Req 4 | 🟠 |
| Owner Dashboard (financeiro real) | Req 3, 19 | 🟠 |
| Multi-moeda | Req 6.5 | 🟡 |
| Onboarding zero-fricção | Análise UX | 🟡 |

---

## 5. Spec Completo (Pronto para Execução)

### Documentos criados:

| Documento | Localização | Conteúdo |
|-----------|------------|----------|
| Requirements | `.kiro/specs/bro-resolve-saas/requirements.md` | 20 requisitos com user stories e acceptance criteria |
| Design | `.kiro/specs/bro-resolve-saas/design.md` | 8 jornadas mapeadas, 30+ falhas silenciosas, arquitetura, 30 correctness properties, data models, API routes, error handling, testing strategy |
| Tasks | `.kiro/specs/bro-resolve-saas/tasks.md` | 24 tasks com sub-tasks, referências a requisitos, property-based tests, checkpoints |

### Resumo das tasks:

| Fase | Tasks | Escopo |
|------|-------|--------|
| 1. Schema | 1.1-1.2 | Novos modelos Prisma + seed |
| 2. Auth | 2.1-2.6 | JWT, middleware, audit log, property tests |
| 3. Conversão | 4.1-4.6 | Validation, Caso, revenue real vs. futura |
| 4. Flow Engine | 6.1-6.5 | Engine dinâmico, cache, templates, integração |
| 5. SLA | 7.1-7.4 | Engine, filas dinâmicas, ticker |
| 6. Attention Loop | 9.1-9.4 | Event bus, WebSocket rooms, retry |
| 7. Metrics | 10.1-10.4 | Revenue Caso-based, alertas, global metrics |
| 8. API Routes | 12-14 | Operator, Owner, Master route groups |
| 9. Reativação | 15.1-15.2 | Limites, retry, validação |
| 10. Abandono | 16.1-16.2 | Job periódico, classificação dinâmica |
| 11. Server | 18.1 | Refactor server.js, eliminar global |
| 12. Dashboard | 20-23 | Operator, Owner, Master interfaces + auth |

---

## 6. Pricing Definido

### Portugal (EUR)

| Plano | Mensal | Anual | Operadores | Leads/mês |
|-------|--------|-------|-----------|-----------|
| Starter | €49 | €39/mês | 2 | 200 |
| Pro | €99 | €79/mês | 5 | 1.000 |
| Business | €199 | €159/mês | 15 | Ilimitado |
| Enterprise | €349+ | Custom | Custom | Custom |

### Brasil (BRL)

| Plano | Mensal | Anual | Operadores | Leads/mês |
|-------|--------|-------|-----------|-----------|
| Starter | R$ 197 | R$ 157/mês | 2 | 200 |
| Pro | R$ 497 | R$ 397/mês | 5 | 1.000 |
| Business | R$ 997 | R$ 797/mês | 15 | Ilimitado |
| Enterprise | R$ 1.997+ | Custom | Custom | Custom |

### Ancoragem: custo de 1 assistente de triagem

- Portugal: €1.200/mês → BRO Resolve Pro = 8% desse custo
- Brasil: R$ 3.400/mês → BRO Resolve Pro = 15% desse custo

---

## 7. Posicionamento

**BRO Resolve mostra qual lead vale dinheiro e quem atender agora.**

Mecanismo central: Motor de Prioridade de Receita (MPR)
- Qualifica automaticamente
- Atribui valor estimado (€)
- Ordena por dinheiro, não por chegada

Mercado-alvo: Portugal (entrada) + Brasil (escala)
Nicho inicial: Escritórios de advocacia em Lisboa e Porto

---

## 8. Métricas do Codebase

| Métrica | Valor |
|---------|-------|
| Linhas de código (backend) | ~2.100 |
| Linhas de teste | 1.153 |
| Arquivos de teste | 14 |
| Modelos Prisma | 4 (Tenant, Lead, Message, Event, Flow) |
| Componentes React | 6 + 3 libs |
| Dependências produção | 12 |
| Dependências dev | 3 |

---

## 9. Decisão

O MVP funciona como protótipo single-tenant. Para virar SaaS vendável, precisa das 24 tasks do spec executadas. Estimativa: 5-7 dias de implementação focada.

Prioridade absoluta (primeiros 2 dias):
1. Schema evolution (novos modelos)
2. JWT auth + eliminar global._currentTenantId
3. Conversion Form + modelo Caso
4. Refactor server.js com novas rotas
