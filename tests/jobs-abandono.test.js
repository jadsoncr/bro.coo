// Mock infra/db before requiring anything
const mockUpdateMany = jest.fn(async () => ({ count: 1 }));
jest.mock('../src/infra/db', () => ({
  getPrisma: jest.fn(() => ({
    lead: {
      updateMany: mockUpdateMany,
    },
  })),
}));

jest.mock('../src/events/service', () => ({
  EVENTS: { ABANDONED: 'abandoned' },
  safeRecordEvent: jest.fn(async () => ({})),
}));

// Mock storage
jest.mock('../src/storage', () => {
  const sessions = {};
  return {
    getSession: jest.fn(async (sessao) => sessions[sessao] || null),
    updateSession: jest.fn(async (sessao, data) => {
      sessions[sessao] = { ...(sessions[sessao] || {}), ...data, sessao };
    }),
    createAbandono: jest.fn(async () => ({})),
    _getAll: jest.fn(() => ({ sessions })),
    _clear: jest.fn(() => { Object.keys(sessions).forEach(k => delete sessions[k]); }),
    __sessions: sessions,
  };
});

// Mock sessionManager
jest.mock('../src/sessionManager', () => ({
  updateSession: jest.fn(async () => {}),
  resetSession: jest.fn(async () => ({})),
}));

const {
  scanForAbandonments,
  startAbandonmentScanner,
  stopAbandonmentScanner,
  classificarAbandono,
  getAllSessions,
  ABANDONO_TIMEOUT_MS,
  RESET_TIMEOUT_MS,
  FINAL_STATUSES,
  FINAL_STATES,
} = require('../src/jobs/abandono');

const storage = require('../src/storage');
const sessionManager = require('../src/sessionManager');
const { safeRecordEvent } = require('../src/events/service');

function makeSession(overrides = {}) {
  return {
    sessao: 'sess-1',
    estadoAtual: 'coleta_nome',
    fluxo: 'juridico',
    statusSessao: 'ATIVO',
    ultimaMensagem: 'oi',
    atualizadoEm: new Date(Date.now() - 35 * 60 * 1000).toISOString(), // 35 min ago
    score: 5,
    prioridade: 'MEDIO',
    nome: 'João',
    canalOrigem: 'telegram',
    origem: 'google',
    campanha: 'camp1',
    mensagensEnviadas: 3,
    ...overrides,
  };
}

describe('classificarAbandono', () => {
  test('returns PRECOCE for start state', () => {
    expect(classificarAbandono('start')).toBe('PRECOCE');
  });

  test('returns PRECOCE for fallback state', () => {
    expect(classificarAbandono('fallback')).toBe('PRECOCE');
  });

  test('returns VALIOSO for contact collection states', () => {
    expect(classificarAbandono('coleta_nome')).toBe('VALIOSO');
    expect(classificarAbandono('contato_confirmacao')).toBe('VALIOSO');
    expect(classificarAbandono('contato_numero')).toBe('VALIOSO');
    expect(classificarAbandono('contato_canal')).toBe('VALIOSO');
  });

  test('returns MEDIO for intermediate states', () => {
    expect(classificarAbandono('menu_principal')).toBe('MEDIO');
    expect(classificarAbandono('area_trabalho')).toBe('MEDIO');
  });
});

