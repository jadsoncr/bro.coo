jest.mock('../src/infra/db', () => {
  const leads = [];
  const messages = [];
  return {
    getPrisma: () => ({
      lead: {
        create: jest.fn(async ({ data }) => {
          const lead = { id: 'uuid-1', ...data };
          leads.push(lead);
          return lead;
        }),
        findMany: jest.fn(async () => leads),
      },
      message: {
        create: jest.fn(async ({ data }) => {
          const msg = { id: 'uuid-m', ...data };
          messages.push(msg);
          return msg;
        }),
      },
    }),
  };
});

const { createLead, createMessage, createAbandono } = require('../src/storage/postgres');

describe('postgres adapter', () => {
  test('createLead persiste com campos obrigatórios', async () => {
    const lead = await createLead({
      tenantId: 'tenant-1',
      nome: 'João',
      telefone: '5511999',
      canal: 'telegram',
      fluxo: 'trabalhista',
      score: 6,
      prioridade: 'QUENTE',
      scoreBreakdown: { urgencia: 3, intencao: 2 },
    });
    expect(lead.tenantId).toBe('tenant-1');
    expect(lead.prioridade).toBe('QUENTE');
    expect(lead.score).toBe(6);
  });

  test('createMessage persiste mensagem vinculada ao lead', async () => {
    const msg = await createMessage({
      tenantId: 'tenant-1',
      leadId: 'uuid-1',
      direcao: 'in',
      conteudo: 'fui demitido',
      estado: 'start',
    });
    expect(msg.direcao).toBe('in');
    expect(msg.leadId).toBe('uuid-1');
  });

  test('createAbandono persiste com classificacao', async () => {
    const result = await createAbandono({
      tenantId: 'tenant-1',
      sessao: '5511999',
      fluxo: 'trabalhista',
      ultimoEstado: 'coleta_nome',
      score: 4,
      prioridade: 'MEDIO',
    });
    expect(result).toBeDefined();
  });
});
