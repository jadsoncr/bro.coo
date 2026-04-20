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
    },
  });
  console.log('Tenant criado:', tenant.nome, tenant.id);
}

main().catch(console.error).finally(() => prisma.$disconnect());
