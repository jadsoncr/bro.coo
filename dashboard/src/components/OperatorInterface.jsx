import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  getOperatorLeads,
  getOperatorLeadDetail,
  assumirLead,
  sendOperatorMessage,
  updateLeadStatus,
  desistirLead,
  advanceLeadStage,
  getToken,
} from '../lib/api.js';
import ConversionForm from './ConversionForm.jsx';

const STAGE_OPTIONS = [
  { value: '', label: 'Todos os estágios' },
  { value: 'novo', label: 'Novo' },
  { value: 'atendimento', label: 'Atendimento' },
  { value: 'qualificado', label: 'Qualificado' },
  { value: 'proposta', label: 'Proposta' },
  { value: 'negociacao', label: 'Negociação' },
];

const ACTIVITY_OPTIONS = [
  { value: '', label: 'Todas as atividades' },
  { value: 'aguardando_cliente', label: 'Aguardando cliente' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'sem_resposta', label: 'Sem resposta' },
  { value: 'em_negociacao', label: 'Em negociação' },
];

const MOTIVOS_DESISTENCIA = [
  { value: 'SEM_RESPOSTA_48H', label: 'Sem resposta 48h' },
  { value: 'PRECO_ALTO', label: 'Preço alto' },
  { value: 'SEM_INTERESSE', label: 'Sem interesse' },
  { value: 'FECHOU_COM_OUTRO', label: 'Fechou com outro' },
  { value: 'FORA_DO_PERFIL', label: 'Fora do perfil' },
  { value: 'CONTATO_INVALIDO', label: 'Contato inválido' },
  { value: 'OUTRO', label: 'Outro' },
];

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
});

const moneyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
});

function proximoPasso(estagio) {
  const passos = {
    novo: 'Assumir atendimento',
    atendimento: 'Qualificar contato',
    qualificado: 'Enviar proposta',
    proposta: 'Aguardar resposta ou negociar',
    negociacao: 'Converter ou marcar perdido',
    convertido: 'Caso em andamento',
    perdido: 'Encerrado',
  };
  return passos[estagio] || 'Assumir atendimento';
}

function nextStage(current) {
  const order = ['novo', 'atendimento', 'qualificado', 'proposta', 'negociacao'];
  const idx = order.indexOf(current || 'novo');
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
}

function activityColor(status) {
  if (status === 'sem_resposta') return '#dc2626';
  if (status === 'follow_up') return '#d97706';
  if (status === 'aguardando_cliente') return '#6b7280';
  if (status === 'em_negociacao') return '#7c3aed';
  if (status === 'em_atendimento') return '#059669';
  return '#525252';
}

function activityLabel(status) {
  const labels = {
    novo: 'Novo',
    em_atendimento: 'Em atendimento',
    aguardando_cliente: 'Aguardando cliente',
    follow_up: 'Follow-up',
    sem_resposta: 'Sem resposta',
    em_negociacao: 'Em negociação',
  };
  return labels[status] || status || 'Novo';
}

