import { useMemo } from 'react';

const MERCADO_PAGO_LINK = 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=b30a655fbc7d43b39ab8dfa704530aeb';

function daysSince(date) {
  if (!date) return 0;
  return Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
}

export default function BillingBanner({ billingStatus, billingDueDate }) {
  const info = useMemo(() => {
    if (!billingStatus || billingStatus === 'active') return null;

    const days = daysSince(billingDueDate);

    if (billingStatus === 'canceled') {
      return {
        type: 'canceled',
        message: 'Conta cancelada. Entre em contato para reativar.',
        bg: '#1f2937',
        color: '#fff',
      };
    }

    if (billingStatus === 'suspended') {
      const daysUntilCancel = Math.max(0, 14 - days);
      return {
        type: 'suspended',
        message: `Operação pausada por falta de pagamento. Cancelamento em ${daysUntilCancel} dia${daysUntilCancel !== 1 ? 's' : ''}.`,
        bg: '#dc2626',
        color: '#fff',
      };
    }

    // past_due
    const daysUntilSuspension = Math.max(0, 7 - days);
    return {
      type: 'past_due',
      message: `Pagamento pendente. Risco de interrupção em ${daysUntilSuspension} dia${daysUntilSuspension !== 1 ? 's' : ''}.`,
      bg: '#f59e0b',
      color: '#1f2937',
    };
  }, [billingStatus, billingDueDate]);

  if (!info) return null;

  return (
    <div
      role="alert"
      style={{
        background: info.bg,
        color: info.color,
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      <span>{info.message}</span>
      {info.type !== 'canceled' && (
        <a
          href={MERCADO_PAGO_LINK}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: info.type === 'suspended' ? '#fff' : '#1f2937',
            color: info.type === 'suspended' ? '#dc2626' : '#fff',
            padding: '5px 14px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Atualizar pagamento
        </a>
      )}
    </div>
  );
}
