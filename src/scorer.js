function prioridadePorScore(score) {
  if (score >= 5) return 'QUENTE';
  if (score >= 3) return 'MEDIO';
  return 'FRIO';
}

function clampScore(score) {
  return Math.max(0, Math.min(10, Number(score) || 0));
}

/**
 * Calcula score legado usado pelos testes e pelo fluxo inicial.
 *
 * @param {{ impacto?: number, intencao?: number }} dados
 * @returns {{ score: number, prioridade: 'QUENTE' | 'MEDIO' | 'FRIO' }}
 */
function calcularScore({ impacto, intencao } = {}) {
  const imp = Number(impacto) || 0;
  const int = Number(intencao) || 0;
  const score = clampScore(imp + int + 1);

  return { score, prioridade: prioridadePorScore(score) };
}

function classificarLead(sinais = {}) {
  const score = clampScore(
    (sinais.urgenciaDeclarada ? 3 : 0) +
    (sinais.intencaoAcao ? 2 : 0) +
    (sinais.problemaClaro ? 2 : 0) +
    (sinais.falarAdvogado ? 3 : 0) +
    (sinais.casoComplexo ? 2 : 0) -
    (sinais.retornouMenu ? 1 : 0)
  );

  const scoreBreakdown = {
    urgenciaDeclarada: sinais.urgenciaDeclarada ? 3 : 0,
    intencaoAcao: sinais.intencaoAcao ? 2 : 0,
    problemaClaro: sinais.problemaClaro ? 2 : 0,
    falarAdvogado: sinais.falarAdvogado ? 3 : 0,
    casoComplexo: sinais.casoComplexo ? 2 : 0,
    retornouMenu: sinais.retornouMenu ? -1 : 0,
  };

  return { score, prioridade: prioridadePorScore(score), scoreBreakdown };
}

module.exports = { calcularScore, classificarLead, prioridadePorScore };
