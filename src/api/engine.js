// src/api/engine.js
// Engine API — simulate conversations using the real flow engine
const express = require('express');
const { requireAuth } = require('../auth/middleware');
const { getFlow } = require('../flow/cache');
const { classifyWithExplanation } = require('../templates/merge');
const { calcularPrioridade, proximoPasso } = require('../pipeline/constants');

const router = express.Router();

/**
 * POST /engine/simulate-conversation
 * Runs the real flow engine step by step with temporary session.
 * Body: { messages: ["oi", "1", "fui demitido", "sim", "João", "1"] }
 */
router.post('/simulate-conversation', requireAuth, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages é obrigatório (array de strings)' });
    }

    const flow = await getFlow(req.tenantId);
    if (!flow || !flow.nodes) {
      return res.status(404).json({ error: 'Fluxo não encontrado para este tenant' });
    }

    const tenantNome = flow.tenant?.nome || '';
    const nodes = flow.nodes;

    // Simulate with in-memory session (no persistence)
    let session = { estadoAtual: 'start', score: 0, prioridade: 'FRIO', fallbackCount: 0, ultimaMensagem: null };
    const steps = [];

    for (const msg of messages) {
      const currentEstado = session.estadoAtual;
      const currentNode = nodes.find(n => n.estado === currentEstado);

      let botResponse = '';
      let classification = null;
      let nextEstado = currentEstado;

      if (!currentNode) {
        botResponse = 'Node não encontrado. Resetando.';
        nextEstado = 'start';
      } else if (currentEstado === 'start' && !session.ultimaMensagem) {
        // First message: try match, else show menu
        session.ultimaMensagem = msg;
        if (currentNode.tipo === 'menu') {
          const matched = matchOption(currentNode, msg);
          if (matched) {
            nextEstado = matched.proxEstado;
            if (matched.segmento) {
              classification = { segmento: matched.segmento, intencao: matched.intencao };
              session.segmento = matched.segmento;
            }
            session.score += matched.scoreIncrement || 0;
            const nextNode = nodes.find(n => n.estado === nextEstado);
            botResponse = nextNode ? replaceVars(nextNode.mensagem, session, tenantNome) : 'Próximo passo...';
          } else {
            botResponse = replaceVars(currentNode.mensagem, session, tenantNome);
          }
        } else {
          botResponse = replaceVars(currentNode.mensagem, session, tenantNome);
        }
      } else if (currentNode.tipo === 'menu') {
        session.ultimaMensagem = msg;
        const matched = matchOption(currentNode, msg);
        if (matched) {
          nextEstado = matched.proxEstado;
          if (matched.segmento) {
            classification = { segmento: matched.segmento, intencao: matched.intencao };
            session.segmento = matched.segmento;
          }
          session.score += matched.scoreIncrement || 0;
          session.fallbackCount = 0;
          const nextNode = nodes.find(n => n.estado === nextEstado);
          botResponse = nextNode ? replaceVars(nextNode.mensagem, session, tenantNome) : 'Próximo passo...';
        } else {
          session.fallbackCount = (session.fallbackCount || 0) + 1;
          if (session.fallbackCount >= 2) {
            nextEstado = 'classificacao_pendente';
            botResponse = 'Encaminhando para atendente...';
          } else {
            botResponse = 'Não entendi. ' + replaceVars(currentNode.mensagem, session, tenantNome);
          }
        }
      } else if (currentNode.tipo === 'input') {
        session.ultimaMensagem = msg;
        const opcoes = currentNode.opcoes || [];
        nextEstado = opcoes[0]?.proxEstado || 'final_lead';
        session.score += opcoes[0]?.scoreIncrement || 0;
        // Store input
        const field = currentNode.config?.inputField;
        if (field) session[field] = msg.trim();
        else if (currentNode.estado === 'coleta_nome') session.nome = msg.trim();
        else if (currentNode.estado === 'situacao' || currentNode.estado === 'descricao') session.situacao = msg.trim();

        const nextNode = nodes.find(n => n.estado === nextEstado);
        if (nextNode && (nextNode.tipo === 'final_lead' || nextNode.tipo === 'final_cliente')) {
          botResponse = replaceVars(nextNode.mensagem, session, tenantNome);
          nextEstado = nextNode.estado;
        } else {
          botResponse = nextNode ? replaceVars(nextNode.mensagem, session, tenantNome) : 'Próximo passo...';
        }
      } else if (currentNode.tipo === 'final_lead' || currentNode.tipo === 'final_cliente') {
        botResponse = replaceVars(currentNode.mensagem, session, tenantNome);
      }

      session.estadoAtual = nextEstado;
      session.prioridade = calcularPrioridade(session.score >= 5 ? 'QUENTE' : session.score >= 3 ? 'MEDIO' : 'FRIO');

      steps.push({
        userMessage: msg,
        botResponse,
        estado: nextEstado,
        classification,
      });
    }

    const finalLead = {
      nome: session.nome || null,
      segmento: session.segmento || null,
      prioridade: session.score >= 5 ? 'QUENTE' : session.score >= 3 ? 'MEDIO' : 'FRIO',
      score: session.score,
      situacao: session.situacao || null,
    };

    return res.json({ steps, finalLead });
  } catch (err) {
    console.error('POST /engine/simulate-conversation error:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

function matchOption(node, msg) {
  const opcoes = node.opcoes || [];
  const input = msg.trim();
  const exact = opcoes.find(o => o.texto === input);
  if (exact) return exact;
  const lower = input.toLowerCase();
  for (const op of opcoes) {
    if (op.keywords && Array.isArray(op.keywords)) {
      for (const kw of op.keywords) {
        if (lower.includes(kw.toLowerCase())) return op;
      }
    }
  }
  return null;
}

function replaceVars(template, session, tenantNome) {
  if (!template) return '';
  return template.replace(/\{nome\}/g, session.nome || '').replace(/\{empresa\}/g, tenantNome || '');
}

module.exports = router;
