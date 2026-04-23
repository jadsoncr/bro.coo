const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');
const prisma = new PrismaClient();

async function main() {
  // ═══ 1. Tenant (existing) ═══
  const tenant = await prisma.tenant.upsert({
    where: { botToken: process.env.TELEGRAM_TOKEN || 'dev-token' },
    update: {},
    create: {
      nome: 'Santos & Bastos Advogados',
      botToken: process.env.TELEGRAM_TOKEN || 'dev-token',
      plano: 'free',
      ativo: true,
      slaMinutes: 15,
      ticketMedio: 1000,
      taxaConversao: 0.2,
      custoMensal: 297,
      metaMensal: 5000,
      moeda: 'BRL',
    },
  });
  console.log('Tenant criado:', tenant.nome, tenant.id);

  // ═══ 2. AdminUser (master admin) ═══
  const adminToken = process.env.ADMIN_TOKEN || 'master-dev-token-' + randomUUID().slice(0, 8);
  const adminUser = await prisma.adminUser.upsert({
    where: { email: '[email]' },
    update: { token: adminToken },
    create: {
      email: '[email]',
      token: adminToken,
      ativo: true,
    },
  });
  console.log('AdminUser criado:', adminUser.email, '| token:', adminUser.token);

  // ═══ 3. Users (OWNER + OPERATOR per tenant) ═══
  // Default password: BroResolve2026! (change on first login)
  const defaultHash = '$2b$10$MfVKCjYavR9.VEI5rBIxuug13db7msOFGP.6yYthY1yRJCYbXMfTa';

  const owner = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: '[email]' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: '[email]',
      senhaHash: defaultHash,
      nome: 'Jadson CR',
      role: 'OWNER',
      ativo: true,
    },
  });
  console.log('User OWNER criado:', owner.nome, owner.email);

  const operator = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'operador@santosbastos.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'operador@santosbastos.com',
      senhaHash: defaultHash,
      nome: 'Ana Operadora',
      role: 'OPERATOR',
      ativo: true,
    },
  });
  console.log('User OPERATOR criado:', operator.nome, operator.email);

  // ═══ 4. Flow + Nodes (juridico template) ═══
  // Replicates the logic from src/stateMachine.js as database records

  // Upsert the flow — find existing or create
  let flow = await prisma.flow.findFirst({
    where: { tenantId: tenant.id, objetivo: 'leads' },
  });
  if (!flow) {
    flow = await prisma.flow.create({
      data: {
        tenantId: tenant.id,
        objetivo: 'leads',
        config: { nome: 'Jurídico — Santos & Bastos', tipo: 'juridico' },
        ativo: true,
      },
    });
  }
  console.log('Flow criado:', flow.id, '| objetivo:', flow.objetivo);

  // Node definitions — each mirrors a state from stateMachine.js
  const nodes = [
    // ── START ──
    {
      estado: 'start',
      tipo: 'menu',
      mensagem: 'Olá! 👋 Bem-vindo ao Santos & Bastos Advogados.\n\nComo podemos te ajudar hoje?\n\n1️⃣ Problema no trabalho\n2️⃣ Questão de família\n3️⃣ Já sou cliente\n4️⃣ Falar com advogado\n5️⃣ Outro tipo de problema',
      ordem: 0,
      opcoes: [
        { texto: '1', proxEstado: 'trabalho_status', scoreIncrement: 0, segmento: 'trabalhista' },
        { texto: '2', proxEstado: 'familia_tipo', scoreIncrement: 0, segmento: 'familia' },
        { texto: '3', proxEstado: 'cliente_identificacao', scoreIncrement: 0, segmento: 'cliente' },
        { texto: '4', proxEstado: 'advogado_tipo', scoreIncrement: 5, segmento: 'advogado' },
        { texto: '5', proxEstado: 'outros_descricao', scoreIncrement: 0, segmento: 'outros' },
      ],
    },

    // ── FALLBACK ──
    {
      estado: 'fallback',
      tipo: 'menu',
      mensagem: 'Não entendi muito bem 😅\n\nEscolha uma opção:\n\n1️⃣ Trabalho\n2️⃣ Família\n3️⃣ Já sou cliente\n4️⃣ Falar com advogado\n5️⃣ Outro',
      ordem: 1,
      opcoes: [
        { texto: '1', proxEstado: 'trabalho_status', scoreIncrement: 0, segmento: 'trabalhista' },
        { texto: '2', proxEstado: 'familia_tipo', scoreIncrement: 0, segmento: 'familia' },
        { texto: '3', proxEstado: 'cliente_identificacao', scoreIncrement: 0, segmento: 'cliente' },
        { texto: '4', proxEstado: 'advogado_tipo', scoreIncrement: 5, segmento: 'advogado' },
        { texto: '5', proxEstado: 'outros_descricao', scoreIncrement: 0, segmento: 'outros' },
      ],
    },

    // ── TRABALHISTA BRANCH ──
    {
      estado: 'trabalho_status',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nVocê ainda está trabalhando ou já saiu da empresa?\n\n1️⃣ Ainda estou trabalhando\n2️⃣ Já saí / fui demitido',
      ordem: 10,
      opcoes: [
        { texto: '1', proxEstado: 'trabalho_tipo', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'trabalho_tipo', scoreIncrement: 0 },
      ],
    },
    {
      estado: 'trabalho_tipo',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nQual dessas situações mais se aproxima do seu caso?\n\n1️⃣ Demissão / rescisão\n2️⃣ Horas extras ou salário atrasado\n3️⃣ Assédio ou problema no trabalho\n4️⃣ Mais de uma dessas\n5️⃣ Outro',
      ordem: 11,
      opcoes: [
        { texto: '1', proxEstado: 'trabalho_tempo', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'trabalho_tempo', scoreIncrement: 0 },
        { texto: '3', proxEstado: 'trabalho_tempo', scoreIncrement: 0 },
        { texto: '4', proxEstado: 'trabalho_tempo', scoreIncrement: 2 },
        { texto: '5', proxEstado: 'trabalho_tempo', scoreIncrement: 0 },
      ],
    },
    {
      estado: 'trabalho_tempo',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nVocê trabalhou na empresa por quanto tempo?\n\n1️⃣ Menos de 1 ano\n2️⃣ Entre 1 e 3 anos\n3️⃣ Mais de 3 anos',
      ordem: 12,
      opcoes: [
        { texto: '1', proxEstado: 'trabalho_salario', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'trabalho_salario', scoreIncrement: 0 },
        { texto: '3', proxEstado: 'trabalho_salario', scoreIncrement: 0 },
      ],
    },
    {
      estado: 'trabalho_salario',
      tipo: 'menu',
      mensagem: 'Perfeito 👍\n\nQual era sua faixa salarial?\n\n1️⃣ Até R$ 2.000\n2️⃣ Entre R$ 2.000 e R$ 5.000\n3️⃣ Acima de R$ 5.000',
      ordem: 13,
      opcoes: [
        { texto: '1', proxEstado: 'trabalho_contrato', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'trabalho_contrato', scoreIncrement: 1 },
        { texto: '3', proxEstado: 'trabalho_contrato', scoreIncrement: 2 },
      ],
    },
    {
      estado: 'trabalho_contrato',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nSeu contrato era:\n\n1️⃣ CLT\n2️⃣ PJ\n3️⃣ Sem registro',
      ordem: 14,
      opcoes: [
        { texto: '1', proxEstado: 'trabalho_intencao', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'trabalho_intencao', scoreIncrement: 0 },
        { texto: '3', proxEstado: 'trabalho_intencao', scoreIncrement: 0 },
      ],
    },
    {
      estado: 'trabalho_intencao',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nO que você pretende fazer?\n\n1️⃣ Resolver sem processo\n2️⃣ Entrar na Justiça\n3️⃣ Ainda estou avaliando',
      ordem: 15,
      opcoes: [
        { texto: '1', proxEstado: 'coleta_nome', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'coleta_nome', scoreIncrement: 2 },
        { texto: '3', proxEstado: 'coleta_nome', scoreIncrement: 0 },
      ],
    },

    // ── FAMÍLIA BRANCH ──
    {
      estado: 'familia_tipo',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nSobre qual situação você precisa de ajuda?\n\n1️⃣ Divórcio\n2️⃣ Pensão\n3️⃣ Guarda\n4️⃣ Outro',
      ordem: 20,
      opcoes: [
        { texto: '1', proxEstado: 'familia_status', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'familia_status', scoreIncrement: 0 },
        { texto: '3', proxEstado: 'familia_status', scoreIncrement: 0 },
        { texto: '4', proxEstado: 'familia_status', scoreIncrement: 0 },
      ],
    },
    {
      estado: 'familia_status',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nEssa situação já está acontecendo ou você quer se organizar?\n\n1️⃣ Já está acontecendo\n2️⃣ Quero me organizar',
      ordem: 21,
      opcoes: [
        { texto: '1', proxEstado: 'familia_urgencia', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'familia_urgencia', scoreIncrement: 0 },
      ],
    },
    {
      estado: 'familia_urgencia',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nIsso precisa ser resolvido com urgência?\n\n1️⃣ Sim\n2️⃣ Não',
      ordem: 22,
      opcoes: [
        { texto: '1', proxEstado: 'coleta_nome', scoreIncrement: 5 },
        { texto: '2', proxEstado: 'coleta_nome', scoreIncrement: 0 },
      ],
    },

    // ── CLIENTE BRANCH ──
    {
      estado: 'cliente_identificacao',
      tipo: 'input',
      mensagem: 'Perfeito 👍 vou te ajudar com seu atendimento.\n\nPode me informar seu nome completo ou número do processo?',
      ordem: 30,
      opcoes: [
        { texto: '*', proxEstado: 'final_cliente', scoreIncrement: 0 },
      ],
    },

    // ── ADVOGADO BRANCH ──
    {
      estado: 'advogado_tipo',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nÉ sobre um caso novo ou você já é cliente?\n\n1️⃣ Caso novo\n2️⃣ Já sou cliente',
      ordem: 40,
      opcoes: [
        { texto: '1', proxEstado: 'advogado_descricao', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'cliente_identificacao', scoreIncrement: 0, segmento: 'cliente' },
      ],
    },
    {
      estado: 'advogado_descricao',
      tipo: 'input',
      mensagem: 'Perfeito 👍\n\nMe conta rapidamente o que aconteceu:',
      ordem: 41,
      opcoes: [
        { texto: '*', proxEstado: 'coleta_nome', scoreIncrement: 0 },
      ],
    },

    // ── OUTROS BRANCH ──
    {
      estado: 'outros_descricao',
      tipo: 'input',
      mensagem: 'Entendi 👍\n\nPode me explicar rapidamente do que se trata?',
      ordem: 50,
      opcoes: [
        { texto: '*', proxEstado: 'outros_impacto', scoreIncrement: 0 },
      ],
    },
    {
      estado: 'outros_impacto',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nIsso está te causando algum prejuízo maior?\n\n1️⃣ Sim\n2️⃣ Não',
      ordem: 51,
      opcoes: [
        { texto: '1', proxEstado: 'coleta_nome', scoreIncrement: 1 },
        { texto: '2', proxEstado: 'coleta_nome', scoreIncrement: 0 },
      ],
    },

    // ── COLETA (shared across branches) ──
    {
      estado: 'coleta_nome',
      tipo: 'input',
      mensagem: 'Perfeito 👍\n\nPra encaminhar seu atendimento, qual é o seu nome completo?',
      ordem: 60,
      opcoes: [
        { texto: '*', proxEstado: 'contato_confirmacao', scoreIncrement: 0 },
      ],
    },
    {
      estado: 'contato_confirmacao',
      tipo: 'menu',
      mensagem: 'Pra agilizar seu atendimento 👍\n\nPodemos falar com você por esse número?\n\n1️⃣ Sim, autorizo contato por aqui\n2️⃣ Prefiro outro número\n3️⃣ Prefiro ligação',
      ordem: 61,
      opcoes: [
        { texto: '1', proxEstado: 'final_lead', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'final_lead', scoreIncrement: 0 },
        { texto: '3', proxEstado: 'final_lead', scoreIncrement: 0 },
      ],
    },

    // ── FINAL STATES ──
    {
      estado: 'final_lead',
      tipo: 'final_lead',
      mensagem: 'Perfeito 👍 já entendi seu caso.\n\nEstou encaminhando para um advogado da equipe analisar.\n\n📞 Você deve receber um retorno em até 24h úteis.',
      ordem: 70,
      opcoes: [],
    },
    {
      estado: 'final_cliente',
      tipo: 'final_cliente',
      mensagem: 'Perfeito 👍 já estou encaminhando isso para a equipe responsável.\n\nA Dra. Raquel ou alguém do time deve falar com você em breve.\n\n📞 Até 24h úteis (normalmente antes)',
      ordem: 71,
      opcoes: [],
    },
  ];

  // Upsert each node (idempotent by flowId + estado)
  for (const node of nodes) {
    await prisma.node.upsert({
      where: { flowId_estado: { flowId: flow.id, estado: node.estado } },
      update: {
        tipo: node.tipo,
        mensagem: node.mensagem,
        opcoes: node.opcoes,
        ordem: node.ordem,
      },
      create: {
        flowId: flow.id,
        estado: node.estado,
        tipo: node.tipo,
        mensagem: node.mensagem,
        opcoes: node.opcoes,
        ordem: node.ordem,
      },
    });
  }
  console.log(`Nodes criados/atualizados: ${nodes.length} para flow ${flow.id}`);
}

