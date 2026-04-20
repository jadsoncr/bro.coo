// src/stateMachine.js
const sessionManager = require('./sessionManager');
const storage = require('./storage');
const { randomUUID } = require('crypto');

const RESET_KEYWORDS = ['menu', 'reiniciar', 'voltar'];

// ─── Perguntas por estado ──────────────────────────────────────────────────
const PERGUNTAS = {

  start: `Olá! 👋 Bem-vindo ao Santos & Bastos Advogados.\n\nComo podemos te ajudar hoje?\n\n1️⃣ Problema no trabalho\n2️⃣ Questão de família\n3️⃣ Já sou cliente\n4️⃣ Falar com advogado\n5️⃣ Outro tipo de problema`,

  fallback: `Não entendi muito bem 😅\n\nEscolha uma opção:\n\n1️⃣ Trabalho\n2️⃣ Família\n3️⃣ Já sou cliente\n4️⃣ Falar com advogado\n5️⃣ Outro`,

  // ── TRABALHISTA ──
  trabalho_status: `Entendi 👍\n\nVocê ainda está trabalhando ou já saiu da empresa?\n\n1️⃣ Ainda estou trabalhando\n2️⃣ Já saí / fui demitido`,
  trabalho_tipo: `Entendi 👍\n\nQual dessas situações mais se aproxima do seu caso?\n\n1️⃣ Demissão / rescisão\n2️⃣ Horas extras ou salário atrasado\n3️⃣ Assédio ou problema no trabalho\n4️⃣ Mais de uma dessas\n5️⃣ Outro`,
  trabalho_tempo: `Entendi 👍\n\nVocê trabalhou na empresa por quanto tempo?\n\n1️⃣ Menos de 1 ano\n2️⃣ Entre 1 e 3 anos\n3️⃣ Mais de 3 anos`,
  trabalho_salario: `Perfeito 👍\n\nQual era sua faixa salarial?\n\n1️⃣ Até R$ 2.000\n2️⃣ Entre R$ 2.000 e R$ 5.000\n3️⃣ Acima de R$ 5.000`,
  trabalho_contrato: `Entendi 👍\n\nSeu contrato era:\n\n1️⃣ CLT\n2️⃣ PJ\n3️⃣ Sem registro`,
  trabalho_intencao: `Entendi 👍\n\nO que você pretende fazer?\n\n1️⃣ Resolver sem processo\n2️⃣ Entrar na Justiça\n3️⃣ Ainda estou avaliando`,

  // ── FAMÍLIA ──
  familia_tipo: `Entendi 👍\n\nSobre qual situação você precisa de ajuda?\n\n1️⃣ Divórcio\n2️⃣ Pensão\n3️⃣ Guarda\n4️⃣ Outro`,
  familia_status: `Entendi 👍\n\nEssa situação já está acontecendo ou você quer se organizar?\n\n1️⃣ Já está acontecendo\n2️⃣ Quero me organizar`,
  familia_urgencia: `Entendi 👍\n\nIsso precisa ser resolvido com urgência?\n\n1️⃣ Sim\n2️⃣ Não`,

  // ── CLIENTE ──
  cliente_identificacao: `Perfeito 👍 vou te ajudar com seu atendimento.\n\nPode me informar seu nome completo ou número do processo?`,

  // ── ADVOGADO ──
  advogado_tipo: `Entendi 👍\n\nÉ sobre um caso novo ou você já é cliente?\n\n1️⃣ Caso novo\n2️⃣ Já sou cliente`,
  advogado_descricao: `Perfeito 👍\n\nMe conta rapidamente o que aconteceu:`,

  // ── OUTROS ──
  outros_descricao: `Entendi 👍\n\nPode me explicar rapidamente do que se trata?`,
  outros_impacto: `Entendi 👍\n\nIsso está te causando algum prejuízo maior?\n\n1️⃣ Sim\n2️⃣ Não`,

  // ── COLETA ──
  coleta_nome: `Perfeito 👍\n\nPra encaminhar seu atendimento, qual é o seu nome completo?`,
  contato_confirmacao: `Pra agilizar seu atendimento 👍\n\nPodemos falar com você por esse número?\n\n1️⃣ Sim, autorizo contato por aqui\n2️⃣ Prefiro outro número\n3️⃣ Prefiro ligação`,
  contato_numero: `Perfeito 👍\n\nMe informa o número com DDD:`,
  contato_canal: `Perfeito 👍\n\nPrefere contato por:\n\n1️⃣ WhatsApp\n2️⃣ Ligação`,

  // ── PÓS-FINAL ──
  pos_final: `Posso te ajudar com mais alguma coisa?\n\n1️⃣ Novo atendimento\n2️⃣ Falar com advogado\n3️⃣ Encerrar`,
  encerramento: `Perfeito 👍\n\nObrigado pelo contato.\n\nNossa equipe já está com sua solicitação e deve falar com você em breve.\n\nFicamos à disposição! 👋`,
};

