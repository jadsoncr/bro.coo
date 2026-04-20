const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
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
}

main().catch(console.error).finally(() => prisma.$disconnect());
