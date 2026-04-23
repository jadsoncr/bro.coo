import { useState } from 'react';
import { convertLead } from '../lib/api.js';

const TIPO_CONTRATO_OPTIONS = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'entrada_exito', label: 'Entrada + Êxito' },
  { value: 'exito', label: 'Êxito' },
  { value: 'consulta', label: 'Consulta' },
  { value: 'outro', label: 'Outro' },
];

function validate(data) {
  const { tipoContrato, valorEntrada, percentualExito, valorCausa, valorConsulta } = data;

  if (!tipoContrato) return 'tipoContrato é obrigatório';

  switch (tipoContrato) {
    case 'entrada':
      if (!valorEntrada || Number(valorEntrada) <= 0) return "valorEntrada é obrigatório para tipo 'Entrada'";
      break;
    case 'entrada_exito':
      if (!valorEntrada || Number(valorEntrada) <= 0) return "valorEntrada é obrigatório para tipo 'Entrada + Êxito'";
      if (percentualExito === '' || percentualExito == null || Number(percentualExito) < 0 || Number(percentualExito) > 100)
        return "percentualExito deve estar entre 0 e 100";
      if (!valorCausa || Number(valorCausa) <= 0) return "valorCausa é obrigatório para tipo 'Entrada + Êxito'";
      break;
    case 'exito':
      if (percentualExito === '' || percentualExito == null || Number(percentualExito) < 0 || Number(percentualExito) > 100)
        return "percentualExito deve estar entre 0 e 100";
      if (!valorCausa || Number(valorCausa) <= 0) return "valorCausa é obrigatório para tipo 'Êxito'";
      break;
    case 'consulta':
      if (!valorConsulta || Number(valorConsulta) <= 0) return "valorConsulta é obrigatório para tipo 'Consulta'";
      break;
    case 'outro':
      if ((!valorEntrada || Number(valorEntrada) <= 0) && (!valorConsulta || Number(valorConsulta) <= 0) && (!valorCausa || Number(valorCausa) <= 0))
        return "Pelo menos um campo de valor deve ser maior que 0";
      break;
  }

  return null;
}

export default function ConversionForm({ lead, tenantId, onClose, onConverted }) {
  const [form, setForm] = useState({
    tipoContrato: '',
    valorEntrada: '',
    percentualExito: '',
    valorCausa: '',
    valorConsulta: '',
    segmento: lead?.segmento || '',
    tipoProcesso: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  }

  const tipo = form.tipoContrato;
  const showValorEntrada = ['entrada', 'entrada_exito', 'outro'].includes(tipo);
  const showPercentualExito = ['entrada_exito', 'exito'].includes(tipo);
  const showValorCausa = ['entrada_exito', 'exito'].includes(tipo);
  const showValorConsulta = ['consulta', 'outro'].includes(tipo);

  async function handleSubmit(e) {
    e.preventDefault();
    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const payload = { tipoContrato: form.tipoContrato };
      if (showValorEntrada && form.valorEntrada) payload.valorEntrada = Number(form.valorEntrada);
      if (showPercentualExito && form.percentualExito !== '') payload.percentualExito = Number(form.percentualExito);
      if (showValorCausa && form.valorCausa) payload.valorCausa = Number(form.valorCausa);
      if (showValorConsulta && form.valorConsulta) payload.valorConsulta = Number(form.valorConsulta);
      if (form.segmento) payload.segmento = form.segmento;
      if (form.tipoProcesso) payload.tipoProcesso = form.tipoProcesso;

      await convertLead(lead.id, payload, tenantId);
      onConverted?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Erro ao converter lead');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Converter Lead — {lead?.nome || lead?.telefone || 'Lead'}</h3>
          <button className="secondary modal-close" type="button" onClick={onClose}>✕</button>
        </div>

        <form className="conversion-form" onSubmit={handleSubmit}>
          <label>
            Tipo de Contrato
            <select value={form.tipoContrato} onChange={(e) => set('tipoContrato', e.target.value)}>
              <option value="">Selecione...</option>
              {TIPO_CONTRATO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          {showValorEntrada && (
            <label>
              Valor Entrada (R$)
              <input type="number" min="0" step="0.01" value={form.valorEntrada}
                onChange={(e) => set('valorEntrada', e.target.value)} placeholder="0.00" />
            </label>
          )}

          {showPercentualExito && (
            <label>
              Percentual Êxito (%)
              <input type="number" min="0" max="100" step="0.01" value={form.percentualExito}
                onChange={(e) => set('percentualExito', e.target.value)} placeholder="0 - 100" />
            </label>
          )}

          {showValorCausa && (
            <label>
              Valor da Causa (R$)
              <input type="number" min="0" step="0.01" value={form.valorCausa}
                onChange={(e) => set('valorCausa', e.target.value)} placeholder="0.00" />
            </label>
          )}

          {showValorConsulta && (
            <label>
              Valor Consulta (R$)
              <input type="number" min="0" step="0.01" value={form.valorConsulta}
                onChange={(e) => set('valorConsulta', e.target.value)} placeholder="0.00" />
            </label>
          )}

          <label>
            Segmento
            <input type="text" value={form.segmento} onChange={(e) => set('segmento', e.target.value)}
              placeholder="Ex: trabalhista, cível..." />
          </label>

          <label>
            Tipo de Processo
            <input type="text" value={form.tipoProcesso} onChange={(e) => set('tipoProcesso', e.target.value)}
              placeholder="Ex: reclamação trabalhista..." />
          </label>

          {error && <p className="error">{error}</p>}

          <div className="actions">
            <button type="submit" disabled={submitting}>
              {submitting ? 'Convertendo...' : 'Converter Lead'}
            </button>
            <button className="secondary" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
