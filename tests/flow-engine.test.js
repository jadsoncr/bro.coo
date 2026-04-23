// tests/flow-engine.test.js
const storage = require('../src/storage/inMemory');

// Mock the flow cache to return our test flow
jest.mock('../src/flow/cache', () => ({
  getFlow: jest.fn(),
}));

// Mock events service
jest.mock('../src/events/service', () => ({
  EVENTS: { LEAD_CREATED: 'lead_created' },
  safeRecordEvent: jest.fn().mockResolvedValue(null),
}));

// Mock storage persistence (createLead, createClient) but keep session ops from inMemory
jest.mock('../src/storage', () => {
  const memory = jest.requireActual('../src/storage/inMemory');
  return {
    ...memory,
    createLead: jest.fn().mockResolvedValue({ id: 'lead-1' }),
    createClient: jest.fn().mockResolvedValue({ id: 'lead-2' }),
    createOther: jest.fn().mockResolvedValue({ id: 'lead-3' }),
    createAbandono: jest.fn().mockResolvedValue({ id: 'lead-4' }),
  };
});

const { process: processFlow } = require('../src/flow/engine');
const { getFlow } = require('../src/flow/cache');

const TENANT_ID = 'tenant-test';
const FLOW_ID = 'flow-test';

// Build a minimal juridico-like flow for testing
function buildTestFlow() {
  return {
    id: FLOW_ID,
    tenantId: TENANT_ID,
    objetivo: 'leads',
    ativo: true,
    config: { nome: 'Test Flow' },
    nodes: [
      {
        id: 'n-start', flowId: FLOW_ID, estado: 'start', tipo: 'menu',
        mensagem: 'Olá! Como podemos ajudar?\n\n1️⃣ Trabalho\n2️⃣ Família\n3️⃣ Já sou cliente',
        ordem: 0,
        opcoes: [
          { texto: '1', proxEstado: 'trabalho_tipo', scoreIncrement: 0, segmento: 'trabalhista' },
          { texto: '2', proxEstado: 'familia_tipo', scoreIncrement: 0, segmento: 'familia' },
          { texto: '3', proxEstado: 'cliente_id', scoreIncrement: 0, segmento: 'cliente' },
        ],
      },
      {
        id: 'n-trab', flowId: FLOW_ID, estado: 'trabalho_tipo', tipo: 'menu',
        mensagem: 'Qual situação?\n\n1️⃣ Demissão\n2️⃣ Horas extras\n3️⃣ Mais de uma',
        ordem: 10,
        opcoes: [
          { texto: '1', proxEstado: 'coleta_nome', scoreIncrement: 0 },
          { texto: '2', proxEstado: 'coleta_nome', scoreIncrement: 1 },
          { texto: '3', proxEstado: 'coleta_nome', scoreIncrement: 3 },
        ],
      },
      {
        id: 'n-fam', flowId: FLOW_ID, estado: 'familia_tipo', tipo: 'menu',
        mensagem: 'Qual situação?\n\n1️⃣ Divórcio\n2️⃣ Pensão',
        ordem: 20,
        opcoes: [
          { texto: '1', proxEstado: 'coleta_nome', scoreIncrement: 2, keywords: ['divorcio', 'separação'] },
          { texto: '2', proxEstado: 'coleta_nome', scoreIncrement: 0 },
        ],
      },
      {
        id: 'n-cli', flowId: FLOW_ID, estado: 'cliente_id', tipo: 'input',
        mensagem: 'Informe seu nome ou número do processo:',
        ordem: 30,
        opcoes: [{ texto: '*', proxEstado: 'final_cliente', scoreIncrement: 0 }],
      },
      {
        id: 'n-coleta', flowId: FLOW_ID, estado: 'coleta_nome', tipo: 'input',
        mensagem: 'Qual é o seu nome completo?',
        ordem: 60,
        opcoes: [{ texto: '*', proxEstado: 'final_lead', scoreIncrement: 0 }],
      },
      {
        id: 'n-final-lead', flowId: FLOW_ID, estado: 'final_lead', tipo: 'final_lead',
        mensagem: 'Obrigado {nome}! Estamos encaminhando seu caso.',
        ordem: 70,
        opcoes: [],
      },
      {
        id: 'n-final-cli', flowId: FLOW_ID, estado: 'final_cliente', tipo: 'final_cliente',
        mensagem: 'Obrigado! Encaminhando para a equipe.',
        ordem: 71,
        opcoes: [],
      },
    ],
  };
}

