const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

export default function ReactivationBox({ data }) {
  const items = [
    ['Enviados', data?.enviados || 0],
    ['Responderam', data?.responderam || 0],
    ['Convertidos', data?.convertidos || 0],
    ['Receita', currency.format(Number(data?.receitaGerada || 0))],
  ];

  return (
    <section className="panel">
      <div className="section-title">
        <span>Reativação</span>
      </div>
      <div className="mini-grid">
        {items.map(([label, value]) => (
          <div className="mini-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
