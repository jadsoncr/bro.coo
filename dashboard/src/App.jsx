import { useEffect, useMemo, useState, useCallback } from 'react';
import { connectSocket, disconnectSocket } from './lib/socket.js';
import DecisionBanner from './components/DecisionBanner.jsx';
import KpiBar from './components/KpiBar.jsx';
import LeadDetail from './components/LeadDetail.jsx';
import LeadInbox from './components/LeadInbox.jsx';
import ReactivationBox from './components/ReactivationBox.jsx';
import FinanceConfig from './components/FinanceConfig.jsx';
import OperatorInterface from './components/OperatorInterface.jsx';
import OwnerDashboard from './components/OwnerDashboard.jsx';
import MasterPanel from './components/MasterPanel.jsx';
import LoginPage from './components/LoginPage.jsx';
import ConfigPage from './components/ConfigPage.jsx';
import RegisterPage from './components/RegisterPage.jsx';
import WelcomePage from './components/WelcomePage.jsx';
import BillingBanner from './components/BillingBanner.jsx';
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
  getToken,
  clearToken,
  getOwnerConfig,
} from './lib/api.js';
import './styles.css';

// ═══ JWT decode (base64, no crypto) ═══

function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { userId: payload.userId, tenantId: payload.tenantId, role: payload.role };
  } catch {
    return null;
  }
}

// ═══ Legacy ConnectionBar (for day-zero / admin mode) ═══

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

// ═══ Legacy App (day-zero / admin-token mode) ═══

