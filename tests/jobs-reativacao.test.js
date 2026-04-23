jest.mock('../src/infra/db', () => {
  const leads = [
    {
      id: 'lead-1',
      telefone: '123456789',
      nome: 'Maria',
      status: 'NOVO',
      statusFinal: 'SEM_SUCESSO',
      reativacaoEnviadaEm: null,
      reativacaoCount: 0,
      abandonedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      tenant: { id: 'tenant-1', botToken: 'bot-token-1', nome: 'Escritório X' },
    },
  ];

  const mockFindMany = jest.fn(async () => leads);
  const mockFindFirst = jest.fn(async () => ({ ...leads[0], reativacaoEnviadaEm: new Date() }));
  const mockUpdate = jest.fn(async ({ where, data }) => ({ id: where.id, ...data }));

  return {
    getPrisma: jest.fn(() => ({
      lead: {
        findMany: mockFindMany,
        findFirst: mockFindFirst,
        update: mockUpdate,
      },
    })),
    __mockFindMany: mockFindMany,
    __mockFindFirst: mockFindFirst,
    __mockUpdate: mockUpdate,
    __leads: leads,
  };
});

jest.mock('../src/events/service', () => ({
  EVENTS: {
    REACTIVATION_SENT: 'reactivation_sent',
    REACTIVATION_REPLY: 'reactivation_reply',
  },
  safeRecordEvent: jest.fn(async () => ({})),
  sleep: jest.fn(async () => {}),
}));

global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));

const {
  buscarLeadsParaReativar,
  enviarReativacao,
  registrarRespostaReativacao,
  runReativacao,
  isValidPhone,
  enviarComRetry,
} = require('../src/jobs/reativacao');

describe('reativacao job', () => {
  beforeEach(() => jest.clearAllMocks());

  test('buscarLeadsParaReativar retorna leads abandonados sem reativacao', async () => {
    const leads = await buscarLeadsParaReativar();
    expect(leads).toHaveLength(1);
    expect(leads[0].id).toBe('lead-1');
  });

  test('buscarLeadsParaReativar includes reativacaoCount filter', async () => {
    const db = require('../src/infra/db');
    await buscarLeadsParaReativar();
    expect(db.__mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reativacaoCount: { lt: 2 },
        }),
      })
    );
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

  test('runReativacao processa lead e marca como reativado com reativacaoCount increment', async () => {
    const db = require('../src/infra/db');
    await runReativacao();
    expect(db.__mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({
          reativacaoEnviadaEm: expect.any(Date),
          reativacaoCount: { increment: 1 },
        }),
      })
    );
  });

  test('runReativacao skips lead with invalid phone and does not send', async () => {
    const db = require('../src/infra/db');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Override leads to have invalid phone
    db.__leads[0].telefone = '123';
    await runReativacao();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(db.__mockUpdate).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('telefone inválido'));
    // Restore
    db.__leads[0].telefone = '123456789';
    warnSpy.mockRestore();
  });

  test('runReativacao retries once on Telegram failure then logs DLQ', async () => {
    const db = require('../src/infra/db');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

    await runReativacao();

    // Should not update lead since both attempts failed
    expect(db.__mockUpdate).not.toHaveBeenCalled();
    // Should log DLQ
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[reativacao DLQ]'));
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('runReativacao succeeds on retry after first Telegram failure', async () => {
    const db = require('../src/infra/db');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await runReativacao();

    expect(db.__mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({
          reativacaoEnviadaEm: expect.any(Date),
          reativacaoCount: { increment: 1 },
        }),
      })
    );
    warnSpy.mockRestore();
  });

  test('registrarRespostaReativacao marca resposta e aquece lead', async () => {
    const db = require('../src/infra/db');
    await registrarRespostaReativacao({ tenantId: 'tenant-1', telefone: '123456789' });
    expect(db.__mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          telefone: '123456789',
        }),
      })
    );
    expect(db.__mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({
          status: 'EM_ATENDIMENTO',
          statusFinal: null,
          prioridade: 'QUENTE',
          origemConversao: 'reativacao',
        }),
      })
    );
  });
});

describe('isValidPhone', () => {
  test('returns false for null/undefined/empty', () => {
    expect(isValidPhone(null)).toBe(false);
    expect(isValidPhone(undefined)).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });

  test('returns false for phone with fewer than 8 digits', () => {
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('1234567')).toBe(false);
    expect(isValidPhone('abc')).toBe(false);
  });

  test('returns true for phone with 8+ digits', () => {
    expect(isValidPhone('12345678')).toBe(true);
    expect(isValidPhone('+55 11 98765-4321')).toBe(true);
    expect(isValidPhone('5511987654321')).toBe(true);
  });

  test('strips non-digit characters before counting', () => {
    expect(isValidPhone('(11) 9876-5432')).toBe(true);
    expect(isValidPhone('+1-234-567-8')).toBe(true); // 8 digits after stripping
    expect(isValidPhone('+1-23-4')).toBe(false); // only 4 digits
  });
});

describe('enviarComRetry', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns true on first successful send', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const lead = {
      id: 'lead-1',
      telefone: '123456789',
      nome: 'Test',
      tenant: { botToken: 'token' },
    };
    const result = await enviarComRetry(lead);
    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('retries once and returns true on second success', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const lead = {
      id: 'lead-2',
      telefone: '123456789',
      nome: 'Test',
      tenant: { botToken: 'token' },
    };
    const result = await enviarComRetry(lead);
    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  test('returns false and logs DLQ when both attempts fail', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    const lead = {
      id: 'lead-3',
      telefone: '123456789',
      nome: 'Test',
      tenant: { botToken: 'token' },
    };
    const result = await enviarComRetry(lead);
    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[reativacao DLQ]'));
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
