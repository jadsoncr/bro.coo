const normalize = require('../src/normalizer');

describe('normalizer', () => {
  test('limpa sessao removendo nao-numericos', () => {
    const result = normalize({ sessao: '+55 (11) 99999-9999', mensagem: 'oi', canal: 'WhatsApp' });
    expect(result.sessao).toBe('5511999999999');
  });

  test('faz trim e lowercase na mensagem', () => {
    const result = normalize({ sessao: '11999', mensagem: '  OLÁ  ', canal: 'whatsapp' });
    expect(result.mensagem).toBe('olá');
  });

  test('normaliza canal para lowercase', () => {
    const result = normalize({ sessao: '11999', mensagem: 'oi', canal: 'WHATSAPP' });
    expect(result.canal).toBe('whatsapp');
  });

  test('adiciona dataHora em formato ISO', () => {
    const result = normalize({ sessao: '11999', mensagem: 'oi', canal: 'whatsapp' });
    expect(result.dataHora).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('mensagem vazia vira string vazia', () => {
    const result = normalize({ sessao: '11999', mensagem: null, canal: 'whatsapp' });
    expect(result.mensagem).toBe('');
  });
});
