// src/conversion/validation.js

const VALID_TIPOS = ['entrada', 'entrada_exito', 'exito', 'consulta', 'outro'];

/**
 * Validate conversion form data based on tipoContrato rules.
 * @param {object} data
 * @returns {{valid: boolean, error?: string}}
 */
function validateConversion(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Dados de conversão são obrigatórios' };
  }

  const { tipoContrato, valorEntrada, percentualExito, valorCausa, valorConsulta } = data;

  if (!tipoContrato || !VALID_TIPOS.includes(tipoContrato)) {
    return { valid: false, error: `tipoContrato é obrigatório e deve ser um de: ${VALID_TIPOS.join(', ')}` };
  }

  switch (tipoContrato) {
    case 'entrada':
      if (!valorEntrada || Number(valorEntrada) <= 0) {
        return { valid: false, error: "valorEntrada é obrigatório para tipoContrato 'entrada'" };
      }
      break;

    case 'entrada_exito':
      if (!valorEntrada || Number(valorEntrada) <= 0) {
        return { valid: false, error: "valorEntrada é obrigatório para tipoContrato 'entrada_exito'" };
      }
      if (percentualExito === undefined || percentualExito === null || Number(percentualExito) < 0 || Number(percentualExito) > 100) {
        return { valid: false, error: "percentualExito deve estar entre 0 e 100 para tipoContrato 'entrada_exito'" };
      }
      if (!valorCausa || Number(valorCausa) <= 0) {
        return { valid: false, error: "valorCausa é obrigatório para tipoContrato 'entrada_exito'" };
      }
      break;

    case 'exito':
      if (percentualExito === undefined || percentualExito === null || Number(percentualExito) < 0 || Number(percentualExito) > 100) {
        return { valid: false, error: "percentualExito deve estar entre 0 e 100 para tipoContrato 'exito'" };
      }
      if (!valorCausa || Number(valorCausa) <= 0) {
        return { valid: false, error: "valorCausa é obrigatório para tipoContrato 'exito'" };
      }
      break;

    case 'consulta':
      if (!valorConsulta || Number(valorConsulta) <= 0) {
        return { valid: false, error: "valorConsulta é obrigatório para tipoContrato 'consulta'" };
      }
      break;

    case 'outro':
      if (
        (!valorEntrada || Number(valorEntrada) <= 0) &&
        (!valorConsulta || Number(valorConsulta) <= 0) &&
        (!valorCausa || Number(valorCausa) <= 0)
      ) {
        return { valid: false, error: "Pelo menos um campo de valor deve ser maior que 0 para tipoContrato 'outro'" };
      }
      break;
  }

  return { valid: true };
}

module.exports = { validateConversion, VALID_TIPOS };
