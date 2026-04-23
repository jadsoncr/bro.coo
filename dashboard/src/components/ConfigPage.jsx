import { useEffect, useState, useCallback } from 'react';
import { getOwnerConfig, patchOwnerConfig, saveWhatsAppConfig, testWhatsAppConnection } from '../lib/api.js';

const TABS = [
  { key: 'negocio', label: 'Negócio' },
  { key: 'operacao', label: 'Operação' },
  { key: 'financeiro', label: 'Financeiro' },
];

const SLA_LEAD_OPTIONS = [
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1h' },
];

const SLA_CONTRATO_OPTIONS = [
  { value: 24, label: '24h' },
  { value: 48, label: '48h' },
  { value: 72, label: '72h' },
];

export default function ConfigPage({ tenantId }) {
  const [tab, setTab] = useState('negocio');
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states per tab
  const [negocio, setNegocio] = useState({ segmentos: '', ticketMedio: '', moeda: 'BRL' });
  const [operacao, setOperacao] = useState({ slaLeadMinutes: 15, slaContratoHoras: 48 });
  const [financeiro, setFinanceiro] = useState({ custoPorLead: '', custoMensal: '', metaMensal: '', taxaConversao: '' });
  const [whatsapp, setWhatsapp] = useState({ phoneId: '', wabaId: '', token: '', verifyToken: '' });
  const [whatsappStatus, setWhatsappStatus] = useState('nao_configurado');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getOwnerConfig(tenantId);
      setConfig(data);
      setNegocio({
        segmentos: (data.segmentos || []).join(', '),
        ticketMedio: data.ticketMedio ?? '',
        moeda: data.moeda || 'BRL',
      });
      setOperacao({
        slaLeadMinutes: data.slaLeadMinutes ?? 15,
        slaContratoHoras: data.slaContratoHoras ?? 48,
      });
      setFinanceiro({
        custoPorLead: data.custoPorLead ?? '',
        custoMensal: data.custoMensal ?? '',
        metaMensal: data.metaMensal ?? '',
        taxaConversao: data.taxaConversao ?? '',
      });
      setWhatsapp({
        phoneId: data.whatsappPhoneId || '',
        wabaId: data.whatsappWabaId || '',
        token: data.whatsappToken ? '••••••••' : '',
        verifyToken: data.whatsappVerifyToken || '',
      });
      setWhatsappStatus(data.whatsappStatus || 'nao_configurado');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  async function save(data) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await patchOwnerConfig(data, tenantId);
      setSuccess('Configuração salva.');
      await loadConfig();
      setTimeout(() => setSuccess(''), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function saveNegocio(e) {
    e.preventDefault();
    const data = { moeda: negocio.moeda };
    if (negocio.segmentos.trim()) data.segmentos = negocio.segmentos.split(',').map(s => s.trim()).filter(Boolean);
    if (negocio.ticketMedio !== '') data.ticketMedio = Number(negocio.ticketMedio);
    save(data);
  }

  function saveOperacao(e) {
    e.preventDefault();
    save({
      slaLeadMinutes: Number(operacao.slaLeadMinutes),
      slaContratoHoras: Number(operacao.slaContratoHoras),
    });
  }

  async function saveWA(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    setTestResult(null);
    try {
      const data = {
        phoneId: whatsapp.phoneId || null,
        wabaId: whatsapp.wabaId || null,
        verifyToken: whatsapp.verifyToken || null,
      };
      // Only send token if user changed it (not the masked value)
      if (whatsapp.token && !whatsapp.token.startsWith('••')) {
        data.token = whatsapp.token;
      }
      const result = await saveWhatsAppConfig(data, tenantId);
      setWhatsappStatus(result.whatsappStatus || 'nao_configurado');
      setSuccess('WhatsApp salvo.');
      setTimeout(() => setSuccess(''), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestWA() {
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const result = await testWhatsAppConnection(tenantId);
      setTestResult(result);
      if (result.ok) {
        setWhatsappStatus('configurado');
      }
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  function saveFinanceiro(e) {
    e.preventDefault();
    const data = {};
    if (financeiro.custoPorLead !== '') data.custoPorLead = Number(financeiro.custoPorLead);
    if (financeiro.custoMensal !== '') data.custoMensal = Number(financeiro.custoMensal);
    if (financeiro.metaMensal !== '') data.metaMensal = Number(financeiro.metaMensal);
    if (financeiro.taxaConversao !== '') data.taxaConversao = Number(financeiro.taxaConversao);
    save(data);
  }

  if (loading) return <main><p className="empty">Carregando configuração...</p></main>;

  return (
    <main>
      {error && <p className="error">{error}</p>}
      {success && <p style={{ color: '#059669', fontWeight: 600, margin: '12px 0' }}>{success}</p>}

      <nav className="config-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            className={`config-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'negocio' && (
        <form className="config-section" onSubmit={saveNegocio}>
          <label>
            Nome da empresa
            <input value={config?.nomeEmpresa || config?.nome || '—'} readOnly style={{ background: '#f3f4f6' }} />
          </label>
          <label>
            Segmentos
            <input
              value={negocio.segmentos}
              onChange={e => setNegocio({ ...negocio, segmentos: e.target.value })}
              placeholder="ex: trabalhista, cível, família"
            />
          </label>
          <label>
            Ticket médio
            <input
              type="number"
              value={negocio.ticketMedio}
              onChange={e => setNegocio({ ...negocio, ticketMedio: e.target.value })}
              inputMode="decimal"
              min="0"
              step="any"
            />
          </label>
          <label>
            Moeda
            <select value={negocio.moeda} onChange={e => setNegocio({ ...negocio, moeda: e.target.value })}>
              <option value="BRL">BRL</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          <button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar Negócio'}</button>
        </form>
      )}

      {tab === 'operacao' && (
        <div>
          <form className="config-section" onSubmit={saveOperacao}>
            <label>
              SLA Lead
              <select value={operacao.slaLeadMinutes} onChange={e => setOperacao({ ...operacao, slaLeadMinutes: e.target.value })}>
                {SLA_LEAD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>
              SLA Contrato
              <select value={operacao.slaContratoHoras} onChange={e => setOperacao({ ...operacao, slaContratoHoras: e.target.value })}>
                {SLA_CONTRATO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar SLA'}</button>
          </form>

          <form className="config-section" onSubmit={saveWA} style={{ marginTop: 24 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>
              WhatsApp Business
              <span style={{
                marginLeft: 8,
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 4,
                background: whatsappStatus === 'nao_configurado' ? '#f3f4f6' : whatsappStatus === 'configurado' ? '#d1fae5' : '#dbeafe',
                color: whatsappStatus === 'nao_configurado' ? '#6b7280' : whatsappStatus === 'configurado' ? '#059669' : '#2563eb',
              }}>
                {whatsappStatus === 'nao_configurado' ? 'Não configurado' : whatsappStatus === 'configurado' ? 'Configurado' : 'Ativo'}
              </span>
            </h3>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
              Opcional — conecte seu WhatsApp Business para receber leads reais.
            </p>
            <label>
              Phone Number ID
              <input
                value={whatsapp.phoneId}
                onChange={e => setWhatsapp({ ...whatsapp, phoneId: e.target.value })}
                placeholder="Ex: 123456789012345"
              />
            </label>
            <label>
              WABA ID (opcional)
              <input
                value={whatsapp.wabaId}
                onChange={e => setWhatsapp({ ...whatsapp, wabaId: e.target.value })}
                placeholder="Ex: 123456789012345"
              />
            </label>
            <label>
              Access Token
              <input
                type="password"
                value={whatsapp.token}
                onChange={e => setWhatsapp({ ...whatsapp, token: e.target.value })}
                placeholder="Token de acesso permanente"
              />
            </label>
            <label>
              Verify Token (webhook)
              <input
                value={whatsapp.verifyToken}
                onChange={e => setWhatsapp({ ...whatsapp, verifyToken: e.target.value })}
                placeholder="Token de verificação do webhook"
              />
            </label>
            {whatsapp.phoneId && (
              <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0' }}>
                URL do webhook: <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: 3 }}>
                  https://app.brorevenue.com/webhook/whatsapp/{config?.tenantId || tenantId || '{tenantId}'}
                </code>
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar WhatsApp'}</button>
              <button type="button" className="secondary" onClick={handleTestWA} disabled={testing || !whatsapp.phoneId}>
                {testing ? 'Testando...' : 'Testar Conexão'}
              </button>
            </div>
            {testResult && (
              <p style={{ fontSize: 12, marginTop: 8, color: testResult.ok ? '#059669' : '#dc2626' }}>
                {testResult.ok ? `Conectado: ${testResult.phoneNumber}` : `Erro: ${testResult.error}`}
              </p>
            )}
          </form>
        </div>
      )}

      {tab === 'financeiro' && (
        <form className="config-section" onSubmit={saveFinanceiro}>
          <label>
            Custo por lead
            <input
              type="number"
              value={financeiro.custoPorLead}
              onChange={e => setFinanceiro({ ...financeiro, custoPorLead: e.target.value })}
              inputMode="decimal"
              min="0"
              step="any"
            />
          </label>
          <label>
            Custo mensal
            <input
              type="number"
              value={financeiro.custoMensal}
              onChange={e => setFinanceiro({ ...financeiro, custoMensal: e.target.value })}
              inputMode="decimal"
              min="0"
              step="any"
            />
          </label>
          <label>
            Meta mensal
            <input
              type="number"
              value={financeiro.metaMensal}
              onChange={e => setFinanceiro({ ...financeiro, metaMensal: e.target.value })}
              inputMode="decimal"
              min="0"
              step="any"
            />
          </label>
          <label>
            Taxa de conversão
            <input
              type="number"
              value={financeiro.taxaConversao}
              onChange={e => setFinanceiro({ ...financeiro, taxaConversao: e.target.value })}
              inputMode="decimal"
              min="0"
              max="1"
              step="0.01"
            />
          </label>
          <button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar Financeiro'}</button>
        </form>
      )}
    </main>
  );
}
