// src/templates/merge.js
// Merge Engine — adapts a base template with client-specific segments
// This is the core of the SaaS: TEMPLATE + VARIABLES = CUSTOM FLOW

/**
 * Merge a base template with client segments.
 * Generates flow nodes dynamically based on active segments.
 * 
 * @param {object} template - Base template (e.g., template_juridico_v1)
 * @param {Array} segments - Client segments [{nome, valorMin, valorMax, ticketMedio, keywords?}]
 * @param {object} options - {slaMinutes, slaContratoHoras, moeda, empresaNome}
 * @returns {object} Merged template ready for tenant creation
 */
function mergeTemplateWithSegments(template, segments, options = {}) {
  const activeSegments = (segments || []).filter(s => s.nome);

  // If no custom segments, use template defaults
  if (activeSegments.length === 0) {
    return template;
  }

  // Build menu options from segments
  const menuOpcoes = activeSegments.map((seg, i) => {
    // Find matching option in template for keywords
    const templateOpcao = (template.nodes[0]?.opcoes || []).find(o => o.segmento === seg.nome);

    return {
      texto: String(i + 1),
      proxEstado: 'situacao',
      scoreIncrement: 0,
      segmento: seg.nome,
      intencao: 'contratar',
      valorEstimadoMin: seg.valorMin || 1000,
      valorEstimadoMax: seg.valorMax || 10000,
      keywords: templateOpcao?.keywords || [seg.nome],
    };
  });

  // Add "Já sou cliente" and "Outro" options
  menuOpcoes.push(
    { texto: String(menuOpcoes.length + 1), proxEstado: 'cliente_id', scoreIncrement: 0, segmento: 'cliente', intencao: 'cliente', keywords: ['cliente', 'processo'] },
    { texto: String(menuOpcoes.length + 2), proxEstado: 'descricao', scoreIncrement: 0, segmento: 'outros', intencao: 'informacao', keywords: ['outro', 'dúvida'] },
  );

  // Build menu message
  const segLabels = activeSegments.map((seg, i) => {
    const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'][i] || `${i + 1}.`;
    const label = seg.nome.charAt(0).toUpperCase() + seg.nome.slice(1);
    return `${emoji} ${label}`;
  });
  const clienteIdx = activeSegments.length + 1;
  const outroIdx = activeSegments.length + 2;
  const clienteEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'][clienteIdx - 1] || `${clienteIdx}.`;
  const outroEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'][outroIdx - 1] || `${outroIdx}.`;

  const menuMsg = `Olá! 👋 Bem-vindo à {empresa}.\n\nComo podemos ajudar?\n\n${segLabels.join('\n')}\n${clienteEmoji} Já sou cliente\n${outroEmoji} Outro assunto`;

  // Build fallback message
  const fallbackLabels = activeSegments.map((seg, i) => {
    const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'][i] || `${i + 1}.`;
    return `${emoji} ${seg.nome.charAt(0).toUpperCase() + seg.nome.slice(1)}`;
  });
  const fallbackMsg = `Não entendi. Escolha uma opção:\n\n${fallbackLabels.join('\n')}\n${clienteEmoji} Já sou cliente\n${outroEmoji} Outro`;

  // Clone template nodes, replacing start and fallback
  const mergedNodes = template.nodes.map(node => {
    if (node.estado === 'start') {
      return { ...node, mensagem: menuMsg, opcoes: menuOpcoes };
    }
    if (node.estado === 'fallback') {
      return { ...node, mensagem: fallbackMsg, opcoes: menuOpcoes.map(o => ({ ...o })) };
    }
    return { ...node };
  });

  // Build merged valores
  const mergedValores = {};
  for (const seg of activeSegments) {
    mergedValores[seg.nome] = {
      min: seg.valorMin || 1000,
      max: seg.valorMax || 10000,
      default: seg.ticketMedio || 3000,
    };
  }

  return {
    ...template,
    segmentos: activeSegments.map(s => s.nome),
    valores: mergedValores,
    sla: {
      slaMinutes: options.slaMinutes || template.sla.slaMinutes,
      slaContratoHoras: options.slaContratoHoras || template.sla.slaContratoHoras,
    },
    financeiro: {
      ...template.financeiro,
      ticketMedio: activeSegments.length > 0
        ? Math.round(activeSegments.reduce((s, seg) => s + (seg.ticketMedio || 3000), 0) / activeSegments.length)
        : template.financeiro.ticketMedio,
      moeda: options.moeda || template.financeiro.moeda,
    },
    nodes: mergedNodes,
  };
}

/**
 * Classify a message against segments and return explanation.
 */
function classifyWithExplanation(message, segments, flowNodes) {
  const lower = (message || '').toLowerCase();
  const matchedKeywords = [];

  // Try flow nodes first
  if (flowNodes && flowNodes.length > 0) {
    const startNode = flowNodes.find(n => n.estado === 'start');
    if (startNode?.opcoes) {
      for (const opcao of startNode.opcoes) {
        if (opcao.keywords) {
          for (const kw of opcao.keywords) {
            if (lower.includes(kw.toLowerCase())) {
              matchedKeywords.push(kw);
            }
          }
          if (matchedKeywords.length > 0) {
            return {
              segmento: opcao.segmento,
              matchedKeywords,
              explicacao: `Classificado como ${opcao.segmento} porque contém: "${matchedKeywords.join('", "')}"`,
              source: 'flow_engine',
            };
          }
        }
      }
    }
  }

  // Fallback: match against segment names
  for (const seg of (segments || [])) {
    if (lower.includes(seg.nome?.toLowerCase())) {
      return {
        segmento: seg.nome,
        matchedKeywords: [seg.nome],
        explicacao: `Classificado como ${seg.nome} porque contém: "${seg.nome}"`,
        source: 'segment_match',
      };
    }
  }

  return {
    segmento: 'outros',
    matchedKeywords: [],
    explicacao: 'Não foi possível classificar automaticamente. Será encaminhado para triagem.',
    source: 'fallback',
  };
}

module.exports = { mergeTemplateWithSegments, classifyWithExplanation };
