# Requirements Document — BRO Resolve SaaS Platform

## Introduction

BRO Resolve é um Sistema Operacional de Receita em tempo real (Real-time Revenue Operating System) para negócios baseados em atendimento. O sistema qualifica leads via bot (Telegram/WhatsApp), organiza filas com SLA, converte leads em casos financeiros reais e fornece dashboards operacionais e financeiros para três níveis de acesso: MASTER (admin da plataforma), OWNER (cliente/dono do negócio) e OPERATOR (operador de atendimento).

O sistema já possui uma base funcional com: Express + Prisma + PostgreSQL, Redis para sessões, BullMQ para filas, dashboard React (Vite), WebSocket (Socket.io), state machine hardcoded, storage layer multi-adapter, módulo de revenue metrics e job de reativação. Esta especificação define os requisitos para evoluir o sistema existente para a plataforma SaaS completa descrita no blueprint.

## Glossary

- **Platform**: A aplicação BRO Resolve SaaS como um todo
- **Tenant**: Uma organização cliente que utiliza a plataforma (escritório, clínica, imobiliária)
- **Master_Panel**: Painel administrativo exclusivo do administrador da plataforma com acesso cross-tenant
- **Owner_Dashboard**: Dashboard financeiro e operacional visível apenas para o dono do Tenant
- **Operator_Interface**: Interface estilo WhatsApp Web para operadores atenderem leads
- **Lead**: Pessoa que iniciou contato via bot e está em processo de qualificação ou atendimento
- **Caso**: Registro financeiro criado quando um Lead é convertido em cliente, contendo dados de contrato e receita
- **Flow_Engine**: Motor de fluxo dinâmico que lê definições de fluxo do banco de dados (Flow → Node)
- **Node**: Unidade de um fluxo que define mensagem, tipo, opções e próximo estado
- **SLA_Engine**: Módulo que calcula tempos de resposta e gera alertas baseados em limites configuráveis por Tenant
- **Queue**: Fila dinâmica de trabalho que agrupa leads/casos por status e urgência de SLA
- **Attention_Loop**: Ciclo de eventos que gera alertas, atualiza filas e força ação do operador
- **Conversion_Form**: Formulário obrigatório preenchido ao marcar "Virou cliente" com dados de contrato
- **Real_Revenue**: Receita efetivamente recebida (valorRecebido + dataRecebimento preenchidos no Caso)
- **Open_Revenue**: Receita futura estimada de casos ativos sem pagamento registrado
- **Audit_Log**: Registro obrigatório de todas as ações do Master para rastreabilidade
- **JWT**: JSON Web Token usado para autenticação de usuários (Owner/Operator)
- **Bot**: Agente automatizado que conduz o fluxo de qualificação via mensagens

---

## Requirements

### Requirement 1: Multi-Tenant Architecture with Role-Based Access

**User Story:** As a platform administrator, I want the system to enforce strict multi-tenant isolation with three distinct access levels, so that each tenant's data is protected and each user role sees only what is relevant to their function.

#### Acceptance Criteria

1. THE Platform SHALL enforce tenant isolation by including tenantId in every database query and API response
2. THE Platform SHALL support three access roles: MASTER, OWNER, and OPERATOR
3. WHEN a user authenticates, THE Platform SHALL issue a JWT containing userId, tenantId, and role
4. THE Platform SHALL store tenantId on the request object (req.tenantId) and SHALL NOT use global variables for tenant context
5. WHEN an OPERATOR attempts to access an Owner-only route, THE Platform SHALL return HTTP 403 with error message "Acesso negado"
6. WHEN an OWNER attempts to access an Operator-only route, THE Platform SHALL return HTTP 403 with error message "Acesso negado"
7. WHEN a request contains an invalid or expired JWT, THE Platform SHALL return HTTP 401 with error message "Token inválido ou expirado"

---

### Requirement 2: Master Panel Authentication and Audit

**User Story:** As the platform administrator (Master), I want a separate authentication mechanism with mandatory audit logging, so that my cross-tenant access is secure and fully traceable.

