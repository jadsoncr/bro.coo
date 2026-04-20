jest.mock('../src/infra/db', () => {
  const leads = [
    {
      id: 'lead-1',
      telefone: '123456789',
      nome: 'Maria',
      status: 'abandonou',
      reativacaoEnviadaEm: null,
      criadoEm: new Date(Date.now() - 24 * 60 * 60 * 1000),
      tenant: { id: 'tenant-1', botToken: 'bot-token-1', nome: 'Escritório X' },
    },
  ];

  const mockFindMany = jest.fn(async () => leads);
  const mockUpdate = jest.fn(async ({ where, data }) => ({ id: where.id, ...data }));

  return {
    getPrisma: jest.fn(() => ({
      lead: {
        findMany: mockFindMany,
        update: mockUpdate,
      },
    })),
    __mockFindMany: mockFindMany,
    __mockUpdate: mockUpdate,
  };
});

global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));

const { buscarLeadsParaReativar, enviarReativacao, runReativacao } = require('../src/jobs/reativacao');

describe('reativacao job', () => {
  beforeEach(() => jest.clearAllMocks());

  test('buscarLeadsParaReativar retorna leads abandonados sem reativacao', async () => {
    const leads = await buscarLeadsParaReativar();
    expect(leads).toHaveLength(1);
    expect(leads[0].id).toBe('lead-1');
  });

  test('enviarReativacao chama Telegram API com mensagem correta', async () => {
    const lead = {
      id: 'lead-1',
      telefone: '123456789',
      nome: 'Maria',
      tenant: { botToken: 'bot-token-1' },
    };
    await enviarReativacao(lead);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('bot-token-1/sendMessage'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('runReativacao processa lead e marca como reativado', async () => {
    const db = require('../src/infra/db');
    await runReativacao();
    expect(db.__mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({ reativacaoEnviadaEm: expect.any(Date) }),
      })
    );
  });
});
