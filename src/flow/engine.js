// src/flow/engine.js
// Dynamic Flow Engine — reads flow definitions from DB and processes messages
const sessionManager = require('../sessionManager');
const storage = require('../storage');
const { getFlow } = require('./cache');
const { safeRecordEvent, EVENTS } = require('../events/service');
const { randomUUID } = require('crypto');

const RESET_KEYWORDS = ['menu', 'reiniciar', 'voltar'];
const MAX_TRANSITIONS = 50; // prevent infinite loops

function calcularPrioridade(score) {
  if (score >= 5) return 'QUENTE';
  if (score >= 3) return 'MEDIO';
  return 'FRIO';
}

function replaceVariables(template, sessaoObj, tenantNome) {
  if (!template) return '';
  return template
    .replace(/\{nome\}/g, sessaoObj.nome || '')
    .replace(/\{empresa\}/g, tenantNome || '');
}

function findNode(flow, estado) {
  if (!flow || !flow.nodes) return null;
  return flow.nodes.find((n) => n.estado === estado) || null;
}

function matchMenuOption(node, mensagem) {
  const opcoes = node.opcoes || [];
  const input = mensagem.trim();
  const exactMatch = opcoes.find((o) => o.texto === input);
  if (exactMatch) return exactMatch;
  const lower = input.toLowerCase();
  for (const opcao of opcoes) {
    if (opcao.keywords && Array.isArray(opcao.keywords)) {
      for (const kw of opcao.keywords) {
        if (lower.includes(kw.toLowerCase())) return opcao;
      }
    }
  }
  return null;
}

async function persistirLead(tenantId, sessao) {
  const s = await storage.getSession(sessao);
  if (!s) return;
  const leadId = s.leadId || randomUUID();
  await sessionManager.updateSession(sessao, { leadId });
  try {
    if (s.fluxo === 'cliente' || s.segmento === 'cliente') {
      await storage.createClient({
        tenantId, leadId, nome: s.clienteId || s.nome,
        telefone: s.sessao || sessao, canalOrigem: s.canalOrigem,
        conteudo: s.clienteId, urgencia: s.flagAtencao ? 'QUENTE' : 'MEDIO',
        flagAtencao: s.flagAtencao, status: 'NOVO', origem: s.origem, campanha: s.campanha,
      });
      return;
    }
    await storage.createLead({
      tenantId, leadId, nome: s.nome,
      telefone: s.telefoneContato || s.sessao || sessao,
      area: s.fluxo || s.segmento, fluxo: s.fluxo || s.segmento,
      situacao: s.situacao || s.advogadoDescricao || s.trabalhoTipo || s.familiaTipo || '',
      score: s.score || 0, prioridade: s.prioridade || 'FRIO',
      flagAtencao: s.flagAtencao, canalOrigem: s.canalOrigem,
      canalPreferido: s.canalPreferido, origem: s.origem, campanha: s.campanha,
      segmento: s.segmento, tipoAtendimento: s.tipoAtendimento,
      valorEstimado: s.valorEstimadoMin || s.valorEstimadoMax || 0, status: 'NOVO',
    });
  } catch (err) {
    console.error('[flow/engine] persistirLead error:', err.message);
  }
}

function buildResponse(sessaoObj, message, estado) {
  return {
    message, estado: estado || sessaoObj.estadoAtual,
    fluxo: sessaoObj.fluxo || sessaoObj.segmento || null,
    sessao: sessaoObj.sessao, score: sessaoObj.score || 0,
    prioridade: sessaoObj.prioridade || 'FRIO',
    flagAtencao: sessaoObj.flagAtencao || false,
    valorEstimadoMin: sessaoObj.valorEstimadoMin || null,
    valorEstimadoMax: sessaoObj.valorEstimadoMax || null,
  };
}

/**
 * Main entry point: process a message through the dynamic flow.
 */
