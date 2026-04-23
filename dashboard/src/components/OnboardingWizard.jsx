import { useState } from 'react';
import { setToken } from '../lib/api.js';

// Pre-built templates with specialties
const BUSINESS_TEMPLATES = {
  advocacia: {
    label: 'Advocacia', icon: '⚖️',
    hint: 'Escritórios de advocacia, advogados autônomos',
    specialties: [
      { nome: 'trabalhista', label: 'Trabalhista', hint: 'Demissão, horas extras, rescisão, assédio', keywords: ['trabalho', 'demitido', 'demissao', 'trabalhista', 'CLT', 'rescisao'] },
      { nome: 'familia', label: 'Família', hint: 'Divórcio, pensão, guarda, inventário', keywords: ['familia', 'divorcio', 'pensao', 'guarda', 'alimentos'] },
      { nome: 'civel', label: 'Cível', hint: 'Contratos, cobranças, indenizações', keywords: ['contrato', 'cobranca', 'indenizacao', 'civel'] },
      { nome: 'previdenciario', label: 'Previdenciário', hint: 'Aposentadoria, benefícios, INSS', keywords: ['aposentadoria', 'inss', 'beneficio', 'previdenciario'] },
      { nome: 'criminal', label: 'Criminal', hint: 'Defesa criminal, habeas corpus', keywords: ['criminal', 'preso', 'policia', 'habeas'] },
      { nome: 'tributario', label: 'Tributário', hint: 'Impostos, planejamento fiscal', keywords: ['imposto', 'tributo', 'fiscal'] },
    ],
  },
  clinica: {
    label: 'Clínica / Saúde', icon: '🏥',
    hint: 'Clínicas, consultórios, profissionais de saúde',
    specialties: [
      { nome: 'consulta', label: 'Consulta', hint: 'Agendamento de consultas', keywords: ['consulta', 'agendar', 'marcar'] },
      { nome: 'procedimento', label: 'Procedimento', hint: 'Cirurgias, exames, tratamentos', keywords: ['cirurgia', 'exame', 'tratamento', 'procedimento'] },
      { nome: 'retorno', label: 'Retorno', hint: 'Acompanhamento, retorno', keywords: ['retorno', 'acompanhamento'] },
      { nome: 'emergencia', label: 'Urgência', hint: 'Atendimento de urgência', keywords: ['urgente', 'emergencia', 'dor'] },
    ],
  },
  imobiliaria: {
    label: 'Imobiliária', icon: '🏠',
    hint: 'Imobiliárias, corretores, construtoras',
    specialties: [
      { nome: 'venda', label: 'Venda', hint: 'Compra e venda de imóveis', keywords: ['comprar', 'vender', 'imovel', 'casa', 'apartamento'] },
      { nome: 'aluguel', label: 'Aluguel', hint: 'Locação de imóveis', keywords: ['alugar', 'aluguel', 'locacao'] },
      { nome: 'financiamento', label: 'Financiamento', hint: 'Financiamento imobiliário', keywords: ['financiamento', 'parcela', 'entrada'] },
    ],
  },
  servicos: {
    label: 'Serviços', icon: '🔧',
    hint: 'Qualquer negócio baseado em serviços',
    specialties: [
      { nome: 'orcamento', label: 'Orçamento', hint: 'Solicitação de orçamento', keywords: ['orcamento', 'preco', 'quanto'] },
      { nome: 'agendamento', label: 'Agendamento', hint: 'Agendar serviço', keywords: ['agendar', 'marcar', 'horario'] },
      { nome: 'suporte', label: 'Suporte', hint: 'Suporte ao cliente', keywords: ['problema', 'ajuda', 'suporte'] },
    ],
  },
};

const SLA_OPTIONS = [
  { value: 5, label: '5 min', desc: 'Atendimento imediato' },
  { value: 15, label: '15 min', desc: 'Resposta rápida' },
  { value: 30, label: '30 min', desc: 'Padrão' },
  { value: 60, label: '1 hora', desc: 'Flexível' },
];