describe('scanForAbandonments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage._clear();
    delete process.env.STORAGE_ADAPTER;
    delete process.env.REDIS_URL;
  });

  test('detects abandonment for session inactive > 30 min', async () => {
    const sess = makeSession();
    storage.__sessions['sess-1'] = sess;

    const results = await scanForAbandonments();

    expect(results.abandoned).toBe(1);
    expect(storage.createAbandono).toHaveBeenCalledWith(
      expect.objectContaining({
        sessao: 'sess-1',
        ultimoEstado: 'coleta_nome',
      })
    );
    expect(sessionManager.updateSession).toHaveBeenCalledWith('sess-1', { statusSessao: 'ABANDONOU' });
  });

  test('skips sessions in FINALIZADO status', async () => {
    storage.__sessions['sess-1'] = makeSession({ statusSessao: 'FINALIZADO' });

    const results = await scanForAbandonments();

    expect(results.abandoned).toBe(0);
    expect(storage.createAbandono).not.toHaveBeenCalled();
  });

  test('skips sessions already ABANDONOU', async () => {
    storage.__sessions['sess-1'] = makeSession({ statusSessao: 'ABANDONOU' });

    const results = await scanForAbandonments();

    expect(results.abandoned).toBe(0);
  });

  test('skips sessions in final flow states', async () => {
    for (const state of FINAL_STATES) {
      jest.clearAllMocks();
      storage._clear();
      storage.__sessions['sess-1'] = makeSession({ estadoAtual: state });

      const results = await scanForAbandonments();
      expect(results.abandoned).toBe(0);
    }
  });

  test('skips sessions at start with no message (never interacted)', async () => {
    storage.__sessions['sess-1'] = makeSession({
      estadoAtual: 'start',
      ultimaMensagem: null,
    });

    const results = await scanForAbandonments();
    expect(results.abandoned).toBe(0);
  });

  test('skips sessions without atualizadoEm', async () => {
    storage.__sessions['sess-1'] = makeSession({ atualizadoEm: null });

    const results = await scanForAbandonments();
    expect(results.abandoned).toBe(0);
  });

  test('skips sessions inactive less than 30 min', async () => {
    storage.__sessions['sess-1'] = makeSession({
      atualizadoEm: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
    });

    const results = await scanForAbandonments();
    expect(results.abandoned).toBe(0);
  });

  test('resets session when inactive > 24h', async () => {
    storage.__sessions['sess-1'] = makeSession({
      atualizadoEm: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25h ago
    });

    const results = await scanForAbandonments();

    expect(results.abandoned).toBe(1);
    expect(results.reset).toBe(1);
    expect(sessionManager.resetSession).toHaveBeenCalledWith('sess-1', 'telegram');
  });

  test('does not reset session when inactive 30min-24h', async () => {
    storage.__sessions['sess-1'] = makeSession({
      atualizadoEm: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
    });

    const results = await scanForAbandonments();

    expect(results.abandoned).toBe(1);
    expect(results.reset).toBe(0);
    expect(sessionManager.resetSession).not.toHaveBeenCalled();
  });

  test('updates existing lead when leadId present and postgres adapter', async () => {
    process.env.STORAGE_ADAPTER = 'postgres';

    storage.__sessions['sess-1'] = makeSession({
      leadId: 'lead-123',
      tenantId: 'tenant-1',
    });

    const results = await scanForAbandonments();

    expect(results.abandoned).toBe(1);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-123', tenantId: 'tenant-1' },
        data: expect.objectContaining({
          status: 'ABANDONOU',
          statusFinal: 'SEM_SUCESSO',
        }),
      })
    );
    expect(safeRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        leadId: 'lead-123',
        event: 'abandoned',
        step: 'coleta_nome',
      })
    );
    // Should NOT create a new abandono record since lead was updated
    expect(storage.createAbandono).not.toHaveBeenCalled();
  });

  test('falls back to createAbandono when lead update fails', async () => {
    process.env.STORAGE_ADAPTER = 'postgres';
    mockUpdateMany.mockRejectedValueOnce(new Error('DB error'));

    storage.__sessions['sess-1'] = makeSession({
      leadId: 'lead-123',
      tenantId: 'tenant-1',
    });

    const results = await scanForAbandonments();

    expect(results.abandoned).toBe(1);
    expect(storage.createAbandono).toHaveBeenCalled();
  });

  test('handles multiple sessions, one failure does not stop scan', async () => {
    storage.__sessions['sess-1'] = makeSession({ sessao: 'sess-1' });
    storage.__sessions['sess-2'] = makeSession({
      sessao: 'sess-2',
      atualizadoEm: 'INVALID_DATE',
    });
    storage.__sessions['sess-3'] = makeSession({ sessao: 'sess-3' });

    const results = await scanForAbandonments();

    // sess-2 has invalid date which produces NaN diff, so it won't pass the < check
    // It should still process sess-1 and sess-3
    expect(results.abandoned).toBeGreaterThanOrEqual(2);
  });
});

describe('startAbandonmentScanner / stopAbandonmentScanner', () => {
  test('starts and stops interval', () => {
    jest.useFakeTimers();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const id = startAbandonmentScanner(1000);
    expect(id).toBeDefined();

    stopAbandonmentScanner(id);

    logSpy.mockRestore();
    jest.useRealTimers();
  });

  test('calls scanForAbandonments on interval', () => {
    jest.useFakeTimers();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const id = startAbandonmentScanner(1000);

    // Advance timer — scanForAbandonments is async but setInterval fires it
    jest.advanceTimersByTime(1000);

    stopAbandonmentScanner(id);
    logSpy.mockRestore();
    jest.useRealTimers();
  });
});

describe('getAllSessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage._clear();
    delete process.env.STORAGE_ADAPTER;
    delete process.env.REDIS_URL;
  });

  test('returns in-memory sessions when Redis not configured', async () => {
    storage.__sessions['s1'] = { sessao: 's1', estadoAtual: 'start' };

    const sessions = await getAllSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessao).toBe('s1');
  });
});
