// src/pipeline/constants.js
// Pipeline stages and activity statuses — single source of truth

const PIPELINE = ['novo', 'atendimento', 'qualificado', 'proposta', 'negociacao', 'convertido', 'perdido'];

const PIPELINE_ORDER = Object.fromEntries(PIPELINE.map((s, i) => [s, i]));

const ACTIVITY_STATUS = ['novo', 'em_atendimento', 'aguardando_cliente', 'follow_up', 'sem_resposta', 'em_negociacao'];

const FINAL_STAGES = ['convertido', 'perdido'];

// Stage transitions: what activityStatus to set when stage changes
const STAGE_ACTIVITY_MAP = {
  novo: 'novo',
  atendimento: 'em_atendimento',
  qualificado: 'em_atendimento',
  proposta: 'aguardando_cliente',
  negociacao: 'em_negociacao',
  convertido: null,
  perdido: null,
};

// Priority algorithm based on activityStatus + stage + valorEstimado
function calcularPrioridade(lead) {
  let score = 0;
  if (lead.activityStatus === 'sem_resposta') score += 5;
  if (lead.activityStatus === 'follow_up') score += 3;
  if (lead.estagio === 'proposta' || lead.estagio === 'negociacao') score += 3;
  const valor = Number(lead.valorEstimado || 0);
  if (valor > 5000) score += 2;
  else if (valor > 2000) score += 1;

  if (score >= 6) return 'quente';
  if (score >= 3) return 'medio';
  return 'frio';
}

// Next stage in pipeline (forward only, excludes convertido/perdido)
function nextStage(current) {
  const idx = PIPELINE.indexOf(current || 'novo');
  if (idx < 0 || idx >= PIPELINE.indexOf('convertido') - 1) return null;
  return PIPELINE[idx + 1];
}

// Recommended action based on stage
function proximoPasso(estagio) {
  const passos = {
    novo: 'Assumir atendimento',
    atendimento: 'Qualificar contato',
    qualificado: 'Enviar proposta',
    proposta: 'Aguardar resposta ou negociar',
    negociacao: 'Converter ou marcar perdido',
    convertido: 'Caso em andamento',
    perdido: 'Encerrado',
  };
  return passos[estagio] || 'Assumir atendimento';
}

module.exports = {
  PIPELINE,
  PIPELINE_ORDER,
  ACTIVITY_STATUS,
  FINAL_STAGES,
  STAGE_ACTIVITY_MAP,
  calcularPrioridade,
  nextStage,
  proximoPasso,
};
