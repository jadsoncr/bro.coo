import { useEffect, useMemo, useState } from 'react';
import { connectSocket, disconnectSocket } from './lib/socket.js';
import DecisionBanner from './components/DecisionBanner.jsx';
import KpiBar from './components/KpiBar.jsx';
import LeadDetail from './components/LeadDetail.jsx';
import LeadInbox from './components/LeadInbox.jsx';
import ReactivationBox from './components/ReactivationBox.jsx';
import FinanceConfig from './components/FinanceConfig.jsx';
import { dayZeroLeads, dayZeroMetrics, dayZeroTenantConfig, getDayZeroLead } from './lib/dayZero.js';
import {
  getLead,
  getLeads,
  getMetrics,
  getReactivation,
  getTenantConfig,
  loadConfig,
  markResult,
  patchTenantConfig,
  saveConfig,
} from './lib/api.js';
import './styles.css';

function ConnectionBar({ config, onChange, onRefresh, loading }) {
  const [open, setOpen] = useState(!config.adminToken || !config.tenantId);
  const [draft, setDraft] = useState(config);

  function submit(event) {
    event.preventDefault();
    saveConfig(draft);
    onChange(draft);
    setOpen(false);
  }

  return (
    <section className="connection">
      <div>
        <strong>Revenue OS Jurídico</strong>
        <span>{config.tenantId ? `Tenant ${config.tenantId}` : 'Configure o tenant local'}</span>
      </div>
      <div className="connection-actions">
        <button className="secondary" type="button" onClick={() => setOpen(!open)}>
          Configurar API
        </button>
        <button type="button" onClick={onRefresh} disabled={loading}>
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {open && (
        <form className="connection-form" onSubmit={submit}>
          <label>
            API URL
            <input value={draft.apiUrl} onChange={(event) => setDraft({ ...draft, apiUrl: event.target.value })} />
          </label>
          <label>
            Admin token
            <input value={draft.adminToken} onChange={(event) => setDraft({ ...draft, adminToken: event.target.value })} />
          </label>
          <label>
            Tenant ID
            <input value={draft.tenantId} onChange={(event) => setDraft({ ...draft, tenantId: event.target.value })} />
          </label>
          <button type="submit">Usar estes dados</button>
        </form>
      )}
    </section>
  );
}

export default function App() {
  const [config, setConfig] = useState(loadConfig);
  const [metrics, setMetrics] = useState(null);
  const [leads, setLeads] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [reactivation, setReactivation] = useState(null);
  const [tenantConfig, setTenantConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('api');

  const selectedFromList = useMemo(
    () => leads.find((lead) => lead.id === selectedId),
    [leads, selectedId]
  );
  const attendNow = useMemo(
    () => leads.find((lead) => !lead.statusFinal && lead.slaStatus === 'atrasado') ||
      leads.find((lead) => !lead.statusFinal && lead.prioridade === 'QUENTE') ||
      leads.find((lead) => !lead.statusFinal) ||
      null,
    [leads]
  );

  function loadDayZero() {
    setMode('day-zero');
    setError('');
    setMetrics(dayZeroMetrics);
    setLeads(dayZeroLeads);
    setReactivation(dayZeroMetrics.reativacao);
    setTenantConfig(dayZeroTenantConfig);
    setSelectedId('dz-1');
    setSelectedLead(getDayZeroLead('dz-1'));
  }

  async function refresh() {
    if (mode === 'day-zero') {
      loadDayZero();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [metricsData, leadsData, reactivationData, tenantData] = await Promise.all([
        getMetrics(config),
        getLeads(config),
        getReactivation(config),
        getTenantConfig(config),
      ]);
      const rows = leadsData.leads || [];
      setMetrics(metricsData);
      setLeads(rows);
      setReactivation(reactivationData);
      setTenantConfig(tenantData);
      setSelectedId((current) => current || rows[0]?.id || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSelectedLead(id) {
    if (!id) {
      setSelectedLead(null);
      return;
    }
    if (mode === 'day-zero') {
      setSelectedLead(getDayZeroLead(id));
      return;
    }
    setDetailLoading(true);
    setError('');
    try {
      const data = await getLead(config, id);
      setSelectedLead(data.lead);
    } catch (err) {
      setError(err.message);
      setSelectedLead(selectedFromList || null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function mark(statusFinal) {
    if (!selectedId) return;
    setError('');
    if (mode === 'day-zero') {
      const updated = leads.map((lead) => lead.id === selectedId
        ? {
          ...lead,
          statusFinal,
          status: 'EM_ATENDIMENTO',
          slaStatus: 'finalizado',
          origemConversao: statusFinal === 'CONVERTIDO' ? (lead.origemConversao || 'atendimento') : null,
        }
        : lead);
      setLeads(updated);
      setSelectedLead(updated.find((lead) => lead.id === selectedId));
      return;
    }
    try {
      await markResult(config, selectedId, statusFinal);
      await refresh();
      await loadSelectedLead(selectedId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveFinance(data) {
    setSaving(true);
    setError('');
    if (mode === 'day-zero') {
      const nextTenant = { ...tenantConfig, ...data };
      setTenantConfig(nextTenant);
      setMetrics({ ...metrics, tenant: nextTenant });
      setSaving(false);
      return;
    }
    try {
      await patchTenantConfig(config, data);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [config]);

  useEffect(() => {
    loadSelectedLead(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!config.apiUrl || !config.tenantId || mode === 'day-zero') return;
    const socket = connectSocket(config.apiUrl, config.tenantId, refresh, refresh);
    return () => disconnectSocket();
  }, [config.apiUrl, config.tenantId, mode]);

  return (
    <main>
      <ConnectionBar config={config} onChange={setConfig} onRefresh={refresh} loading={loading} />

      {error && <p className="error">{error}</p>}

      <section className="hero-strip">
        <img src="https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=480&q=70" alt="" />
        <div>
          <span className="eyebrow">Decisão em 3 segundos</span>
          <h1>Atenda primeiro o lead que protege receita agora.</h1>
        </div>
      </section>

      <section className="test-strip">
        <div>
          <strong>{mode === 'day-zero' ? 'Dia Zero ativo' : 'Modo API local'}</strong>
          <span>Teste: 5 leads, 2 abandonos, reativação, 2 conversões.</span>
        </div>
        <button type="button" onClick={loadDayZero}>Carregar Dia Zero</button>
      </section>

      <DecisionBanner lead={attendNow} metrics={metrics} onSelect={setSelectedId} />
      <KpiBar metrics={metrics} />

      <section className="workspace">
        <LeadInbox leads={leads} selectedId={selectedId} onSelect={setSelectedId} />
        <LeadDetail
          lead={selectedLead || selectedFromList}
          loading={detailLoading}
          onConverted={() => mark('CONVERTIDO')}
          onLost={() => mark('PERDIDO')}
        />
      </section>

      <section className="bottom-grid">
        <ReactivationBox data={reactivation} />
        <FinanceConfig config={tenantConfig} onSave={saveFinance} saving={saving} />
      </section>
    </main>
  );
}