#### Acceptance Criteria

1. THE Master_Panel SHALL use a separate AdminUser model with its own token, independent from Tenant user authentication
2. WHEN a Master authenticates, THE Platform SHALL verify the admin token against the AdminUser table
3. WHEN a Master performs any action (view tenant, view metrics, access client data), THE Audit_Log SHALL record the adminId, action name, target tenantId, metadata, and timestamp
4. THE Master_Panel SHALL provide read access to all Tenants, their leads, cases, and aggregated metrics
5. WHEN a Master requests global metrics, THE Platform SHALL aggregate conversion rates, revenue, and loss patterns across all active Tenants
6. THE Master_Panel SHALL display cross-client benchmarks including average conversion rate, average response time, and revenue per tenant

---

### Requirement 3: Owner Dashboard with Real Financial Data

**User Story:** As a business owner (Owner), I want a dashboard showing real revenue, open revenue, conversion rates, and operational alerts, so that I can understand my business performance at a glance.

#### Acceptance Criteria

1. WHEN an Owner opens the dashboard, THE Owner_Dashboard SHALL display the current month as the default date range including today
2. THE Owner_Dashboard SHALL support date filters: today, this week, this month, and custom date range
3. THE Owner_Dashboard SHALL display Real_Revenue as the sum of valorRecebido from Casos where dataRecebimento is within the selected period
4. THE Owner_Dashboard SHALL display Open_Revenue as the estimated value of active Casos without valorRecebido, calculated as valorEntrada + (percentualExito / 100 × valorCausa) + valorConsulta
5. THE Owner_Dashboard SHALL display conversion percentage calculated as the count of leads with status "virou_cliente" divided by total leads in the period
6. THE Owner_Dashboard SHALL display the count of leads without first response that exceed the Tenant slaLeadMinutes threshold
7. THE Owner_Dashboard SHALL display the count of Casos without update that exceed the Tenant slaContratoHoras threshold
8. THE Owner_Dashboard SHALL display average first response time in minutes across all leads with a recorded first response
9. WHEN unresponded leads exist beyond SLA, THE Owner_Dashboard SHALL display an alert of type "leads_sem_resposta" with the count
10. WHEN stalled contracts exist beyond SLA, THE Owner_Dashboard SHALL display an alert of type "contratos_parados" with the count
11. WHEN conversion rate drops below 10%, THE Owner_Dashboard SHALL display an alert of type "queda_conversao" with the current rate
12. WHEN an Owner clicks "Ver problema" on an alert, THE Owner_Dashboard SHALL navigate to a filtered read-only list of the affected leads or cases
13. THE Owner_Dashboard SHALL NOT display operator-level controls such as status changes, message sending, or lead assignment

---

### Requirement 4: Operator Interface (WhatsApp Web Style)

**User Story:** As an operator, I want a three-column interface (Filters | Lead list | Chat) with real-time messages, so that I can efficiently attend leads and manage conversations.

#### Acceptance Criteria

1. THE Operator_Interface SHALL display three columns: a filter panel, a lead list panel, and a chat/detail panel
2. THE Operator_Interface SHALL display leads sorted by: SLA-exceeded first, then by score descending, then by oldest creation date
3. THE Operator_Interface SHALL display real-time messages (from bot and human) via WebSocket events
4. WHEN an operator clicks "Assumir atendimento" on a lead, THE Platform SHALL set the lead status to "em_atendimento", record the operator's userId as assumidoPorId, record primeiraRespostaEm if not already set, and pause bot responses for that lead
5. THE Operator_Interface SHALL allow manual editing of lead classification (segmento and tipoAtendimento)
6. THE Operator_Interface SHALL support the following lead statuses: "em_atendimento", "aguardando_retorno", "virou_cliente", "desistiu"
7. WHEN an operator sets status to "desistiu", THE Operator_Interface SHALL require a reason selected from: "preco", "sem_interesse", "fechou_com_outro", "nao_respondeu", "outro"
8. IF an operator attempts to set status "desistiu" without providing a reason, THEN THE Platform SHALL reject the request with error "Motivo obrigatório para desistência"
9. THE Operator_Interface SHALL NOT display full financial data (Real_Revenue, Open_Revenue, or Caso monetary values)