// ═══════════════════════════════════════════════════════════════
// CLINICA (Saúde) Flow Template
// ═══════════════════════════════════════════════════════════════
async function seedClinica(tenantId) {
  let flow = await prisma.flow.findFirst({
    where: { tenantId, objetivo: 'leads', config: { path: ['tipo'], equals: 'clinica' } },
  });
  if (!flow) {
    flow = await prisma.flow.create({
      data: {
        tenantId,
        objetivo: 'leads',
        config: { nome: 'Clínica — Saúde', tipo: 'clinica' },
        ativo: true,
      },
    });
  }
  console.log('Flow CLINICA criado:', flow.id);

  const nodes = [
    // ── START ──
    {
      estado: 'start',
      tipo: 'menu',
      mensagem: 'Olá! 👋 Bem-vindo à {empresa}.\n\nComo podemos ajudar?\n\n1️⃣ Agendar consulta\n2️⃣ Procedimento\n3️⃣ Retorno\n4️⃣ Urgência\n5️⃣ Outro',
      ordem: 0,
      opcoes: [
        { texto: '1', proxEstado: 'situacao_consulta', scoreIncrement: 0, segmento: 'consulta', tipoAtendimento: 'consulta', keywords: ['consulta'] },
        { texto: '2', proxEstado: 'situacao_procedimento', scoreIncrement: 2, segmento: 'procedimento', tipoAtendimento: 'procedimento', keywords: ['procedimento'] },
        { texto: '3', proxEstado: 'situacao_retorno', scoreIncrement: 0, segmento: 'retorno', tipoAtendimento: 'retorno', keywords: ['retorno'] },
        { texto: '4', proxEstado: 'urgencia_clinica', scoreIncrement: 5, segmento: 'urgencia', tipoAtendimento: 'urgencia', keywords: ['urgente', 'dor'] },
        { texto: '5', proxEstado: 'situacao_outro', scoreIncrement: 0, segmento: 'outros', tipoAtendimento: 'outro', keywords: ['outro'] },
      ],
    },

    // ── FALLBACK ──
    {
      estado: 'fallback',
      tipo: 'menu',
      mensagem: 'Não entendi muito bem 😅\n\nEscolha uma opção:\n\n1️⃣ Consulta\n2️⃣ Procedimento\n3️⃣ Retorno\n4️⃣ Urgência\n5️⃣ Outro',
      ordem: 1,
      opcoes: [
        { texto: '1', proxEstado: 'situacao_consulta', scoreIncrement: 0, segmento: 'consulta', keywords: ['consulta'] },
        { texto: '2', proxEstado: 'situacao_procedimento', scoreIncrement: 2, segmento: 'procedimento', keywords: ['procedimento'] },
        { texto: '3', proxEstado: 'situacao_retorno', scoreIncrement: 0, segmento: 'retorno', keywords: ['retorno'] },
        { texto: '4', proxEstado: 'urgencia_clinica', scoreIncrement: 5, segmento: 'urgencia', keywords: ['urgente', 'dor'] },
        { texto: '5', proxEstado: 'situacao_outro', scoreIncrement: 0, segmento: 'outros', keywords: ['outro'] },
      ],
    },

    // ── SITUAÇÃO BRANCHES ──
    {
      estado: 'situacao_consulta',
      tipo: 'input',
      mensagem: 'Entendi 👍\n\nQual especialidade ou médico você procura?',
      ordem: 10,
      opcoes: [{ texto: '*', proxEstado: 'urgencia_clinica', scoreIncrement: 0 }],
    },
    {
      estado: 'situacao_procedimento',
      tipo: 'input',
      mensagem: 'Entendi 👍\n\nQual procedimento você precisa realizar?',
      ordem: 11,
      opcoes: [{ texto: '*', proxEstado: 'urgencia_clinica', scoreIncrement: 0 }],
    },
    {
      estado: 'situacao_retorno',
      tipo: 'input',
      mensagem: 'Entendi 👍\n\nQual médico ou especialidade do seu retorno?',
      ordem: 12,
      opcoes: [{ texto: '*', proxEstado: 'urgencia_clinica', scoreIncrement: 0 }],
    },
    {
      estado: 'situacao_outro',
      tipo: 'input',
      mensagem: 'Entendi 👍\n\nPode descrever brevemente o que precisa?',
      ordem: 13,
      opcoes: [{ texto: '*', proxEstado: 'urgencia_clinica', scoreIncrement: 0 }],
    },

    // ── URGÊNCIA ──
    {
      estado: 'urgencia_clinica',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nIsso é urgente?\n\n1️⃣ Sim\n2️⃣ Não',
      ordem: 20,
      opcoes: [
        { texto: '1', proxEstado: 'coleta_nome', scoreIncrement: 5 },
        { texto: '2', proxEstado: 'coleta_nome', scoreIncrement: 0 },
      ],
    },

    // ── COLETA (shared) ──
    {
      estado: 'coleta_nome',
      tipo: 'input',
      mensagem: 'Perfeito 👍\n\nPra agendar, qual é o seu nome completo?',
      ordem: 60,
      opcoes: [{ texto: '*', proxEstado: 'contato_confirmacao', scoreIncrement: 0 }],
    },
    {
      estado: 'contato_confirmacao',
      tipo: 'menu',
      mensagem: 'Pra agilizar seu atendimento 👍\n\nPodemos falar com você por esse número?\n\n1️⃣ Sim, autorizo contato por aqui\n2️⃣ Prefiro outro número\n3️⃣ Prefiro ligação',
      ordem: 61,
      opcoes: [
        { texto: '1', proxEstado: 'final_lead', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'final_lead', scoreIncrement: 0 },
        { texto: '3', proxEstado: 'final_lead', scoreIncrement: 0 },
      ],
    },

    // ── FINAL ──
    {
      estado: 'final_lead',
      tipo: 'final_lead',
      mensagem: 'Perfeito 👍 já registramos seu pedido.\n\nNossa equipe vai entrar em contato para confirmar o agendamento.\n\n📞 Retorno em até 2h úteis.',
      ordem: 70,
      opcoes: [],
    },
  ];

  for (const node of nodes) {
    await prisma.node.upsert({
      where: { flowId_estado: { flowId: flow.id, estado: node.estado } },
      update: { tipo: node.tipo, mensagem: node.mensagem, opcoes: node.opcoes, ordem: node.ordem },
      create: { flowId: flow.id, estado: node.estado, tipo: node.tipo, mensagem: node.mensagem, opcoes: node.opcoes, ordem: node.ordem },
    });
  }
  console.log(`Nodes CLINICA criados/atualizados: ${nodes.length} para flow ${flow.id}`);
}

