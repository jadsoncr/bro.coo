// tests/engine-resolveNode.test.js
const { resolveNode, resolveFlow } = require('../src/engine/resolveNode');

describe('resolveNode', () => {
  const baseNode = {
    estado: 'start',
    tipo: 'menu',
    mensagem: 'Olá! Como podemos ajudar?',
    opcoes: [{ texto: '1', proxEstado: 'next', segmento: 'trabalhista' }],
    ordem: 0,
  };

  test('returns base node when no override', () => {
    expect(resolveNode(baseNode, null)).toEqual(baseNode);
    expect(resolveNode(baseNode, undefined)).toEqual(baseNode);
  });

  test('returns base node when override has no overrides field', () => {
    expect(resolveNode(baseNode, {})).toEqual(baseNode);
    expect(resolveNode(baseNode, { overrides: null })).toEqual(baseNode);
  });

  test('overrides mensagem only', () => {
    const override = { overrides: { mensagem: 'Nova mensagem' } };
    const result = resolveNode(baseNode, override);
    expect(result.mensagem).toBe('Nova mensagem');
    expect(result.opcoes).toEqual(baseNode.opcoes);
    expect(result.tipo).toBe('menu');
    expect(result.estado).toBe('start');
  });

  test('overrides opcoes only', () => {
    const newOpcoes = [{ texto: '1', proxEstado: 'other', segmento: 'familia' }];
    const override = { overrides: { opcoes: newOpcoes } };
    const result = resolveNode(baseNode, override);
    expect(result.mensagem).toBe(baseNode.mensagem);
    expect(result.opcoes).toEqual(newOpcoes);
  });

  test('overrides config with merge', () => {
    const nodeWithConfig = { ...baseNode, config: { maxFallbacks: 2 } };
    const override = { overrides: { config: { inputField: 'nome' } } };
    const result = resolveNode(nodeWithConfig, override);
    expect(result.config).toEqual({ maxFallbacks: 2, inputField: 'nome' });
  });

  test('never overrides tipo or estado', () => {
    const override = { overrides: { tipo: 'input', estado: 'hacked', mensagem: 'ok' } };
    const result = resolveNode(baseNode, override);
    expect(result.tipo).toBe('menu');
    expect(result.estado).toBe('start');
    expect(result.mensagem).toBe('ok');
  });
});

describe('resolveFlow', () => {
  const baseNodes = [
    { estado: 'start', tipo: 'menu', mensagem: 'Hello', opcoes: [], ordem: 0 },
    { estado: 'input1', tipo: 'input', mensagem: 'Name?', opcoes: [], ordem: 1 },
    { estado: 'final', tipo: 'final_lead', mensagem: 'Done', opcoes: [], ordem: 2 },
  ];

  test('returns base nodes when no overrides', () => {
    expect(resolveFlow(baseNodes, [])).toEqual(baseNodes);
    expect(resolveFlow(baseNodes, null)).toEqual(baseNodes);
  });

  test('applies override to matching node only', () => {
    const overrides = [{ nodeEstado: 'start', overrides: { mensagem: 'Oi!' } }];
    const result = resolveFlow(baseNodes, overrides);
    expect(result[0].mensagem).toBe('Oi!');
    expect(result[1].mensagem).toBe('Name?');
    expect(result[2].mensagem).toBe('Done');
  });

  test('applies multiple overrides', () => {
    const overrides = [
      { nodeEstado: 'start', overrides: { mensagem: 'Oi!' } },
      { nodeEstado: 'final', overrides: { mensagem: 'Fim!' } },
    ];
    const result = resolveFlow(baseNodes, overrides);
    expect(result[0].mensagem).toBe('Oi!');
    expect(result[2].mensagem).toBe('Fim!');
  });
});