---

### Requirement 5: Mandatory Conversion Form

**User Story:** As a platform operator, I want the system to require complete contract data when marking a lead as "Virou cliente", so that financial records are always accurate and complete.

#### Acceptance Criteria

1. WHEN an operator marks a lead as "virou_cliente", THE Conversion_Form SHALL require: tipoContrato (one of "entrada", "entrada_exito", "exito", "consulta", "outro")
2. WHEN tipoContrato is "entrada" or "entrada_exito", THE Conversion_Form SHALL require valorEntrada as a positive decimal value
3. WHEN tipoContrato is "exito" or "entrada_exito", THE Conversion_Form SHALL require percentualExito as a decimal between 0 and 100, and valorCausa as a positive decimal value
4. WHEN tipoContrato is "consulta", THE Conversion_Form SHALL require valorConsulta as a positive decimal value
5. IF any required field for the selected tipoContrato is missing, THEN THE Platform SHALL reject the conversion with a descriptive error message identifying the missing field
6. WHEN the Conversion_Form is submitted with valid data, THE Platform SHALL create a Caso record linked to the lead with status "em_andamento"
7. WHEN the Conversion_Form is submitted with valid data, THE Platform SHALL update the lead status to "virou_cliente"

---

### Requirement 6: Caso (Financial Case) Management

**User Story:** As a business owner, I want each converted client to generate a financial case with separate real and open revenue tracking, so that I always know exactly how much money has been received versus how much is expected.

#### Acceptance Criteria

1. THE Platform SHALL store each Caso with: tenantId, leadId, origem, segmento, tipoProcesso, tipoContrato, status, valorEntrada, percentualExito, valorCausa, valorConsulta, currency, valorConvertido, exchangeRate, valorRecebido, and dataRecebimento
2. THE Platform SHALL calculate Real_Revenue by summing valorRecebido from Casos where both valorRecebido and dataRecebimento are non-null
3. THE Platform SHALL calculate Open_Revenue by summing estimated values from active Casos (status not "finalizado" and no valorRecebido), where estimated value equals valorEntrada + (percentualExito / 100 × valorCausa) + valorConsulta
4. WHEN closing a Caso, THE Platform SHALL require valorRecebido and dataRecebimento
5. WHEN closing a Caso with a currency different from the Tenant moedaBase, THE Platform SHALL calculate valorConvertido using the provided exchangeRate
6. THE Platform SHALL support Caso statuses: "em_andamento", "aguardando_decisao", "finalizado"

---

### Requirement 7: Dynamic Flow Engine

**User Story:** As a platform administrator, I want conversation flows to be defined in the database as Flow → Node graphs, so that each tenant can have customized qualification flows without code changes.

#### Acceptance Criteria

1. THE Flow_Engine SHALL read flow definitions from the database using Flow and Node models
2. THE Flow_Engine SHALL resolve the next state by matching user input against the current Node opcoes array
3. WHEN a Node has tipo "menu", THE Flow_Engine SHALL match user input against opcoes[].texto to determine the next state, score increment, segmento, and tipoAtendimento
4. WHEN a Node has tipo "input", THE Flow_Engine SHALL advance to the next state defined in opcoes[0].proxEstado, with "final_lead" as fallback
5. THE Flow_Engine SHALL NOT contain hardcoded state names for transitions
6. WHEN a Node has tipo "final_lead" or "final_cliente", THE Flow_Engine SHALL persist the lead data and emit a completion event
7. THE Flow_Engine SHALL cache active flow definitions to avoid repeated database queries on every message
8. WHEN a flow definition is updated in the database, THE Flow_Engine SHALL invalidate the cache for that flow within 60 seconds
9. THE Platform SHALL provide flow templates for at least three business types: juridico, clinica, and imobiliaria

