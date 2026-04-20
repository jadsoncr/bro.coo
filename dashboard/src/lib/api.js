const DEFAULT_CONFIG = {
  apiUrl: import.meta.env.VITE_API_URL || '',
  adminToken: import.meta.env.VITE_ADMIN_TOKEN || '',
  tenantId: import.meta.env.VITE_TENANT_ID || '',
};

const STORAGE_KEY = 'brocco.dashboard.config';

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
