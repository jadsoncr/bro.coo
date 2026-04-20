const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
});

function messageLabel(direction) {
  if (direction === 'in') return 'Cliente';
  if (direction === 'out') return 'Bot';
  return direction || 'Mensagem';
}

export default function LeadDetail({ lead, loading, onConverted, onLost }) {
  if (loading) {
    return (
      <section className="panel detail-panel">
        <p className="empty">Carregando detalhe...</p>
      </section>
    );
  }

  if (!lead) {
    return (
      <section className="panel detail-panel">
        <p className="empty">Selecione um lead para decidir a próxima ação.</p>
      </section>
    );
  }

  return (
    <section className="panel detail-panel">
      <div className="detail-head">
        <div>
          <span className="eyebrow">Detalhe</span>
          <h2>{lead.nome || lead.telefone || 'Lead sem nome'}</h2>
        </div>
        <mark className="score">score {lead.score}</mark>
      </div>

      <dl className="facts">
        <div>
          <dt>Origem</dt>
          <dd>{lead.origem || 'direto'}{lead.campanha ? ` / ${lead.campanha}` : ''}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{lead.status}{lead.statusFinal ? ` · ${lead.statusFinal}` : ''}</dd>
        </div>
        <div>
          <dt>Prioridade</dt>
          <dd>{lead.prioridade}</dd>
        </div>
      </dl>

      <div className="actions">
        <button type="button" onClick={onConverted}>Marcar como convertido</button>
        <button className="secondary" type="button" onClick={onLost}>Marcar como perdido</button>
      </div>

      <div className="conversation">
        <h3>Conversa</h3>
        {(lead.messages || []).length === 0 && (
          <p className="empty">Sem mensagens registradas ainda.</p>
        )}
        {(lead.messages || []).map((message) => (
          <article className="message" key={message.id}>
            <span>{messageLabel(message.direcao)} · {dateFmt.format(new Date(message.criadoEm))}</span>
            <p>{message.conteudo}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