---

### Requirement 8: SLA Engine and Dynamic Queues

**User Story:** As a business owner and operator, I want the system to track response times against configurable SLA thresholds and organize work into dynamic queues, so that no lead or case falls through the cracks.

#### Acceptance Criteria

1. THE SLA_Engine SHALL calculate lead SLA status based on time since creation versus Tenant slaLeadMinutes, where status is "dentro" when elapsed is less than 70% of limit, "atencao" when elapsed is between 70% and 100%, and "atrasado" when elapsed exceeds the limit
2. THE SLA_Engine SHALL consider a lead as "atrasado" only when primeiraRespostaEm is null and status is "em_qualificacao" or "em_atendimento"
3. THE SLA_Engine SHALL calculate Caso SLA status based on hours since last update versus Tenant slaContratoHoras
4. WHILE a Tenant is active, THE Platform SHALL maintain four dynamic queues: "Leads sem resposta" (unresponded beyond SLA), "Atendimento em andamento" (active conversations), "Contratos enviados sem retorno" (cases without update beyond SLA), and "Casos sem atualização" (stale cases)
5. WHEN a lead exceeds the SLA threshold without first response, THE Platform SHALL emit a WebSocket event "sla:alert" to the Tenant room
6. THE Platform SHALL allow each Tenant to configure slaLeadMinutes and slaContratoHoras independently

---

### Requirement 9: Attention Loop (Event-Driven Retention)

**User Story:** As a platform user, I want the system to automatically generate alerts and update queues when key events occur, so that operators are always prompted to take the next action.

#### Acceptance Criteria

1. WHEN a new lead is created, THE Attention_Loop SHALL emit a "lead:new" WebSocket event to the Tenant room
2. WHEN a lead status changes, THE Attention_Loop SHALL emit a "lead:updated" WebSocket event to the Tenant room
3. WHEN a lead is converted, THE Attention_Loop SHALL emit a "lead:converted" WebSocket event with the associated Caso data
4. WHEN a lead is marked as "desistiu", THE Attention_Loop SHALL emit a "lead:lost" WebSocket event with the desistência reason
5. WHEN an SLA threshold is exceeded, THE Attention_Loop SHALL emit an "sla:alert" WebSocket event with the alert type and affected item count
6. WHEN a Caso is updated, THE Attention_Loop SHALL emit a "caso:updated" WebSocket event to the Tenant room
7. THE Attention_Loop SHALL follow the cycle: event occurs → alert generated → queue updated → operator notified → operator acts → event occurs

---

### Requirement 10: Real-Time Communication

**User Story:** As an operator, I want to see new leads, status changes, and SLA alerts in real time without refreshing the page, so that I can react immediately to urgent situations.

#### Acceptance Criteria

1. THE Platform SHALL use Socket.io for real-time communication between server and clients
2. WHEN a client connects via WebSocket, THE Platform SHALL require the client to join a tenant-specific room using "join:tenant" with the tenantId
3. WHEN a client connects as an operator, THE Platform SHALL allow the client to join an operator-specific room using "join:operator" with the userId
4. THE Platform SHALL emit events only to the relevant Tenant room, ensuring cross-tenant isolation in real-time events
5. WHEN the WebSocket connection is lost, THE Platform SHALL attempt reconnection up to 5 times

---

### Requirement 11: Lead Reactivation System

**User Story:** As a business owner, I want the system to automatically reach out to abandoned leads based on priority and timing rules, so that potential revenue is recovered.

#### Acceptance Criteria

1. THE Platform SHALL identify leads eligible for reactivation based on: MEDIO priority leads abandoned between 24h and 48h ago, FRIO priority leads abandoned between 3 and 7 days ago, and leads with status "abandonou" created between 24h and 48h ago
2. WHEN a lead is eligible for reactivation, THE Platform SHALL send a reactivation message via the Tenant bot with a personalized greeting
3. WHEN a reactivation message is sent, THE Platform SHALL record reativacaoEnviadaEm on the lead and create a REACTIVATION_SENT event
4. WHEN a reactivated lead responds, THE Platform SHALL set the lead status to "EM_ATENDIMENTO", clear statusFinal, set prioridade to "QUENTE", set origemConversao to "reativacao", and record reativacaoRespondidaEm
5. THE Platform SHALL run the reactivation job on a scheduled basis (hourly via cron)
6. THE Owner_Dashboard SHALL display reactivation metrics: messages sent, responses received, conversions from reactivation, and revenue generated from reactivation

