const { process: processar } = require('../src/stateMachine');
const storage = require('../src/storage/inMemory');

beforeEach(() => storage._clear());

// ─────────────────────────────────────────────────────────────────────────────
// ENTRADA
// ─────────────────────────────────────────────────────────────────────────────

describe('entrada — start e fallback', () => {
  test('primeira mensagem retorna menu e estado start', async () => {
    const result = await processar('11001', 'oi', 'whatsapp');
    expect(result.message).toContain('Santos & Bastos');
    expect(result.message).toContain('1️⃣');
  });

  test('"1" em start vai para trabalho_status', async () => {
    await processar('11002', 'oi', 'whatsapp');
    const result = await processar('11002', '1', 'whatsapp');
    expect(result.estado).toBe('trabalho_status');
    expect(result.fluxo).toBe('trabalhista');
  });

  test('"2" em start vai para familia_tipo', async () => {
    await processar('11003', 'oi', 'whatsapp');
    const result = await processar('11003', '2', 'whatsapp');
    expect(result.estado).toBe('familia_tipo');
    expect(result.fluxo).toBe('familia');
  });

  test('"3" em start vai para cliente_identificacao', async () => {
    await processar('11004', 'oi', 'whatsapp');
    const result = await processar('11004', '3', 'whatsapp');
    expect(result.estado).toBe('cliente_identificacao');
    expect(result.fluxo).toBe('cliente');
  });

  test('"4" em start vai para advogado_tipo com score 3', async () => {
    await processar('11005', 'oi', 'whatsapp');
    const result = await processar('11005', '4', 'whatsapp');
    expect(result.estado).toBe('advogado_tipo');
    expect(result.score).toBeGreaterThanOrEqual(5);
  });

  test('"5" em start vai para outros_descricao', async () => {
    await processar('11006', 'oi', 'whatsapp');
    const result = await processar('11006', '5', 'whatsapp');
    expect(result.estado).toBe('outros_descricao');
    expect(result.fluxo).toBe('outros');
  });

  test('opção inválida em start vai para fallback', async () => {
    await processar('11007', 'oi', 'whatsapp');
    const result = await processar('11007', 'xyz', 'whatsapp');
    expect(result.estado).toBe('fallback');
  });

  test('fallback com opção válida retorna ao fluxo correto', async () => {
    await processar('11008', 'oi', 'whatsapp');
    await processar('11008', 'xyz', 'whatsapp');
    const result = await processar('11008', '1', 'whatsapp');
    expect(result.estado).toBe('trabalho_status');
  });

  test('reset com "menu" volta para start', async () => {
    await processar('11009', 'oi', 'whatsapp');
    await processar('11009', '1', 'whatsapp');
    const result = await processar('11009', 'menu', 'whatsapp');
    expect(result.message).toContain('Santos & Bastos');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FLUXO TRABALHISTA
// ─────────────────────────────────────────────────────────────────────────────

describe('fluxo trabalhista', () => {
  async function iniciarTrabalhista(sessao) {
    await processar(sessao, 'oi', 'whatsapp');
    await processar(sessao, '1', 'whatsapp'); // start → trabalho_status
  }

  test('percorre todos os estados na ordem correta', async () => {
    await iniciarTrabalhista('22001');
    let r;
    r = await processar('22001', '2', 'whatsapp'); expect(r.estado).toBe('trabalho_tipo');
    r = await processar('22001', '1', 'whatsapp'); expect(r.estado).toBe('trabalho_tempo');
    r = await processar('22001', '3', 'whatsapp'); expect(r.estado).toBe('trabalho_salario');
    r = await processar('22001', '2', 'whatsapp'); expect(r.estado).toBe('trabalho_contrato');
    r = await processar('22001', '1', 'whatsapp'); expect(r.estado).toBe('trabalho_intencao');
    r = await processar('22001', '1', 'whatsapp'); expect(r.estado).toBe('coleta_nome');
    r = await processar('22001', 'João Silva', 'whatsapp'); expect(r.estado).toBe('contato_confirmacao');
    r = await processar('22001', '1', 'whatsapp'); expect(r.estado).toBe('pos_final');
  });

  test('tipo "mais de uma" (4) adiciona bonus de score', async () => {
    await iniciarTrabalhista('22002');
    await processar('22002', '1', 'whatsapp'); // trabalho_status
    const r = await processar('22002', '4', 'whatsapp'); // trabalho_tipo com bonus
    expect(r.score).toBe(2);
  });

  test('salário alto (3) adiciona bonus de score', async () => {
    await iniciarTrabalhista('22003');
    await processar('22003', '1', 'whatsapp'); // status
    await processar('22003', '1', 'whatsapp'); // tipo
    await processar('22003', '1', 'whatsapp'); // tempo
    const r = await processar('22003', '3', 'whatsapp'); // salario alto
    expect(r.score).toBe(2);
  });

  test('intenção "entrar na justiça" (2) adiciona bonus e vira QUENTE', async () => {
    await iniciarTrabalhista('22004');
    await processar('22004', '1', 'whatsapp'); // status
    await processar('22004', '4', 'whatsapp'); // tipo (+2)
    await processar('22004', '1', 'whatsapp'); // tempo
    await processar('22004', '3', 'whatsapp'); // salario (+2)
    await processar('22004', '1', 'whatsapp'); // contrato
    const r = await processar('22004', '2', 'whatsapp'); // intencao (+2) = 6 → QUENTE
    expect(r.score).toBe(6);
    expect(r.prioridade).toBe('QUENTE');
    expect(r.estado).toBe('coleta_nome');
  });

  test('fluxo completo finaliza e vai para pos_final', async () => {
    await iniciarTrabalhista('22005');
    await processar('22005', '1', 'whatsapp');
    await processar('22005', '1', 'whatsapp');
    await processar('22005', '1', 'whatsapp');
    await processar('22005', '1', 'whatsapp');
    await processar('22005', '1', 'whatsapp');
    await processar('22005', '1', 'whatsapp');
    await processar('22005', 'Maria Souza', 'whatsapp');
    const r = await processar('22005', '1', 'whatsapp');
    expect(r.estado).toBe('pos_final');
    expect(r.message).toContain('encaminhando');
  });

  test('contato "outro número" passa por contato_numero e contato_canal', async () => {
    await iniciarTrabalhista('22006');
    await processar('22006', '1', 'whatsapp');
    await processar('22006', '1', 'whatsapp');
    await processar('22006', '1', 'whatsapp');
    await processar('22006', '1', 'whatsapp');
    await processar('22006', '1', 'whatsapp');
    await processar('22006', '1', 'whatsapp');
    await processar('22006', 'Carlos Lima', 'whatsapp');
    let r = await processar('22006', '2', 'whatsapp'); // outro número
    expect(r.estado).toBe('contato_numero');
    r = await processar('22006', '11999990000', 'whatsapp');
    expect(r.estado).toBe('contato_canal');
    r = await processar('22006', '1', 'whatsapp');
    expect(r.estado).toBe('pos_final');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FLUXO FAMÍLIA
// ─────────────────────────────────────────────────────────────────────────────

describe('fluxo família', () => {
  async function iniciarFamilia(sessao) {
    await processar(sessao, 'oi', 'whatsapp');
    await processar(sessao, '2', 'whatsapp');
  }

  test('percorre estados na ordem correta', async () => {
    await iniciarFamilia('33001');
    let r;
    r = await processar('33001', '1', 'whatsapp'); expect(r.estado).toBe('familia_status');
    r = await processar('33001', '1', 'whatsapp'); expect(r.estado).toBe('familia_urgencia');
    r = await processar('33001', '2', 'whatsapp'); expect(r.estado).toBe('coleta_nome');
  });

  test('urgência "sim" (1) vira QUENTE', async () => {
    await iniciarFamilia('33002');
    await processar('33002', '1', 'whatsapp');
    await processar('33002', '1', 'whatsapp');
    const r = await processar('33002', '1', 'whatsapp'); // urgencia sim
    expect(r.prioridade).toBe('QUENTE');
    expect(r.score).toBeGreaterThanOrEqual(5);
  });

  test('fluxo completo finaliza corretamente', async () => {
    await iniciarFamilia('33003');
    await processar('33003', '1', 'whatsapp');
    await processar('33003', '1', 'whatsapp');
    await processar('33003', '2', 'whatsapp');
    await processar('33003', 'Ana Paula', 'whatsapp');
    const r = await processar('33003', '1', 'whatsapp');
    expect(r.estado).toBe('pos_final');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FLUXO CLIENTE
// ─────────────────────────────────────────────────────────────────────────────

describe('fluxo cliente', () => {
  test('identifica cliente e finaliza rapidamente', async () => {
    await processar('44001', 'oi', 'whatsapp');
    await processar('44001', '3', 'whatsapp');
    const r = await processar('44001', 'João Silva / proc 12345', 'whatsapp');
    expect(r.estado).toBe('pos_final');
    expect(r.message).toContain('Dra. Raquel');
  });

  test('fluxo cliente não passa por coleta_nome', async () => {
    await processar('44002', 'oi', 'whatsapp');
    await processar('44002', '3', 'whatsapp');
    const r = await processar('44002', 'Maria / 99999', 'whatsapp');
    expect(r.estado).toBe('pos_final');
    expect(r.estado).not.toBe('coleta_nome');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FLUXO ADVOGADO
// ─────────────────────────────────────────────────────────────────────────────

describe('fluxo advogado', () => {
  test('"4" no start inicia com score 3', async () => {
    await processar('55001', 'oi', 'whatsapp');
    const r = await processar('55001', '4', 'whatsapp');
    expect(r.estado).toBe('advogado_tipo');
    expect(r.score).toBeGreaterThanOrEqual(5);
  });

  test('caso novo vai para advogado_descricao', async () => {
    await processar('55002', 'oi', 'whatsapp');
    await processar('55002', '4', 'whatsapp');
    const r = await processar('55002', '1', 'whatsapp');
    expect(r.estado).toBe('advogado_descricao');
  });

  test('já é cliente redireciona para cliente_identificacao', async () => {
    await processar('55003', 'oi', 'whatsapp');
    await processar('55003', '4', 'whatsapp');
    const r = await processar('55003', '2', 'whatsapp');
    expect(r.estado).toBe('cliente_identificacao');
    expect(r.fluxo).toBe('cliente');
  });

  test('caso novo com descrição vai para coleta_nome com prioridade QUENTE', async () => {
    await processar('55004', 'oi', 'whatsapp');
    await processar('55004', '4', 'whatsapp');
    await processar('55004', '1', 'whatsapp');
    const r = await processar('55004', 'Preciso urgente de ajuda', 'whatsapp');
    expect(r.estado).toBe('coleta_nome');
    expect(r.prioridade).toBe('QUENTE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FLUXO OUTROS
// ─────────────────────────────────────────────────────────────────────────────

describe('fluxo outros', () => {
  test('percorre estados na ordem correta', async () => {
    await processar('66001', 'oi', 'whatsapp');
    await processar('66001', '5', 'whatsapp');
    let r;
    r = await processar('66001', 'Quero revisar um contrato', 'whatsapp');
    expect(r.estado).toBe('outros_impacto');
    r = await processar('66001', '1', 'whatsapp');
    expect(r.estado).toBe('coleta_nome');
  });

  test('impacto "sim" adiciona score', async () => {
    await processar('66002', 'oi', 'whatsapp');
    await processar('66002', '5', 'whatsapp');
    await processar('66002', 'Contrato', 'whatsapp');
    const r = await processar('66002', '1', 'whatsapp');
    expect(r.score).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PÓS-FINAL
// ─────────────────────────────────────────────────────────────────────────────

describe('pós-final', () => {
  async function chegarAoPosFinal(sessao) {
    await processar(sessao, 'oi', 'whatsapp');
    await processar(sessao, '3', 'whatsapp'); // cliente — fluxo mais curto
    await processar(sessao, 'Teste 12345', 'whatsapp');
  }

  test('"1" em pos_final reinicia para start', async () => {
    await chegarAoPosFinal('77001');
    const r = await processar('77001', '1', 'whatsapp');
    expect(r.message).toContain('Santos & Bastos');
  });

  test('"2" em pos_final vai para advogado_tipo', async () => {
    await chegarAoPosFinal('77002');
    const r = await processar('77002', '2', 'whatsapp');
    expect(r.estado).toBe('advogado_tipo');
  });

  test('"3" em pos_final vai para encerramento', async () => {
    await chegarAoPosFinal('77003');
    const r = await processar('77003', '3', 'whatsapp');
    expect(r.estado).toBe('encerramento');
    expect(r.message).toContain('Obrigado');
  });
});
