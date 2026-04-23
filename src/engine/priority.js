// src/engine/priority.js
// SINGLE SOURCE OF TRUTH for priority calculation
// Centralizes logic from pipeline/constants.js calcularPrioridade

/**
 * Calculate priority from lead data.
 * Uses same logic as pipeline/constants.js but centralized.
 *
 * @param {object} lead - {activityStatus, estagio, valorEstimado}
 * @param {object} [config] - optional config with custom thresholds
 * @returns {PriorityResult}
 */
function calculatePriority(lead, config) {
  const rules = config?.priorityThresholds?.rules || [
    { condition: { activityStatus: 'sem_resposta' }, scoreIncrement: 5 },
    { condition: { activityStatus: 'follow_up' }, scoreIncrement: 3 },
    { condition: { estagio: 'proposta' }, scoreIncrement: 3 },
    { condition: { estagio: 'negociacao' }, scoreIncrement: 3 },
    { condition: { valorMinimo: 5000 }, scoreIncrement: 2 },
    { condition: { valorMinimo: 2000 }, scoreIncrement: 1 },
  ];

  const thresholdQuente = config?.priorityThresholds?.quente || 6;
  const thresholdMedio = config?.priorityThresholds?.medio || 3;

  let score = 0;
  const reasons = [];

  for (const rule of rules) {
    const cond = rule.condition;
    let match = false;

    if (cond.activityStatus && lead.activityStatus === cond.activityStatus) match = true;
    if (cond.estagio && lead.estagio === cond.estagio) match = true;
    if (cond.valorMinimo) {
      const valor = Number(lead.valorEstimado || 0);
      // Only apply highest matching valor rule
      if (valor >= cond.valorMinimo) match = true;
    }

    if (match) {
      score += rule.scoreIncrement;
      reasons.push(`${Object.values(cond)[0]} +${rule.scoreIncrement}`);
    }
  }

  // Deduplicate valor rules (only count highest)
  // The current logic matches both 5000 and 2000 if valor > 5000
  // This matches the existing behavior in constants.js

  let prioridade;
  if (score >= thresholdQuente) prioridade = 'quente';
  else if (score >= thresholdMedio) prioridade = 'medio';
  else prioridade = 'frio';

  return {
    prioridade,
    score,
    reason: reasons.length > 0 ? `${reasons.join(', ')} = ${score} → ${prioridade}` : `score ${score} → ${prioridade}`,
  };
}

module.exports = { calculatePriority };
