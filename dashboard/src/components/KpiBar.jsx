const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

function money(value) {
  return currency.format(Number(value || 0));
}

export default function KpiBar({ metrics }) {
  const items = [
    { label: 'Receita hoje', value: money(metrics?.potencialHoje), tone: 'green' },
    { label: 'Dinheiro em risco', value: money(metrics?.emRisco), tone: 'red' },
    { label: 'Meta diária', value: money(metrics?.tenant?.metaDiaria), tone: 'blue' },
    { label: 'Receita futura', value: money(metrics?.receitaFutura), tone: 'amber' },
  ];

  return (
    <section className="kpi-grid" aria-label="Indicadores principais">
      {items.map((item) => (
        <article className={`kpi kpi-${item.tone}`} key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </article>
      ))}
    </section>
  );
}