async function process(tenantId, sessao, mensagem, canal) {
  const flow = await getFlow(tenantId);
  if (!flow) {
    return { message: 'Fluxo não configurado para este tenant.', estado: null, fluxo: null, sessao, score: 0, prioridade: 'FRIO', flagAtencao: false };
  }

  const tenantNome = flow.tenant ? flow.tenant.nome : '';
  let sessaoObj = await sessionManager.getSession(sessao, canal);

  // Loop prevention
  const transitions = (sessaoObj.transitionCount || 0) + 1;
  if (transitions > MAX_TRANSITIONS) {
    await sessionManager.updateSession(sessao, { estadoAtual: 'start', ultimaMensagem: null, transitionCount: 0 });
    const startNode = findNode(flow, 'start');
    return buildResponse(sessaoObj, replaceVariables(startNode?.mensagem || 'Bem-vindo!', sessaoObj, tenantNome), 'start');
  }
  await sessionManager.updateSession(sessao, { transitionCount: transitions });

  // RESET keywords → back to menu
  if (RESET_KEYWORDS.includes(mensagem.toLowerCase())) {
    sessaoObj = await sessionManager.resetSession(sessao, canal);
    await sessionManager.updateSession(sessao, { transitionCount: 0 });
    const startNode = findNode(flow, 'start');
    return buildResponse(sessaoObj, replaceVariables(startNode?.mensagem || 'Bem-vindo!', sessaoObj, tenantNome), 'start');
  }

  // FIX: First message — show start menu AND try to process input
  // Before: first message was ignored (just showed menu). Now: show menu + attempt match.
  if (sessaoObj.estadoAtual === 'start' && !sessaoObj.ultimaMensagem) {
    await sessionManager.updateSession(sessao, { ultimaMensagem: mensagem });
    const startNode = findNode(flow, 'start');
    if (!startNode) return buildResponse(sessaoObj, 'Bem-vindo!', 'start');

    // Try to match the first message against start node options
    if (startNode.tipo === 'menu') {
      const matched = matchMenuOption(startNode, mensagem);
      if (matched) {
        // First message matched an option — process it
        return processMenu(flow, startNode, sessaoObj, sessao, mensagem, tenantId, tenantNome);
      }
    }
    // No match — show the start menu
    return buildResponse(sessaoObj, replaceVariables(startNode.mensagem, sessaoObj, tenantNome), 'start');
  }

  await sessionManager.updateSession(sessao, { ultimaMensagem: mensagem });

  const currentNode = findNode(flow, sessaoObj.estadoAtual);
  if (!currentNode) {
    await sessionManager.updateSession(sessao, { estadoAtual: 'start', ultimaMensagem: null });
    const startNode = findNode(flow, 'start');
    return buildResponse(sessaoObj, replaceVariables(startNode?.mensagem || 'Bem-vindo!', sessaoObj, tenantNome), 'start');
  }

  switch (currentNode.tipo) {
    case 'menu':
      return processMenu(flow, currentNode, sessaoObj, sessao, mensagem, tenantId, tenantNome);
    case 'input':
      return processInput(flow, currentNode, sessaoObj, sessao, mensagem, tenantId, tenantNome);
    case 'final_lead':
      return processFinal(flow, currentNode, sessaoObj, sessao, tenantId, tenantNome, 'lead');
    case 'final_cliente':
      return processFinal(flow, currentNode, sessaoObj, sessao, tenantId, tenantNome, 'cliente');
    default:
      return processMenu(flow, currentNode, sessaoObj, sessao, mensagem, tenantId, tenantNome);
  }
}

async function processMenu(flow, node, sessaoObj, sessao, mensagem, tenantId, tenantNome) {
  const matched = matchMenuOption(node, mensagem);

  if (matched) {
    const newScore = (sessaoObj.score || 0) + (matched.scoreIncrement || 0);
    const updates = {
      estadoAtual: matched.proxEstado, score: newScore,
      prioridade: calcularPrioridade(newScore), fallbackCount: 0,
    };
    if (matched.segmento) { updates.segmento = matched.segmento; updates.fluxo = matched.segmento; }
    if (matched.tipoAtendimento) updates.tipoAtendimento = matched.tipoAtendimento;
    if (matched.intencao) updates.intencao = matched.intencao;
    if (matched.valorEstimadoMin !== undefined) updates.valorEstimadoMin = matched.valorEstimadoMin;
    if (matched.valorEstimadoMax !== undefined) updates.valorEstimadoMax = matched.valorEstimadoMax;

    await sessionManager.updateSession(sessao, updates);
    const updatedSession = await storage.getSession(sessao);

    const nextNode = findNode(flow, matched.proxEstado);
    if (nextNode && (nextNode.tipo === 'final_lead' || nextNode.tipo === 'final_cliente')) {
      return processFinal(flow, nextNode, updatedSession, sessao, tenantId, tenantNome, nextNode.tipo === 'final_lead' ? 'lead' : 'cliente');
    }
    return buildResponse(updatedSession, replaceVariables(nextNode?.mensagem || 'Próximo passo...', updatedSession, tenantNome), matched.proxEstado);
  }

  // No match — fallback
  const fallbackCount = (sessaoObj.fallbackCount || 0) + 1;
  const maxFallbacks = node.config?.maxFallbacks || 2;
  await sessionManager.updateSession(sessao, { fallbackCount });

  if (fallbackCount >= maxFallbacks) {
    // Check if node has a configured fallback state
    const fallbackEstado = node.config?.fallbackEstado;
    if (fallbackEstado) {
      const fallbackNode = findNode(flow, fallbackEstado);
      if (fallbackNode) {
        await sessionManager.updateSession(sessao, { estadoAtual: fallbackEstado, fallbackCount: 0 });
        const updatedSession = await storage.getSession(sessao);
        return buildResponse(updatedSession, replaceVariables(fallbackNode.mensagem, updatedSession, tenantNome), fallbackEstado);
      }
    }
    // Default: escalate to operator
    await sessionManager.updateSession(sessao, { statusSessao: 'classificacao_pendente', estadoAtual: 'classificacao_pendente' });
    const updatedSession = await storage.getSession(sessao);
    return buildResponse(updatedSession, 'Vou encaminhar você para um atendente que pode te ajudar melhor. Aguarde um momento! 🙏', 'classificacao_pendente');
  }

  // Try the flow's fallback node first
  const fallbackNode = findNode(flow, 'fallback');
  if (fallbackNode && fallbackNode.estado !== node.estado) {
    const updatedSession = await storage.getSession(sessao);
    return buildResponse(updatedSession, replaceVariables(fallbackNode.mensagem, updatedSession, tenantNome), node.estado);
  }

  // Default hint
  const updatedSession = await storage.getSession(sessao);
  return buildResponse(updatedSession, 'Não entendi sua resposta. Por favor, escolha uma das opções:\n\n' + replaceVariables(node.mensagem, updatedSession, tenantNome), node.estado);
}