// ─── Mensagem de finalização ──────────────────────────────────────────────
function mensagemFinalizacao(prioridade, fluxo) {
  if (fluxo === 'cliente') {
    return `Perfeito 👍 já estou encaminhando isso para a equipe responsável.\n\nA Dra. Raquel ou alguém do time deve falar com você em breve.\n\n📞 Até 24h úteis (normalmente antes)`;
  }
  if (prioridade === 'QUENTE') {
    return `Entendi 👍 seu caso é prioridade.\n\nJá estou acionando um advogado da equipe para falar com você o mais rápido possível.\n\nFique atento ao telefone/WhatsApp 📞`;
  }
  return `Perfeito 👍 já entendi seu caso.\n\nEstou encaminhando para um advogado da equipe analisar.\n\n📞 Você deve receber um retorno em até 24h úteis.`;
}

// ─── Calcular prioridade pelo score ───────────────────────────────────────
function calcularPrioridade(score) {
  if (score >= 5) return 'QUENTE';
  if (score >= 3) return 'MEDIO';
  return 'FRIO';
}

// ─── Persistência ─────────────────────────────────────────────────────────
async function persistirFluxo(sessao) {
  const s = await storage.getSession(sessao);
  if (!s) return;

  const leadId = s.leadId || randomUUID();
  await sessionManager.updateSession(sessao, { leadId });

  let tentativa = 0;
  const MAX = 3;

  while (tentativa < MAX) {
    tentativa++;
    try {
      if (s.fluxo === 'cliente') {
        await storage.createClient({
          leadId,
          nome: s.clienteId || s.nome,
          telefone: s.sessao,
          canalOrigem: s.canalOrigem,
          conteudo: s.clienteId,
          urgencia: s.flagAtencao ? 'QUENTE' : 'MEDIO',
          flagAtencao: s.flagAtencao,
          status: 'NOVO',
        });
        return;
      }

      if (s.fluxo === 'outros') {
        await storage.createOther({
          leadId,
          nome: s.nome,
          telefone: s.telefoneContato || s.sessao,
          tipo: s.outrosDescricao,
          canalOrigem: s.canalOrigem,
          conteudo: s.outrosDescricao,
          status: 'NOVO',
        });
        return;
      }

      // trabalhista, familia, advogado
      await storage.createLead({
        leadId,
        nome: s.nome,
        telefone: s.telefoneContato || s.sessao,
        area: s.fluxo === 'advogado' ? 'trabalhista' : s.fluxo,
        situacao: s.advogadoDescricao || s.trabalhoTipo || s.familiaTipo || '',
        impacto: s.trabalhoSalario || s.familiaUrgencia || 1,
        intencao: s.trabalhoIntencao || 1,
        score: s.score || 0,
        prioridade: s.prioridade || 'FRIO',
        flagAtencao: s.flagAtencao,
        canalOrigem: s.canalOrigem,
        canalPreferido: s.canalPreferido,
        resumo: JSON.stringify({
          status: s.trabalhoStatus,
          tipo: s.trabalhoTipo || s.familiaTipo,
          tempo: s.trabalhoTempo,
          salario: s.trabalhoSalario,
          contrato: s.trabalhoContrato,
          intencao: s.trabalhoIntencao || s.familiaIntencao,
        }),
        status: 'NOVO',
      });
      return;

    } catch (err) {
      console.error(`[persistirFluxo tentativa ${tentativa}/${MAX}]`, err.message);
      if (tentativa === MAX) {
        console.error('[persistirFluxo] falha definitiva — lead não persistido:', leadId);
      }
    }
  }
}

