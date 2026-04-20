function priorityClass(priority) {
  if (priority === 'QUENTE') return 'hot';
  if (priority === 'MEDIO') return 'warm';
  return 'cold';
}

function waitingText(minutes) {
  if (minutes === null || minutes === undefined) return 'sem tempo';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function LeadInbox({ leads, selectedId, onSelect }) {
  return (
    <section className="panel inbox-panel">
      <div className="section-title">
        <span>Inbox</span>
        <strong>{leads.length}</strong>
      </div>

      <div className="lead-list">
        {leads.length === 0 && (
          <p className="empty">Nenhum lead para decidir agora.</p>
        )}

        {leads.map((lead) => (
          <button
            className={`lead-row ${selectedId === lead.id ? 'active' : ''}`}
            type="button"
            onClick={() => onSelect(lead.id)}
            key={lead.id}
          >
            <span className="lead-main">
              <strong>{lead.nome || lead.telefone || 'Lead sem nome'}</strong>
              <small>{lead.resumo || lead.fluxo || 'Sem resumo ainda'}</small>
            </span>
            <span className="lead-meta">
              <mark className={priorityClass(lead.prioridade)}>{lead.prioridade}</mark>
              <small>{lead.slaStatus} · {waitingText(lead.minutosEspera)}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