// ═══════════════════════════════════════════════════════════════
// IMOBILIARIA Flow Template
// ═══════════════════════════════════════════════════════════════
async function seedImobiliaria(tenantId) {
  let flow = await prisma.flow.findFirst({
    where: { tenantId, objetivo: 'leads', config: { path: ['tipo'], equals: 'imobiliaria' } },
  });
  if (!flow) {
    flow = await prisma.flow.create({
      data: {
        tenantId,
        objetivo: 'leads',
        config: { nome: 'Imobiliária — Imóveis', tipo: 'imobiliaria' },
        ativo: true,
      },
    });
  }
  console.log('Flow IMOBILIARIA criado:', flow.id);

  const nodes = [
    // ── START ──
    {
      estado: 'start',
      tipo: 'menu',
      mensagem: 'Olá! 👋 Bem-vindo à {empresa}.\n\nComo podemos ajudar?\n\n1️⃣ Comprar imóvel\n2️⃣ Vender imóvel\n3️⃣ Alugar\n4️⃣ Avaliação\n5️⃣ Outro',
      ordem: 0,
      opcoes: [
        { texto: '1', proxEstado: 'tipo_imovel_compra', scoreIncrement: 3, segmento: 'compra', tipoAtendimento: 'compra', valorEstimadoMin: 200000, valorEstimadoMax: 1000000, keywords: ['comprar', 'compra'] },
        { texto: '2', proxEstado: 'tipo_imovel_venda', scoreIncrement: 1, segmento: 'venda', tipoAtendimento: 'venda', keywords: ['vender', 'venda'] },
        { texto: '3', proxEstado: 'tipo_imovel_aluguel', scoreIncrement: 0, segmento: 'aluguel', tipoAtendimento: 'aluguel', keywords: ['alugar', 'aluguel'] },
        { texto: '4', proxEstado: 'tipo_imovel_avaliacao', scoreIncrement: 0, segmento: 'avaliacao', tipoAtendimento: 'avaliacao', keywords: ['avaliar', 'avaliação'] },
        { texto: '5', proxEstado: 'tipo_imovel_outro', scoreIncrement: 0, segmento: 'outros', tipoAtendimento: 'outro', keywords: ['outro'] },
      ],
    },

    // ── FALLBACK ──
    {
      estado: 'fallback',
      tipo: 'menu',
      mensagem: 'Não entendi muito bem 😅\n\nEscolha uma opção:\n\n1️⃣ Comprar\n2️⃣ Vender\n3️⃣ Alugar\n4️⃣ Avaliação\n5️⃣ Outro',
      ordem: 1,
      opcoes: [
        { texto: '1', proxEstado: 'tipo_imovel_compra', scoreIncrement: 3, segmento: 'compra', keywords: ['comprar', 'compra'] },
        { texto: '2', proxEstado: 'tipo_imovel_venda', scoreIncrement: 1, segmento: 'venda', keywords: ['vender', 'venda'] },
        { texto: '3', proxEstado: 'tipo_imovel_aluguel', scoreIncrement: 0, segmento: 'aluguel', keywords: ['alugar', 'aluguel'] },
        { texto: '4', proxEstado: 'tipo_imovel_avaliacao', scoreIncrement: 0, segmento: 'avaliacao', keywords: ['avaliar', 'avaliação'] },
        { texto: '5', proxEstado: 'tipo_imovel_outro', scoreIncrement: 0, segmento: 'outros', keywords: ['outro'] },
      ],
    },

    // ── TIPO IMÓVEL BRANCHES ──
    {
      estado: 'tipo_imovel_compra',
      tipo: 'menu',
      mensagem: 'Ótimo! 👍\n\nQue tipo de imóvel você procura?\n\n1️⃣ Apartamento\n2️⃣ Casa\n3️⃣ Terreno\n4️⃣ Comercial\n5️⃣ Outro',
      ordem: 10,
      opcoes: [
        { texto: '1', proxEstado: 'urgencia_imob', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'urgencia_imob', scoreIncrement: 0 },
        { texto: '3', proxEstado: 'urgencia_imob', scoreIncrement: 0 },
        { texto: '4', proxEstado: 'urgencia_imob', scoreIncrement: 1 },
        { texto: '5', proxEstado: 'urgencia_imob', scoreIncrement: 0 },
      ],
    },
    {
      estado: 'tipo_imovel_venda',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nQue tipo de imóvel você quer vender?\n\n1️⃣ Apartamento\n2️⃣ Casa\n3️⃣ Terreno\n4️⃣ Comercial\n5️⃣ Outro',
      ordem: 11,
      opcoes: [
        { texto: '1', proxEstado: 'urgencia_imob', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'urgencia_imob', scoreIncrement: 0 },
        { texto: '3', proxEstado: 'urgencia_imob', scoreIncrement: 0 },
        { texto: '4', proxEstado: 'urgencia_imob', scoreIncrement: 0 },
        { texto: '5', proxEstado: 'urgencia_imob', scoreIncrement: 0 },
      ],
    },
    {
      estado: 'tipo_imovel_aluguel',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nQue tipo de imóvel você procura para alugar?\n\n1️⃣ Apartamento\n2️⃣ Casa\n3️⃣ Comercial\n4️⃣ Outro',
      ordem: 12,
      opcoes: [
        { texto: '1', proxEstado: 'urgencia_imob', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'urgencia_imob', scoreIncrement: 0 },
        { texto: '3', proxEstado: 'urgencia_imob', scoreIncrement: 0 },
        { texto: '4', proxEstado: 'urgencia_imob', scoreIncrement: 0 },
      ],
    },
    {
      estado: 'tipo_imovel_avaliacao',
      tipo: 'input',
      mensagem: 'Entendi 👍\n\nQual o endereço ou região do imóvel para avaliação?',
      ordem: 13,
      opcoes: [{ texto: '*', proxEstado: 'urgencia_imob', scoreIncrement: 0 }],
    },
    {
      estado: 'tipo_imovel_outro',
      tipo: 'input',
      mensagem: 'Entendi 👍\n\nPode descrever brevemente o que precisa?',
      ordem: 14,
      opcoes: [{ texto: '*', proxEstado: 'urgencia_imob', scoreIncrement: 0 }],
    },

    // ── URGÊNCIA ──
    {
      estado: 'urgencia_imob',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nQual a urgência?\n\n1️⃣ Preciso resolver logo\n2️⃣ Estou pesquisando',
      ordem: 20,
      opcoes: [
        { texto: '1', proxEstado: 'coleta_nome', scoreIncrement: 3 },
        { texto: '2', proxEstado: 'coleta_nome', scoreIncrement: 0 },
      ],
    },

    // ── COLETA (shared) ──
    {
      estado: 'coleta_nome',
      tipo: 'input',
      mensagem: 'Perfeito 👍\n\nPra dar andamento, qual é o seu nome completo?',
      ordem: 60,
      opcoes: [{ texto: '*', proxEstado: 'contato_confirmacao', scoreIncrement: 0 }],
    },
    {
      estado: 'contato_confirmacao',
      tipo: 'menu',
      mensagem: 'Pra agilizar seu atendimento 👍\n\nPodemos falar com você por esse número?\n\n1️⃣ Sim, autorizo contato por aqui\n2️⃣ Prefiro outro número\n3️⃣ Prefiro ligação',
      ordem: 61,
      opcoes: [
        { texto: '1', proxEstado: 'final_lead', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'final_lead', scoreIncrement: 0 },
        { texto: '3', proxEstado: 'final_lead', scoreIncrement: 0 },
      ],
    },

    // ── FINAL ──
    {
      estado: 'final_lead',
      tipo: 'final_lead',
      mensagem: 'Perfeito 👍 já registramos seu interesse.\n\nUm corretor vai entrar em contato com as melhores opções pra você.\n\n📞 Retorno em até 1h útil.',
      ordem: 70,
      opcoes: [],
    },
  ];

  for (const node of nodes) {
    await prisma.node.upsert({
      where: { flowId_estado: { flowId: flow.id, estado: node.estado } },
      update: { tipo: node.tipo, mensagem: node.mensagem, opcoes: node.opcoes, ordem: node.ordem },
      create: { flowId: flow.id, estado: node.estado, tipo: node.tipo, mensagem: node.mensagem, opcoes: node.opcoes, ordem: node.ordem },
    });
  }
  console.log(`Nodes IMOBILIARIA criados/atualizados: ${nodes.length} para flow ${flow.id}`);
}