// ─── Validação de opção numérica ──────────────────────────────────────────
function opcao(msg, max) {
  const n = parseInt(msg, 10);
  return n >= 1 && n <= max ? String(n) : null;
}

// Retorna estado atual (repete pergunta) quando entrada for inválida
function repetir(estado) {
  return { proximoEstado: estado, salvar: {} };
}

// ─── Transições por estado ────────────────────────────────────────────────
async function transitar(sessao, estado, mensagem) {

  switch (estado) {

    // ── START ──
    case 'start': {
      if (mensagem === '1') return { proximoEstado: 'trabalho_status', salvar: { fluxo: 'trabalhista', score: 0 } };
      if (mensagem === '2') return { proximoEstado: 'familia_tipo',    salvar: { fluxo: 'familia',     score: 0 } };
      if (mensagem === '3') return { proximoEstado: 'cliente_identificacao', salvar: { fluxo: 'cliente', score: 0 } };
      if (mensagem === '4') return { proximoEstado: 'advogado_tipo',   salvar: { fluxo: 'advogado',    score: 5 } };
      if (mensagem === '5') return { proximoEstado: 'outros_descricao',salvar: { fluxo: 'outros',      score: 0 } };
      return { proximoEstado: 'fallback', salvar: {} };
    }

    // ── FALLBACK ──
    case 'fallback': {
      if (mensagem === '1') return { proximoEstado: 'trabalho_status', salvar: { fluxo: 'trabalhista', score: 0 } };
      if (mensagem === '2') return { proximoEstado: 'familia_tipo',    salvar: { fluxo: 'familia',     score: 0 } };
      if (mensagem === '3') return { proximoEstado: 'cliente_identificacao', salvar: { fluxo: 'cliente', score: 0 } };
      if (mensagem === '4') return { proximoEstado: 'advogado_tipo',   salvar: { fluxo: 'advogado',    score: 5 } };
      if (mensagem === '5') return { proximoEstado: 'outros_descricao',salvar: { fluxo: 'outros',      score: 0 } };
      return { proximoEstado: 'start', salvar: {} };
    }

    // ── TRABALHISTA ──
    case 'trabalho_status': {
      if (!opcao(mensagem, 2)) return repetir('trabalho_status');
      return { proximoEstado: 'trabalho_tipo', salvar: { trabalhoStatus: mensagem } };
    }

    case 'trabalho_tipo': {
      if (!opcao(mensagem, 5)) return repetir('trabalho_tipo');
      const bonus = mensagem === '4' ? 2 : 0;
      const sess = await storage.getSession(sessao);
      const score = (sess.score || 0) + bonus;
      return { proximoEstado: 'trabalho_tempo', salvar: { trabalhoTipo: mensagem, score } };
    }

    case 'trabalho_tempo': {
      if (!opcao(mensagem, 3)) return repetir('trabalho_tempo');
      return { proximoEstado: 'trabalho_salario', salvar: { trabalhoTempo: mensagem } };
    }

    case 'trabalho_salario': {
      if (!opcao(mensagem, 3)) return repetir('trabalho_salario');
      const sess = await storage.getSession(sessao);
      const bonus = mensagem === '3' ? 2 : mensagem === '2' ? 1 : 0;
      const score = (sess.score || 0) + bonus;
      return { proximoEstado: 'trabalho_contrato', salvar: { trabalhoSalario: mensagem, score } };
    }

    case 'trabalho_contrato': {
      if (!opcao(mensagem, 3)) return repetir('trabalho_contrato');
      return { proximoEstado: 'trabalho_intencao', salvar: { trabalhoContrato: mensagem } };
    }

    case 'trabalho_intencao': {
      if (!opcao(mensagem, 3)) return repetir('trabalho_intencao');
      const sess = await storage.getSession(sessao);
      const bonus = mensagem === '2' ? 2 : 0;
      const score = (sess.score || 0) + bonus;
      const prioridade = calcularPrioridade(score);
      return { proximoEstado: 'coleta_nome', salvar: { trabalhoIntencao: mensagem, score, prioridade } };
    }

    // ── FAMÍLIA ──
    case 'familia_tipo': {
      if (!opcao(mensagem, 4)) return repetir('familia_tipo');
      return { proximoEstado: 'familia_status', salvar: { familiaTipo: mensagem } };
    }

    case 'familia_status': {
      if (!opcao(mensagem, 2)) return repetir('familia_status');
      return { proximoEstado: 'familia_urgencia', salvar: { familiaStatus: mensagem } };
    }

    case 'familia_urgencia': {
      if (!opcao(mensagem, 2)) return repetir('familia_urgencia');
      const sess = await storage.getSession(sessao);
      const bonus = mensagem === '1' ? 5 : 0;
      const score = (sess.score || 0) + bonus;
      const prioridade = calcularPrioridade(score);
      return { proximoEstado: 'coleta_nome', salvar: { familiaUrgencia: mensagem, score, prioridade } };
    }

    // ── CLIENTE ──
    case 'cliente_identificacao': {
      if (mensagem.trim().length < 3) return repetir('cliente_identificacao');
      return { proximoEstado: 'final_cliente', salvar: { clienteId: mensagem } };
    }

    // ── ADVOGADO ──
    case 'advogado_tipo': {
      if (!opcao(mensagem, 2)) return repetir('advogado_tipo');
      if (mensagem === '2') return { proximoEstado: 'cliente_identificacao', salvar: { fluxo: 'cliente' } };
      return { proximoEstado: 'advogado_descricao', salvar: {} };
    }

    case 'advogado_descricao': {
      if (mensagem.trim().length < 3) return repetir('advogado_descricao');
      const sess = await storage.getSession(sessao);
      const prioridade = calcularPrioridade(sess.score || 0);
      return { proximoEstado: 'coleta_nome', salvar: { advogadoDescricao: mensagem, prioridade } };
    }

    // ── OUTROS ──
    case 'outros_descricao': {
      if (mensagem.trim().length < 3) return repetir('outros_descricao');
      return { proximoEstado: 'outros_impacto', salvar: { outrosDescricao: mensagem } };
    }

    case 'outros_impacto': {
      if (!opcao(mensagem, 2)) return repetir('outros_impacto');
      const sess = await storage.getSession(sessao);
      const bonus = mensagem === '1' ? 1 : 0;
      const score = (sess.score || 0) + bonus;
      const prioridade = calcularPrioridade(score);
      return { proximoEstado: 'coleta_nome', salvar: { outrosImpacto: mensagem, score, prioridade } };
    }

    // ── COLETA DE NOME ──
    case 'coleta_nome': {
      const nome = mensagem.trim();
      // rejeita nomes claramente inválidos: < 3 chars, só números, ou palavras-chave de menu
      if (nome.length < 3 || /^\d+$/.test(nome) || RESET_KEYWORDS.includes(nome.toLowerCase())) {
        return repetir('coleta_nome');
      }
      return { proximoEstado: 'contato_confirmacao', salvar: { nome } };
    }

    // ── CONTATO ──
    case 'contato_confirmacao': {
      if (!opcao(mensagem, 3)) return repetir('contato_confirmacao');
      if (mensagem === '1') return { proximoEstado: 'final_lead', salvar: { canalPreferido: 'whatsapp', telefoneContato: sessao } };
      if (mensagem === '2') return { proximoEstado: 'contato_numero', salvar: {} };
      return { proximoEstado: 'final_lead', salvar: { canalPreferido: 'ligacao', telefoneContato: sessao } };
    }

    case 'contato_numero':
      return { proximoEstado: 'contato_canal', salvar: { telefoneContato: mensagem } };

    case 'contato_canal': {
      if (!opcao(mensagem, 2)) return repetir('contato_canal');
      const canal = mensagem === '1' ? 'whatsapp' : 'ligacao';
      return { proximoEstado: 'final_lead', salvar: { canalPreferido: canal } };
    }

    // ── PÓS-FINAL ──
    case 'pos_final': {
      if (!opcao(mensagem, 3)) return repetir('pos_final');
      if (mensagem === '1') return { proximoEstado: 'start', salvar: { fluxo: null, score: 0, nome: null, ultimaMensagem: null } };
      if (mensagem === '2') return { proximoEstado: 'advogado_tipo', salvar: { fluxo: 'advogado', score: 3 } };
      return { proximoEstado: 'encerramento', salvar: {} };
    }

    default:
      return { proximoEstado: 'start', salvar: {} };
  }
}

