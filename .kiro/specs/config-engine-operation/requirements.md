# Requirements Document — CONFIG → ENGINE → OPERATION

## Introduction

Refatoração arquitetural do BRO Revenue SaaS para o modelo CONFIG → ENGINE → OPERATION. Atualmente a lógica de negócio está espalhada em múltiplos arquivos com valores hardcoded (pipeline stages em `constants.js`, keywords em `simulate.js`, thresholds de prioridade fixos). O sistema funciona bem para advocacia mas não é verdadeiramente universal. Esta refatoração cria um TenantConfig unificado que alimenta funções puras do Engine, e o Operator apenas executa o que o Engine recomenda.

## Glossary

- **TenantConfig**: Objeto JSON unificado armazenado no campo `config` do modelo Tenant, contendo todas as configurações que controlam o comportamento do sistema para aquele tenant (businessType, segmentos, pipelineStages, activityRules, slaRules, prioridade thresholds, canais)
- **Engine**: Conjunto de funções puras que recebem dados do lead + TenantConfig e retornam classificação, prioridade, próxima ação recomendada e risco financeiro
- **Config_API**: Endpoints REST para leitura e escrita do TenantConfig
- **Operator_UI**: Interface do operador que exibe recomendações do Engine e permite executar ações
- **Config_Page**: Interface do owner para editar o TenantConfig
- **Onboarding_Wizard**: Fluxo de criação de conta que gera o TenantConfig completo automaticamente
- **Pipeline_Stage**: Etapa do funil de vendas (ex: novo, atendimento, qualificado, proposta, negociacao, convertido, perdido)
- **Activity_Status**: Status de atividade do lead dentro de um estágio (ex: novo, em_atendimento, aguardando_cliente, follow_up, sem_resposta, em_negociacao)
- **SLA_Engine**: Módulo que calcula status de SLA e gera alertas baseado nas regras do TenantConfig
- **Flow_Engine**: Motor de fluxo dinâmico existente que lê definições de fluxo do banco de dados (src/flow/engine.js)
- **Classification_Result**: Objeto retornado pelo Engine contendo segmento, keywords matched, explicação e source
- **Priority_Result**: Objeto retornado pelo Engine contendo prioridade (quente/medio/frio), score numérico e razão textual
- **Action_Recommendation**: Objeto retornado pelo Engine contendo ação recomendada, urgência e contexto para o operador
- **Risk_Result**: Objeto retornado pelo Engine contendo valor financeiro em risco, nível de urgência e tempo restante

## Requirements

### Requirement 1: TenantConfig Unified Model

**User Story:** As an OWNER, I want all my business configuration stored in a single structured object on my Tenant, so that every part of the system reads from one source of truth.

#### Acceptance Criteria

1. THE Tenant model SHALL store a `config` field of type JSON containing the complete TenantConfig structure with keys: businessType, segmentos, pipelineStages, activityRules, slaRules, priorityThresholds, canais
2. WHEN a Tenant has no `config` field populated, THE system SHALL generate a default TenantConfig from the existing scattered fields (slaMinutes, segmentos, ticketMedio, taxaConversao, slaContratoHoras) to maintain backward compatibility
3. THE TenantConfig `pipelineStages` field SHALL be an ordered array of stage objects, each containing: name, defaultActivityStatus, and isFinal flag
4. THE TenantConfig `slaRules` field SHALL contain leadResponseMinutes, contratoUpdateHoras, and attentionThresholdPercent (percentage of SLA at which status becomes "atencao")
5. THE TenantConfig `priorityThresholds` field SHALL contain scoring rules as an array of objects with condition (activityStatus, estagio, or valorMinimo) and scoreIncrement, plus threshold values for quente, medio, and frio classification
6. THE TenantConfig `activityRules` field SHALL contain a mapping from each Pipeline_Stage to its default Activity_Status
7. THE TenantConfig `canais` field SHALL contain a whatsappEnabled boolean and a telegramEnabled boolean

### Requirement 2: Config Migration and Backward Compatibility

**User Story:** As a developer, I want existing tenants to work without changes after the refactoring, so that the 312 existing tests continue passing.