async function processInput(flow, node, sessaoObj, sessao, mensagem, tenantId, tenantNome) {
  const input = mensagem.trim();
  const minLength = node.config?.minLength || 3;

  if (input.length < minLength) {
    return buildResponse(sessaoObj, replaceVariables(node.mensagem, sessaoObj, tenantNome), node.estado);
  }

  const opcoes = node.opcoes || [];
  const proxEstado = opcoes.length > 0 && opcoes[0].proxEstado ? opcoes[0].proxEstado : 'final_lead';
  const scoreIncrement = opcoes.length > 0 ? (opcoes[0].scoreIncrement || 0) : 0;
  const newScore = (sessaoObj.score || 0) + scoreIncrement;

  const updates = {
    estadoAtual: proxEstado, score: newScore,
    prioridade: calcularPrioridade(newScore), fallbackCount: 0,
  };

  // FIX: Use config.inputField instead of hardcoded state names
  const inputField = node.config?.inputField;
  if (inputField) {
    updates[inputField] = input;
  } else {
    // Legacy fallback: hardcoded mapping for backward compatibility
    if (node.estado === 'coleta_nome') updates.nome = input;
    else if (node.estado === 'cliente_id' || node.estado === 'cliente_identificacao') updates.clienteId = input;
    else if (node.estado === 'situacao' || node.estado === 'descricao') updates.situacao = input;
    else if (node.estado === 'contato_numero') updates.telefoneContato = input;
  }

  await sessionManager.updateSession(sessao, updates);
  const updatedSession = await storage.getSession(sessao);

  const nextNode = findNode(flow, proxEstado);
  if (nextNode && (nextNode.tipo === 'final_lead' || nextNode.tipo === 'final_cliente')) {
    return processFinal(flow, nextNode, updatedSession, sessao, tenantId, tenantNome, nextNode.tipo === 'final_lead' ? 'lead' : 'cliente');
  }
  return buildResponse(updatedSession, replaceVariables(nextNode?.mensagem || 'Próximo passo...', updatedSession, tenantNome), proxEstado);
}

async function processFinal(flow, node, sessaoObj, sessao, tenantId, tenantNome, tipo) {
  await persistirLead(tenantId, sessao);
  await safeRecordEvent({
    tenantId, leadId: sessaoObj.leadId || null,
    event: EVENTS.LEAD_CREATED, step: node.estado,
    metadata: { tipo, segmento: sessaoObj.segmento },
  });
  const msg = replaceVariables(node.mensagem, sessaoObj, tenantNome);
  const posNode = findNode(flow, 'pos_final');
  if (posNode) {
    await sessionManager.updateSession(sessao, { estadoAtual: 'pos_final' });
    const updatedSession = await storage.getSession(sessao);
    return buildResponse(updatedSession, msg + '\n\n' + replaceVariables(posNode.mensagem, updatedSession, tenantNome), 'pos_final');
  }
  await sessionManager.updateSession(sessao, { estadoAtual: node.estado });
  return buildResponse(sessaoObj, msg, node.estado);
}

module.exports = { process };