---

### Requirement 12: Database Schema and Performance

**User Story:** As a developer, I want the database schema to support all platform features with proper indexing, so that queries perform well under production load.

#### Acceptance Criteria

1. THE Platform SHALL maintain indexes on: (tenantId, status), (tenantId, segmento), (tenantId, atualizadoEm), (tenantId, score) on the Lead table
2. THE Platform SHALL maintain indexes on: (leadId), (leadId, criadoEm) on the Message table
3. THE Platform SHALL maintain indexes on: (tenantId, status), (tenantId, dataRecebimento), (tenantId, criadoEm) on the Caso table
4. THE Platform SHALL maintain indexes on: (tenantId, event, criadoEm), (leadId) on the Event table
5. THE Platform SHALL maintain indexes on: (adminId, criadoEm), (tenantId, criadoEm) on the AdminLog table
6. THE Platform SHALL store the Caso model with Decimal precision: valorEntrada(14,2), percentualExito(5,2), valorCausa(14,2), valorConsulta(14,2), valorRecebido(14,2), valorConvertido(14,2), exchangeRate(10,6)
7. THE Platform SHALL support the AdminUser model with fields: id, email (unique), token (unique), ativo, criadoEm
8. THE Platform SHALL support the AdminLog model with fields: id, adminId, acao, tenantId, metadata (JSON), criadoEm

---

### Requirement 13: Operator Message Handling

**User Story:** As an operator, I want to send messages as a human within the chat interface and see the full conversation history, so that I can provide personalized service to leads.

#### Acceptance Criteria

1. WHEN an operator sends a message, THE Platform SHALL save the message with origem "humano" and the associated leadId
2. WHEN an operator sends a message, THE Platform SHALL emit a "lead:updated" WebSocket event so other connected clients see the new message
3. THE Operator_Interface SHALL display all messages for a lead in chronological order, showing the origin (cliente, bot, humano) and timestamp for each message
4. IF an operator attempts to send an empty message, THEN THE Platform SHALL reject the request with error "texto é obrigatório"

---

### Requirement 14: Tenant Configuration

**User Story:** As a business owner, I want to configure my SLA thresholds and financial parameters, so that the system reflects my specific business rules.

#### Acceptance Criteria

1. THE Platform SHALL allow Owners to configure: slaLeadMinutes (default 60), slaContratoHoras (default 48), ticketMedio, taxaConversao, custoMensal, metaMensal, and moeda
2. WHEN a Tenant configuration is updated, THE Platform SHALL immediately use the new values for SLA calculations and financial aggregations
3. THE Platform SHALL validate that slaLeadMinutes is a positive integer and slaContratoHoras is a positive integer
4. THE Owner_Dashboard SHALL provide a configuration form for editing financial parameters (custoMensal, ticketMedio, taxaConversao, metaMensal)

---

### Requirement 15: Event Tracking and Funnel Analysis

**User Story:** As a business owner, I want to see where in the qualification flow leads are abandoning, so that I can identify and fix bottlenecks.

#### Acceptance Criteria

1. WHEN a lead enters a new flow step, THE Platform SHALL record an event with type "entered_step" and the step name
2. WHEN a lead abandons the flow, THE Platform SHALL record an event with type "abandoned" and the last step name
3. WHEN a lead completes the flow, THE Platform SHALL record an event with type "completed_flow"
4. THE Owner_Dashboard SHALL display funnel analysis showing abandonment count per step, sorted by highest abandonment first
5. THE Owner_Dashboard SHALL display qualification quality metrics: conversion rate per priority band (QUENTE, MEDIO, FRIO)

