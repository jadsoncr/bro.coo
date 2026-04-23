import { useState } from 'react';
import { registerAccount, setToken } from '../lib/api.js';

const TEMPLATES = [
  { id: 'advocacia', label: 'Advocacia', icon: '⚖️', segmentos: [
    { nome: 'trabalhista', valorMin: 2000, valorMax: 15000, ticketMedio: 5000, taxaConversao: 0.25 },
    { nome: 'familia', valorMin: 1500, valorMax: 8000, ticketMedio: 3000, taxaConversao: 0.2 },
    { nome: 'civel', valorMin: 1000, valorMax: 10000, ticketMedio: 4000, taxaConversao: 0.15 },
    { nome: 'previdenciario', valorMin: 2000, valorMax: 12000, ticketMedio: 5000, taxaConversao: 0.2 },
  ]},
  { id: 'clinica', label: 'Clínica', icon: '🏥', segmentos: [
    { nome: 'consulta', valorMin: 100, valorMax: 500, ticketMedio: 200, taxaConversao: 0.4 },
    { nome: 'procedimento', valorMin: 500, valorMax: 5000, ticketMedio: 1500, taxaConversao: 0.25 },
  ]},
  { id: 'imobiliaria', label: 'Imobiliária', icon: '🏠', segmentos: [
    { nome: 'venda', valorMin: 50000, valorMax: 500000, ticketMedio: 150000, taxaConversao: 0.05 },
    { nome: 'aluguel', valorMin: 500, valorMax: 5000, ticketMedio: 1500, taxaConversao: 0.3 },
  ]},
];

const SLA_OPTIONS = [
  { value: 15, label: '15 min' }, { value: 30, label: '30 min' }, { value: 60, label: '1h' },
];