// ═══════════════════════════════════════════════════════════════
// GENERICO (Atendimento geral) Flow Template
// ═══════════════════════════════════════════════════════════════
async function seedGenerico(tenantId) {
  let flow = await prisma.flow.findFirst({
    where: { tenantId, objetivo: 'leads', config: { path: ['tipo'], equals: 'generico' } },
  });
  if (!flow) {
    flow = await prisma.flow.create({
      data: {
        tenantId,
        objetivo: 'leads',
        config: { nome: 'Genérico — Atendimento Geral', tipo: 'generico' },
        ativo: true,
      },
    });
  }
  console.log('Flow GENERICO criado:', flow.id);

  const nodes = [
    // ── START ──
    {
      estado: 'start',
      tipo: 'menu',
      mensagem: 'Olá! 👋 Bem-vindo à {empresa}.\n\nComo podemos ajudar?\n\n1️⃣ Consulta\n2️⃣ Orçamento\n3️⃣ Suporte\n4️⃣ Reclamação\n5️⃣ Outro',
      ordem: 0,
      opcoes: [
        { texto: '1', proxEstado: 'descricao_consulta', scoreIncrement: 0, segmento: 'consulta', tipoAtendimento: 'consulta', keywords: ['consulta'] },
        { texto: '2', proxEstado: 'descricao_orcamento', scoreIncrement: 2, segmento: 'orcamento', tipoAtendimento: 'orcamento', keywords: ['orçamento', 'preço'] },
        { texto: '3', proxEstado: 'descricao_suporte', scoreIncrement: 0, segmento: 'suporte', tipoAtendimento: 'suporte', keywords: ['suporte', 'ajuda'] },
        { texto: '4', proxEstado: 'descricao_reclamacao', scoreIncrement: 1, segmento: 'reclamacao', tipoAtendimento: 'reclamacao', keywords: ['reclamação', 'problema'] },
        { texto: '5', proxEstado: 'descricao_outro', scoreIncrement: 0, segmento: 'outros', tipoAtendimento: 'outro', keywords: ['outro'] },
      ],
    },

    // ── FALLBACK ──
    {
      estado: 'fallback',
      tipo: 'menu',
      mensagem: 'Não entendi muito bem 😅\n\nEscolha uma opção:\n\n1️⃣ Consulta\n2️⃣ Orçamento\n3️⃣ Suporte\n4️⃣ Reclamação\n5️⃣ Outro',
      ordem: 1,
      opcoes: [
        { texto: '1', proxEstado: 'descricao_consulta', scoreIncrement: 0, segmento: 'consulta', keywords: ['consulta'] },
        { texto: '2', proxEstado: 'descricao_orcamento', scoreIncrement: 2, segmento: 'orcamento', keywords: ['orçamento', 'preço'] },
        { texto: '3', proxEstado: 'descricao_suporte', scoreIncrement: 0, segmento: 'suporte', keywords: ['suporte', 'ajuda'] },
        { texto: '4', proxEstado: 'descricao_reclamacao', scoreIncrement: 1, segmento: 'reclamacao', keywords: ['reclamação', 'problema'] },
        { texto: '5', proxEstado: 'descricao_outro', scoreIncrement: 0, segmento: 'outros', keywords: ['outro'] },
      ],
    },

    // ── DESCRIÇÃO BRANCHES (input) ──
    {
      estado: 'descricao_consulta',
      tipo: 'input',
      mensagem: 'Entendi 👍\n\nPode descrever brevemente sua consulta?',
      ordem: 10,
      opcoes: [{ texto: '*', proxEstado: 'urgencia_geral', scoreIncrement: 0 }],
    },
    {
      estado: 'descricao_orcamento',
      tipo: 'input',
      mensagem: 'Entendi 👍\n\nDescreva o que precisa para montarmos o orçamento:',
      ordem: 11,
      opcoes: [{ texto: '*', proxEstado: 'urgencia_geral', scoreIncrement: 0 }],
    },
    {
      estado: 'descricao_suporte',
      tipo: 'input',
      mensagem: 'Entendi 👍\n\nDescreva o problema ou dúvida que você tem:',
      ordem: 12,
      opcoes: [{ texto: '*', proxEstado: 'urgencia_geral', scoreIncrement: 0 }],
    },
    {
      estado: 'descricao_reclamacao',
      tipo: 'input',
      mensagem: 'Entendi 👍\n\nPode descrever sua reclamação? Vamos resolver:',
      ordem: 13,
      opcoes: [{ texto: '*', proxEstado: 'urgencia_geral', scoreIncrement: 0 }],
    },
    {
      estado: 'descricao_outro',
      tipo: 'input',
      mensagem: 'Entendi 👍\n\nPode explicar brevemente o que precisa?',
      ordem: 14,
      opcoes: [{ texto: '*', proxEstado: 'urgencia_geral', scoreIncrement: 0 }],
    },

    // ── URGÊNCIA ──
    {
      estado: 'urgencia_geral',
      tipo: 'menu',
      mensagem: 'Entendi 👍\n\nIsso é urgente?\n\n1️⃣ Sim\n2️⃣ Não',
      ordem: 20,
      opcoes: [
        { texto: '1', proxEstado: 'coleta_nome', scoreIncrement: 5 },
        { texto: '2', proxEstado: 'coleta_nome', scoreIncrement: 0 },
      ],
    },

    // ── COLETA (shared) ──
    {
      estado: 'coleta_nome',
      tipo: 'input',
      mensagem: 'Perfeito 👍\n\nPra dar andamento, qual é o seu nome completo?',
      ordem: 60,
      opcoes: [{ texto: '*', proxEstado: 'contato_confirmacao', scoreIncrement: 0 }],
    },
    {
      estado: 'contato_confirmacao',
      tipo: 'menu',
      mensagem: 'Pra agilizar seu atendimento 👍\n\nPodemos falar com você por esse número?\n\n1️⃣ Sim, autorizo contato por aqui\n2️⃣ Prefiro outro número\n3️⃣ Prefiro ligação',
      ordem: 61,
      opcoes: [
        { texto: '1', proxEstado: 'final_lead', scoreIncrement: 0 },
        { texto: '2', proxEstado: 'final_lead', scoreIncrement: 0 },
        { texto: '3', proxEstado: 'final_lead', scoreIncrement: 0 },
      ],
    },

    // ── FINAL ──
    {
      estado: 'final_lead',
      tipo: 'final_lead',
      mensagem: 'Perfeito 👍 já registramos sua solicitação.\n\nNossa equipe vai entrar em contato em breve.\n\n📞 Retorno em até 24h úteis.',
      ordem: 70,
      opcoes: [],
    },
  ];

  for (const node of nodes) {
    await prisma.node.upsert({
      where: { flowId_estado: { flowId: flow.id, estado: node.estado } },
      update: { tipo: node.tipo, mensagem: node.mensagem, opcoes: node.opcoes, ordem: node.ordem },
      create: { flowId: flow.id, estado: node.estado, tipo: node.tipo, mensagem: node.mensagem, opcoes: node.opcoes, ordem: node.ordem },
    });
  }
  console.log(`Nodes GENERICO criados/atualizados: ${nodes.length} para flow ${flow.id}`);
}

