import { useEffect, useState } from 'react';

export default function FinanceConfig({ config, onSave, saving }) {
  const [form, setForm] = useState({
    custoMensal: '',
    ticketMedio: '',
    taxaConversao: '',
  });

  useEffect(() => {
    setForm({
      custoMensal: config?.custoMensal ?? '',
      ticketMedio: config?.ticketMedio ?? '',
      taxaConversao: config?.taxaConversao ?? '',
    });
  }, [config]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSave({
      custoMensal: Number(form.custoMensal || 0),
      ticketMedio: Number(form.ticketMedio || 0),
      taxaConversao: Number(form.taxaConversao || 0),
    });
  }

  return (
    <section className="panel">
      <div className="section-title">
        <span>Financeiro</span>
      </div>

      <form className="config-form" onSubmit={submit}>
        <label>
          Custo mensal
          <input value={form.custoMensal} onChange={(event) => update('custoMensal', event.target.value)} inputMode="decimal" />
        </label>
        <label>
          Ticket médio
          <input value={form.ticketMedio} onChange={(event) => update('ticketMedio', event.target.value)} inputMode="decimal" />
        </label>
        <label>
          Taxa conversão
          <input value={form.taxaConversao} onChange={(event) => update('taxaConversao', event.target.value)} inputMode="decimal" />
        </label>
        <button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar config'}</button>
      </form>
    </section>
  );
}
