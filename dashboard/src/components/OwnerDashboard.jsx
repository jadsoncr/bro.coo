import { useEffect, useState, useCallback } from 'react';
import {
  getOwnerMetrics,
  getOwnerFunil,
  getOwnerAlerts,
  getOwnerConfig,
  getOwnerLeads,
  getOwnerCasos,
  getToken,
} from '../lib/api.js';

const moneyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
});

function money(v) { return moneyFmt.format(Number(v || 0)); }

const PERIODOS = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
];

export default function OwnerDashboard({ tenantId, onNavigateOperator }) {
  const [periodo, setPeriodo] = useState('mes');
  const [metrics, setMetrics] = useState(null);
  const [funil, setFunil] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // "Ver problema" drill-down
  const [drillView, setDrillView] = useState(null); // { type, items }
  const [drillLoading, setDrillLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [m, f, a, c] = await Promise.all([
        getOwnerMetrics(periodo, tenantId),
        getOwnerFunil(tenantId),
        getOwnerAlerts(tenantId),
        getOwnerConfig(tenantId),
      ]);
      setMetrics(m);
      setFunil(f);
      setAlerts(a.alerts || a.alertas || []);
      setConfig(c);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [periodo, tenantId]);

  useEffect(() => { refresh(); }, [refresh]);

  // WebSocket for real-time updates
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    let socket = null;

    import('socket.io-client').then(({ io }) => {
      if (cancelled) return;
      let apiUrl = '';
      try {
        const stored = localStorage.getItem('brocco.dashboard.config');
        if (stored) apiUrl = JSON.parse(stored).apiUrl || '';
      } catch { /* ignore */ }

      socket = io(apiUrl || undefined, {
        auth: { token },
        reconnectionAttempts: 5,
      });
      socket.on('connect', () => { socket.emit('join:tenant'); });
      socket.on('lead:converted', () => refresh());
      socket.on('lead:new', () => refresh());
      socket.on('sla:alert', () => refresh());
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (socket) socket.disconnect();
    };
  }, [refresh]);

  async function handleVerProblema(alert) {
    setDrillLoading(true);
    setDrillView(null);
    try {
      if (alert.type === 'leads_sem_resposta') {
        const data = await getOwnerLeads({ slaStatus: 'atrasado' }, tenantId);
        setDrillView({ type: alert.type, label: 'Leads sem resposta (SLA)', items: data.leads || [] });
      } else if (alert.type === 'contratos_parados') {
        const data = await getOwnerCasos({ status: 'em_andamento' }, tenantId);
        setDrillView({ type: alert.type, label: 'Contratos parados', items: data.casos || [] });
      } else {
        const data = await getOwnerLeads({}, tenantId);
        setDrillView({ type: alert.type, label: alert.message || alert.type, items: data.leads || [] });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDrillLoading(false);
    }
  }

  // ═══ KPI data ═══
  const kpis = metrics ? [
    { label: 'Receita Real', value: money(metrics.realRevenue), tone: 'green' },
    { label: 'Receita em Aberto', value: money(metrics.openRevenue), tone: 'blue' },
    { label: 'Conversão', value: `${(Number(metrics.conversao || 0) * 100).toFixed(1)}%`, tone: 'green' },
    { label: 'Leads sem Resposta', value: metrics.leadsSemResposta ?? 0, tone: (metrics.leadsSemResposta > 0) ? 'red' : 'green' },
    { label: 'Casos sem Update', value: metrics.casosSemUpdate ?? 0, tone: (metrics.casosSemUpdate > 0) ? 'amber' : 'green' },
    { label: 'Tempo Médio Resposta', value: `${Math.round(metrics.tempoMedioResposta || 0)} min`, tone: 'blue' },
    { label: 'Lucro Estimado', value: money(metrics.lucroEstimado), tone: 'green' },
  ] : [];

  return (
    <main>
      {error && <p className="error">{error}</p>}

      {/* Date range filter */}
      <section className="owner-filter-bar">
        {PERIODOS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={periodo === p.value ? '' : 'secondary'}
            onClick={() => setPeriodo(p.value)}
          >
            {p.label}
          </button>
        ))}
      </section>

      {/* KPI Cards */}
      <section className="owner-kpi-grid" aria-label="Indicadores principais">
        {kpis.map((kpi) => (
          <article className={`kpi kpi-${kpi.tone}`} key={kpi.label}>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
          </article>
        ))}
      </section>

      {/* Action block — critical */}
      {metrics && metrics.emRisco > 0 && (
        <section className="panel owner-action-block">
          <strong className="owner-action-value">{money(metrics.emRisco)} em risco</strong>
          <span className="owner-action-desc">
            {metrics.leadsSemResposta} contato(s) aguardando resposta
          </span>
          {onNavigateOperator && (
            <button type="button" onClick={onNavigateOperator}>
              Atender agora →
            </button>
          )}
        </section>
      )}

      {/* Pipeline */}
      {metrics?.pipeline && metrics.pipeline.length > 0 && (
        <section className="panel owner-pipeline">
          <div className="section-title"><span>Pipeline</span></div>
          <div className="pipeline-bar">
            {metrics.pipeline.filter(s => s.count > 0).map((s) => (
              <div className="pipeline-stage" key={s.stage}>
                <span className="pipeline-label">{s.stage}</span>
                <strong className="pipeline-count">{s.count}</strong>
                <small className="pipeline-valor">{money(s.valor)}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <section className="panel owner-alerts">
          <div className="section-title"><span>Alertas</span></div>
          {alerts.map((a, i) => (
            <div className="owner-alert-row" key={i}>
              <span className={`owner-alert-icon alert-${a.type}`}>
                {a.type === 'leads_sem_resposta' ? '⏰' : a.type === 'contratos_parados' ? '📋' : '📉'}
              </span>
              <span className="owner-alert-msg">{a.message || a.type}</span>
              <strong>{a.count}</strong>
              <button className="secondary" type="button" onClick={() => handleVerProblema(a)}>
                Ver problema
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Drill-down view */}
      {drillView && (
        <section className="panel">
          <div className="section-title">
            <span>{drillView.label}</span>
            <button className="secondary" type="button" onClick={() => setDrillView(null)}>Fechar</button>
          </div>
          {drillLoading && <p className="empty">Carregando...</p>}
          {!drillLoading && drillView.items.length === 0 && <p className="empty">Nenhum item encontrado.</p>}
          <div className="owner-drill-list">
            {drillView.items.map((item) => (
              <div className="owner-drill-item" key={item.id}>
                <strong>{item.nome || item.telefone || item.id}</strong>
                <small>{item.status || item.tipoContrato || ''} · {item.slaStatus || ''}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Breakdowns */}
      <section className="owner-breakdowns">
        {/* Funnel analysis */}
        {funil && funil.funil && funil.funil.length > 0 && (
          <div className="panel">
            <div className="section-title"><span>Funil — Abandono por Etapa</span></div>
            <div className="owner-breakdown-list">
              {funil.funil.map((s, i) => (
                <div className="owner-breakdown-row" key={i}>
                  <span>{s.step || s.estado || `Etapa ${i + 1}`}</span>
                  <strong>{s.abandonos ?? s.count ?? 0}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leads lost by reason */}
        {metrics?.lostByReason && metrics.lostByReason.length > 0 && (
          <div className="panel">
            <div className="section-title"><span>Leads Perdidos por Motivo</span></div>
            <div className="owner-breakdown-list">
              {metrics.lostByReason.map((r, i) => (
                <div className="owner-breakdown-row" key={i}>
                  <span>{r.reason || r.motivo || 'Sem motivo'}</span>
                  <strong>{r.count ?? 0}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revenue by origin */}
        {metrics?.revenueByOrigin && metrics.revenueByOrigin.length > 0 && (
          <div className="panel">
            <div className="section-title"><span>Receita por Origem</span></div>
            <div className="owner-breakdown-list">
              {metrics.revenueByOrigin.map((r, i) => (
                <div className="owner-breakdown-row" key={i}>
                  <span>{r.origin || r.origem || 'Desconhecida'}</span>
                  <strong>{money(r.revenue || r.receita)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conversion rate per priority band */}
        {metrics?.conversionByPriority && metrics.conversionByPriority.length > 0 && (
          <div className="panel">
            <div className="section-title"><span>Conversão por Prioridade</span></div>
            <div className="owner-breakdown-list">
              {metrics.conversionByPriority.map((r, i) => (
                <div className="owner-breakdown-row" key={i}>
                  <span>{r.priority || r.prioridade}</span>
                  <strong>{(Number(r.rate || r.taxa || 0) * 100).toFixed(1)}%</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

    </main>
  );
}
