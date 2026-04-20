const { calcularScore } = require('../src/scorer');

describe('scorer', () => {
  test('score = impacto + intencao + 1', () => {
    const { score } = calcularScore({ impacto: 3, intencao: 3 });
    expect(score).toBe(7);
  });

  test('score >= 5 é QUENTE', () => {
    const { prioridade } = calcularScore({ impacto: 3, intencao: 3 });
    expect(prioridade).toBe('QUENTE');
  });

  test('score >= 3 e < 5 é MEDIO', () => {
    const { prioridade } = calcularScore({ impacto: 1, intencao: 1 });
    expect(prioridade).toBe('MEDIO');
  });

  test('score < 3 é FRIO', () => {
    const { prioridade } = calcularScore({ impacto: 0, intencao: 1 });
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

  test('classificarLead soma sinais do Revenue OS em escala 0-10', () => {
    const { score, prioridade, scoreBreakdown } = require('../src/scorer').classificarLead({
      urgenciaDeclarada: true,
      intencaoAcao: true,
      problemaClaro: true,
      falarAdvogado: true,
      casoComplexo: true,
      retornouMenu: true,
    });
    expect(score).toBe(10);
    expect(prioridade).toBe('QUENTE');
    expect(scoreBreakdown.retornouMenu).toBe(-1);
  });
});
