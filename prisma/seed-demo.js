const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');
const prisma = new PrismaClient();

const TENANT_ID = 'b25f1463-e14d-42df-a15d-e56f47101397';
const NOW = Date.now();
const min = (m) => new Date(NOW - m * 60000);
const day = (d) => new Date(NOW - d * 86400000);

function phone() {
  const ddd = ['11','21','31','41','51','61','71','81'][Math.floor(Math.random()*8)];
  const n = () => String(Math.floor(Math.random()*10000)).padStart(4,'0');
  return `${ddd}9${n()}${n()}`;
}

async function main() {
  console.log('🌱 Seeding demo data for tenant', TENANT_ID);

  // Ensure tenant exists
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      nome: 'Santos & Bastos Advogados',
      botToken: 'demo-token-' + randomUUID().slice(0,8),
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

  // Fix admin token
  try {
    await prisma.adminUser.updateMany({
      where: {},
      data: { token: 'bro-master-admin-token-2026' },
    });
    console.log('✅ AdminUser token updated');
  } catch (e) {
    console.log('⚠️  AdminUser update skipped:', e.message);
  }

  // Update Jadson to MASTER role
  try {
    const result = await prisma.user.updateMany({
      where: { email: 'jadsoncr@gmail.com' },
      data: { role: 'MASTER' },
    });
    console.log(`✅ Jadson CR updated to MASTER role (${result.count} rows)`);
  } catch (e) {
    console.log('⚠️  MASTER role update skipped:', e.message);
  }

  // Clean existing demo leads for this tenant (to allow re-run)
  const existingLeads = await prisma.lead.findMany({ where: { tenantId: TENANT_ID }, select: { id: true } });
  const leadIds = existingLeads.map(l => l.id);
  if (leadIds.length > 0) {
    await prisma.event.deleteMany({ where: { tenantId: TENANT_ID } });
    await prisma.message.deleteMany({ where: { tenantId: TENANT_ID } });
    await prisma.caso.deleteMany({ where: { tenantId: TENANT_ID } });
    await prisma.lead.deleteMany({ where: { tenantId: TENANT_ID } });
    console.log(`🗑️  Cleaned ${leadIds.length} existing leads`);
  }

  // ═══ LEADS ═══
  const leads = [];

  // --- 3 QUENTE (score >= 5, no primeiraRespostaEm) ---
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'Maria Silva', telefone: '11987654321', canal: 'telegram',
    fluxo: 'trabalho_tipo', score: 7, prioridade: 'QUENTE', status: 'NOVO',
    segmento: 'trabalhista', tipoAtendimento: 'demissão',
    estagio: 'novo', intencao: 'contratar', origem: 'google',
    valorEstimado: 5000, criadoEm: min(20),
  });
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'Pedro Almeida', telefone: '21976543210', canal: 'telegram',
    fluxo: 'trabalho_tipo', score: 8, prioridade: 'QUENTE', status: 'NOVO',
    segmento: 'trabalhista', tipoAtendimento: 'assédio',
    estagio: 'novo', intencao: 'contratar', origem: 'instagram',
    valorEstimado: 5000, criadoEm: min(15),
  });
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'Ana Costa', telefone: '31965432109', canal: 'telegram',
    fluxo: 'familia_tipo', score: 6, prioridade: 'QUENTE', status: 'NOVO',
    segmento: 'familia', tipoAtendimento: 'divórcio urgente',
    estagio: 'novo', intencao: 'contratar', origem: 'indicacao',
    valorEstimado: 3000, criadoEm: min(25),
  });

  // --- 4 MEDIO (score 3-4) ---
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'João Santos', telefone: '41954321098', canal: 'telegram',
    fluxo: 'trabalho_tipo', score: 4, prioridade: 'MEDIO', status: 'NOVO',
    segmento: 'trabalhista', tipoAtendimento: 'horas extras',
    estagio: 'novo', intencao: 'contratar', origem: 'google',
    valorEstimado: 5000, criadoEm: min(10),
  });
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'Carla Oliveira', telefone: '51943210987', canal: 'telegram',
    fluxo: 'familia_tipo', score: 3, prioridade: 'MEDIO', status: 'NOVO',
    segmento: 'familia', tipoAtendimento: 'pensão',
    estagio: 'novo', intencao: 'informacao', origem: 'instagram',
    valorEstimado: 3000, criadoEm: min(8),
  });
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'Roberto Lima', telefone: '61932109876', canal: 'telegram',
    fluxo: 'outros_descricao', score: 3, prioridade: 'MEDIO', status: 'EM_ATENDIMENTO',
    segmento: 'outros', tipoAtendimento: 'consulta geral',
    estagio: 'atendimento', intencao: 'informacao', origem: 'indicacao',
    valorEstimado: 500, criadoEm: min(30),
    primeiraRespostaEm: min(25),
  });
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'Fernanda Souza', telefone: '71921098765', canal: 'telegram',
    fluxo: 'trabalho_tipo', score: 4, prioridade: 'MEDIO', status: 'EM_ATENDIMENTO',
    segmento: 'trabalhista', tipoAtendimento: 'rescisão',
    estagio: 'qualificado', intencao: 'contratar', origem: 'google',
    valorEstimado: 5000, criadoEm: min(45),
    primeiraRespostaEm: min(35),
  });

  // --- 3 FRIO (score < 3) ---
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'Lucas Pereira', telefone: '81910987654', canal: 'telegram',
    fluxo: 'outros_descricao', score: 1, prioridade: 'FRIO', status: 'NOVO',
    segmento: 'outros', tipoAtendimento: 'informação',
    estagio: 'novo', intencao: 'informacao', origem: 'desconhecida',
    valorEstimado: 500, criadoEm: min(5),
  });
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'Juliana Martins', telefone: '11998765432', canal: 'telegram',
    fluxo: 'familia_tipo', score: 2, prioridade: 'FRIO', status: 'NOVO',
    segmento: 'familia', tipoAtendimento: 'consulta',
    estagio: 'novo', intencao: 'suporte', origem: 'desconhecida',
    valorEstimado: 3000, criadoEm: min(3),
  });
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'Marcos Ribeiro', telefone: '21987651234', canal: 'telegram',
    fluxo: 'outros_descricao', score: 1, prioridade: 'FRIO', status: 'NOVO',
    segmento: 'outros', tipoAtendimento: 'dúvida',
    estagio: 'novo', intencao: 'informacao', origem: 'desconhecida',
    valorEstimado: 500, criadoEm: min(1),
  });

  // --- 3 Converted (statusFinal = 'virou_cliente') ---
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'Patricia Gomes', telefone: '31998761234', canal: 'telegram',
    fluxo: 'trabalho_tipo', score: 6, prioridade: 'QUENTE', status: 'EM_ATENDIMENTO',
    statusFinal: 'virou_cliente', segmento: 'trabalhista', tipoAtendimento: 'demissão',
    estagio: 'convertido', intencao: 'contratar', origem: 'google',
    valorEstimado: 5000, criadoEm: day(6), convertidoEm: day(5),
    primeiraRespostaEm: day(6),
  });
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'Ricardo Ferreira', telefone: '41997651234', canal: 'telegram',
    fluxo: 'familia_tipo', score: 5, prioridade: 'QUENTE', status: 'EM_ATENDIMENTO',
    statusFinal: 'virou_cliente', segmento: 'familia', tipoAtendimento: 'divórcio',
    estagio: 'convertido', intencao: 'contratar', origem: 'indicacao',
    valorEstimado: 3000, criadoEm: day(11), convertidoEm: day(10),
    primeiraRespostaEm: day(11),
  });
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'Sandra Alves', telefone: '51996541234', canal: 'telegram',
    fluxo: 'trabalho_tipo', score: 7, prioridade: 'QUENTE', status: 'EM_ATENDIMENTO',
    statusFinal: 'virou_cliente', segmento: 'trabalhista', tipoAtendimento: 'horas extras',
    estagio: 'convertido', intencao: 'contratar', origem: 'instagram',
    valorEstimado: 5000, criadoEm: day(16), convertidoEm: day(15),
    primeiraRespostaEm: day(16),
  });

  // --- 2 Lost (statusFinal = 'PERDIDO') ---
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'Carlos Mendes', telefone: '61995431234', canal: 'telegram',
    fluxo: 'trabalho_tipo', score: 4, prioridade: 'MEDIO', status: 'EM_ATENDIMENTO',
    statusFinal: 'PERDIDO', segmento: 'trabalhista', tipoAtendimento: 'rescisão',
    motivoDesistencia: 'PRECO_ALTO',
    estagio: 'perdido', intencao: 'contratar', origem: 'google',
    valorEstimado: 5000, criadoEm: day(4), perdidoEm: day(3),
    primeiraRespostaEm: day(4),
  });
  leads.push({
    id: randomUUID(), tenantId: TENANT_ID,
    nome: 'Lucia Barbosa', telefone: '71994321234', canal: 'telegram',
    fluxo: 'familia_tipo', score: 3, prioridade: 'MEDIO', status: 'EM_ATENDIMENTO',
    statusFinal: 'PERDIDO', segmento: 'familia', tipoAtendimento: 'pensão',
    motivoDesistencia: 'SEM_INTERESSE',
    estagio: 'perdido', intencao: 'informacao', origem: 'instagram',
    valorEstimado: 3000, criadoEm: day(8), perdidoEm: day(7),
    primeiraRespostaEm: day(8),
  });

  // Create all leads
  for (const lead of leads) {
    await prisma.lead.create({ data: lead });
  }
  console.log(`✅ ${leads.length} leads created`);

  // ═══ MESSAGES (for leads with primeiraRespostaEm or converted) ═══
  const msgLeads = leads.filter(l => l.primeiraRespostaEm || l.statusFinal === 'virou_cliente');
  for (const lead of msgLeads) {
    const baseTime = new Date(lead.criadoEm).getTime();
    const msgs = [
      { direcao: 'bot', conteudo: 'Olá! 👋 Bem-vindo ao Santos & Bastos Advogados. Como podemos te ajudar?', criadoEm: new Date(baseTime + 1000) },
      { direcao: 'cliente', conteudo: `Preciso de ajuda com ${lead.tipoAtendimento || 'meu caso'}`, criadoEm: new Date(baseTime + 60000) },
      { direcao: 'bot', conteudo: 'Entendi 👍 Vou encaminhar para um advogado da equipe.', criadoEm: new Date(baseTime + 62000) },
    ];
    if (lead.primeiraRespostaEm) {
      msgs.push({
        direcao: 'humano', conteudo: `Olá ${lead.nome.split(' ')[0]}, sou da equipe Santos & Bastos. Vi seu caso sobre ${lead.tipoAtendimento || 'sua situação'}. Vamos resolver isso.`,
        criadoEm: new Date(new Date(lead.primeiraRespostaEm).getTime() + 1000),
      });
    }
    if (lead.statusFinal === 'virou_cliente') {
      msgs.push({
        direcao: 'cliente', conteudo: 'Ótimo, vamos fechar então!',
        criadoEm: new Date(new Date(lead.convertidoEm).getTime() - 60000),
      });
    }
    for (const msg of msgs) {
      await prisma.message.create({
        data: { tenantId: TENANT_ID, leadId: lead.id, ...msg },
      });
    }
  }
  console.log(`✅ Messages created for ${msgLeads.length} leads`);

  // ═══ CASOS (for converted leads) ═══
  const patricia = leads.find(l => l.nome === 'Patricia Gomes');
  const ricardo = leads.find(l => l.nome === 'Ricardo Ferreira');
  const sandra = leads.find(l => l.nome === 'Sandra Alves');

  await prisma.caso.create({
    data: {
      tenantId: TENANT_ID, leadId: patricia.id,
      tipoContrato: 'entrada_exito', status: 'em_andamento',
      valorEntrada: 2000, percentualExito: 30, valorCausa: 50000,
      currency: 'BRL', segmento: 'trabalhista',
    },
  });
  await prisma.caso.create({
    data: {
      tenantId: TENANT_ID, leadId: ricardo.id,
      tipoContrato: 'entrada', status: 'em_andamento',
      valorEntrada: 3000,
      valorRecebido: 3000, dataRecebimento: day(5),
      currency: 'BRL', segmento: 'familia',
    },
  });
  await prisma.caso.create({
    data: {
      tenantId: TENANT_ID, leadId: sandra.id,
      tipoContrato: 'exito', status: 'em_andamento',
      percentualExito: 25, valorCausa: 80000,
      currency: 'BRL', segmento: 'trabalhista',
    },
  });
  console.log('✅ 3 Casos created');

  // ═══ EVENTS ═══
  // LEAD_CREATED for all
  for (const lead of leads) {
    await prisma.event.create({
      data: {
        tenantId: TENANT_ID, leadId: lead.id,
        event: 'lead_created', criadoEm: lead.criadoEm,
      },
    });
  }

  // ABANDONED for 2 leads (Lucas Pereira at coleta_nome, Juliana Martins at trabalho_tipo)
  const lucas = leads.find(l => l.nome === 'Lucas Pereira');
  const juliana = leads.find(l => l.nome === 'Juliana Martins');
  await prisma.event.create({
    data: {
      tenantId: TENANT_ID, leadId: lucas.id,
      event: 'abandoned', step: 'coleta_nome', criadoEm: min(4),
    },
  });
  await prisma.event.create({
    data: {
      tenantId: TENANT_ID, leadId: juliana.id,
      event: 'abandoned', step: 'trabalho_tipo', criadoEm: min(2),
    },
  });

  // CONVERTED for 3 converted leads
  for (const lead of [patricia, ricardo, sandra]) {
    await prisma.event.create({
      data: {
        tenantId: TENANT_ID, leadId: lead.id,
        event: 'converted', criadoEm: lead.convertidoEm,
        metadata: { origemConversao: 'atendimento' },
      },
    });
  }

  // LOST for 2 lost leads
  const carlos = leads.find(l => l.nome === 'Carlos Mendes');
  const lucia = leads.find(l => l.nome === 'Lucia Barbosa');
  await prisma.event.create({
    data: {
      tenantId: TENANT_ID, leadId: carlos.id,
      event: 'lost', criadoEm: carlos.perdidoEm,
      metadata: { motivo: 'PRECO_ALTO' },
    },
  });
  await prisma.event.create({
    data: {
      tenantId: TENANT_ID, leadId: lucia.id,
      event: 'lost', criadoEm: lucia.perdidoEm,
      metadata: { motivo: 'SEM_INTERESSE' },
    },
  });

  // FIRST_RESPONSE for leads with primeiraRespostaEm
  for (const lead of leads.filter(l => l.primeiraRespostaEm)) {
    await prisma.event.create({
      data: {
        tenantId: TENANT_ID, leadId: lead.id,
        event: 'first_response', criadoEm: lead.primeiraRespostaEm,
      },
    });
  }
  console.log('✅ Events created');

  // Clean duplicate/phantom tenants
  await prisma.tenant.deleteMany({
    where: { nome: 'Tenant Padrão' },
  });
  console.log('🗑️  Cleaned phantom tenants');

  try {
    await prisma.tenant.delete({ where: { id: 'your_dev_tenant_id' } });
  } catch (e) { /* ignore if not found */ }

  console.log('\n🎉 Demo data seeded successfully!');
  console.log(`   Tenant: ${TENANT_ID}`);
  console.log(`   Leads: ${leads.length}`);
  console.log('   Casos: 3');
  console.log('   Ready for demonstration!\n');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
