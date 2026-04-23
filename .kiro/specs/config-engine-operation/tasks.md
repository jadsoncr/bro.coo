# Implementation Plan: CONFIG → ENGINE → OPERATION

## Overview

Refactor the BRO Revenue SaaS from scattered hardcoded values into a clean CONFIG → ENGINE → OPERATION architecture. Implementation follows a 5-phase migration strategy: schema + config builder, engine pure functions, API wiring, onboarding, and frontend updates. All 312 existing tests must continue passing throughout.

## Tasks

- [ ] 1. Phase 1 — Prisma schema + Config module
  - [ ] 1.1 Add `config Json?` field to Tenant model in `prisma/schema.prisma` and generate migration
    - Add nullable `config` field to the Tenant model
    - Run `npx prisma generate` to update the client
    - _Requirements: 1.1_

  - [ ] 1.2 Create `src/engine/config.js` with DEFAULT_CONFIG, buildConfigFromLegacy, resolveConfig, and validateConfigUpdate
    - Define DEFAULT_CONFIG matching current hardcoded behavior (7 pipeline stages, activity rules, SLA defaults, priority thresholds from constants.js)
    - Implement `buildConfigFromLegacy(tenant)` that constructs TenantConfig from scattered fields (slaMinutes, segmentos, ticketMedio, taxaConversao, slaContratoHoras, moeda)
    - Implement `resolveConfig(tenant)` that returns `tenant.config || buildConfigFromLegacy(tenant)`
    - Implement `validateConfigUpdate(partial)` that checks pipelineStages has convertido/perdido, slaRules has positive values, etc.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2_

  - [ ]* 1.3 Write property tests for config module (`tests/engine-config.test.js`)
    - **Property 1: TenantConfig structural validity and internal consistency**
    - **Property 2: Legacy config construction preserves tenant values**
    - **Validates: Requirements 1.1, 1.2, 1.6, 2.1**

  - [ ] 1.4 Write unit tests for config module (`tests/engine-config.test.js`)
    - Test DEFAULT_CONFIG has all required keys
    - Test buildConfigFromLegacy with Santos & Bastos tenant data
    - Test resolveConfig returns stored config when present, builds from legacy when null
    - Test validateConfigUpdate rejects missing convertido/perdido stages, negative SLA values
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2_

  - [ ] 1.5 Create `src/engine/index.js` re-export barrel file
    - Re-export all functions from config.js (and later classify, priority, action, risk)
    - _Requirements: 1.1_

