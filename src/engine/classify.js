// src/engine/classify.js
// SINGLE SOURCE OF TRUTH for lead classification
// All other classification logic delegates here.

/**
 * Classify a message using flow nodes and segment data.
 * Priority: flow node keywords → segment name match → fallback
 *
 * @param {string} message - user message
 * @param {Array} flowNodes - nodes from DB (may lack keywords on intermediate nodes)
 * @param {Array} [segments] - tenant segmentos [{nome, keywords?}]
 * @returns {ClassificationResult}
 */
function classifyLead(message, flowNodes, segments) {
  const lower = (message || '').toLowerCase().trim();
  if (!lower) {
    return { segmento: 'outros', intencao: 'informacao', matchedKeywords: [], explicacao: 'Mensagem vazia.', source: 'fallback' };
  }

  // 1. Flow node keywords (start node opcoes)
  if (flowNodes && flowNodes.length > 0) {
    const startNode = flowNodes.find(n => n.estado === 'start');
    if (startNode && startNode.opcoes) {
      for (const opcao of startNode.opcoes) {
        if (opcao.keywords && Array.isArray(opcao.keywords)) {
          const matched = [];
          for (const kw of opcao.keywords) {
            if (lower.includes(kw.toLowerCase())) matched.push(kw);
          }
          if (matched.length > 0) {
            return {
              segmento: opcao.segmento || 'outros',
              intencao: opcao.intencao || 'contratar',
              matchedKeywords: matched,
              explicacao: `Classificado como ${opcao.segmento} porque contém: "${matched.join('", "')}"`,
              source: 'flow_engine',
              valorEstimadoMin: opcao.valorEstimadoMin || null,
              valorEstimadoMax: opcao.valorEstimadoMax || null,
            };
          }
        }
      }
    }
  }

  // 2. Segment name match
  if (segments && segments.length > 0) {
    for (const seg of segments) {
      const segName = (seg.nome || '').toLowerCase();
      if (segName && lower.includes(segName)) {
        return {
          segmento: seg.nome,
          intencao: 'contratar',
          matchedKeywords: [seg.nome],
          explicacao: `Classificado como ${seg.nome} porque contém: "${seg.nome}"`,
          source: 'segment_match',
          valorEstimadoMin: seg.valorMin || null,
          valorEstimadoMax: seg.valorMax || null,
        };
      }
      // Also check segment keywords if available
      if (seg.keywords && Array.isArray(seg.keywords)) {
        const matched = [];
        for (const kw of seg.keywords) {
          if (lower.includes(kw.toLowerCase())) matched.push(kw);
        }
        if (matched.length > 0) {
          return {
            segmento: seg.nome,
            intencao: 'contratar',
            matchedKeywords: matched,
            explicacao: `Classificado como ${seg.nome} porque contém: "${matched.join('", "')}"`,
            source: 'segment_match',
            valorEstimadoMin: seg.valorMin || null,
            valorEstimadoMax: seg.valorMax || null,
          };
        }
      }
    }
  }

  // 3. Fallback
  return {
    segmento: 'outros',
    intencao: 'informacao',
    matchedKeywords: [],
    explicacao: 'Não foi possível classificar automaticamente. Será encaminhado para triagem.',
    source: 'fallback',
    valorEstimadoMin: null,
    valorEstimadoMax: null,
  };
}

module.exports = { classifyLead };
