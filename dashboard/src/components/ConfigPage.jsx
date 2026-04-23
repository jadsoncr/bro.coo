import { useEffect, useState, useCallback } from 'react';
import { getOwnerConfig, patchOwnerConfig, saveWhatsAppConfig, testWhatsAppConnection, authRequest } from '../lib/api.js';

const TABS = [
  { key: 'negocio', label: 'Negócio' },
  { key: 'operacao', label: 'Operação' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'flow', label: 'Fluxo' },
];

const SLA_LEAD_OPTIONS = [
  { value: 5, label: '5 min' }, { value: 15, label: '15 min' },
  { value: 30, label: '30 min' }, { value: 60, label: '1h' },
];
const SLA_CONTRATO_OPTIONS = [
  { value: 24, label: '24h' }, { value: 48, label: '48h' }, { value: 72, label: '72h' },
];

const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export default function ConfigPage({ tenantId }) {
  const [tab, setTab] = useState('negocio');
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Segmentos estruturados
  const [segmentos, setSegmentos] = useState([]);
  // SLA
  const [operacao, setOperacao] = useState({ slaLeadMinutes: 15, slaContratoHoras: 48 });
  // Financeiro
  const [financeiro, setFinanceiro] = useState({ custoMensal: '', metaMensal: '', taxaConversao: '' });
  // WhatsApp
  const [whatsapp, setWhatsapp] = useState({ phoneId: '', wabaId: '', token: '', verifyToken: '' });
  const [whatsappStatus, setWhatsappStatus] = useState('nao_configurado');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  // Flow nodes
  const [flowNodes, setFlowNodes] = useState([]);
  const [flowLoading, setFlowLoading] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await getOwnerConfig(tenantId);
      setConfig(data);
      setSegmentos(data.segmentosEstruturados || []);
      setOperacao({ slaLeadMinutes: data.slaLeadMinutes ?? 15, slaContratoHoras: data.slaContratoHoras ?? 48 });
      setFinanceiro({ custoMensal: data.custoMensal ?? '', metaMensal: data.metaMensal ?? '', taxaConversao: data.taxaConversao ?? '' });
      setWhatsapp({
        phoneId: data.whatsappPhoneId || '', wabaId: data.whatsappWabaId || '',
        token: data.whatsappToken ? '••••••••' : '', verifyToken: data.whatsappVerifyToken || '',
      });
      setWhatsappStatus(data.whatsappStatus || 'nao_configurado');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Load flow nodes when Flow tab is selected
  useEffect(() => {
    if (tab !== 'flow' || flowNodes.length > 0) return;
    setFlowLoading(true);
    const params = new URLSearchParams();
    if (tenantId) params.set('tenantId', tenantId);
    authRequest(`/operator/leads?${params.toString()}`).then(() => {
      // Flow nodes come from the flow engine — fetch via a dedicated endpoint or use config
    }).catch(() => {}).finally(() => setFlowLoading(false));
  }, [tab]);

  async function save(data) {
    setSaving(true); setError(''); setSuccess('');
    try {
      await patchOwnerConfig(data, tenantId);
      setSuccess('Salvo.'); await loadConfig();
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  function updateSegmento(idx, field, value) {
    const updated = [...segmentos];
    updated[idx] = { ...updated[idx], [field]: field === 'nome' ? value : Number(value) || 0 };
    setSegmentos(updated);
  }

  function removeSegmento(idx) {
    setSegmentos(segmentos.filter((_, i) => i !== idx));
  }

  function addSegmento() {
    setSegmentos([...segmentos, { nome: '', valorMin: 1000, valorMax: 10000, ticketMedio: 3000, taxaConversao: 0.2 }]);
  }

  function saveSegmentos(e) {
    e.preventDefault();
    const valid = segmentos.filter(s => s.nome.trim());
    save({ segmentos: valid, ticketMedio: valid.length > 0 ? Math.round(valid.reduce((s, seg) => s + seg.ticketMedio, 0) / valid.length) : config?.ticketMedio });
  }

  function saveOperacao(e) { e.preventDefault(); save({ slaLeadMinutes: Number(operacao.slaLeadMinutes), slaContratoHoras: Number(operacao.slaContratoHoras) }); }
  function saveFinanceiro(e) {
    e.preventDefault();
    const data = {};
    if (financeiro.custoMensal !== '') data.custoMensal = Number(financeiro.custoMensal);
    if (financeiro.metaMensal !== '') data.metaMensal = Number(financeiro.metaMensal);
    if (financeiro.taxaConversao !== '') data.taxaConversao = Number(financeiro.taxaConversao);
    save(data);
  }

  async function saveWA(e) {
    e.preventDefault(); setSaving(true); setError(''); setSuccess(''); setTestResult(null);
    try {
      const data = { phoneId: whatsapp.phoneId || null, wabaId: whatsapp.wabaId || null, verifyToken: whatsapp.verifyToken || null };
      if (whatsapp.token && !whatsapp.token.startsWith('••')) data.token = whatsapp.token;
      const result = await saveWhatsAppConfig(data, tenantId);
      setWhatsappStatus(result.whatsappStatus || 'nao_configurado');
      setSuccess('WhatsApp salvo.'); setTimeout(() => setSuccess(''), 2000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleTestWA() {
    setTesting(true); setTestResult(null); setError('');
    try {
      const result = await testWhatsAppConnection(tenantId);
      setTestResult(result);
      if (result.ok) setWhatsappStatus('configurado');
    } catch (err) { setTestResult({ ok: false, error: err.message }); }
    finally { setTesting(false); }
  }

  if (loading) return <main style={{ padding: 24 }}><p>Carregando...</p></main>;

  return (
    <main style={{ padding: '16px 24px' }}>
      {error && <p className="error">{error}</p>}
      {success && <p style={{ color: '#059669', fontWeight: 600, margin: '8px 0' }}>{success}</p>}

      <nav className="config-tabs">
        {TABS.map(t => (
          <button key={t.key} type="button" className={`config-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </nav>

      {/* ═══ ABA NEGÓCIO — Segmentos estruturados ═══ */}
      {tab === 'negocio' && (
        <form className="config-section" onSubmit={saveSegmentos}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280' }}>
              Empresa: {config?.nome || '—'}
            </span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Moeda: {config?.moeda || 'BRL'}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Segmentos de atuação</span>
            <button type="button" className="secondary" onClick={addSegmento} style={{ fontSize: 12, padding: '4px 10px' }}>+ Segmento</button>
          </div>

          {segmentos.length === 0 && <p style={{ color: '#9ca3af', fontSize: 13 }}>Nenhum segmento configurado.</p>}

          {segmentos.map((seg, i) => (
            <div key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <input
                  value={seg.nome} onChange={e => updateSegmento(i, 'nome', e.target.value)}
                  placeholder="Nome do segmento" style={{ fontWeight: 600, fontSize: 14, border: 'none', background: 'transparent', flex: 1 }}
                />
                <button type="button" onClick={() => removeSegmento(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={{ fontSize: 12 }}>
                  Valor mínimo
                  <input type="number" value={seg.valorMin} onChange={e => updateSegmento(i, 'valorMin', e.target.value)} min="0" step="100" />
                </label>
                <label style={{ fontSize: 12 }}>
                  Valor máximo
                  <input type="number" value={seg.valorMax} onChange={e => updateSegmento(i, 'valorMax', e.target.value)} min="0" step="100" />
                </label>
                <label style={{ fontSize: 12 }}>
                  Ticket médio
                  <input type="number" value={seg.ticketMedio} onChange={e => updateSegmento(i, 'ticketMedio', e.target.value)} min="0" step="100" />
                </label>
                <label style={{ fontSize: 12 }}>
                  Taxa conversão
                  <input type="number" value={seg.taxaConversao} onChange={e => updateSegmento(i, 'taxaConversao', e.target.value)} min="0" max="1" step="0.01" />
                </label>
              </div>
            </div>
          ))}

          <button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar Segmentos'}</button>
        </form>
      )}

      {/* ═══ ABA OPERAÇÃO — SLA + WhatsApp ═══ */}
      {tab === 'operacao' && (
        <div>
          <form className="config-section" onSubmit={saveOperacao}>
            <label>SLA Lead
              <select value={operacao.slaLeadMinutes} onChange={e => setOperacao({ ...operacao, slaLeadMinutes: e.target.value })}>
                {SLA_LEAD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>SLA Contrato
              <select value={operacao.slaContratoHoras} onChange={e => setOperacao({ ...operacao, slaContratoHoras: e.target.value })}>
                {SLA_CONTRATO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar SLA'}</button>
          </form>

          <form className="config-section" onSubmit={saveWA} style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>WhatsApp Business</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4,
                background: whatsappStatus === 'nao_configurado' ? '#f3f4f6' : '#d1fae5',
                color: whatsappStatus === 'nao_configurado' ? '#6b7280' : '#059669' }}>
                {whatsappStatus === 'nao_configurado' ? 'Não configurado' : 'Configurado'}
              </span>
            </div>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px' }}>Opcional — conecte para receber leads reais.</p>
            <label>Phone Number ID <input value={whatsapp.phoneId} onChange={e => setWhatsapp({ ...whatsapp, phoneId: e.target.value })} placeholder="123456789012345" /></label>
            <label>WABA ID <input value={whatsapp.wabaId} onChange={e => setWhatsapp({ ...whatsapp, wabaId: e.target.value })} placeholder="Opcional" /></label>
            <label>Access Token <input type="password" value={whatsapp.token} onChange={e => setWhatsapp({ ...whatsapp, token: e.target.value })} placeholder="Token permanente" /></label>
            <label>Verify Token <input value={whatsapp.verifyToken} onChange={e => setWhatsapp({ ...whatsapp, verifyToken: e.target.value })} placeholder="Token webhook" /></label>
            {whatsapp.phoneId && <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0' }}>Webhook: <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: 3 }}>https://app.brorevenue.com/webhook/whatsapp/{config?.tenantId || tenantId || '{id}'}</code></p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
              <button type="button" className="secondary" onClick={handleTestWA} disabled={testing || !whatsapp.phoneId}>{testing ? 'Testando...' : 'Testar'}</button>
            </div>
            {testResult && <p style={{ fontSize: 12, marginTop: 6, color: testResult.ok ? '#059669' : '#dc2626' }}>{testResult.ok ? `Conectado: ${testResult.phoneNumber}` : `Erro: ${testResult.error}`}</p>}
          </form>

          {/* Team management */}
          <TeamSection tenantId={tenantId} />
        </div>
      )}

      {/* ═══ ABA FINANCEIRO ═══ */}
      {tab === 'financeiro' && (
        <form className="config-section" onSubmit={saveFinanceiro}>
          <label>Custo mensal <input type="number" value={financeiro.custoMensal} onChange={e => setFinanceiro({ ...financeiro, custoMensal: e.target.value })} min="0" step="any" /></label>
          <label>Meta mensal <input type="number" value={financeiro.metaMensal} onChange={e => setFinanceiro({ ...financeiro, metaMensal: e.target.value })} min="0" step="any" /></label>
          <label>Taxa de conversão <input type="number" value={financeiro.taxaConversao} onChange={e => setFinanceiro({ ...financeiro, taxaConversao: e.target.value })} min="0" max="1" step="0.01" /></label>

          {segmentos.length > 0 && (
            <div style={{ marginTop: 16, padding: 12, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Receita projetada por segmento</span>
              {segmentos.map((seg, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', color: '#6b7280' }}>
                  <span>{seg.nome}</span>
                  <span>{moneyFmt.format(seg.ticketMedio)} × {(seg.taxaConversao * 100).toFixed(0)}% = {moneyFmt.format(seg.ticketMedio * seg.taxaConversao)}/lead</span>
                </div>
              ))}
            </div>
          )}

          <button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar Financeiro'}</button>
        </form>
      )}

      {/* ═══ ABA FLOW — Visualização da árvore ═══ */}
      {tab === 'flow' && (
        <div className="config-section">
          <span style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, display: 'block' }}>Árvore de classificação</span>
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>Fluxo de qualificação automática do bot. Edite textos e valores sem alterar a estrutura.</p>
          <FlowTreeView tenantId={tenantId} />
        </div>
      )}
    </main>
  );
}

// ═══ Flow Tree Viewer ═══
function FlowTreeView({ tenantId }) {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tenantId) params.set('tenantId', tenantId);
    authRequest(`/owner/flow/nodes?${params.toString()}`)
      .then(data => setNodes(data.nodes || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) return <p style={{ color: '#9ca3af', fontSize: 13 }}>Carregando fluxo...</p>;
  if (error) return <p className="error">{error}</p>;
  if (nodes.length === 0) return <p style={{ color: '#9ca3af', fontSize: 13 }}>Nenhum fluxo configurado.</p>;

  return (
    <div>
      {nodes.sort((a, b) => a.ordem - b.ordem).map(node => (
        <div key={node.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{node.estado}</span>
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: node.tipo === 'menu' ? '#dbeafe' : node.tipo === 'input' ? '#fef3c7' : '#d1fae5', color: node.tipo === 'menu' ? '#1d4ed8' : node.tipo === 'input' ? '#92400e' : '#065f46' }}>{node.tipo}</span>
          </div>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 6px', whiteSpace: 'pre-line' }}>{node.mensagem}</p>
          {node.opcoes && node.opcoes.length > 0 && (
            <div style={{ paddingLeft: 12, borderLeft: '2px solid #e5e7eb' }}>
              {node.opcoes.map((op, i) => (
                <div key={i} style={{ fontSize: 11, color: '#6b7280', padding: '2px 0' }}>
                  <span style={{ color: '#2563eb' }}>{op.texto}</span> → {op.proxEstado}
                  {op.segmento && <span style={{ marginLeft: 6, color: '#059669' }}>[{op.segmento}]</span>}
                  {op.valorEstimadoMin && <span style={{ marginLeft: 6, color: '#d97706' }}>R${op.valorEstimadoMin}-{op.valorEstimadoMax}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


// ═══ Team Management Section ═══
function TeamSection({ tenantId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ nome: '', email: '', senha: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tenantId) params.set('tenantId', tenantId);
    authRequest(`/owner/team?${params.toString()}`)
      .then(data => setUsers(data.users || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [tenantId]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.nome || !form.email || !form.senha) return;
    setSaving(true); setError('');
    try {
      const params = new URLSearchParams();
      if (tenantId) params.set('tenantId', tenantId);
      const result = await authRequest(`/owner/team?${params.toString()}`, {
        method: 'POST', body: JSON.stringify(form),
      });
      setUsers([...users, result.user]);
      setForm({ nome: '', email: '', senha: '' });
      setShowAdd(false);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function toggleUser(id) {
    try {
      const params = new URLSearchParams();
      if (tenantId) params.set('tenantId', tenantId);
      const result = await authRequest(`/owner/team/${id}?${params.toString()}`, { method: 'PATCH' });
      setUsers(users.map(u => u.id === id ? result.user : u));
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="config-section" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Equipe</span>
        <button type="button" className="secondary" onClick={() => setShowAdd(!showAdd)} style={{ fontSize: 12, padding: '4px 10px' }}>
          {showAdd ? 'Cancelar' : '+ Operador'}
        </button>
      </div>

      {error && <p className="error" style={{ fontSize: 12 }}>{error}</p>}

      {showAdd && (
        <form onSubmit={handleAdd} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <label style={{ fontSize: 12 }}>Nome <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required /></label>
          <label style={{ fontSize: 12 }}>Email <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></label>
          <label style={{ fontSize: 12 }}>Senha <input type="password" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} required minLength={6} /></label>
          <button type="submit" disabled={saving} style={{ marginTop: 8 }}>{saving ? 'Criando...' : 'Criar operador'}</button>
        </form>
      )}

      {loading && <p style={{ fontSize: 12, color: '#9ca3af' }}>Carregando...</p>}

      {users.map(u => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.ativo ? '#059669' : '#d1d5db' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{u.nome}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{u.email} · {u.role}</div>
          </div>
          {u.role !== 'OWNER' && (
            <button type="button" className="secondary" onClick={() => toggleUser(u.id)} style={{ fontSize: 11, padding: '3px 8px' }}>
              {u.ativo ? 'Desativar' : 'Ativar'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