- [ ] 2. Checkpoint — Phase 1 complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Phase 2 — Engine pure functions
  - [ ] 3.1 Implement `src/engine/classify.js` — classifyLead(message, config, flowNodes)
    - First attempt classification via flow node keywords (source: 'flow_engine')
    - Fall back to segment name matching from config.segmentos (source: 'segment_match')
    - Return segmento 'outros' with source 'fallback' when nothing matches
    - Return ClassificationResult: { segmento, matchedKeywords, explicacao, source }
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 3.2 Write property tests for classifyLead (`tests/engine-classify.test.js`)
    - **Property 4: Engine functions return structurally complete results (classifyLead)**
    - **Property 5: Engine functions are deterministic — classifyLead**
    - **Property 6: Classification source priority**
    - **Property 7: Classification round-trip consistency**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

  - [ ] 3.3 Write unit tests for classifyLead (`tests/engine-classify.test.js`)
    - Test flow_engine source when keyword matches flow node
    - Test segment_match source when segment name matches
    - Test fallback source when nothing matches
    - Test empty flowNodes falls through to segment matching
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 3.4 Implement `src/engine/priority.js` — calculatePriority(lead, config)
    - Iterate config.priorityThresholds.rules, sum scoreIncrement for matching conditions
    - Classify as quente/medio/frio based on threshold values
    - Return PriorityResult: { prioridade, score, reason }
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 3.5 Write property tests for calculatePriority (`tests/engine-priority.test.js`)
    - **Property 3: Backward-compatible priority scores**
    - **Property 5: Engine functions are deterministic — calculatePriority**
    - **Property 8: Priority score computation follows config rules**
    - **Validates: Requirements 2.3, 4.2, 4.3, 4.4, 4.5**

  - [ ] 3.6 Write unit tests for calculatePriority (`tests/engine-priority.test.js`)
    - Test sem_resposta +5, follow_up +3, proposta/negociacao +3, valor>5000 +2, valor>2000 +1
    - Test quente>=6, medio>=3, frio otherwise
    - Test with custom thresholds from config
    - Test fallback to default thresholds when priorityThresholds undefined
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [ ] 3.7 Implement `src/engine/action.js` — nextAction(lead, config, now)
    - Determine recommended action based on lead's stage, activityStatus, time since last interaction
    - Return urgency 'critico' with financial value when sem_resposta + valorEstimado > 0
    - Use config.pipelineStages for valid next stages
    - Return ActionRecommendation: { actionText, urgency, contextText }
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 3.8 Write property tests for nextAction (`tests/engine-action.test.js`)
    - **Property 5: Engine functions are deterministic — nextAction**
    - **Property 9: Critical urgency for unresponsive valuable leads**
    - **Property 10: nextAction respects config pipeline stages**
    - **Validates: Requirements 5.3, 5.4, 5.5**

  - [ ] 3.9 Write unit tests for nextAction (`tests/engine-action.test.js`)
    - Test critico urgency for sem_resposta + valor > 0
    - Test actionText includes financial value for critico leads
    - Test uses config pipelineStages not hardcoded PIPELINE
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [ ] 3.10 Implement `src/engine/risk.js` — calculateRisk(lead, config, now)
    - Calculate valorEmRisco from lead.valorEstimado, fallback to segment ticketMedio
    - Calculate tempoRestante as slaRules.leadResponseMinutes minus elapsed minutes
    - Set urgencyLevel to 'critico' when tempoRestante <= 0
    - Return RiskResult: { valorEmRisco, urgencyLevel, tempoRestante }
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 3.11 Write property tests for calculateRisk (`tests/engine-risk.test.js`)
    - **Property 5: Engine functions are deterministic — calculateRisk**
    - **Property 11: Risk calculation correctness**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5**

  - [ ] 3.12 Write unit tests for calculateRisk (`tests/engine-risk.test.js`)
    - Test valorEmRisco uses lead.valorEstimado when > 0
    - Test valorEmRisco falls back to segment ticketMedio when valorEstimado is 0
    - Test tempoRestante calculation
    - Test urgencyLevel critico when tempoRestante <= 0
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 3.13 Update `src/engine/index.js` to re-export all 4 engine functions
    - Add exports for classifyLead, calculatePriority, nextAction, calculateRisk
    - _Requirements: 3.1, 4.1, 5.1, 6.1_

- [ ] 4. Checkpoint — Phase 2 complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Phase 3 — Wire up API endpoints, SLA integration, simulate refactoring
  - [ ] 5.1 Create `src/api/engine.js` with POST /engine/evaluate and POST /engine/simulate
    - POST /engine/evaluate: load tenant + lead, resolveConfig, call all 4 engine functions, return combined result
    - POST /engine/simulate: validate message, resolveConfig, call classifyLead + calculatePriority, return result
    - Return 404 for non-existent leadId, 400 for empty message
    - Load TenantConfig once per request
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ] 5.2 Register engine router in `server.js`
    - Mount `/engine` route with auth middleware
    - _Requirements: 8.1_

  - [ ] 5.3 Add GET /owner/config and PATCH /owner/config endpoints to `src/api/owner.js`
    - GET /owner/config: resolveConfig for tenant, return full TenantConfig
    - PATCH /owner/config: validateConfigUpdate, merge into existing config, persist to Tenant.config, also update legacy fields for backward compat
    - MASTER can read any tenant's config via ?tenantId query param
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 5.4 Modify `src/sla/engine.js` to accept optional config parameter
    - `leadSLAStatus(lead, tenant, now, config?)` reads from config.slaRules when provided
    - `casoSLAStatus(caso, tenant, now, config?)` reads from config.slaRules when provided
    - SLA ticker `tick()` calls resolveConfig and passes to leadSLAStatus + uses engine calculatePriority
    - Fall back to legacy fields when config not provided (backward compat)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ] 5.5 Refactor `src/api/simulate.js` to use engine functions
    - Replace KEYWORD_MAP and VALORES with calls to classifyLead, calculatePriority, calculateRisk
    - Load tenant config via resolveConfig
    - Maintain same response shape (segmento, subtipo, intencao, valorMin, valorMax, prioridade, proximoPasso, risco, slaMinutos)
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ] 5.6 Modify `src/api/operator.js` to use engine functions for priority recalculation
    - Import calculatePriority from engine, use with resolveConfig in estagio/activity endpoints
    - Stage validation uses config pipelineStages when available
    - _Requirements: 2.4, 2.5_

  - [ ] 5.7 Add optional `config` param to `calcularPrioridade` in `src/pipeline/constants.js`
    - When config is provided, delegate to engine calculatePriority
    - Without config, use existing hardcoded logic (backward compat)
    - _Requirements: 2.3, 2.4_

  - [ ]* 5.8 Write property tests for SLA config integration (`tests/engine-backward-compat.test.js`)
    - **Property 12: SLA engine uses config rules**
    - **Property 13: Simulate endpoint response shape backward compatibility**
    - **Validates: Requirements 9.1, 9.2, 13.4**

  - [ ] 5.9 Write integration tests for engine API (`tests/api-engine.test.js`)
    - Test POST /engine/evaluate returns all 4 results
    - Test POST /engine/simulate returns classification + priority
    - Test 404 for non-existent lead
    - Test 400 for empty message
    - Test GET /owner/config returns TenantConfig
    - Test PATCH /owner/config merges and persists
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3_