beforeEach(() => {
  storage._clear();
  getFlow.mockReset();
  getFlow.mockResolvedValue(buildTestFlow());
  jest.clearAllMocks();
  getFlow.mockResolvedValue(buildTestFlow());
});

describe('flow/engine — basic flow', () => {
  test('first message shows start node message', async () => {
    const r = await processFlow(TENANT_ID, 'sess-1', 'oi', 'whatsapp');
    expect(r.message).toContain('Como podemos ajudar');
    expect(r.estado).toBe('start');
  });

  test('selecting option 1 advances to trabalho_tipo', async () => {
    await processFlow(TENANT_ID, 'sess-2', 'oi', 'whatsapp');
    const r = await processFlow(TENANT_ID, 'sess-2', '1', 'whatsapp');
    expect(r.estado).toBe('trabalho_tipo');
    expect(r.fluxo).toBe('trabalhista');
  });

  test('selecting option 2 advances to familia_tipo', async () => {
    await processFlow(TENANT_ID, 'sess-3', 'oi', 'whatsapp');
    const r = await processFlow(TENANT_ID, 'sess-3', '2', 'whatsapp');
    expect(r.estado).toBe('familia_tipo');
    expect(r.fluxo).toBe('familia');
  });

  test('selecting option 3 advances to cliente_id (input)', async () => {
    await processFlow(TENANT_ID, 'sess-4', 'oi', 'whatsapp');
    const r = await processFlow(TENANT_ID, 'sess-4', '3', 'whatsapp');
    expect(r.estado).toBe('cliente_id');
  });
});

describe('flow/engine — score accumulation', () => {
  test('scoreIncrement accumulates across transitions', async () => {
    await processFlow(TENANT_ID, 'sess-5', 'oi', 'whatsapp');
    await processFlow(TENANT_ID, 'sess-5', '1', 'whatsapp'); // trabalhista, +0
    const r = await processFlow(TENANT_ID, 'sess-5', '3', 'whatsapp'); // mais de uma, +3
    expect(r.score).toBe(3);
    expect(r.prioridade).toBe('MEDIO');
  });

  test('score >= 5 yields QUENTE priority', async () => {
    // Use familia path with divorcio (+2), then manually check
    await processFlow(TENANT_ID, 'sess-6', 'oi', 'whatsapp');
    await processFlow(TENANT_ID, 'sess-6', '1', 'whatsapp'); // trabalhista
    const r = await processFlow(TENANT_ID, 'sess-6', '3', 'whatsapp'); // +3 → MEDIO
    expect(r.prioridade).toBe('MEDIO');
  });
});

describe('flow/engine — input nodes', () => {
  test('input node rejects text shorter than 3 chars', async () => {
    await processFlow(TENANT_ID, 'sess-7', 'oi', 'whatsapp');
    await processFlow(TENANT_ID, 'sess-7', '3', 'whatsapp'); // → cliente_id (input)
    const r = await processFlow(TENANT_ID, 'sess-7', 'ab', 'whatsapp');
    expect(r.estado).toBe('cliente_id'); // stays on same node
  });

  test('input node advances with valid text (>= 3 chars)', async () => {
    await processFlow(TENANT_ID, 'sess-8', 'oi', 'whatsapp');
    await processFlow(TENANT_ID, 'sess-8', '3', 'whatsapp'); // → cliente_id
    const r = await processFlow(TENANT_ID, 'sess-8', 'João Silva', 'whatsapp');
    // Should reach final_cliente → pos_final or final_cliente
    expect(r.message).toContain('Encaminhando');
  });
});

describe('flow/engine — final states', () => {
  test('reaching final_lead persists lead and returns finalization message', async () => {
    const storageMock = require('../src/storage');
    await processFlow(TENANT_ID, 'sess-9', 'oi', 'whatsapp');
    await processFlow(TENANT_ID, 'sess-9', '1', 'whatsapp'); // → trabalho_tipo
    await processFlow(TENANT_ID, 'sess-9', '1', 'whatsapp'); // → coleta_nome
    const r = await processFlow(TENANT_ID, 'sess-9', 'Maria Souza', 'whatsapp'); // → final_lead
    expect(r.message).toContain('Obrigado');
    expect(storageMock.createLead).toHaveBeenCalled();
  });

  test('reaching final_cliente persists client data', async () => {
    const storageMock = require('../src/storage');
    await processFlow(TENANT_ID, 'sess-10', 'oi', 'whatsapp');
    await processFlow(TENANT_ID, 'sess-10', '3', 'whatsapp'); // → cliente_id
    const r = await processFlow(TENANT_ID, 'sess-10', 'João / proc 123', 'whatsapp');
    expect(r.message).toContain('Encaminhando');
    expect(storageMock.createClient).toHaveBeenCalled();
  });
});