#### Acceptance Criteria

1. WHEN the system reads a Tenant that has no `config` field, THE Engine SHALL construct a TenantConfig at runtime from the existing individual fields (slaMinutes, segmentos, ticketMedio, taxaConversao, slaContratoHoras, moeda) using default pipeline stages matching the current hardcoded PIPELINE array
2. THE default TenantConfig generated for backward compatibility SHALL produce identical pipeline stages: novo, atendimento, qualificado, proposta, negociacao, convertido, perdido
3. THE default TenantConfig generated for backward compatibility SHALL produce identical priority scores as the current `calcularPrioridade` function in constants.js (sem_resposta +5, follow_up +3, proposta/negociacao +3, valor>5000 +2, valor>2000 +1, quente>=6, medio>=3)
4. THE existing exports from `src/pipeline/constants.js` (PIPELINE, PIPELINE_ORDER, ACTIVITY_STATUS, FINAL_STAGES, STAGE_ACTIVITY_MAP, calcularPrioridade, nextStage, proximoPasso) SHALL remain available and functional, delegating to the Engine when a TenantConfig is available
5. THE existing API endpoints (/operator/*, /owner/*, /simulate) SHALL continue to function with the same request/response contracts

### Requirement 3: Engine — classifyLead Function

**User Story:** As an OPERATOR, I want the system to automatically classify incoming leads based on the tenant's configured segments and keywords, so that I know what type of service the lead needs.

#### Acceptance Criteria

1. WHEN a message and TenantConfig are provided, THE Engine classifyLead function SHALL return a Classification_Result containing segmento, matchedKeywords array, explicacao text, and source identifier
2. THE Engine classifyLead function SHALL first attempt classification using Flow_Engine nodes (keywords from the start node opcoes), and fall back to segment name matching from TenantConfig segmentos
3. WHEN no keywords match, THE Engine classifyLead function SHALL return segmento "outros" with source "fallback" and an explicacao stating the message could not be classified
4. THE Engine classifyLead function SHALL be a pure function that receives (message: string, config: TenantConfig, flowNodes: array) and produces a deterministic Classification_Result without side effects
5. FOR ALL valid messages, classifying then formatting the Classification_Result then classifying the formatted output SHALL produce an equivalent segmento (round-trip consistency for classification explanations)

### Requirement 4: Engine — calculatePriority Function

**User Story:** As an OPERATOR, I want the system to calculate lead priority using the tenant's configured thresholds, so that I focus on the most valuable and urgent leads first.

#### Acceptance Criteria

1. WHEN a lead object and TenantConfig are provided, THE Engine calculatePriority function SHALL return a Priority_Result containing prioridade (quente, medio, or frio), numeric score, and reason text explaining the score breakdown
2. THE Engine calculatePriority function SHALL compute the score by iterating over TenantConfig priorityThresholds scoring rules, summing scoreIncrement for each matching condition
3. THE Engine calculatePriority function SHALL classify the final score as "quente" when score >= TenantConfig priorityThresholds.quente, "medio" when score >= TenantConfig priorityThresholds.medio, and "frio" otherwise
4. THE Engine calculatePriority function SHALL be a pure function that receives (lead: object, config: TenantConfig) and produces a deterministic Priority_Result without side effects
5. WHEN TenantConfig priorityThresholds are not defined, THE Engine calculatePriority function SHALL use default thresholds matching the current hardcoded behavior (quente>=6, medio>=3)

### Requirement 5: Engine — nextAction Function

**User Story:** As an OPERATOR, I want the system to tell me exactly what to do next for each lead, so that I do not need to think about the process and just execute.

#### Acceptance Criteria

1. WHEN a lead object and TenantConfig are provided, THE Engine nextAction function SHALL return an Action_Recommendation containing actionText, urgency level (critico, alto, normal, baixo), and contextText explaining why this action is recommended
2. THE Engine nextAction function SHALL determine the recommended action based on the lead's current Pipeline_Stage, Activity_Status, time since last interaction, and the TenantConfig activityRules
3. WHEN a lead has Activity_Status "sem_resposta" and valorEstimado greater than zero, THE Engine nextAction function SHALL return urgency "critico" with actionText including the financial value at risk
4. THE Engine nextAction function SHALL be a pure function that receives (lead: object, config: TenantConfig, now: Date) and produces a deterministic Action_Recommendation without side effects
5. THE Engine nextAction function SHALL use TenantConfig pipelineStages to determine valid next stages, instead of the hardcoded PIPELINE array

### Requirement 6: Engine — calculateRisk Function

**User Story:** As an OPERATOR, I want to see the financial risk of not acting on a lead, so that I prioritize based on potential revenue loss.

#### Acceptance Criteria

1. WHEN a lead object and TenantConfig are provided, THE Engine calculateRisk function SHALL return a Risk_Result containing valorEmRisco (decimal), urgencyLevel (critico, alto, normal), and tempoRestante (minutes until SLA breach)
2. THE Engine calculateRisk function SHALL calculate valorEmRisco using the lead's valorEstimado, falling back to the segment's ticketMedio from TenantConfig when valorEstimado is zero
3. THE Engine calculateRisk function SHALL calculate tempoRestante as the difference between TenantConfig slaRules.leadResponseMinutes and the elapsed minutes since lead creation
4. WHEN tempoRestante is less than or equal to zero, THE Engine calculateRisk function SHALL set urgencyLevel to "critico"
5. THE Engine calculateRisk function SHALL be a pure function that receives (lead: object, config: TenantConfig, now: Date) and produces a deterministic Risk_Result without side effects

### Requirement 7: Config API Endpoints

**User Story:** As an OWNER, I want API endpoints to read and update my TenantConfig, so that the Config_Page can manage all settings from one place.

#### Acceptance Criteria

1. WHEN an authenticated OWNER sends GET /owner/config, THE Config_API SHALL return the complete TenantConfig for the requesting tenant
2. WHEN an authenticated OWNER sends PATCH /owner/config with a partial TenantConfig, THE Config_API SHALL merge the provided fields into the existing TenantConfig and persist the result
3. WHEN an authenticated OWNER sends PATCH /owner/config with invalid pipelineStages (missing "convertido" or "perdido" final stages), THE Config_API SHALL return HTTP 400 with a descriptive error message
4. WHEN an authenticated OWNER sends PATCH /owner/config, THE Config_API SHALL also update the legacy individual fields (slaMinutes, segmentos, ticketMedio) to maintain backward compatibility with existing code that reads those fields
5. WHEN an authenticated MASTER sends GET /owner/config with a tenantId query parameter, THE Config_API SHALL return the TenantConfig for the specified tenant

### Requirement 8: Engine API Endpoint

**User Story:** As a frontend developer, I want a single API endpoint that runs all Engine functions for a lead, so that the Operator_UI can display complete recommendations.

#### Acceptance Criteria

1. WHEN an authenticated OPERATOR sends POST /engine/evaluate with a leadId, THE Engine API SHALL return the combined results of classifyLead, calculatePriority, nextAction, and calculateRisk for that lead
2. WHEN an authenticated OPERATOR sends POST /engine/simulate with a message string, THE Engine API SHALL return the Classification_Result and estimated Priority_Result without creating a lead
3. IF the leadId provided to POST /engine/evaluate does not exist or belongs to a different tenant, THEN THE Engine API SHALL return HTTP 404 with error "Lead não encontrado"
4. THE Engine API SHALL load the TenantConfig once per request and pass it to all Engine functions, avoiding redundant database queries

### Requirement 9: SLA Engine Config Integration

**User Story:** As an OWNER, I want SLA calculations to use my configured thresholds instead of hardcoded values, so that I can tune response times for my business.

#### Acceptance Criteria

1. WHEN calculating lead SLA status, THE SLA_Engine SHALL read leadResponseMinutes and attentionThresholdPercent from TenantConfig slaRules instead of hardcoded values
2. WHEN calculating caso SLA status, THE SLA_Engine SHALL read contratoUpdateHoras from TenantConfig slaRules instead of the hardcoded slaContratoHoras field
3. WHEN the SLA ticker recalculates priority for open leads, THE SLA_Engine SHALL call the Engine calculatePriority function with the tenant's TenantConfig instead of the hardcoded calcularPrioridade function
4. WHEN TenantConfig slaRules are not defined, THE SLA_Engine SHALL fall back to reading the legacy slaMinutes and slaContratoHoras fields from the Tenant model

### Requirement 10: Onboarding Generates Complete TenantConfig

**User Story:** As a new user, I want the onboarding wizard to generate a complete TenantConfig automatically based on my business type, so that the system is fully configured from day one.

#### Acceptance Criteria

1. WHEN a new tenant is created via the Onboarding_Wizard, THE system SHALL generate a complete TenantConfig containing businessType, segmentos, pipelineStages (default 7 stages), activityRules, slaRules, priorityThresholds, and canais
2. WHEN the user selects a business type template (advocacia, clinica, imobiliaria), THE Onboarding_Wizard SHALL pre-populate segmentos with template-specific segments including keywords for classification
3. WHEN the user customizes segments during onboarding, THE system SHALL include the customized values in the generated TenantConfig segmentos array
4. THE generated TenantConfig SHALL be stored in the Tenant `config` field alongside the legacy individual fields for backward compatibility

### Requirement 11: Config_Page Reads and Writes TenantConfig

**User Story:** As an OWNER, I want the Config_Page to show and edit all my configuration in one unified interface, so that I do not need to navigate multiple scattered settings.

#### Acceptance Criteria

1. WHEN the Config_Page loads, THE Config_Page SHALL fetch the TenantConfig via GET /owner/config and populate all tabs (Negócio, Operação, Financeiro, Fluxo) from the unified config object
2. WHEN the OWNER saves changes on any tab, THE Config_Page SHALL send a PATCH /owner/config with only the changed fields from the TenantConfig
3. WHEN the OWNER edits pipelineStages, THE Config_Page SHALL display a reorderable list of stages with name, defaultActivityStatus, and isFinal toggle, preventing removal of "convertido" and "perdido" stages
4. WHEN the OWNER edits priorityThresholds, THE Config_Page SHALL display the scoring rules and threshold values with a live preview showing how a sample lead would be scored

### Requirement 12: Operator_UI Uses Engine Recommendations

**User Story:** As an OPERATOR, I want the interface to show me exactly what the Engine recommends for each lead, so that I just execute without needing to analyze the situation myself.

#### Acceptance Criteria

1. WHEN the OPERATOR selects a lead, THE Operator_UI SHALL call POST /engine/evaluate and display the Action_Recommendation actionText, urgency, and contextText in the context banner
2. WHEN the Engine returns urgency "critico", THE Operator_UI SHALL display the context banner with a red background and include the valorEmRisco from the Risk_Result
3. THE Operator_UI SHALL display the Priority_Result reason text alongside the priority emoji, replacing the current static priority label
4. THE Operator_UI SHALL use pipelineStages from TenantConfig to render the stage filter dropdown and the "Avançar" button options, instead of the hardcoded STAGE_OPTIONS array
5. THE Operator_UI SHALL use activityRules from TenantConfig to render the activity filter dropdown, instead of the hardcoded ACTIVITY_OPTIONS array

### Requirement 13: Remove Hardcoded Values from simulate.js

**User Story:** As a developer, I want the simulation endpoint to use Engine functions and TenantConfig instead of hardcoded KEYWORD_MAP and VALORES, so that classification works correctly for all business types.

#### Acceptance Criteria

1. WHEN POST /simulate is called, THE simulate endpoint SHALL call Engine classifyLead with the tenant's TenantConfig and flow nodes instead of using the hardcoded KEYWORD_MAP
2. WHEN POST /simulate is called, THE simulate endpoint SHALL call Engine calculatePriority with the tenant's TenantConfig instead of using the hardcoded calcularPrioridade with fixed VALORES
3. WHEN POST /simulate is called, THE simulate endpoint SHALL call Engine calculateRisk with the tenant's TenantConfig to compute the risco field
4. THE simulate endpoint SHALL return the same response shape (segmento, subtipo, intencao, valorMin, valorMax, prioridade, proximoPasso, risco, slaMinutos) to maintain API compatibility