export default function OnboardingWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [businessType, setBusinessType] = useState(null);
  const [selectedSpecs, setSelectedSpecs] = useState([]);
  const [customSpecs, setCustomSpecs] = useState([]);
  const [sla, setSla] = useState(15);
  const [conta, setConta] = useState({ nome: '', email: '', senha: '', empresa: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [testMessages, setTestMessages] = useState([]);
  const [testInput, setTestInput] = useState('');

  const allSpecs = [...selectedSpecs, ...customSpecs.filter(c => c.nome.trim())];
  const steps = ['Negócio', 'Especialidades', 'Árvore', 'Testar', 'SLA', 'Conta'];

  function selectBusiness(key) {
    const tmpl = BUSINESS_TEMPLATES[key];
    setBusinessType(key);
    setSelectedSpecs(tmpl.specialties.map(s => ({ ...s, active: true })));
    setStep(1);
  }

  function toggleSpec(idx) {
    setSelectedSpecs(prev => prev.map((s, i) => i === idx ? { ...s, active: !s.active } : s));
  }

  function addCustomSpec() {
    setCustomSpecs([...customSpecs, { nome: '', label: '', hint: '', keywords: [], active: true, custom: true }]);
  }

  function updateCustomSpec(idx, field, value) {
    setCustomSpecs(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value, nome: field === 'label' ? value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_') : s.nome } : s));
  }

  function removeCustomSpec(idx) {
    setCustomSpecs(prev => prev.filter((_, i) => i !== idx));
  }

  // Simulate bot conversation
  function simulateMessage(msg) {
    const lower = msg.toLowerCase();
    const activeSpecs = allSpecs.filter(s => s.active);

    // Add user message
    const newMessages = [...testMessages, { from: 'user', text: msg }];

    // Try to match
    let matched = null;
    for (const spec of activeSpecs) {
      for (const kw of (spec.keywords || [])) {
        if (lower.includes(kw.toLowerCase())) {
          matched = spec;
          break;
        }
      }
      if (matched) break;
    }

    if (matched) {
      newMessages.push({ from: 'bot', text: `Entendi! Você precisa de atendimento em ${matched.label}. 👍\n\nPode descrever brevemente sua situação?` });
      newMessages.push({ from: 'system', text: `✅ Classificado como: ${matched.label}` });
    } else {
      // Show menu
      const menuText = activeSpecs.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n');
      newMessages.push({ from: 'bot', text: `Olá! 👋 Bem-vindo.\n\nComo podemos ajudar?\n\n${menuText}\n${activeSpecs.length + 1}️⃣ Já sou cliente\n${activeSpecs.length + 2}️⃣ Outro assunto` });
    }

    setTestMessages(newMessages);
    setTestInput('');
  }

  function startTest() {
    setTestMode(true);
    const activeSpecs = allSpecs.filter(s => s.active);
    const menuText = activeSpecs.map((s, i) => `${i + 1}️⃣ ${s.label}`).join('\n');
    setTestMessages([
      { from: 'bot', text: `Olá! 👋 Bem-vindo à ${conta.empresa || 'sua empresa'}.\n\nComo podemos ajudar?\n\n${menuText}\n${activeSpecs.length + 1}️⃣ Já sou cliente\n${activeSpecs.length + 2}️⃣ Outro assunto` },
    ]);
  }

  async function handleFinish(e) {
    e.preventDefault();
    if (!conta.nome || !conta.email || !conta.senha) { setError('Preencha todos os campos'); return; }
    setLoading(true); setError('');
    try {
      const activeSpecs = allSpecs.filter(s => s.active);
      const segments = activeSpecs.map(s => ({
        nome: s.nome, valorMin: 1000, valorMax: 10000, ticketMedio: 3000, taxaConversao: 0.2, keywords: s.keywords || [],
      }));

      const res = await fetch('/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: conta.empresa || conta.nome,
          businessType: businessType || 'servicos',
          segments,
          slaMinutes: sla,
          owner: { nome: conta.nome, email: conta.email, senha: conta.senha },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar conta');
      setToken(data.token);
      onComplete();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <main className="welcome-page">
      <div className="welcome-container" style={{ maxWidth: 640 }}>
        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? '#2563eb' : '#e5e7eb' }} />
          ))}
        </div>
        <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginBottom: 16 }}>
          {steps[step]}
        </p>

        {/* STEP 0: Tipo de negócio */}
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', margin: '0 0 6px' }}>Qual o seu negócio?</h2>
            <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20 }}>Escolha o tipo e configuramos tudo automaticamente.</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {Object.entries(BUSINESS_TEMPLATES).map(([key, t]) => (
                <button key={key} type="button" onClick={() => selectBusiness(key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 32 }}>{t.icon}</span>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{t.label}</span>
                    <span style={{ display: 'block', fontSize: 12, color: '#9ca3af' }}>{t.hint}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 1: Especialidades */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', margin: '0 0 6px' }}>Quais especialidades você atende?</h2>
            <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20 }}>Essas serão as opções que seu cliente verá no bot. Desmarque as que não se aplicam.</p>

            <div style={{ display: 'grid', gap: 8 }}>
              {selectedSpecs.map((spec, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: spec.active ? '#eff6ff' : '#f9fafb', border: `1px solid ${spec.active ? '#bfdbfe' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={spec.active} onChange={() => toggleSpec(i)} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500 }}>{spec.label}</span>
                    <span style={{ display: 'block', fontSize: 11, color: '#9ca3af' }}>{spec.hint}</span>
                  </div>
                </label>
              ))}

              {/* Custom specialties */}
              {customSpecs.map((spec, i) => (
                <div key={`custom-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8 }}>
                  <input
                    value={spec.label}
                    onChange={e => updateCustomSpec(i, 'label', e.target.value)}
                    placeholder="Nome da especialidade"
                    style={{ flex: 1, border: 'none', background: 'transparent', fontWeight: 500, fontSize: 14 }}
                  />
                  <button type="button" onClick={() => removeCustomSpec(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </div>

            <button type="button" className="secondary" onClick={addCustomSpec} style={{ marginTop: 10, fontSize: 12 }}>+ Adicionar especialidade</button>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button type="button" className="secondary" onClick={() => setStep(0)}>Voltar</button>
              <button type="button" onClick={() => setStep(2)} disabled={!allSpecs.some(s => s.active)}>Ver árvore →</button>
            </div>
          </div>
        )}

        {/* STEP 2: Visualizar árvore */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', margin: '0 0 6px' }}>Sua árvore de atendimento</h2>
            <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20 }}>É assim que o bot vai classificar seus clientes. Você pode ajustar depois.</p>

            {/* Tree visualization */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
              {/* Root */}
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <span style={{ display: 'inline-block', background: '#2563eb', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13 }}>
                  👋 Mensagem inicial
                </span>
                <p style={{ fontSize: 11, color: '#6b7280', margin: '6px 0 0' }}>
                  "Olá! Como podemos ajudar?"
                </p>
              </div>

              {/* Branches */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <div style={{ width: 2, height: 20, background: '#d1d5db' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(allSpecs.filter(s => s.active).length + 2, 4)}, 1fr)`, gap: 8 }}>
                {allSpecs.filter(s => s.active).map((spec, i) => (
                  <div key={i} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8' }}>{i + 1}️⃣ {spec.label}</span>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
                      → Descrever situação<br />→ Urgência?<br />→ Nome<br />→ Contato<br />→ ✅ Lead criado
                    </div>
                  </div>
                ))}
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>🔄 Já sou cliente</span>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>→ Identificação<br />→ Encaminhar</div>
                </div>
                <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#ca8a04' }}>❓ Outro assunto</span>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>→ Descrever<br />→ Triagem</div>
                </div>
              </div>
            </div>

            <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 12 }}>
              Cada especialidade gera uma rota automática: classificação → coleta de dados → lead qualificado.
            </p>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" className="secondary" onClick={() => setStep(1)}>Voltar</button>
              <button type="button" onClick={() => { startTest(); setStep(3); }}>Testar ao vivo →</button>
            </div>
          </div>
        )}

        {/* STEP 3: Testar ao vivo */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', margin: '0 0 6px' }}>Teste como seu cliente</h2>
            <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 16 }}>Digite como se fosse um cliente entrando em contato. Veja como o bot responde.</p>

            {/* Chat simulation */}
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}>
              {testMessages.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 8,
                }}>
                  <div style={{
                    maxWidth: '80%',
                    padding: '8px 12px',
                    borderRadius: 10,
                    fontSize: 13,
                    whiteSpace: 'pre-line',
                    background: msg.from === 'user' ? '#2563eb' : msg.from === 'system' ? '#d1fae5' : '#fff',
                    color: msg.from === 'user' ? '#fff' : msg.from === 'system' ? '#065f46' : '#374151',
                    border: msg.from === 'bot' ? '1px solid #e5e7eb' : 'none',
                    fontWeight: msg.from === 'system' ? 600 : 400,
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={e => { e.preventDefault(); if (testInput.trim()) simulateMessage(testInput.trim()); }} style={{ display: 'flex', gap: 8 }}>
              <input
                value={testInput}
                onChange={e => setTestInput(e.target.value)}
                placeholder="Ex: fui demitido, quero divórcio, preciso de ajuda..."
                style={{ flex: 1, padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}
                autoFocus
              />
              <button type="submit" disabled={!testInput.trim()}>Enviar</button>
            </form>

            <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 8 }}>
              Teste diferentes mensagens para ver como o bot classifica cada uma.
            </p>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" className="secondary" onClick={() => { setTestMode(false); setStep(2); }}>Voltar</button>
              <button type="button" onClick={() => setStep(4)}>Ficou bom, próximo →</button>
            </div>
          </div>
        )}

        {/* STEP 4: SLA */}
        {step === 4 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', margin: '0 0 6px' }}>Tempo de resposta</h2>
            <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20 }}>Em quanto tempo sua equipe deve responder um novo contato?</p>

            <div style={{ display: 'grid', gap: 8 }}>
              {SLA_OPTIONS.map(opt => (
                <label key={opt.value} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                  background: sla === opt.value ? '#eff6ff' : '#fff',
                  border: `2px solid ${sla === opt.value ? '#2563eb' : '#e5e7eb'}`,
                  borderRadius: 10, cursor: 'pointer',
                }}>
                  <input type="radio" name="sla" checked={sla === opt.value} onChange={() => setSla(opt.value)} />
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{opt.label}</span>
                    <span style={{ display: 'block', fontSize: 12, color: '#6b7280' }}>{opt.desc}</span>
                  </div>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button type="button" className="secondary" onClick={() => setStep(3)}>Voltar</button>
              <button type="button" onClick={() => setStep(5)}>Próximo →</button>
            </div>
          </div>
        )}

        {/* STEP 5: Conta */}
        {step === 5 && (
          <form onSubmit={handleFinish}>
            <h2 style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', margin: '0 0 6px' }}>Criar sua conta</h2>
            <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20 }}>Último passo. Sua operação estará pronta em segundos.</p>

            <label>Nome da empresa <input value={conta.empresa} onChange={e => setConta({ ...conta, empresa: e.target.value })} placeholder="Ex: Santos & Bastos Advogados" /></label>
            <label>Seu nome <input value={conta.nome} onChange={e => setConta({ ...conta, nome: e.target.value })} required /></label>
            <label>Email <input type="email" value={conta.email} onChange={e => setConta({ ...conta, email: e.target.value })} required /></label>
            <label>Senha <input type="password" value={conta.senha} onChange={e => setConta({ ...conta, senha: e.target.value })} required minLength={6} /></label>

            {error && <p className="error">{error}</p>}

            {/* Summary */}
            <div style={{ marginTop: 16, padding: 12, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>
              <span style={{ fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Resumo</span>
              <div>Tipo: {BUSINESS_TEMPLATES[businessType]?.label || businessType}</div>
              <div>Especialidades: {allSpecs.filter(s => s.active).map(s => s.label).join(', ')}</div>
              <div>SLA: {sla} minutos</div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#9ca3af' }}>
                Valores financeiros podem ser configurados depois em Configurações → Negócio.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" className="secondary" onClick={() => setStep(4)}>Voltar</button>
              <button type="submit" disabled={loading}>{loading ? 'Criando...' : 'Criar conta e começar'}</button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