// ─── Ponto de entrada principal ───────────────────────────────────────────
async function process(sessao, mensagem, canal) {
  let sessaoObj = await sessionManager.getSession(sessao, canal);

  // Palavras de reinício
  if (RESET_KEYWORDS.includes(mensagem)) {
    sessaoObj = await sessionManager.resetSession(sessao, canal);
    return buildResposta(sessaoObj, PERGUNTAS.start, 'start');
  }

  // Primeira mensagem (qualquer conteúdo) — mostrar abertura
  if (sessaoObj.estadoAtual === 'start' && !sessaoObj.ultimaMensagem) {
    await sessionManager.updateSession(sessao, { ultimaMensagem: mensagem });
    return buildResposta(sessaoObj, PERGUNTAS.start, 'start');
  }

  // Salvar última mensagem
  await sessionManager.updateSession(sessao, { ultimaMensagem: mensagem });

  // Processar transição
  const { proximoEstado, salvar } = await transitar(sessao, sessaoObj.estadoAtual, mensagem);
  await sessionManager.updateSession(sessao, { ...salvar, estadoAtual: proximoEstado });

  // Recarregar sessão
  const sessaoAtualizada = await storage.getSession(sessao);

  // Estados de finalização
  if (proximoEstado === 'final_lead') {
    await persistirFluxo(sessao);
    const sessaoFinal = await storage.getSession(sessao);
    const msg = mensagemFinalizacao(sessaoFinal.prioridade, sessaoFinal.fluxo);
    await sessionManager.updateSession(sessao, { estadoAtual: 'pos_final', ultimaPergunta: msg });
    return buildResposta(sessaoFinal, msg + '\n\n' + PERGUNTAS.pos_final, 'pos_final');
  }

  if (proximoEstado === 'final_cliente') {
    await persistirFluxo(sessao);
    const sessaoFinal = await storage.getSession(sessao);
    const msg = mensagemFinalizacao('MEDIO', 'cliente');
    await sessionManager.updateSession(sessao, { estadoAtual: 'pos_final', ultimaPergunta: msg });
    return buildResposta(sessaoFinal, msg + '\n\n' + PERGUNTAS.pos_final, 'pos_final');
  }

  // pos_final → start: limpa sessão e mostra abertura com transição
  if (proximoEstado === 'start' && sessaoObj.estadoAtual === 'pos_final') {
    await sessionManager.resetSession(sessao, canal);
    const msg = 'Tudo certo 👍\n\n' + PERGUNTAS.start;
    return buildResposta(sessaoAtualizada, msg, 'start');
  }

  // Próxima pergunta
  const pergunta = PERGUNTAS[proximoEstado] || PERGUNTAS.start;
  await sessionManager.updateSession(sessao, { ultimaPergunta: pergunta });
  return buildResposta(sessaoAtualizada, pergunta, proximoEstado);
}

function buildResposta(sessao, message, estado) {
  return {
    message,
    estado: estado || sessao.estadoAtual,
    fluxo: sessao.fluxo,
    sessao: sessao.sessao,
    score: sessao.score || 0,
    prioridade: sessao.prioridade || 'FRIO',
    flagAtencao: sessao.flagAtencao || false,
  };
}

module.exports = { process };