- [ ] 6. Checkpoint — Phase 3 complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Phase 4 — Onboarding generates full TenantConfig
  - [ ] 7.1 Modify `src/templates/service.js` createTenantFromTemplate to generate and store TenantConfig
    - Build full TenantConfig from template data (businessType, segmentos with keywords, default pipeline, SLA, priority thresholds, canais)
    - Store in Tenant.config field alongside legacy fields
    - _Requirements: 10.1, 10.2, 10.4_

  - [ ] 7.2 Modify `src/api/register.js` (or auth setup endpoint) to pass template config through
    - Ensure /auth/setup creates tenant with TenantConfig when business type is provided
    - _Requirements: 10.1, 10.3_

  - [ ] 7.3 Write unit tests for onboarding config generation
    - Test advocacia template generates correct segmentos with keywords
    - Test clinica/imobiliaria templates generate correct configs
    - Test custom segments from wizard are included in TenantConfig
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 8. Checkpoint — Phase 4 complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Phase 5 — Frontend updates
  - [ ] 9.1 Update `dashboard/src/components/ConfigPage.jsx` to read/write TenantConfig
    - Fetch config via GET /owner/config instead of GET /owner/tenant/config
    - Save changes via PATCH /owner/config with partial TenantConfig
    - Add pipeline stages editor (reorderable list with name, defaultActivityStatus, isFinal toggle)
    - Add priority thresholds editor with live preview
    - Prevent removal of convertido/perdido stages
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ] 9.2 Update `dashboard/src/components/OperatorInterface.jsx` to use engine recommendations
    - Call POST /engine/evaluate when a lead is selected, display ActionRecommendation in context banner
    - Show red background on context banner when urgency is 'critico', include valorEmRisco
    - Display PriorityResult reason text alongside priority emoji
    - Replace hardcoded STAGE_OPTIONS with pipelineStages from TenantConfig
    - Replace hardcoded ACTIVITY_OPTIONS with activityRules from TenantConfig
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ] 9.3 Update `dashboard/src/components/OnboardingWizard.jsx` to generate full TenantConfig
    - Send complete TenantConfig structure in /auth/setup request body
    - Include businessType, segmentos with keywords, pipelineStages, activityRules, slaRules, priorityThresholds, canais
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ] 9.4 Add API helper functions in `dashboard/src/lib/api.js`
    - Add `getOwnerTenantConfig(tenantId)` for GET /owner/config
    - Add `patchOwnerTenantConfig(data, tenantId)` for PATCH /owner/config
    - Add `evaluateLead(leadId, tenantId)` for POST /engine/evaluate
    - Add `simulateMessage(message, tenantId)` for POST /engine/simulate
    - _Requirements: 7.1, 7.2, 8.1, 8.2_

- [ ] 10. Final checkpoint — All phases complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all 312 existing tests still pass
  - Verify new engine tests pass
  - Verify backward compatibility: tenants with config=null work identically to before

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between phases
- Property tests validate universal correctness properties from the design document
- All engine functions are pure — no database access, no side effects
- Backward compatibility is maintained throughout via resolveConfig fallback
