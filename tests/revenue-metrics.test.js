const { buildMetrics, normalizeFinalStatus, normalizeStatus } = require('../src/revenue/metrics');

describe('revenue metrics', () => {
  const now = new Date('2026-04-20T15:00:00.000Z');
  const tenant = {
    id: 'tenant-1',
    nome: 'Escritório X',
    moeda: 'BRL',
    slaMinutes: 15,
    ticketMedio: 1000,
    taxaConversao: 0.2,
    custoMensal: 297,
    metaMensal: 5000,
  };

  test('calcula potencial, risco, receita e lucro estimado', () => {
    const leads = [
      {
        id: 'lead-1',
        prioridade: 'QUENTE',
        status: 'NOVO',
        statusFinal: null,
        criadoEm: new Date('2026-04-20T14:30:00.000Z'),
        valorEntrada: 0,
        valorExito: 0,
        valorEstimado: 0,
      },
      {
        id: 'lead-2',
        prioridade: 'MEDIO',
        status: 'NOVO',
        statusFinal: null,
        criadoEm: new Date('2026-04-20T14:58:00.000Z'),
        valorEntrada: 0,
        valorExito: 0,
        valorEstimado: 500,
      },
      {
        id: 'lead-3',
        prioridade: 'FRIO',
        status: 'EM_ATENDIMENTO',
        statusFinal: 'CONVERTIDO',
        criadoEm: new Date('2026-04-19T12:00:00.000Z'),
        valorEntrada: 700,
        valorExito: 300,
        valorEstimado: 0,
      },
    ];

    const metrics = buildMetrics({ tenant, leads, now });

    expect(metrics.leadsHoje).toBe(2);
    expect(metrics.quentes).toBe(1);
    expect(metrics.atrasados).toBe(1);
    expect(metrics.potencialHoje).toBe(400);
    expect(metrics.emRisco).toBe(200);
    expect(metrics.receitaGerada).toBe(1000);
    expect(metrics.receitaFutura).toBe(700);
    expect(metrics.lucroEstimado).toBe(1403);
  });

  test('calcula métricas de reativação', () => {
    const leads = [
      {
        id: 'lead-1',
        prioridade: 'QUENTE',
        statusFinal: 'CONVERTIDO',
        origemConversao: 'reativacao',
        reativacaoEnviadaEm: new Date(),
        reativacaoRespondidaEm: new Date(),
        criadoEm: now,
        valorEntrada: 1200,
        valorExito: 0,
        valorEstimado: 0,
      },
    ];

    const metrics = buildMetrics({ tenant, leads, now });

    expect(metrics.reativacao.enviados).toBe(1);
    expect(metrics.reativacao.responderam).toBe(1);
    expect(metrics.reativacao.convertidos).toBe(1);
    expect(metrics.reativacao.receitaGerada).toBe(1200);
  });

  test('normaliza status oficiais', () => {
    expect(normalizeStatus('agendado')).toBe('AGENDADO');
    expect(normalizeStatus('qualquer')).toBe('NOVO');
    expect(normalizeFinalStatus('convertido')).toBe('CONVERTIDO');
    expect(normalizeFinalStatus('qualquer')).toBeNull();
  });
});
