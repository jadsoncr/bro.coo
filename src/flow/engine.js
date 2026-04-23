// src/flow/engine.js
// Dynamic Flow Engine — reads flow definitions from DB and processes messages
const sessionManager = require('../sessionManager');
const storage = require('../storage');
const { getFlow } = require('./cache');
const { safeRecordEvent, EVENTS } = require('../events/service');
const { randomUUID } = require('crypto');

const RESET_KEYWORDS = ['menu', 'reiniciar', 'voltar'];

/**
 * Calculate priority from accumulated score.
 */
function calcularPrioridade(score) {
  if (score >= 5) return 'QUENTE';
  if (score >= 3) return 'MEDIO';
  return 'FRIO';
}

/**
 * Replace {nome} and {empresa} placeholders in a message template.
 */
function replaceVariables(template, sessaoObj, tenantNome) {
  if (!template) return '';
  return template
    .replace(/\{nome\}/g, sessaoObj.nome || '')
    .replace(/\{empresa\}/g, tenantNome || '');
}

/**
 * Find a Node by estado within a flow's nodes array.
 */
function findNode(flow, estado) {
  if (!flow || !flow.nodes) return null;
  return flow.nodes.find((n) => n.estado === estado) || null;
}

/**
 * Match user input against a menu Node's opcoes.
 * 1. Exact number match against opcoes[].texto
 * 2. Keyword match: check if mensagem contains any keyword from opcoes[].keywords
 * Returns the matched option or null.
 */
function matchMenuOption(node, mensagem) {
  const opcoes = node.opcoes || [];
  const input = mensagem.trim();

  // 1. Exact text match
  const exactMatch = opcoes.find((o) => o.texto === input);
  if (exactMatch) return exactMatch;

  // 2. Keyword match
  const lower = input.toLowerCase();
  for (const opcao of opcoes) {
    if (opcao.keywords && Array.isArray(opcao.keywords)) {
      for (const kw of opcao.keywords) {
        if (lower.includes(kw.toLowerCase())) {
          return opcao;
        }
      }
    }
  }

  return null;
}

/**
 * Persist lead data when reaching a final state.
 */
async function persistirLead(tenantId, sessao) {
  const s = await storage.getSession(sessao);
  if (!s) return;

  const leadId = s.leadId || randomUUID();
  await sessionManager.updateSession(sessao, { leadId });

  try {
    if (s.fluxo === 'cliente' || s.segmento === 'cliente') {
      await storage.createClient({
        tenantId,
        leadId,
        nome: s.clienteId || s.nome,
        telefone: s.sessao || sessao,
        canalOrigem: s.canalOrigem,
        conteudo: s.clienteId,
        urgencia: s.flagAtencao ? 'QUENTE' : 'MEDIO',
        flagAtencao: s.flagAtencao,
        status: 'NOVO',
        origem: s.origem,
        campanha: s.campanha,
      });
      return;
    }

    await storage.createLead({
      tenantId,
      leadId,
      nome: s.nome,
      telefone: s.telefoneContato || s.sessao || sessao,
      area: s.fluxo || s.segmento,
      fluxo: s.fluxo || s.segmento,
      situacao: s.advogadoDescricao || s.trabalhoTipo || s.familiaTipo || '',
      score: s.score || 0,
      prioridade: s.prioridade || 'FRIO',
      flagAtencao: s.flagAtencao,
      canalOrigem: s.canalOrigem,
      canalPreferido: s.canalPreferido,
      origem: s.origem,
      campanha: s.campanha,
      segmento: s.segmento,
      tipoAtendimento: s.tipoAtendimento,
      valorEstimado: s.valorEstimadoMin || s.valorEstimadoMax || 0,
      status: 'NOVO',
    });
  } catch (err) {
    console.error('[flow/engine] persistirLead error:', err.message);
  }
}

/**
 * Build the standard response object.
 */
function buildResponse(sessaoObj, message, estado) {
  return {
    message,
    estado: estado || sessaoObj.estadoAtual,
    fluxo: sessaoObj.fluxo || sessaoObj.segmento || null,
    sessao: sessaoObj.sessao,
    score: sessaoObj.score || 0,
    prioridade: sessaoObj.prioridade || 'FRIO',
    flagAtencao: sessaoObj.flagAtencao || false,
    valorEstimadoMin: sessaoObj.valorEstimadoMin || null,
    valorEstimadoMax: sessaoObj.valorEstimadoMax || null,
  };
}

/**
 * Main entry point: process a message through the dynamic flow.
 *
 * @param {string} tenantId
 * @param {string} sessao - session identifier (phone number)
 * @param {string} mensagem - normalized user message
 * @param {string} canal - channel (telegram, whatsapp, etc.)
 * @returns {Promise<FlowResponse>}
 */
