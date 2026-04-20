/**
 * Calcula score e prioridade de um lead.
 * Pode ser chamado incrementalmente (com apenas impacto ou apenas intencao).
 *
 * @param {{ impacto?: number, intencao?: number }} dados
 * @returns {{ score: number, prioridade: 'QUENTE' | 'MEDIO' | 'FRIO' }}
 */
function calcularScore({ impacto, intencao } = {}) {
  const imp = Number(impacto) || 0;
  const int = Number(intencao) || 0;
  const score = imp + int + 1;

  let prioridade;
  if (score >= 7) prioridade = 'QUENTE';
  else if (score >= 5) prioridade = 'MEDIO';
  else prioridade = 'FRIO';

  return { score, prioridade };
}

module.exports = { calcularScore };