const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export default function OnboardingWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [tipo, setTipo] = useState(null);
  const [segmentos, setSegmentos] = useState([]);
  const [sla, setSla] = useState({ lead: 15, contrato: 48 });
  const [conta, setConta] = useState({ nome: '', email: '', senha: '', empresa: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function selectTipo(t) {
    setTipo(t);
    setSegmentos(t.segmentos.map(s => ({ ...s, ativo: true })));
    setStep(1);
  }

  function toggleSegmento(idx) {
    const updated = [...segmentos];
    updated[idx] = { ...updated[idx], ativo: !updated[idx].ativo };
    setSegmentos(updated);
  }

  function updateSegVal(idx, field, value) {
    const updated = [...segmentos];
    updated[idx] = { ...updated[idx], [field]: Number(value) || 0 };
    setSegmentos(updated);
  }

  async function handleFinish(e) {
    e.preventDefault();
    if (!conta.nome || !conta.email || !conta.senha) { setError('Preencha todos os campos'); return; }
    setLoading(true); setError('');
    try {
      const segmento = tipo?.id === 'advocacia' ? 'advocacia' : tipo?.id === 'clinica' ? 'clinica' : 'imobiliaria';
      const data = await registerAccount({ nome: conta.nome, email: conta.email, senha: conta.senha, empresa: conta.empresa || `Escritório de ${conta.nome}`, segmento, moeda: 'BRL' });
      setToken(data.token);
      onComplete();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const steps = ['Tipo', 'Áreas', 'Valores', 'SLA', 'Conta'];

  return (
    <main className="welcome-page">
      <div className="welcome-container" style={{ maxWidth: 600 }}>
        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? '#2563eb' : '#e5e7eb' }} />
          ))}
        </div>
        <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginBottom: 20 }}>
          Passo {step + 1} de {steps.length} — {steps[step]}
        </p>

        {/* Step 0: Tipo de negócio */}
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>Qual o seu tipo de negócio?</h2>
            <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20 }}>Vamos configurar tudo automaticamente.</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {TEMPLATES.map(t => (
                <button key={t.id} type="button" onClick={() => selectTipo(t)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontSize: 15 }}>
                  <span style={{ fontSize: 28 }}>{t.icon}</span>
                  <div>
                    <span style={{ fontWeight: 600 }}>{t.label}</span>
                    <span style={{ display: 'block', fontSize: 12, color: '#9ca3af' }}>{t.segmentos.length} segmentos pré-configurados</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Áreas de atuação */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>Áreas de atuação</h2>
            <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20 }}>Desmarque as que não se aplicam.</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {segmentos.map((seg, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: seg.ativo ? '#eff6ff' : '#f9fafb', border: `1px solid ${seg.ativo ? '#bfdbfe' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={seg.ativo} onChange={() => toggleSegmento(i)} />
                  <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{seg.nome}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{moneyFmt.format(seg.valorMin)} – {moneyFmt.format(seg.valorMax)}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button type="button" className="secondary" onClick={() => setStep(0)}>Voltar</button>
              <button type="button" onClick={() => setStep(2)} disabled={!segmentos.some(s => s.ativo)}>Próximo</button>
            </div>
          </div>
        )}

        {/* Step 2: Ajuste financeiro por segmento */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>Ajuste os valores</h2>
            <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20 }}>Valores pré-preenchidos do template. Ajuste se necessário.</p>
            {segmentos.filter(s => s.ativo).map((seg, i) => {
              const realIdx = segmentos.indexOf(seg);
              return (
                <div key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, textTransform: 'capitalize', display: 'block', marginBottom: 6 }}>{seg.nome}</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    <label style={{ fontSize: 11 }}>Mínimo <input type="number" value={seg.valorMin} onChange={e => updateSegVal(realIdx, 'valorMin', e.target.value)} min="0" step="100" /></label>
                    <label style={{ fontSize: 11 }}>Máximo <input type="number" value={seg.valorMax} onChange={e => updateSegVal(realIdx, 'valorMax', e.target.value)} min="0" step="100" /></label>
                    <label style={{ fontSize: 11 }}>Ticket médio <input type="number" value={seg.ticketMedio} onChange={e => updateSegVal(realIdx, 'ticketMedio', e.target.value)} min="0" step="100" /></label>
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" className="secondary" onClick={() => setStep(1)}>Voltar</button>
              <button type="button" onClick={() => setStep(3)}>Próximo</button>
            </div>
          </div>
        )}

        {/* Step 3: SLA */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>Tempo de resposta</h2>
            <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20 }}>Em quanto tempo sua equipe deve responder?</p>
            <label style={{ marginBottom: 12, display: 'block' }}>
              SLA Lead (tempo máximo para primeira resposta)
              <select value={sla.lead} onChange={e => setSla({ ...sla, lead: Number(e.target.value) })}>
                {SLA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'block' }}>
              SLA Contrato (horas para atualizar caso)
              <select value={sla.contrato} onChange={e => setSla({ ...sla, contrato: Number(e.target.value) })}>
                <option value={24}>24h</option><option value={48}>48h</option><option value={72}>72h</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button type="button" className="secondary" onClick={() => setStep(2)}>Voltar</button>
              <button type="button" onClick={() => setStep(4)}>Próximo</button>
            </div>
          </div>
        )}

        {/* Step 4: Conta */}
        {step === 4 && (
          <form onSubmit={handleFinish}>
            <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>Criar sua conta</h2>
            <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20 }}>Último passo. Sua operação estará pronta em segundos.</p>
            <label>Seu nome <input value={conta.nome} onChange={e => setConta({ ...conta, nome: e.target.value })} required /></label>
            <label>Email <input type="email" value={conta.email} onChange={e => setConta({ ...conta, email: e.target.value })} required /></label>
            <label>Senha <input type="password" value={conta.senha} onChange={e => setConta({ ...conta, senha: e.target.value })} required minLength={6} /></label>
            <label>Nome da empresa <input value={conta.empresa} onChange={e => setConta({ ...conta, empresa: e.target.value })} placeholder="Opcional" /></label>
            {error && <p className="error">{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" className="secondary" onClick={() => setStep(3)}>Voltar</button>
              <button type="submit" disabled={loading}>{loading ? 'Criando...' : 'Criar conta e começar'}</button>
            </div>

            {/* Summary */}
            <div style={{ marginTop: 20, padding: 12, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Resumo da configuração</span>
              <div style={{ marginTop: 6 }}>Tipo: {tipo?.label}</div>
              <div>Segmentos: {segmentos.filter(s => s.ativo).map(s => s.nome).join(', ')}</div>
              <div>SLA Lead: {sla.lead}min | SLA Contrato: {sla.contrato}h</div>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