// ═══════════════════════════════════════════════════════════════
// DEMO TENANTS for each template
// ═══════════════════════════════════════════════════════════════
async function seedDemoTenants() {
  // ── Clínica demo tenant ──
  const clinicaTenant = await prisma.tenant.upsert({
    where: { botToken: 'demo-clinica-token' },
    update: {},
    create: {
      nome: 'Clínica Saúde Viva',
      botToken: 'demo-clinica-token',
      plano: 'free',
      ativo: true,
      slaMinutes: 15,
      ticketMedio: 500,
      taxaConversao: 0.3,
      custoMensal: 200,
      metaMensal: 3000,
      moeda: 'BRL',
      flowSource: 'dynamic',
    },
  });
  console.log('Tenant CLINICA criado:', clinicaTenant.nome, clinicaTenant.id);
  await seedClinica(clinicaTenant.id);

  // ── Imobiliária demo tenant ──
  const imobTenant = await prisma.tenant.upsert({
    where: { botToken: 'demo-imobiliaria-token' },
    update: {},
    create: {
      nome: 'Imobiliária Casa Nova',
      botToken: 'demo-imobiliaria-token',
      plano: 'free',
      ativo: true,
      slaMinutes: 30,
      ticketMedio: 5000,
      taxaConversao: 0.15,
      custoMensal: 500,
      metaMensal: 20000,
      moeda: 'BRL',
      flowSource: 'dynamic',
    },
  });
  console.log('Tenant IMOBILIARIA criado:', imobTenant.nome, imobTenant.id);
  await seedImobiliaria(imobTenant.id);

  // ── Genérico demo tenant ──
  const genTenant = await prisma.tenant.upsert({
    where: { botToken: 'demo-generico-token' },
    update: {},
    create: {
      nome: 'Empresa Genérica Ltda',
      botToken: 'demo-generico-token',
      plano: 'free',
      ativo: true,
      slaMinutes: 20,
      ticketMedio: 800,
      taxaConversao: 0.2,
      custoMensal: 150,
      metaMensal: 5000,
      moeda: 'BRL',
      flowSource: 'dynamic',
    },
  });
  console.log('Tenant GENERICO criado:', genTenant.nome, genTenant.id);
  await seedGenerico(genTenant.id);
}

main()
  .then(() => seedDemoTenants())
  .catch(console.error)
  .finally(() => prisma.$disconnect());
