// src/infra/db.js
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const { Pool } = require('@neondatabase/serverless');

let _prisma;

function getPrisma() {
  if (!_prisma) {
    // Use the Neon adapter which works with both regular postgres and prisma+postgres URLs
    const adapter = new PrismaNeon(
      new Pool({
        connectionString: process.env.DATABASE_URL,
      })
    );

    _prisma = new PrismaClient({
      adapter,
    });
  }
  return _prisma;
}

async function disconnectPrisma() {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}

module.exports = { getPrisma, disconnectPrisma };
