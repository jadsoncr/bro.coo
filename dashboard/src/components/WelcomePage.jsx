import { useEffect, useState, useRef } from 'react';
import { simulateMessage } from '../lib/api.js';

const PRIORIDADE_COLORS = {
  quente: { bg: '#fef2f2', color: '#dc2626', label: 'QUENTE' },
  medio: { bg: '#fffbeb', color: '#d97706', label: 'MÉDIO' },
  frio: { bg: '#eff6ff', color: '#2563eb', label: 'FRIO' },
};

const DEFAULT_MESSAGE = 'Fui demitido ontem e não recebi nada';

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
}

export default function WelcomePage({ onGoToDashboard, onGoToConfig }) {
  const [phase, setPhase] = useState('analyzing'); // analyzing | result | input
  const [result, setResult] = useState(null);
  const [customMsg, setCustomMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentMessage, setCurrentMessage] = useState(DEFAULT_MESSAGE);
  const inputRef = useRef(null);

  // Auto-simulate on mount
  useEffect(() => {
    runSimulation(DEFAULT_MESSAGE);
  }, []);

  async function runSimulation(message) {
    setPhase('analyzing');
    setError('');
    setCurrentMessage(message);
    setLoading(true);

    // Show "Analisando..." for at least 1.5s
    const minDelay = new Promise(r => setTimeout(r, 1500));

    try {
      const [data] = await Promise.all([simulateMessage(message), minDelay]);
      setResult(data);
      setPhase('result');
    } catch (err) {
      setError(err.message);
      setPhase('result');
    } finally {
      setLoading(false);
    }
  }

  function handleTestAnother() {
    setPhase('input');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handleSubmitCustom(e) {
    e.preventDefault();
    if (!customMsg.trim()) return;
    runSimulation(customMsg.trim());
    setCustomMsg('');
  }

  const pri = result ? (PRIORIDADE_COLORS[result.prioridade] || PRIORIDADE_COLORS.frio) : null;

  return (
    <main className="welcome-page">
      <div className="welcome-container">
        <div className="welcome-header">
          <h1>Seu sistema está pronto.</h1>
          <p>Veja como ele transforma uma mensagem em decisão.</p>
        </div>

        {/* Mensagem simulada */}
        <div className="welcome-message-box">
          <span className="welcome-label">Mensagem recebida</span>
          <p className="welcome-message">"{currentMessage}"</p>
        </div>

        {/* Analyzing animation */}
        {phase === 'analyzing' && (
          <div className="welcome-analyzing">
            <div className="welcome-spinner" />
            <span>Analisando...</span>
          </div>
        )}

        {/* Result */}
        {phase === 'result' && result && !error && (
          <div className="welcome-result">
            <div className="welcome-result-grid">
              <div className="welcome-card">
                <span className="welcome-card-label">Classificação</span>
                <span className="welcome-card-value">
                  {(result.segmento || '').charAt(0).toUpperCase() + (result.segmento || '').slice(1)}
                  {result.subtipo && result.subtipo !== result.segmento ? ` · ${result.subtipo.charAt(0).toUpperCase() + result.subtipo.slice(1)}` : ''}
                </span>
              </div>
              <div className="welcome-card">
                <span className="welcome-card-label">Valor estimado</span>
                <span className="welcome-card-value">{formatBRL(result.valorMin)} – {formatBRL(result.valorMax)}</span>
              </div>
              <div className="welcome-card">
                <span className="welcome-card-label">Prioridade</span>
                <span className="welcome-card-badge" style={{ background: pri.bg, color: pri.color }}>
                  {pri.label}
                </span>
              </div>
              <div className="welcome-card">
                <span className="welcome-card-label">Ação recomendada</span>
                <span className="welcome-card-value">{result.proximoPasso}</span>
              </div>
            </div>

            {/* Risk block */}
            {result.risco > 0 && (
              <div className="welcome-risk">
                Se não responder em {result.slaMinutos || 30} minutos: risco de perder {formatBRL(result.risco)}
              </div>
            )}
          </div>
        )}

        {phase === 'result' && error && (
          <p className="error">{error}</p>
        )}

        {/* Input for custom test */}
        {phase === 'input' && (
          <form className="welcome-input-form" onSubmit={handleSubmitCustom}>
            <input
              ref={inputRef}
              value={customMsg}
              onChange={e => setCustomMsg(e.target.value)}
              placeholder="Ex: quero divórcio, acidente de trabalho..."
              autoFocus
            />
            <button type="submit" disabled={!customMsg.trim() || loading}>Simular</button>
          </form>
        )}

        {/* Actions */}
        {phase === 'result' && (
          <div className="welcome-actions">
            <button type="button" className="secondary" onClick={handleTestAnother}>
              Testar com outro caso
            </button>
          </div>
        )}

        {/* Next steps */}
        {phase === 'result' && (
          <div className="welcome-next">
            <p className="welcome-next-label">Próximo passo: conectar seu WhatsApp para receber mensagens reais</p>
            <div className="welcome-next-buttons">
              <button type="button" onClick={onGoToConfig}>Configurar WhatsApp</button>
              <button type="button" className="secondary" onClick={onGoToDashboard}>Ir para Dashboard</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