async function process(tenantId, sessao, mensagem, canal) {
  // Load flow definition (cached)
  const flow = await getFlow(tenantId);
  if (!flow) {
    return {
      message: 'Fluxo não configurado para este tenant.',
      estado: null,
      fluxo: null,
      sessao,
      score: 0,
      prioridade: 'FRIO',
      flagAtencao: false,
    };
  }

  const tenantNome = flow.tenant ? flow.tenant.nome : '';

  // Get or create session
  let sessaoObj = await sessionManager.getSession(sessao, canal);

  // RESET keywords
  if (RESET_KEYWORDS.includes(mensagem.toLowerCase())) {
    sessaoObj = await sessionManager.resetSession(sessao, canal);
    const startNode = findNode(flow, 'start');
    const msg = startNode
      ? replaceVariables(startNode.mensagem, sessaoObj, tenantNome)
      : 'Bem-vindo!';
    return buildResponse(sessaoObj, msg, 'start');
  }

  // First message — show start node
  if (sessaoObj.estadoAtual === 'start' && !sessaoObj.ultimaMensagem) {
    await sessionManager.updateSession(sessao, { ultimaMensagem: mensagem });
    const startNode = findNode(flow, 'start');
    const msg = startNode
      ? replaceVariables(startNode.mensagem, sessaoObj, tenantNome)
      : 'Bem-vindo!';
    return buildResponse(sessaoObj, msg, 'start');
  }

  // Save last message
  await sessionManager.updateSession(sessao, { ultimaMensagem: mensagem });

  // Find current node
  const currentNode = findNode(flow, sessaoObj.estadoAtual);
  if (!currentNode) {
    // Unknown state — reset to start
    await sessionManager.updateSession(sessao, { estadoAtual: 'start', ultimaMensagem: null });
    const startNode = findNode(flow, 'start');
    const msg = startNode
      ? replaceVariables(startNode.mensagem, sessaoObj, tenantNome)
      : 'Bem-vindo!';
    return buildResponse(sessaoObj, msg, 'start');
  }

  // Process based on node type
  let result;
  switch (currentNode.tipo) {
    case 'menu':
      result = await processMenu(flow, currentNode, sessaoObj, sessao, mensagem, tenantId, tenantNome);
      break;
    case 'input':
      result = await processInput(flow, currentNode, sessaoObj, sessao, mensagem, tenantId, tenantNome);
      break;
    case 'final_lead':
      result = await processFinal(flow, currentNode, sessaoObj, sessao, tenantId, tenantNome, 'lead');
      break;
    case 'final_cliente':
      result = await processFinal(flow, currentNode, sessaoObj, sessao, tenantId, tenantNome, 'cliente');
      break;
    default:
      // Unknown type — treat as menu
      result = await processMenu(flow, currentNode, sessaoObj, sessao, mensagem, tenantId, tenantNome);
      break;
  }

  return result;
}

/**
 * Process a menu-type node: match input against options.
 */
async function processMenu(flow, node, sessaoObj, sessao, mensagem, tenantId, tenantNome) {
  const matched = matchMenuOption(node, mensagem);

  if (matched) {
    // Valid match — reset fallback count, advance state
    const currentScore = sessaoObj.score || 0;
    const newScore = currentScore + (matched.scoreIncrement || 0);
    const prioridade = calcularPrioridade(newScore);

    const updates = {
      estadoAtual: matched.proxEstado,
      score: newScore,
      prioridade,
      fallbackCount: 0,
    };

    if (matched.segmento) {
      updates.segmento = matched.segmento;
      updates.fluxo = matched.segmento;
    }
    if (matched.tipoAtendimento) {
      updates.tipoAtendimento = matched.tipoAtendimento;
    }
    if (matched.valorEstimadoMin !== undefined) {
      updates.valorEstimadoMin = matched.valorEstimadoMin;
    }
    if (matched.valorEstimadoMax !== undefined) {
      updates.valorEstimadoMax = matched.valorEstimadoMax;
    }

    await sessionManager.updateSession(sessao, updates);

    // Reload session
    const updatedSession = await storage.getSession(sessao);

    // Check if next state is a final state
    const nextNode = findNode(flow, matched.proxEstado);
    if (nextNode && (nextNode.tipo === 'final_lead' || nextNode.tipo === 'final_cliente')) {
      return processFinal(flow, nextNode, updatedSession, sessao, tenantId, tenantNome,
        nextNode.tipo === 'final_lead' ? 'lead' : 'cliente');
    }

    // Return next node's message
    const msg = nextNode
      ? replaceVariables(nextNode.mensagem, updatedSession, tenantNome)
      : 'Próximo passo...';
    return buildResponse(updatedSession, msg, matched.proxEstado);
  }

  // No match — fallback logic
  const fallbackCount = (sessaoObj.fallbackCount || 0) + 1;
  await sessionManager.updateSession(sessao, { fallbackCount });

  if (fallbackCount >= 2) {
    // Escalate to operator
    await sessionManager.updateSession(sessao, {
      statusSessao: 'classificacao_pendente',
      estadoAtual: 'classificacao_pendente',
    });
    const updatedSession = await storage.getSession(sessao);
    return buildResponse(
      updatedSession,
      'Vou encaminhar você para um atendente que pode te ajudar melhor. Aguarde um momento! 🙏',
      'classificacao_pendente'
    );
  }

  // Repeat current node with hint
  const updatedSession = await storage.getSession(sessao);
  const hintMsg = 'Não entendi sua resposta. Por favor, escolha uma das opções:\n\n' +
    replaceVariables(node.mensagem, updatedSession, tenantNome);
  return buildResponse(updatedSession, hintMsg, node.estado);
}