---

### Requirement 16: API Route Security

**User Story:** As a developer, I want all API routes to enforce role-based access control, so that each user type can only access their permitted endpoints.

#### Acceptance Criteria

1. THE Platform SHALL organize API routes into three groups: /operator/* (OPERATOR role), /owner/* (OWNER role), and /master/* (MASTER/admin auth)
2. WHEN an unauthenticated request reaches a protected route, THE Platform SHALL return HTTP 401
3. WHEN an authenticated user with insufficient role reaches a restricted route, THE Platform SHALL return HTTP 403
4. THE Platform SHALL extract tenantId from the JWT for all authenticated routes and SHALL NOT rely on request headers for tenant identification in role-protected routes
5. THE /master/* routes SHALL use AdminUser token authentication, separate from JWT-based user authentication

---

### Requirement 17: Health Check and System Monitoring

**User Story:** As a developer, I want a health check endpoint that verifies all critical system dependencies, so that deployment platforms can monitor application health.

#### Acceptance Criteria

1. THE Platform SHALL expose a GET /health endpoint without authentication
2. WHEN the health endpoint is called, THE Platform SHALL verify database connectivity by executing a test query
3. THE Platform SHALL report the status of: storage adapter type, database connection, Redis connection, Telegram token presence, and JWT secret presence
4. IF the database connection fails, THEN THE Platform SHALL return status "degraded" instead of "ok"

---

### Requirement 18: Abandonment Detection and Session Management

**User Story:** As a platform operator, I want the system to automatically detect abandoned conversations and manage session lifecycle, so that abandoned leads are properly tracked and sessions are recycled.

#### Acceptance Criteria

1. WHEN a session has no activity for 30 minutes and the lead is not in a final state, THE Platform SHALL mark the session status as "ABANDONOU" and create an abandonment record
2. WHEN a session has no activity for 24 hours, THE Platform SHALL reset the session to the initial state for a fresh conversation
3. THE Platform SHALL classify abandonments as: "PRECOCE" (abandoned at start/fallback states), "VALIOSO" (abandoned at name collection or contact states), or "MEDIO" (abandoned at intermediate states)
4. WHEN an abandonment is detected, THE Platform SHALL create an Event record with type "abandoned" and the last state as the step

---

### Requirement 19: Owner Financial Insights

**User Story:** As a business owner, I want the dashboard to answer four key questions: where does money come from, where is money lost, what to do now, and how much will be billed, so that I can make informed business decisions.

#### Acceptance Criteria

1. THE Owner_Dashboard SHALL display revenue by origin (origem field on Caso) to answer "where does money come from"
2. THE Owner_Dashboard SHALL display leads lost by reason (motivoDesistencia) and abandoned leads by flow step to answer "where is money lost"
3. THE Owner_Dashboard SHALL highlight the most urgent unattended lead with SLA status and estimated value to answer "what to do now"
4. THE Owner_Dashboard SHALL display total Real_Revenue for the period plus projected Open_Revenue to answer "how much will be billed"
5. THE Owner_Dashboard SHALL display lucro estimado calculated as (receitaGerada + receitaFutura - custoMensal)

---

### Requirement 20: Master Cross-Tenant Intelligence

**User Story:** As the platform administrator, I want to use aggregated data across all tenants to identify patterns and generate strategic insights, so that I can improve the platform and advise clients.

#### Acceptance Criteria

1. THE Master_Panel SHALL display a list of all active Tenants with their key metrics: lead count, conversion rate, revenue, and average response time
2. THE Master_Panel SHALL display global aggregated metrics: total leads across all tenants, overall conversion rate, total revenue, and average SLA compliance
3. THE Master_Panel SHALL identify conversion patterns by comparing tenant performance metrics
4. THE Master_Panel SHALL identify loss patterns by aggregating desistência reasons and abandonment steps across tenants
5. WHEN a Master accesses any tenant-specific data, THE Audit_Log SHALL record the access with the target tenantId
