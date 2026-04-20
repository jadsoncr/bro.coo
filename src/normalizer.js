/**
 * Normaliza a entrada do webhook.
 * @param {{ sessao: string, mensagem: string, canal: string }} input
 * @returns {{ sessao: string, mensagem: string, canal: string, dataHora: string }}
 */
function normalize(input) {
  const sessao = String(input.sessao || input.telefone || input.Telefone || '').replace(/\D/g, '');
  const mensagem = String(input.mensagem || '').trim().toLowerCase();
  const canal = String(input.canal || '').toLowerCase();
  const dataHora = new Date().toISOString();

  return { sessao, mensagem, canal, dataHora };
}

module.exports = normalize;