/**
 * Process an input-type node: validate min length, advance.
 */
async function processInput(flow, node, sessaoObj, sessao, mensagem, tenantId, tenantNome) {
  const input = mensagem.trim();

  // Validate minimum length (3 chars)
  if (input.length < 3) {
    const msg = replaceVariables(node.mensagem, sessaoObj, tenantNome);
    return buildResponse(sessaoObj, msg, node.estado);
  }

  // Determine next state from opcoes
  const opcoes = node.opcoes || [];
  const proxEstado = opcoes.length > 0 && opcoes[0].proxEstado
    ? opcoes[0].proxEstado
    : 'final_lead';

  const scoreIncrement = opcoes.length > 0 ? (opcoes[0].scoreIncrement || 0) : 0;
  const newScore = (sessaoObj.score || 0) + scoreIncrement;
  const prioridade = calcularPrioridade(newScore);

  // Save input data based on current state context
  const updates = {
    estadoAtual: proxEstado,
    score: newScore,
    prioridade,
    fallbackCount: 0,
  };

  // Store input value contextually
  if (node.estado === 'coleta_nome') {
    updates.nome = input;
  } else if (node.estado === 'cliente_identificacao') {
    updates.clienteId = input;
  } else if (node.estado === 'advogado_descricao') {
    updates.advogadoDescricao = input;
  } else if (node.estado === 'outros_descricao') {
    updates.outrosDescricao = input;
  } else if (node.estado === 'contato_numero') {
    updates.telefoneContato = input;
  }

  await sessionManager.updateSession(sessao, updates);
  const updatedSession = await storage.getSession(sessao);

  // Check if next state is final
  const nextNode = findNode(flow, proxEstado);
  if (nextNode && (nextNode.tipo === 'final_lead' || nextNode.tipo === 'final_cliente')) {
    return processFinal(flow, nextNode, updatedSession, sessao, tenantId, tenantNome,
      nextNode.tipo === 'final_lead' ? 'lead' : 'cliente');
  }

  const msg = nextNode
    ? replaceVariables(nextNode.mensagem, updatedSession, tenantNome)
    : 'Próximo passo...';
  return buildResponse(updatedSession, msg, proxEstado);
}

/**
 * Process a final state: persist lead, emit event, return finalization message.
 */
async function processFinal(flow, node, sessaoObj, sessao, tenantId, tenantNome, tipo) {
  // Persist lead data
  await persistirLead(tenantId, sessao);

  // Emit completion event
  await safeRecordEvent({
    tenantId,
    leadId: sessaoObj.leadId || null,
    event: EVENTS.LEAD_CREATED,
    step: node.estado,
    metadata: { tipo, segmento: sessaoObj.segmento },
  });

  const msg = replaceVariables(node.mensagem, sessaoObj, tenantNome);

  // Move to pos_final if it exists, otherwise stay
  const posNode = findNode(flow, 'pos_final');
  if (posNode) {
    await sessionManager.updateSession(sessao, { estadoAtual: 'pos_final' });
    const updatedSession = await storage.getSession(sessao);
    const posMsg = replaceVariables(posNode.mensagem, updatedSession, tenantNome);
    return buildResponse(updatedSession, msg + '\n\n' + posMsg, 'pos_final');
  }

  await sessionManager.updateSession(sessao, { estadoAtual: node.estado });
  return buildResponse(sessaoObj, msg, node.estado);
}

module.exports = { process };
