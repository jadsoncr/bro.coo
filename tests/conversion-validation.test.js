const { validateConversion, VALID_TIPOS } = require('../src/conversion/validation');

describe('conversion/validation', () => {
  // --- tipoContrato validation ---
  test('rejects null/undefined data', () => {
    expect(validateConversion(null)).toEqual({ valid: false, error: expect.stringContaining('obrigatórios') });
  });

  test('rejects missing tipoContrato', () => {
    const result = validateConversion({});
    expect(result.valid).toBe(false);
    expect(result.error).toContain('tipoContrato');
  });

  test('rejects invalid tipoContrato', () => {
    const result = validateConversion({ tipoContrato: 'invalido' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('tipoContrato');
  });

  // --- entrada ---
  test('entrada: valid with valorEntrada > 0', () => {
    expect(validateConversion({ tipoContrato: 'entrada', valorEntrada: 500 })).toEqual({ valid: true });
  });

  test('entrada: rejects without valorEntrada', () => {
    const result = validateConversion({ tipoContrato: 'entrada' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('valorEntrada');
    expect(result.error).toContain('entrada');
  });

  test('entrada: rejects valorEntrada = 0', () => {
    const result = validateConversion({ tipoContrato: 'entrada', valorEntrada: 0 });
    expect(result.valid).toBe(false);
  });

  // --- entrada_exito ---
  test('entrada_exito: valid with all required fields', () => {
    const result = validateConversion({
      tipoContrato: 'entrada_exito',
      valorEntrada: 1000,
      percentualExito: 30,
      valorCausa: 50000,
    });
    expect(result).toEqual({ valid: true });
  });

  test('entrada_exito: rejects without valorEntrada', () => {
    const result = validateConversion({
      tipoContrato: 'entrada_exito',
      percentualExito: 30,
      valorCausa: 50000,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('valorEntrada');
  });

  test('entrada_exito: rejects percentualExito > 100', () => {
    const result = validateConversion({
      tipoContrato: 'entrada_exito',
      valorEntrada: 1000,
      percentualExito: 150,
      valorCausa: 50000,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('percentualExito');
  });

  test('entrada_exito: rejects without valorCausa', () => {
    const result = validateConversion({
      tipoContrato: 'entrada_exito',
      valorEntrada: 1000,
      percentualExito: 30,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('valorCausa');
  });

  // --- exito ---
  test('exito: valid with percentualExito and valorCausa', () => {
    const result = validateConversion({
      tipoContrato: 'exito',
      percentualExito: 20,
      valorCausa: 100000,
    });
    expect(result).toEqual({ valid: true });
  });

  test('exito: rejects negative percentualExito', () => {
    const result = validateConversion({
      tipoContrato: 'exito',
      percentualExito: -5,
      valorCausa: 100000,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('percentualExito');
  });

  test('exito: rejects without valorCausa', () => {
    const result = validateConversion({
      tipoContrato: 'exito',
      percentualExito: 20,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('valorCausa');
  });

  // --- consulta ---
  test('consulta: valid with valorConsulta > 0', () => {
    expect(validateConversion({ tipoContrato: 'consulta', valorConsulta: 300 })).toEqual({ valid: true });
  });

  test('consulta: rejects without valorConsulta', () => {
    const result = validateConversion({ tipoContrato: 'consulta' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('valorConsulta');
  });

  // --- outro ---
  test('outro: valid with at least one value > 0', () => {
    expect(validateConversion({ tipoContrato: 'outro', valorEntrada: 100 })).toEqual({ valid: true });
    expect(validateConversion({ tipoContrato: 'outro', valorConsulta: 200 })).toEqual({ valid: true });
    expect(validateConversion({ tipoContrato: 'outro', valorCausa: 300 })).toEqual({ valid: true });
  });

  test('outro: rejects with all values zero or missing', () => {
    const result = validateConversion({ tipoContrato: 'outro' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('outro');
  });

  // --- edge: percentualExito boundary ---
  test('entrada_exito: accepts percentualExito = 0', () => {
    const result = validateConversion({
      tipoContrato: 'entrada_exito',
      valorEntrada: 1000,
      percentualExito: 0,
      valorCausa: 50000,
    });
    expect(result).toEqual({ valid: true });
  });

  test('entrada_exito: accepts percentualExito = 100', () => {
    const result = validateConversion({
      tipoContrato: 'entrada_exito',
      valorEntrada: 1000,
      percentualExito: 100,
      valorCausa: 50000,
    });
    expect(result).toEqual({ valid: true });
  });
});
