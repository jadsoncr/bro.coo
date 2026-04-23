import { useEffect, useState, useCallback } from 'react';
import {
  getMasterTenants,
  getMasterGlobalMetrics,
  getMasterLossPatterns,
  getMasterBenchmarks,
  getMasterAuditLog,
  getToken,
} from '../lib/api.js';

const brlFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
});
function money(v) { return brlFmt.format(Number(v || 0)); }

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: '2-digit',
  hour: '2-digit', minute: '2-digit',
});

export default function MasterPanel({ onViewTenant }) {
  // Data
  const [tenants, setTenants] = useState([]);
  const [globalMetrics, setGlobalMetrics] = useState(null);
  const [lossPatterns, setLossPatterns] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sort
  const [sortField, setSortField] = useState('revenue');
  const [selectedTenant, setSelectedTenant] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [t, g, lp, al] = await Promise.all([
        getMasterTenants(),
        getMasterGlobalMetrics(),
        getMasterLossPatterns(),
        getMasterAuditLog(),
      ]);
      setTenants(t.tenants || t || []);
      setGlobalMetrics(g);
      setLossPatterns(lp);
      setAuditLog(al.logs || al || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Sort tenants
  const sortedTenants = [...tenants].sort((a, b) => {
    const av = Number(a[sortField] || 0);
    const bv = Number(b[sortField] || 0);
    return bv - av;
  });

  return (
    <main>
      <section className="connection">
        <div>
          <strong>Master Panel</strong>
          <span>Administração cross-tenant</span>
        </div>
        <div className="connection-actions">
          <button className="secondary" type="button" onClick={refresh} disabled={loading}>
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      {/* Global KPIs */}
      {globalMetrics && (
        <section className="kpi-grid" aria-label="Métricas globais">
          <article className="kpi kpi-blue">
            <span>Total Leads</span>
            <strong>{globalMetrics.totalLeads ?? 0}</strong>
          </article>
          <article className="kpi kpi-green">
            <span>Conversão Geral</span>
            <strong>{((Number(globalMetrics.overallConversao || globalMetrics.conversao || 0)) * 100).toFixed(1)}%</strong>
          </article>
          <article className="kpi kpi-green">
            <span>Receita Total</span>
            <strong>{money(globalMetrics.totalRevenue || globalMetrics.totalReceita)}</strong>
          </article>
          <article className="kpi kpi-amber">
            <span>Tempo Médio Resposta</span>
            <strong>{Math.round(globalMetrics.avgResponseTime || globalMetrics.tempoMedioResposta || 0)} min</strong>
          </article>
        </section>
      )}

      {/* Tenant table */}
      <section className="panel">
        <div className="section-title">
          <span>Tenants ({sortedTenants.length})</span>
        </div>
        <div className="master-table-wrap">
          <table className="master-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Plano</th>
                <th className="sortable" onClick={() => setSortField('leads')}>Leads</th>
                <th className="sortable" onClick={() => setSortField('conversao')}>Conversão</th>
                <th className="sortable" onClick={() => setSortField('revenue')}>Receita</th>
                <th className="sortable" onClick={() => setSortField('avgResponseTime')}>Resp. Média</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {sortedTenants.map((t) => (
                <tr
                  key={t.id}
                  className={selectedTenant === t.id ? 'selected' : ''}
                  onClick={() => setSelectedTenant(selectedTenant === t.id ? null : t.id)}
                >
                  <td><strong>{t.nome || t.id}</strong></td>
                  <td>{t.plano || '—'}</td>
                  <td>{t.leads ?? 0}</td>
                  <td>{((Number(t.conversao || 0)) * 100).toFixed(1)}%</td>
                  <td>{money(t.revenue || t.receita)}</td>
                  <td>{Math.round(t.avgResponseTime || 0)} min</td>
                  <td>
                    <button className="secondary" type="button" onClick={(e) => { e.stopPropagation(); onViewTenant(t.id, 'owner'); }} style={{ marginRight: 4 }}>Dashboard</button>
                    <button className="secondary" type="button" onClick={(e) => { e.stopPropagation(); onViewTenant(t.id, 'operator'); }}>Operação</button>
                  </td>
                </tr>
              ))}
              {sortedTenants.length === 0 && (
                <tr><td colSpan="7" className="empty">Nenhum tenant encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Loss patterns */}
      {lossPatterns && (
        <section className="owner-breakdowns">
          {lossPatterns.byReason && lossPatterns.byReason.length > 0 && (
            <div className="panel">
              <div className="section-title"><span>Perda por Motivo</span></div>
              <div className="owner-breakdown-list">
                {lossPatterns.byReason.map((r, i) => (
                  <div className="owner-breakdown-row" key={i}>
                    <span>{r.reason || r.motivo || 'Sem motivo'}</span>
                    <strong>{r.count ?? 0}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
          {lossPatterns.byStep && lossPatterns.byStep.length > 0 && (
            <div className="panel">
              <div className="section-title"><span>Abandono por Etapa</span></div>
              <div className="owner-breakdown-list">
                {lossPatterns.byStep.map((s, i) => (
                  <div className="owner-breakdown-row" key={i}>
                    <span>{s.step || s.estado || `Etapa ${i + 1}`}</span>
                    <strong>{s.count ?? 0}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Audit log */}
      <section className="panel">
        <div className="section-title"><span>Audit Log</span></div>
        <div className="master-table-wrap">
          <table className="master-table">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Ação</th>
                <th>Tenant</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.slice(0, 50).map((log, i) => (
                <tr key={log.id || i}>
                  <td>{log.adminId || '—'}</td>
                  <td>{log.acao || log.action || '—'}</td>
                  <td>{log.tenantId || '—'}</td>
                  <td>{log.criadoEm ? dateFmt.format(new Date(log.criadoEm)) : '—'}</td>
                </tr>
              ))}
              {auditLog.length === 0 && (
                <tr><td colSpan="4" className="empty">Nenhum registro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
