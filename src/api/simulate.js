// src/api/simulate.js
// Simulation endpoint — classifies a message without creating a lead
const express = require('express');
const { requireAuth } = require('../auth/middleware');
const { getFlow } = require('../flow/cache');
const { calcularPrioridade, proximoPasso } = require('../pipeline/constants');
const { classifyWithExplanation } = require('../templates/merge');

const router = express.Router();

// Keyword → segmento mapping for simulation
const KEYWORD_MAP = [
  { keywords: ['demitido', 'demissão', 'demissao', 'trabalho', 'trabalhista', 'horas extras', 'salário', 'salario', 'CLT', 'rescisão', 'rescisao', 'assédio', 'assedio'], segmento: 'trabalhista', subtipo: 'demissao', intencao: 'contratar' },
  { keywords: ['divórcio', 'divorcio', 'separação', 'separacao', 'pensão', 'pensao', 'guarda', 'família', 'familia', 'alimentos'], segmento: 'familia', subtipo: 'divorcio', intencao: 'contratar' },
  { keywords: ['consulta', 'dúvida', 'duvida', 'informação', 'informacao', 'saber', 'quanto custa'], segmento: 'outros', subtipo: 'consulta', intencao: 'informacao' },
  { keywords: ['cliente', 'processo', 'andamento', 'meu caso'], segmento: 'cliente', subtipo: 'acompanhamento', intencao: 'cliente' },
  { keywords: ['contrato', 'acordo', 'proposta', 'fechar', 'contratar'], segmento: 'civel', subtipo: 'contrato', intencao: 'contratar' },
];

// Default values per segmento
const VALORES = {
  trabalhista: { min: 2000, max: 15000 },
  familia: { min: 1500, max: 8000 },
  civel: { min: 1000, max: 10000 },
  outros: { min: 200, max: 1000 },
  cliente: { min: 0, max: 0 },
};

function classifyMessage(message) {
  const lower = (message || '').toLowerCase();

  for (const entry of KEYWORD_MAP) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        const valores = VALORES[entry.segmento] || VALORES.outros;
        const lead = {
          estagio: 'novo',
          activityStatus: 'novo',
          valorEstimado: valores.min,
        };
        const prioridade = calcularPrioridade(lead);

        return {
          segmento: entry.segmento,
          subtipo: entry.subtipo,
          intencao: entry.intencao,
          valorMin: valores.min,
          valorMax: valores.max,
          prioridade,
          proximoPasso: proximoPasso('novo'),
          risco: valores.min,
          slaMinutos: 30,
        };
      }
    }
  }

  // Default: não classificado
  return {
    segmento: 'outros',
    subtipo: 'nao_classificado',
    intencao: 'informacao',
    valorMin: 200,
    valorMax: 1000,
    prioridade: 'frio',
    proximoPasso: proximoPasso('novo'),
    risco: 200,
    slaMinutos: 30,
  };
}

/**
 * POST /simulate
 * Body: { message }
 * Returns classification without creating a lead
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message é obrigatório' });
    }

    // Try to use Flow Engine nodes for better classification
    let result = null;
    try {
      const flow = await getFlow(req.tenantId);
      if (flow && flow.nodes) {
        const startNode = flow.nodes.find(n => n.estado === 'start');
        if (startNode && startNode.opcoes) {
          const lower = message.toLowerCase();
          for (const opcao of startNode.opcoes) {
            if (opcao.keywords) {
              for (const kw of opcao.keywords) {
                if (lower.includes(kw.toLowerCase())) {
                  const valores = VALORES[opcao.segmento] || VALORES.outros;
                  result = {
                    segmento: opcao.segmento || 'outros',
                    subtipo: opcao.tipoAtendimento || opcao.segmento || 'geral',
                    intencao: opcao.intencao || 'contratar',
                    valorMin: opcao.valorEstimadoMin || valores.min,
                    valorMax: opcao.valorEstimadoMax || valores.max,
                    prioridade: calcularPrioridade({ estagio: 'novo', activityStatus: 'novo', valorEstimado: opcao.valorEstimadoMin || valores.min }),
                    proximoPasso: proximoPasso('novo'),
                    risco: opcao.valorEstimadoMin || valores.min,
                    slaMinutos: 30,
                  };
                  break;
                }
              }
            }
            if (result) break;
          }
        }
      }
    } catch { /* fallback to keyword map */ }

    // Fallback to keyword map
    if (!result) {
      result = classifyMessage(message);
    }

    // Add classification explanation
    try {
      const flow = await getFlow(req.tenantId);
      const { getPrisma } = require('../infra/db');
      const tenant = await getPrisma().tenant.findUnique({ where: { id: req.tenantId }, select: { segmentos: true } });
      const explanation = classifyWithExplanation(message, tenant?.segmentos || [], flow?.nodes || []);
      result.explicacao = explanation.explicacao;
      result.matchedKeywords = explanation.matchedKeywords;
    } catch { /* explanation is optional */ }

    return res.json(result);
  } catch (err) {
    console.error('POST /simulate error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
