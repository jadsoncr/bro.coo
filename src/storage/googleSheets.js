const { google } = require('googleapis');
const { randomUUID } = require('crypto');

const SPREADSHEET_ID = (process.env.GOOGLE_SHEETS_ID || '').trim();

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não definida');
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function appendRow(tab, values) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

function fmt(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'SIM' : 'NAO';
  return String(val);
}

async function createLead(data) {
  const leadId = data.leadId || randomUUID();
  const row = [
    new Date().toISOString(),
    leadId,
    fmt(data.status || 'NOVO'),
    fmt(data.nome),
    fmt(data.telefone),
    fmt(data.area || data.fluxo),
    fmt(data.situacao),
    fmt(data.impacto),
    fmt(data.intencao),
    fmt(data.score),
    fmt(data.prioridade),
    fmt(data.flagAtencao),
    fmt(data.canalOrigem),
    fmt(data.resumo || data.ultimaMensagem),
  ];
  await appendRow('Leads', row);
  return leadId;
}

async function createClient(data) {
  const leadId = data.leadId || randomUUID();
  const row = [
    new Date().toISOString(),
    leadId,
    fmt(data.status || 'NOVO'),
    fmt(data.nome),
    fmt(data.telefone),
    'cliente',
    '',
    '',
    '',
    '',
    fmt(data.urgencia),
    '',
    fmt(data.canalOrigem),
    fmt(data.conteudo),
  ];
  await appendRow('Clientes', row);
  return leadId;
}

async function createOther(data) {
  const leadId = data.leadId || randomUUID();
  const row = [
    new Date().toISOString(),
    leadId,
    fmt(data.status || 'NOVO'),
    fmt(data.nome),
    fmt(data.telefone),
    'outros',
    fmt(data.tipo),
    '',
    '',
    '',
    '',
    '',
    fmt(data.canalOrigem),
    fmt(data.conteudo),
  ];
  await appendRow('Outros', row);
  return leadId;
}

// Cabeçalho da aba Abandonos (colar na linha 1 da planilha):
// data_hora | sessao_id | fluxo | ultimo_estado | score | prioridade | nome | canal_origem | mensagens_enviadas | classificacao
const ABANDONOS_HEADER = [
  'data_hora',
  'sessao_id',
  'fluxo',
  'ultimo_estado',
  'score',
  'prioridade',
  'nome',
  'canal_origem',
  'mensagens_enviadas',
  'classificacao',
];

async function ensureAbandonosHeader() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Abandonos!A1',
  });
  const firstCell = res.data.values?.[0]?.[0];
  if (!firstCell) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Abandonos!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [ABANDONOS_HEADER] },
    });
  }
}

// classificacao: PRECOCE | MEDIO | VALIOSO
function classificarAbandono(ultimoEstado) {
  const finais = ['coleta_nome', 'contato_confirmacao', 'contato_numero', 'contato_canal'];
  const iniciais = ['start', 'fallback'];
  if (iniciais.includes(ultimoEstado)) return 'PRECOCE';
  if (finais.includes(ultimoEstado)) return 'VALIOSO';
  return 'MEDIO';
}

async function createAbandono(data) {
  await ensureAbandonosHeader();
  const row = [
    new Date().toISOString(),
    fmt(data.sessao),
    fmt(data.fluxo),
    fmt(data.ultimoEstado),
    fmt(data.score),
    fmt(data.prioridade),
    fmt(data.nome),
    fmt(data.canalOrigem),
    fmt(data.mensagensEnviadas),
    classificarAbandono(data.ultimoEstado),
  ];
  await appendRow('Abandonos', row);
}

async function getSession() {
  throw new Error('Google Sheets adapter não suporta getSession. Use STORAGE_ADAPTER=memory para sessões.');
}

async function updateSession() {
  throw new Error('Google Sheets adapter não suporta updateSession. Use STORAGE_ADAPTER=memory para sessões.');
}

module.exports = { createLead, createClient, createOther, createAbandono, getSession, updateSession };