function LegacyApp() {
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
    if (mode === 'day-zero') { loadDayZero(); return; }
    setLoading(true);
    setError('');
    try {
      const [metricsData, leadsData, reactivationData, tenantData] = await Promise.all([
        getMetrics(config), getLeads(config), getReactivation(config), getTenantConfig(config),
      ]);
      const rows = leadsData.leads || [];
      setMetrics(metricsData);
      setLeads(rows);
      setReactivation(reactivationData);
      setTenantConfig(tenantData);
      setSelectedId((current) => current || rows[0]?.id || null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function loadSelectedLead(id) {
    if (!id) { setSelectedLead(null); return; }
    if (mode === 'day-zero') { setSelectedLead(getDayZeroLead(id)); return; }
    setDetailLoading(true);
    setError('');
    try {
      const data = await getLead(config, id);
      setSelectedLead(data.lead);
    } catch (err) { setError(err.message); setSelectedLead(selectedFromList || null); }
    finally { setDetailLoading(false); }
  }

  async function mark(statusFinal) {
    if (!selectedId) return;
    setError('');
    if (mode === 'day-zero') {
      const updated = leads.map((lead) => lead.id === selectedId
        ? { ...lead, statusFinal, status: 'EM_ATENDIMENTO', slaStatus: 'finalizado',
            origemConversao: statusFinal === 'CONVERTIDO' ? (lead.origemConversao || 'atendimento') : null }
        : lead);
      setLeads(updated);
      setSelectedLead(updated.find((lead) => lead.id === selectedId));
      return;
    }
    try { await markResult(config, selectedId, statusFinal); await refresh(); await loadSelectedLead(selectedId); }
    catch (err) { setError(err.message); }
  }

  async function saveFinance(data) {
    setSaving(true); setError('');
    if (mode === 'day-zero') {
      const nextTenant = { ...tenantConfig, ...data };
      setTenantConfig(nextTenant);
      setMetrics({ ...metrics, tenant: nextTenant });
      setSaving(false);
      return;
    }
    try { await patchTenantConfig(config, data); await refresh(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  useEffect(() => { refresh(); }, [config]);
  useEffect(() => { loadSelectedLead(selectedId); }, [selectedId]);
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
        <LeadDetail lead={selectedLead || selectedFromList} loading={detailLoading}
          onConverted={() => mark('CONVERTIDO')} onLost={() => mark('PERDIDO')} />
      </section>
      <section className="bottom-grid">
        <ReactivationBox data={reactivation} />
        <FinanceConfig config={tenantConfig} onSave={saveFinance} saving={saving} />
      </section>
    </main>
  );
}

// ═══ Main App with auth routing ═══

export default function App() {
  const [view, setView] = useState(() => {
    // Check for /boas-vindas redirect from Mercado Pago
    const path = window.location.pathname;
    if (path === '/boas-vindas') {
      return 'register';
    }

    const token = getToken();
    if (token) {
      const claims = decodeJWT(token);
      if (claims?.role === 'MASTER') return 'master';
      if (claims?.role === 'OPERATOR') return 'operator';
      if (claims?.role === 'OWNER') return 'owner';
    }
    return 'login';
  });

  const [activeTenantId, setActiveTenantId] = useState(null);
  const [billing, setBilling] = useState({ billingStatus: 'active', billingDueDate: null });

  // Load billing status when view changes to an authenticated view
  useEffect(() => {
    if (['operator', 'owner', 'config'].includes(view) && getToken()) {
      // MASTER without activeTenantId: skip billing check (MASTER is never billed)
      const role = decodeJWT(getToken())?.role;
      if (role === 'MASTER' && !activeTenantId) return;

      getOwnerConfig(activeTenantId).then(data => {
        if (data?.billingStatus) {
          setBilling({ billingStatus: data.billingStatus, billingDueDate: data.billingDueDate });
        }
      }).catch(() => {
        // Billing check failed — don't block, assume active
        setBilling({ billingStatus: 'active', billingDueDate: null });
      });
    }
  }, [view, activeTenantId]);

  const userRole = (() => {
    const token = getToken();
    if (!token) return null;
    return decodeJWT(token)?.role || null;
  })();

  function handleLogin() {
    const token = getToken();
    const claims = decodeJWT(token);
    if (claims?.role === 'MASTER') setView('master');
    else if (claims?.role === 'OPERATOR') setView('operator');
    else if (claims?.role === 'OWNER') setView('owner');
    else setView('login');
  }

  function handleLogout() {
    clearToken();
    setActiveTenantId(null);
    setView('login');
  }

  if (view === 'master') {
    return (
      <div>
        <header className="app-header">
          <strong>BRO Revenue — Consolidado</strong>
          <div className="connection-actions">
            <button className="secondary" type="button" onClick={handleLogout}>Sair</button>
          </div>
        </header>
        <MasterPanel onViewTenant={(tenantId, viewType) => {
          setActiveTenantId(tenantId);
          setView(viewType);
        }} />
      </div>
    );
  }

  if (view === 'login') {
    return (
      <div>
        <LoginPage onLogin={handleLogin} />
        <div style={{ textAlign: 'center', padding: '10px' }}>
          <button className="secondary" type="button" onClick={() => setView('register')} style={{ fontSize: 13 }}>
            Criar conta
          </button>
        </div>
      </div>
    );
  }

  if (view === 'register') {
    return (
      <div>
        <RegisterPage onRegistered={() => {
          handleLogin();
          setView('welcome');
        }} />
        <div style={{ textAlign: 'center', padding: '10px' }}>
          <button className="secondary" type="button" onClick={() => setView('login')} style={{ fontSize: 13 }}>
            Já tenho conta
          </button>
        </div>
      </div>
    );
  }

  if (view === 'welcome') {
    return (
      <WelcomePage
        onGoToDashboard={() => {
          const token = getToken();
          const claims = decodeJWT(token);
          setView(claims?.role === 'OWNER' ? 'owner' : 'operator');
        }}
        onGoToConfig={() => setView('config')}
      />
    );
  }

  if (view === 'operator') {
    return (
      <div>
        <BillingBanner billingStatus={billing.billingStatus} billingDueDate={billing.billingDueDate} />
        <header className="app-header">
          <strong>BRO Revenue — Operação</strong>
          <div className="connection-actions">
            {userRole === 'MASTER' && <button className="secondary" type="button" onClick={() => setView('master')}>Consolidado</button>}
            {userRole === 'MASTER' && activeTenantId && <button className="secondary" type="button" onClick={() => setView('owner')}>Dashboard</button>}
            {userRole === 'OWNER' && <button className="secondary" type="button" onClick={() => setView('owner')}>Dashboard</button>}
            <button className="secondary" type="button" onClick={handleLogout}>Sair</button>
          </div>
        </header>
        <OperatorInterface tenantId={userRole === 'MASTER' ? activeTenantId : null} />
      </div>
    );
  }

  if (view === 'config') {
    return (
      <div>
        <BillingBanner billingStatus={billing.billingStatus} billingDueDate={billing.billingDueDate} />
        <header className="app-header">
          <strong>BRO Revenue — Configurações</strong>
          <div className="connection-actions">
            <button className="secondary" type="button" onClick={() => setView('owner')}>Dashboard</button>
            <button className="secondary" type="button" onClick={handleLogout}>Sair</button>
          </div>
        </header>
        <ConfigPage tenantId={userRole === 'MASTER' ? activeTenantId : null} />
      </div>
    );
  }

  if (view === 'owner') {
    return (
      <div>
        <BillingBanner billingStatus={billing.billingStatus} billingDueDate={billing.billingDueDate} />
        <header className="app-header">
          <strong>BRO Revenue — Dashboard</strong>
          <div className="connection-actions">
            {userRole === 'MASTER' && <button className="secondary" type="button" onClick={() => setView('master')}>Consolidado</button>}
            {userRole === 'MASTER' && activeTenantId && <button className="secondary" type="button" onClick={() => setView('operator')}>Operação</button>}
            {userRole === 'OPERATOR' && <button className="secondary" type="button" onClick={() => setView('operator')}>Operação</button>}
            <button className="secondary" type="button" onClick={() => setView('config')}>Config</button>
            <button className="secondary" type="button" onClick={handleLogout}>Sair</button>
          </div>
        </header>
        <OwnerDashboard tenantId={userRole === 'MASTER' ? activeTenantId : null} onNavigateOperator={() => setView('operator')} />
      </div>
    );
  }

  // Legacy mode
  return (
    <div>
      <div className="app-header">
        <strong>BRO Resolve — Legacy</strong>
        <button className="secondary" type="button" onClick={() => setView('login')}>Voltar ao login</button>
      </div>
      <LegacyApp />
    </div>
  );
}
