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

const { createLead, createClient, createOther, createMessage, createAbandono } = require('../src/storage/postgres');

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

  test('createLead aceita payload legado da stateMachine', async () => {
    const lead = await createLead({
      tenantId: 'tenant-1',
      nome: 'Maria',
      telefone: '5511888',
      canalOrigem: 'telegram',
      area: 'trabalhista',
      status: 'NOVO',
      urgencia: 'QUENTE',
    });
    expect(lead.fluxo).toBe('trabalhista');
    expect(lead.canal).toBe('telegram');
    expect(lead.status).toBe('NOVO');
    expect(lead.prioridade).toBe('QUENTE');
  });

  test('createClient e createOther mapeiam fluxo corretamente', async () => {
    const cliente = await createClient({
      tenantId: 'tenant-1',
      nome: 'Cliente',
      telefone: '5511777',
      conteudo: 'processo 123',
    });
    const other = await createOther({
      tenantId: 'tenant-1',
      nome: 'Outro',
      telefone: '5511666',
      tipo: 'contrato',
    });
    expect(cliente.fluxo).toBe('cliente');
    expect(cliente.prioridade).toBe('MEDIO');
    expect(other.fluxo).toBe('outros');
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
    expect(result.statusFinal).toBe('SEM_SUCESSO');
    expect(result.abandonedAt).toBeInstanceOf(Date);
  });
});