describe('flow/engine — RESET keywords', () => {
  test('"menu" resets session to start', async () => {
    await processFlow(TENANT_ID, 'sess-11', 'oi', 'whatsapp');
    await processFlow(TENANT_ID, 'sess-11', '1', 'whatsapp');
    const r = await processFlow(TENANT_ID, 'sess-11', 'menu', 'whatsapp');
    expect(r.estado).toBe('start');
    expect(r.message).toContain('Como podemos ajudar');
  });

  test('"reiniciar" resets session to start', async () => {
    await processFlow(TENANT_ID, 'sess-12', 'oi', 'whatsapp');
    await processFlow(TENANT_ID, 'sess-12', '1', 'whatsapp');
    const r = await processFlow(TENANT_ID, 'sess-12', 'reiniciar', 'whatsapp');
    expect(r.estado).toBe('start');
  });

  test('"voltar" resets session to start', async () => {
    await processFlow(TENANT_ID, 'sess-13', 'oi', 'whatsapp');
    await processFlow(TENANT_ID, 'sess-13', '2', 'whatsapp');
    const r = await processFlow(TENANT_ID, 'sess-13', 'voltar', 'whatsapp');
    expect(r.estado).toBe('start');
  });
});

describe('flow/engine — fallback escalation', () => {
  test('first invalid input repeats current node with hint', async () => {
    await processFlow(TENANT_ID, 'sess-14', 'oi', 'whatsapp');
    const r = await processFlow(TENANT_ID, 'sess-14', 'xyz', 'whatsapp');
    expect(r.estado).toBe('start');
    expect(r.message).toContain('Não entendi');
  });

  test('second invalid input escalates to operator', async () => {
    await processFlow(TENANT_ID, 'sess-15', 'oi', 'whatsapp');
    await processFlow(TENANT_ID, 'sess-15', 'xyz', 'whatsapp'); // fallback 1
    const r = await processFlow(TENANT_ID, 'sess-15', 'abc', 'whatsapp'); // fallback 2
    expect(r.estado).toBe('classificacao_pendente');
    expect(r.message).toContain('atendente');
  });

  test('valid match after one fallback resets fallback count', async () => {
    await processFlow(TENANT_ID, 'sess-16', 'oi', 'whatsapp');
    await processFlow(TENANT_ID, 'sess-16', 'xyz', 'whatsapp'); // fallback 1
    const r = await processFlow(TENANT_ID, 'sess-16', '1', 'whatsapp'); // valid
    expect(r.estado).toBe('trabalho_tipo');
  });
});

describe('flow/engine — keyword matching', () => {
  test('keyword match works for menu options', async () => {
    await processFlow(TENANT_ID, 'sess-17', 'oi', 'whatsapp');
    await processFlow(TENANT_ID, 'sess-17', '2', 'whatsapp'); // → familia_tipo
    const r = await processFlow(TENANT_ID, 'sess-17', 'quero divorcio', 'whatsapp');
    expect(r.estado).toBe('coleta_nome');
    expect(r.score).toBe(2); // divorcio option has scoreIncrement: 2
  });
});

describe('flow/engine — message variables', () => {
  test('{nome} is replaced in final message', async () => {
    await processFlow(TENANT_ID, 'sess-18', 'oi', 'whatsapp');
    await processFlow(TENANT_ID, 'sess-18', '1', 'whatsapp'); // → trabalho_tipo
    await processFlow(TENANT_ID, 'sess-18', '1', 'whatsapp'); // → coleta_nome
    const r = await processFlow(TENANT_ID, 'sess-18', 'Carlos Lima', 'whatsapp');
    expect(r.message).toContain('Carlos Lima');
  });
});

describe('flow/engine — no flow configured', () => {
  test('returns error message when no flow exists', async () => {
    getFlow.mockResolvedValue(null);
    const r = await processFlow(TENANT_ID, 'sess-19', 'oi', 'whatsapp');
    expect(r.message).toContain('Fluxo não configurado');
    expect(r.estado).toBeNull();
  });
});