function timeSince(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function timeSinceMinutes(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

function priorityEmoji(p) {
  if (p === 'QUENTE') return '🔥';
  if (p === 'MEDIO') return '⚠️';
  return '🔵';
}

function priorityLabel(p) {
  if (p === 'QUENTE') return 'QUENTE';
  if (p === 'MEDIO') return 'MÉDIO';
  return 'FRIO';
}

function slaCardBg(s) {
  if (s === 'atrasado') return '#fef2f2';
  if (s === 'atencao') return '#fffbeb';
  return '#ffffff';
}

function messageOriginLabel(direcao) {
  if (direcao === 'in' || direcao === 'cliente') return '👤 Cliente';
  if (direcao === 'out' || direcao === 'bot') return '🤖 Bot';
  if (direcao === 'humano') return '👨‍💼 Operador';
  return direcao || 'Mensagem';
}

function messageOriginClass(direcao) {
  if (direcao === 'in' || direcao === 'cliente') return 'msg-cliente';
  if (direcao === 'out' || direcao === 'bot') return 'msg-bot';
  if (direcao === 'humano') return 'msg-humano';
  return '';
}

export default function OperatorInterface({ tenantId }) {
  // Filters
  const [stageFilter, setStageFilter] = useState('');
  const [activityFilter, setActivityFilter] = useState('');
  const [segmentoFilter, setSegmentoFilter] = useState('');
  const [slaFilter, setSlaFilter] = useState('');

  // Data
  const [leads, setLeads] = useState([]);
  const [queues, setQueues] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [showConversionForm, setShowConversionForm] = useState(false);
  const [showDesistenciaModal, setShowDesistenciaModal] = useState(false);
  const [notification, setNotification] = useState('');

  const messagesEndRef = useRef(null);
  const wsRef = useRef(null);

  // ═══ Derived data ═══

  const slaCounts = useMemo(() => {
    const counts = { atrasado: 0, atencao: 0, dentro: 0 };
    leads.forEach((l) => {
      if (counts[l.slaStatus] !== undefined) counts[l.slaStatus]++;
    });
    return counts;
  }, [leads]);

  const slaValues = useMemo(() => {
    const values = { atrasado: 0, atencao: 0, dentro: 0 };
    leads.forEach((l) => {
      const val = l.valorLead || l.valorEstimado || 0;
      if (values[l.slaStatus] !== undefined) values[l.slaStatus] += val;
    });
    return values;
  }, [leads]);

  const uniqueSegmentos = useMemo(() => {
    const set = new Set();
    leads.forEach((l) => { if (l.segmento) set.add(l.segmento); });
    return Array.from(set).sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return leads
      .filter((l) => {
        // Hide finalized leads (convertido/perdido)
        if (l.estagio === 'convertido' || l.estagio === 'perdido') return false;
        if (l.statusFinal) return false;
        if (slaFilter && l.slaStatus !== slaFilter) return false;
        if (stageFilter && l.estagio !== stageFilter) return false;
        if (activityFilter && l.activityStatus !== activityFilter) return false;
        if (segmentoFilter && l.segmento !== segmentoFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const prioWeight = { quente: 0, QUENTE: 0, medio: 1, MEDIO: 1, frio: 2, FRIO: 2 };
        const prioA = prioWeight[a.prioridade] ?? 9;
        const prioB = prioWeight[b.prioridade] ?? 9;
        if (prioA !== prioB) return prioA - prioB;
        const valA = a.valorLead || a.valorEstimado || 0;
        const valB = b.valorLead || b.valorEstimado || 0;
        if (valB !== valA) return valB - valA;
        const tempoA = a.tempoSemResposta || 0;
        const tempoB = b.tempoSemResposta || 0;
        return tempoB - tempoA;
      });
  }, [leads, slaFilter, stageFilter, activityFilter, segmentoFilter]);

  // ═══ Data fetching ═══

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getOperatorLeads({}, tenantId);
      setLeads(data.leads || []);
      setQueues(data.queues || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const fetchLeadDetail = useCallback(async (id) => {
    if (!id) { setSelectedLead(null); return; }
    setDetailLoading(true);
    try {
      const data = await getOperatorLeadDetail(id, tenantId);
      setSelectedLead(data.lead || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }, [tenantId]);

  // ═══ Effects ═══

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  useEffect(() => { fetchLeadDetail(selectedId); }, [selectedId, fetchLeadDetail]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedLead?.messages]);

  // WebSocket connection
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    let cancelled = false;

    import('socket.io-client').then(({ io }) => {
      if (cancelled) return;

      let configApiUrl = '';
      try {
        const stored = localStorage.getItem('brocco.dashboard.config');
        if (stored) configApiUrl = JSON.parse(stored).apiUrl || '';
      } catch { /* ignore */ }

      const socket = io(configApiUrl || undefined, {
        auth: { token },
        reconnectionAttempts: 5,
      });

      socket.on('connect', () => {
        socket.emit('join:tenant');
        socket.emit('join:operator');
      });

      socket.on('lead:new', () => fetchLeads());
      socket.on('lead:updated', (data) => {
        fetchLeads();
        if (data?.leadId === selectedId) fetchLeadDetail(selectedId);
      });
      socket.on('sla:alert', (data) => {
        const valor = data?.valorTotal || data?.valor || 0;
        const valorStr = valor ? moneyFmt.format(valor) : '';
        setNotification(
          `🚨 Lead crítico — 💰 ${valorStr || 'R$???'} quase perdido`
        );
        setTimeout(() => setNotification(''), 5000);
      });

      wsRef.current = socket;
    }).catch(() => { /* socket.io-client not available */ });

    return () => {
      cancelled = true;
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }
    };
  }, [fetchLeads, fetchLeadDetail, selectedId]);

  // ═══ Actions ═══

  async function handleAssumir() {
    if (!selectedId) return;
    setError('');
    try {
      await assumirLead(selectedId, tenantId);
      await fetchLeads();
      await fetchLeadDetail(selectedId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!messageText.trim() || !selectedId) return;
    setSending(true);
    setError('');
    try {
      // Auto-assumir if not yet assumed
      if (selectedLead && selectedLead.status !== 'EM_ATENDIMENTO' && !selectedLead.statusFinal) {
        await assumirLead(selectedId, tenantId).catch(() => {}); // silent
      }
      await sendOperatorMessage(selectedId, messageText.trim(), tenantId);
      setMessageText('');
      await fetchLeadDetail(selectedId);
      await fetchLeads();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(status) {
    if (!selectedId) return;
    setError('');
    try {
      await updateLeadStatus(selectedId, status, tenantId);
      await fetchLeads();
      await fetchLeadDetail(selectedId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDesistir(motivo) {
    if (!selectedId || !motivo) return;
    setError('');
    try {
      await desistirLead(selectedId, motivo, tenantId);
      setShowDesistenciaModal(false);
      await fetchLeads();
      await fetchLeadDetail(selectedId);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleConversionSuccess() {
    setShowConversionForm(false);
    const valor = selectedLead?.valorLead || selectedLead?.valorEstimado || 0;
    setNotification(`💰 Conversão registrada: ${moneyFmt.format(valor)}`);
    setTimeout(() => setNotification(''), 4000);
    fetchLeads();
    fetchLeadDetail(selectedId);
  }

  function handleQueueClick(sla) {
    setSlaFilter((prev) => (prev === sla ? '' : sla));
  }

  async function handleAdvanceStage(estagio) {
    if (!selectedId || !estagio) return;
    setError('');
    try {
      await advanceLeadStage(selectedId, estagio, tenantId);
      await fetchLeads();
      await fetchLeadDetail(selectedId);
    } catch (err) {
      setError(err.message);
    }
  }

  // ═══ Render ═══

  const leadValor = (l) => l.valorLead || l.valorEstimado || 0;

  return (
    <div className="operator-layout">
      {notification && (
        <div className={`op-notification ${notification.startsWith('💰') ? 'op-notification-success' : 'op-notification-critical'}`}>
          {notification}
        </div>
      )}

      {/* Column 1: FILAS */}
      <aside className="op-filters">
        <div className="op-filters-header">
          <strong>Filas</strong>
        </div>

        <div className="op-queue-groups">
          <button
            type="button"
            className={`op-queue-btn op-queue-critico ${slaFilter === 'atrasado' ? 'op-queue-active' : ''}`}
            onClick={() => handleQueueClick('atrasado')}
          >
            <span>🔥 Críticos ({slaCounts.atrasado})</span>
            <strong>{moneyFmt.format(slaValues.atrasado)}</strong>
          </button>
          <button
            type="button"
            className={`op-queue-btn op-queue-risco ${slaFilter === 'atencao' ? 'op-queue-active' : ''}`}
            onClick={() => handleQueueClick('atencao')}
          >
            <span>⚠️ Em risco ({slaCounts.atencao})</span>
            <strong>{moneyFmt.format(slaValues.atencao)}</strong>
          </button>
          <button
            type="button"
            className={`op-queue-btn op-queue-novos ${slaFilter === 'dentro' ? 'op-queue-active' : ''}`}
            onClick={() => handleQueueClick('dentro')}
          >
            <span>⏳ Novos ({slaCounts.dentro})</span>
            <strong>{moneyFmt.format(slaValues.dentro)}</strong>
          </button>
        </div>

        <div className="op-subfilters">
          <label>
            Pipeline
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
              {STAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label>
            Atividade
            <select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)}>
              {ACTIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label>
            Segmento
            <select value={segmentoFilter} onChange={(e) => setSegmentoFilter(e.target.value)}>
              <option value="">Todos</option>
              {uniqueSegmentos.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </aside>

      {/* Column 2: LEADS */}
      <section className="op-lead-list">
        <div className="section-title">
          <span>Leads</span>
          <strong>{filteredLeads.length}</strong>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="lead-list">
          {loading && leads.length === 0 && <p className="empty">Carregando...</p>}
          {!loading && filteredLeads.length === 0 && <p className="empty">Nenhum lead encontrado.</p>}

          {filteredLeads.map((lead) => {
            const valor = leadValor(lead);
            const mins = timeSinceMinutes(lead.criadoEm);
            return (
              <button
                className={`lead-row ${selectedId === lead.id ? 'active' : ''} ${lead.slaStatus === 'atrasado' ? 'lead-row-critico' : ''}`}
                style={{ backgroundColor: slaCardBg(lead.slaStatus) }}
                type="button"
                onClick={() => setSelectedId(lead.id)}
                key={lead.id}
              >
                <span className="lead-main">
                  <strong>{lead.nome || lead.telefone || 'Lead sem nome'}</strong>
                  <span className="lead-card-row">
                    {valor > 0 && <span className="lead-valor">💰 {moneyFmt.format(valor)}</span>}
                    <span className="lead-priority">
                      {priorityEmoji(lead.prioridade)} {priorityLabel(lead.prioridade)}
                    </span>
                  </span>
                  {lead.estagio && <span className="lead-estagio">{lead.estagio}</span>}
                  {lead.activityStatus && lead.activityStatus !== 'novo' && (
                    <span className="lead-activity" style={{ color: activityColor(lead.activityStatus) }}>
                      {activityLabel(lead.activityStatus)}
                    </span>
                  )}
                  {lead.intencao && <span className="lead-intencao">{lead.intencao}</span>}
                </span>
                <span className="lead-meta">
                  <small className="lead-time">⏱ {mins}min</small>
                  {lead.slaStatus === 'atrasado' && valor > 0 && (
                    <small className="lead-risco">🚨 {moneyFmt.format(valor)} em risco</small>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Column 3: CHAT + ACTION */}
      <section className="op-chat-panel">
        {detailLoading && <p className="empty">Carregando...</p>}

        {!detailLoading && !selectedLead && (
          <p className="empty">Selecione um lead para ver detalhes.</p>
        )}

        {!detailLoading && selectedLead && (() => {
          const valor = leadValor(selectedLead);
          const mins = timeSinceMinutes(selectedLead.criadoEm);
          const isAtrasado = selectedLead.slaStatus === 'atrasado';

          return (
            <>
              {/* Header */}
              <div className="op-chat-header">
                <div className="op-chat-header-info">
                  <h2>{selectedLead.nome || selectedLead.telefone || 'Lead'}</h2>
                  <small>
                    📞 {selectedLead.telefone || '—'}
                    {selectedLead.segmento ? ` · 🏷️ ${selectedLead.segmento}` : ''}
                  </small>
                </div>
                <div className="op-chat-header-values">
                  {valor > 0 && (
                    <span className="op-valor-potencial">💰 {moneyFmt.format(valor)} potencial</span>
                  )}
                  {isAtrasado && valor > 0 && (
                    <span className="op-valor-risco">🚨 {moneyFmt.format(valor)} em risco</span>
                  )}
                  <span className="op-tempo-sem-resposta">⏱ {mins}min sem resposta</span>
                  <span className="op-proximo-passo">→ {proximoPasso(selectedLead.estagio)}</span>
                </div>
              </div>

              {/* Action buttons — only 3 */}
              <div className="op-actions-bar">
                {selectedLead.status !== 'EM_ATENDIMENTO' && !selectedLead.statusFinal && (
                  <button type="button" className="btn-assumir" onClick={handleAssumir}>
                    Assumir atendimento
                  </button>
                )}
                {!selectedLead.statusFinal && nextStage(selectedLead.estagio) && (
                  <button type="button" className="btn-avancar" onClick={() => handleAdvanceStage(nextStage(selectedLead.estagio))}>
                    Avançar → {nextStage(selectedLead.estagio)}
                  </button>
                )}
                {!selectedLead.statusFinal && (
                  <>
                    <button
                      type="button"
                      className="btn-converter"
                      disabled={selectedLead.estagio && !['proposta', 'negociacao', 'novo'].includes(selectedLead.estagio)}
                      onClick={() => setShowConversionForm(true)}
                    >
                      Converter 💰
                    </button>
                    <button
                      type="button"
                      className="btn-desistiu"
                      onClick={() => setShowDesistenciaModal(true)}
                    >
                      Desistiu ❌
                    </button>
                  </>
                )}
              </div>

              {/* Messages */}
              <div className="op-messages">
                {(selectedLead.messages || []).length === 0 && (
                  <p className="empty">Sem mensagens ainda.</p>
                )}
                {(selectedLead.messages || []).map((msg) => (
                  <article className={`op-msg ${messageOriginClass(msg.direcao)}`} key={msg.id}>
                    <span className="op-msg-meta">
                      {messageOriginLabel(msg.direcao)} · {dateFmt.format(new Date(msg.criadoEm))}
                    </span>
                    <p>{msg.conteudo}</p>
                  </article>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              {!selectedLead.statusFinal && (
                <form className="op-message-input" onSubmit={handleSendMessage}>
                  <input
                    type="text"
                    placeholder={
                      selectedLead?.slaStatus === 'atrasado'
                        ? 'Responder agora (lead em risco)...'
                        : 'Digite uma mensagem...'
                    }
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                  />
                  <button type="submit" disabled={sending || !messageText.trim()}>
                    {sending ? '...' : 'Enviar'}
                  </button>
                </form>
              )}

              {/* Simplified context block */}
              <div className="op-lead-info">
                <strong>Contexto</strong>
                <dl className="op-info-list op-info-compact">
                  <div><dt>Segmento</dt><dd>{selectedLead.segmento || '—'}</dd></div>
                  <div>
                    <dt>Prioridade</dt>
                    <dd>{priorityEmoji(selectedLead.prioridade)} {priorityLabel(selectedLead.prioridade)}</dd>
                  </div>
                  <div><dt>Tempo</dt><dd>{mins}min</dd></div>
                  <div><dt>Estágio</dt><dd>{selectedLead.estagio || 'novo'}</dd></div>
                  <div><dt>Atividade</dt><dd style={{ color: activityColor(selectedLead.activityStatus) }}>{activityLabel(selectedLead.activityStatus)}</dd></div>
                  <div><dt>Intenção</dt><dd>{selectedLead.intencao || '—'}</dd></div>
                </dl>
              </div>
            </>
          );
        })()}
      </section>

      {/* Modals */}
      {showConversionForm && selectedLead && (
        <ConversionForm
          lead={selectedLead}
          tenantId={tenantId}
          onClose={() => setShowConversionForm(false)}
          onConverted={handleConversionSuccess}
        />
      )}

      {showDesistenciaModal && (
        <DesistenciaModal
          onClose={() => setShowDesistenciaModal(false)}
          onConfirm={handleDesistir}
        />
      )}
    </div>
  );
}

function DesistenciaModal({ onClose, onConfirm }) {
  const [motivo, setMotivo] = useState('');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Motivo da desistência</h3>
          <button className="secondary modal-close" type="button" onClick={onClose}>✕</button>
        </div>
        <div className="conversion-form">
          <label>
            Selecione o motivo
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">Selecione...</option>
              {MOTIVOS_DESISTENCIA.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button type="button" disabled={!motivo} onClick={() => onConfirm(motivo)}>
              Confirmar desistência
            </button>
            <button className="secondary" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
