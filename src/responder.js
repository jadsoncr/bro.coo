// src/responder.js
// Garante formato consistente de saída, independente de como a stateMachine respondeu.

function buildResponse(resultado) {
  return {
    message: resultado.message || '',
    estado: resultado.estado || null,
    fluxo: resultado.fluxo || null,
    sessao: resultado.sessao || null,
    score: resultado.score ?? 1,
    prioridade: resultado.prioridade || 'FRIO',
    flagAtencao: resultado.flagAtencao || false,
  };
}

module.exports = { buildResponse };
