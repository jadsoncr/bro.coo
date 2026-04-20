require('dotenv').config();
const { createLead, createClient, createOther } = require('./src/storage/googleSheets');

async function run() {
  console.log('Testando Google Sheets adapter...\n');

  const leadId = await createLead({
    nome: 'Teste Trabalhista',
    telefone: '21999999991',
    area: 'trabalhista',
    situacao: 'Fui demitido sem justa causa',
    impacto: 3,
    intencao: 3,
    score: 7,
    prioridade: 'QUENTE',
    flagAtencao: true,
    canalOrigem: 'whatsapp',
    resumo: 'Preciso de ajuda urgente',
    status: 'NOVO',
  });
  console.log('createLead OK — leadId:', leadId);

  const clientId = await createClient({
    nome: 'Teste Cliente',
    telefone: '21999999992',
    urgencia: 'MEDIO',
    flagAtencao: false,
    canalOrigem: 'whatsapp',
    conteudo: 'Quero atualização do meu processo',
    status: 'NOVO',
  });
  console.log('createClient OK — leadId:', clientId);

  const otherId = await createOther({
    nome: 'Teste Outros',
    telefone: '21999999993',
    tipo: 'Contrato comercial',
    canalOrigem: 'whatsapp',
    conteudo: 'Preciso revisar um contrato',
    status: 'NOVO',
  });
  console.log('createOther OK — leadId:', otherId);

  console.log('\nTodos os registros inseridos. Verifique a planilha.');
}

run().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
