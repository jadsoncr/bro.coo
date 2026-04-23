const DEFAULT_CONFIG = {
  apiUrl: import.meta.env.VITE_API_URL || '',
  adminToken: import.meta.env.VITE_ADMIN_TOKEN || '',
  tenantId: import.meta.env.VITE_TENANT_ID || '',
};

const STORAGE_KEY = 'brocco.dashboard.config';
const TOKEN_KEY = 'brocco.jwt';

// ═══ JWT token management ═══

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ═══ Config management (legacy admin) ═══

export function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function headers(config) {
  return {
    'Content-Type': 'application/json',
    'x-admin-token': config.adminToken,
    'x-tenant-id': config.tenantId,
  };
}

function authHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ═══ Legacy request (admin-token based) ═══

export async function request(config, path, options = {}) {
  const baseUrl = config.apiUrl.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...headers(config), ...(options.headers || {}) },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || `Erro ${response.status}`);
  }

  return data;
}

// ═══ JWT-based request (operator/owner) ═══

export async function authRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || `Erro ${response.status}`);
  }

  return data;
}

// ═══ Legacy API functions ═══

export function getMetrics(config) {
  return request(config, '/api/metrics');
}

export function getLeads(config) {
  return request(config, '/api/leads');
}

export function getLead(config, id) {
  return request(config, `/api/leads/${id}`);
}

export function markResult(config, id, statusFinal) {
  return request(config, `/api/leads/${id}/result`, {
    method: 'POST',
    body: JSON.stringify({
      status_final: statusFinal,
      origemConversao: statusFinal === 'CONVERTIDO' ? 'atendimento' : null,
    }),
  });
}

export function getReactivation(config) {
  return request(config, '/api/reactivation');
}

export function getTenantConfig(config) {
  return request(config, '/api/tenant/config');
}

export function patchTenantConfig(config, data) {
  return request(config, '/api/tenant/config', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ═══ Operator API functions (JWT-based) ═══

export function getOperatorLeads(filters = {}, tenantId) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.prioridade) params.set('prioridade', filters.prioridade);
  if (filters.slaStatus) params.set('slaStatus', filters.slaStatus);
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/operator/leads${qs ? `?${qs}` : ''}`);
}

export function getOperatorLeadDetail(leadId, tenantId) {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/operator/leads/${leadId}${qs ? `?${qs}` : ''}`);
}

export function assumirLead(leadId, tenantId) {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/operator/leads/${leadId}/assumir${qs ? `?${qs}` : ''}`, { method: 'PATCH' });
}

export function sendOperatorMessage(leadId, texto, tenantId) {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/operator/leads/${leadId}/messages${qs ? `?${qs}` : ''}`, {
    method: 'POST',
    body: JSON.stringify({ texto }),
  });
}

export function convertLead(leadId, formData, tenantId) {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/operator/leads/${leadId}/converter${qs ? `?${qs}` : ''}`, {
    method: 'POST',
    body: JSON.stringify(formData),
  });
}

export function updateLeadStatus(leadId, status, tenantId) {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/operator/leads/${leadId}/status${qs ? `?${qs}` : ''}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function desistirLead(leadId, motivo, tenantId) {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/operator/leads/${leadId}/desistir${qs ? `?${qs}` : ''}`, {
    method: 'PATCH',
    body: JSON.stringify({ motivo }),
  });
}

export function advanceLeadStage(leadId, estagio, tenantId) {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/operator/leads/${leadId}/estagio${qs ? `?${qs}` : ''}`, {
    method: 'PATCH',
    body: JSON.stringify({ estagio }),
  });
}

// ═══ Auth API ═══

export function login(email, senha) {
  return fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  }).then(async (res) => {
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
    return data;
  });
}

// ═══ Owner API functions (JWT-based) ═══

export function getOwnerMetrics(periodo = 'mes', tenantId) {
  const params = new URLSearchParams();
  params.set('periodo', periodo);
  if (tenantId) params.set('tenantId', tenantId);
  return authRequest(`/owner/metrics?${params.toString()}`);
}

export function getOwnerFunil(tenantId) {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/owner/funil${qs ? `?${qs}` : ''}`);
}

export function getOwnerAlerts(tenantId) {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/owner/alerts${qs ? `?${qs}` : ''}`);
}

export function getOwnerConfig(tenantId) {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/owner/tenant/config${qs ? `?${qs}` : ''}`);
}

export function patchOwnerConfig(data, tenantId) {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/owner/tenant/config${qs ? `?${qs}` : ''}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function getOwnerLeads(filters = {}, tenantId) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.slaStatus) params.set('slaStatus', filters.slaStatus);
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/owner/leads${qs ? `?${qs}` : ''}`);
}

export function getOwnerCasos(filters = {}, tenantId) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/owner/casos${qs ? `?${qs}` : ''}`);
}

// ═══ Master API functions (JWT-based for MASTER role, fallback to admin-token) ═══

const MASTER_TOKEN_KEY = 'brocco.master.token';

export function setMasterToken(token) {
  localStorage.setItem(MASTER_TOKEN_KEY, token);
}

export function getMasterToken() {
  return localStorage.getItem(MASTER_TOKEN_KEY) || '';
}

export function clearMasterToken() {
  localStorage.removeItem(MASTER_TOKEN_KEY);
}

export async function masterRequest(path, options = {}) {
  // If user has a JWT token, try JWT auth first (MASTER role)
  const jwt = getToken();
  if (jwt) {
    const response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (response.ok) return data;
    // If JWT fails with 401, fall through to admin token
    if (response.status !== 401) throw new Error(data?.error || `Erro ${response.status}`);
  }

  // Fallback to x-admin-token
  const token = getMasterToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || `Erro ${response.status}`);
  return data;
}

export function getMasterTenants() {
  return masterRequest('/master/tenants');
}

export function getMasterGlobalMetrics() {
  return masterRequest('/master/global/metrics');
}

export function getMasterLossPatterns() {
  return masterRequest('/master/global/loss-patterns');
}

export function getMasterBenchmarks() {
  return masterRequest('/master/global/benchmarks');
}

export function getMasterAuditLog() {
  return masterRequest('/master/audit-log');
}


// ═══ WhatsApp API functions (JWT-based) ═══

export function getWhatsAppConfig(tenantId) {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/owner/tenant/config${qs ? `?${qs}` : ''}`);
}

export function saveWhatsAppConfig(data, tenantId) {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/owner/tenant/whatsapp${qs ? `?${qs}` : ''}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function testWhatsAppConnection(tenantId) {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  const qs = params.toString();
  return authRequest(`/owner/tenant/whatsapp/test${qs ? `?${qs}` : ''}`, { method: 'POST' });
}

// ═══ Simulate API (JWT-based) ═══

export function simulateMessage(message) {
  return authRequest('/simulate', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

// ═══ Register API ═══

export function registerAccount({ nome, email, senha, empresa, segmento, moeda }) {
  return fetch('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, email, senha, empresa, segmento, moeda }),
  }).then(async (res) => {
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
    return data;
  });
}
