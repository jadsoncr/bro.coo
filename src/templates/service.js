// src/templates/service.js
// Template cloning service — creates a new tenant from a template

const { getPrisma } = require('../infra/db');
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const { template_juridico_v1 } = require('./juridico');

const TEMPLATES = {
  juridico: template_juridico_v1,
};

function getTemplate(tipo) {
  return TEMPLATES[tipo] || null;
}

function listTemplates() {
  return Object.entries(TEMPLATES).map(([key, t]) => ({
    id: key,
    nome: t.nome,
    tipo: t.tipo,
    segmentos: t.segmentos,
  }));
}

/**
 * Clone a template to create a new tenant with full operational setup.
 */
async function createTenantFromTemplate({
  templateId,
  nome,
  ownerEmail,
  ownerSenha,
  ownerNome,
  moeda,
  botToken,
}) {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`Template "${templateId}" não encontrado`);

  const prisma = getPrisma();

  // 1. Create tenant with structured segmentos from template
  const segmentosEstruturados = template.segmentos.map(seg => ({
    nome: seg,
    valorMin: template.valores[seg]?.min || 1000,
    valorMax: template.valores[seg]?.max || 10000,
    ticketMedio: template.valores[seg]?.default || template.financeiro.ticketMedio,
    taxaConversao: template.financeiro.taxaConversao,
  }));

  const tenant = await prisma.tenant.create({
    data: {
      nome,
      botToken: botToken || `bot-${randomUUID().slice(0, 8)}`,
      plano: 'starter',
      ativo: true,
      slaMinutes: template.sla.slaMinutes,
      slaContratoHoras: template.sla.slaContratoHoras,
      ticketMedio: template.financeiro.ticketMedio,
      taxaConversao: template.financeiro.taxaConversao,
      custoMensal: template.financeiro.custoMensal,
      metaMensal: template.financeiro.metaMensal,
      moeda: moeda || template.financeiro.moeda,
      moedaBase: moeda || template.financeiro.moeda,
      flowSource: 'dynamic',
      segmentos: segmentosEstruturados,
    },
  });

  // 2. Create OWNER user
  const senhaHash = await bcrypt.hash(ownerSenha, 10);
  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: ownerEmail,
      senhaHash,
      nome: ownerNome || nome,
      role: 'OWNER',
      ativo: true,
    },
  });

  // 3. Create Flow + Nodes from template
  const flow = await prisma.flow.create({
    data: {
      tenantId: tenant.id,
      objetivo: 'leads',
      config: { nome: template.nome, tipo: template.tipo, versao: template.versao },
      ativo: true,
    },
  });

  for (const node of template.nodes) {
    await prisma.node.create({
      data: {
        flowId: flow.id,
        estado: node.estado,
        tipo: node.tipo,
        mensagem: node.mensagem,
        opcoes: node.opcoes,
        ordem: node.ordem,
      },
    });
  }

  return { tenant, owner, flow, template: templateId };
}

module.exports = { getTemplate, listTemplates, createTenantFromTemplate, TEMPLATES };
