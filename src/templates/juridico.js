// src/templates/juridico.js
// Template base extraído do Santos & Bastos Advogados

const template_juridico_v1 = {
  nome: 'Jurídico',
  tipo: 'juridico',
  versao: '1.0',

  segmentos: ['trabalhista', 'familia', 'civel', 'previdenciario'],

  sla: {
    slaMinutes: 15,
    slaContratoHoras: 48,
  },

  valores: {
    trabalhista: { min: 2000, max: 15000, default: 5000 },
    familia: { min: 1500, max: 8000, default: 3000 },
    civel: { min: 1000, max: 10000, default: 4000 },
    previdenciario: { min: 2000, max: 12000, default: 5000 },
  },

  financeiro: {
    ticketMedio: 5000,
    taxaConversao: 0.2,
    custoMensal: 500,
    metaMensal: 20000,
    moeda: 'BRL',
  },

  nodes: [
    {
      estado: 'start', tipo: 'menu', ordem: 0,
      mensagem: 'Olá! 👋 Bem-vindo à {empresa}.\n\nComo podemos ajudar?\n\n1️⃣ Problema no trabalho\n2️⃣ Questão de família\n3️⃣ Já sou cliente\n4️⃣ Outro assunto',
      opcoes: [
        { texto: '1', proxEstado: 'situacao', scoreIncrement: 0, segmento: 'trabalhista', intencao: 'contratar', valorEstimadoMin: 2000, valorEstimadoMax: 15000, keywords: ['trabalho', 'demitido', 'demissão', 'trabalhista'] },
        { texto: '2', proxEstado: 'situacao', scoreIncrement: 0, segmento: 'familia', intencao: 'contratar', valorEstimadoMin: 1500, valorEstimadoMax: 8000, keywords: ['família', 'divórcio', 'pensão', 'guarda'] },
        { texto: '3', proxEstado: 'cliente_id', scoreIncrement: 0, segmento: 'cliente', intencao: 'cliente', keywords: ['cliente', 'processo'] },
        { texto: '4', proxEstado: 'descricao', scoreIncrement: 0, segmento: 'outros', intencao: 'informacao', keywords: ['outro', 'dúvida'] },
      ],
    },
    {
      estado: 'fallback', tipo: 'menu', ordem: 1,
      mensagem: 'Não entendi. Escolha uma opção:\n\n1️⃣ Trabalho\n2️⃣ Família\n3️⃣ Já sou cliente\n4️⃣ Outro',
      opcoes: [
        { texto: '1', proxEstado: 'situacao', scoreIncrement: 0, segmento: 'trabalhista', intencao: 'contratar', keywords: ['trabalho'] },
        { texto: '2', proxEstado: 'situacao', scoreIncrement: 0, segmento: 'familia', intencao: 'contratar', keywords: ['família'] },
        { texto: '3', proxEstado: 'cliente_id', scoreIncrement: 0, segmento: 'cliente', intencao: 'cliente' },
        { texto: '4', proxEstado: 'descricao', scoreIncrement: 0, segmento: 'outros', intencao: 'informacao' },
      ],
    },
    {
      estado: 'situacao', tipo: 'input', ordem: 10,
      mensagem: 'Entendi 👍\n\nPode descrever brevemente sua situação?',
      opcoes: [{ texto: '*', proxEstado: 'urgencia', scoreIncrement: 0 }],
    },
    {
      estado: 'urgencia', tipo: 'menu', ordem: 20,
      mensagem: 'Entendi 👍\n\nIsso é urgente?\n\n1️⃣ Sim\n2️⃣ Não',
      opcoes: [
        { texto: '1', proxEstado: 'coleta_nome', scoreIncrement: 5 },
        { texto: '2', proxEstado: 'coleta_nome', scoreIncrement: 0 },
      ],
    },
    {
      estado: 'descricao', tipo: 'input', ordem: 30,
      mensagem: 'Entendi 👍\n\nPode explicar brevemente do que se trata?',
      opcoes: [{ texto: '*', proxEstado: 'urgencia', scoreIncrement: 0 }],
    },
    {
      estado: 'cliente_id', tipo: 'input', ordem: 40,
      mensagem: 'Perfeito 👍\n\nInforme seu nome ou número do processo:',
      opcoes: [{ texto: '*', proxEstado: 'final_cliente', scoreIncrement: 0 }],
    },
    {
      estado: 'coleta_nome', tipo: 'input', ordem: 60,
      mensagem: 'Perfeito 👍\n\nQual é o seu nome completo?',
      opcoes: [{ texto: '*', proxEstado: 'contato', scoreIncrement: 0 }],
    },
    {
      estado: 'contato', tipo: 'menu', ordem: 61,
      mensagem: 'Podemos falar com você por esse número?\n\n1️⃣ Sim\n2️⃣ Outro número',
      opcoes: [
        { texto: '1', proxEstado: 'final_lead', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'final_lead', scoreIncrement: 0 },
      ],
    },
    {
      estado: 'final_lead', tipo: 'final_lead', ordem: 70,
      mensagem: 'Perfeito 👍 Estamos encaminhando para a equipe.\n\n📞 Retorno em até 24h úteis.',
      opcoes: [],
    },
    {
      estado: 'final_cliente', tipo: 'final_cliente', ordem: 71,
      mensagem: 'Perfeito 👍 Encaminhando para a equipe responsável.\n\n📞 Retorno em breve.',
      opcoes: [],
    },
  ],
};

module.exports = { template_juridico_v1 };
