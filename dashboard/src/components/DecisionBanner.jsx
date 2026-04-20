const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

function money(value) {
  return currency.format(Number(value || 0));
}

export default function DecisionBanner({ lead, metrics, onSelect }) {
  if (!lead) {
    return (
      <section className="decision-banner">
        <div>
          <span className="eyebrow">Fila limpa</span>
          <h2>Nenhum lead urgente agora.</h2>
        </div>
      </section>
    );
  }

  return (
    <section className="decision-banner">
      <div>
        <span className="eyebrow">Atender agora</span>
        <h2>{lead.nome || lead.telefone}</h2>
        <p>{lead.resumo}</p>
      </div>
      <div className="risk-box">
        <span>Dinheiro em risco agora</span>
        <strong>{money(metrics?.emRisco)}</strong>
        <button type="button" onClick={() => onSelect(lead.id)}>Ver lead</button>
      </div>
    </section>
  );
}
