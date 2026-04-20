const { calcularScore } = require('../src/scorer');

describe('scorer', () => {
  test('score = impacto + intencao + 1', () => {
    const { score } = calcularScore({ impacto: 3, intencao: 3 });
    expect(score).toBe(7);
  });

  test('score >= 7 é QUENTE', () => {
    const { prioridade } = calcularScore({ impacto: 3, intencao: 3 });
    expect(prioridade).toBe('QUENTE');
  });

  test('score >= 5 e < 7 é MEDIO', () => {
    const { prioridade } = calcularScore({ impacto: 2, intencao: 2 });
    expect(prioridade).toBe('MEDIO');
  });

  test('score < 5 é FRIO', () => {
    const { prioridade } = calcularScore({ impacto: 1, intencao: 1 });
    expect(prioridade).toBe('FRIO');
  });

  test('com apenas impacto definido, usa intencao 0', () => {
    const { score } = calcularScore({ impacto: 3, intencao: null });
    expect(score).toBe(4);
  });

  test('com nenhum dado, score é 1', () => {
    const { score } = calcularScore({});
    expect(score).toBe(1);
  });
});
