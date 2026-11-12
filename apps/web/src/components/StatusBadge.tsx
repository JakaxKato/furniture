export function StatusPill({ status, kind }: { status: string; kind: 'payment' | 'shipping' }) {
  const tone =
    kind === 'payment'
      ? status === 'paid'
        ? 'success'
        : ['review', 'verifying'].includes(status)
          ? 'warning'
          : ['failed', 'expired', 'cancelled', 'disputed'].includes(status)
            ? 'danger'
            : 'neutral'
      : status === 'delivered'
        ? 'success'
        : status === 'shipped'
          ? 'info'
          : 'neutral';
  return <span className={`status status--${tone}`}>{status}</span>;
}

export function PaymentStatus({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  const tone =
    status === 'paid'
      ? 'success'
      : ['review', 'verifying'].includes(status)
        ? 'warning'
        : ['failed', 'expired', 'cancelled', 'disputed'].includes(status)
          ? 'danger'
          : 'neutral';
  return (
    <span className={`status status--${tone}`}>
      <span className="sr-only">Status pembayaran: </span>
      {label}
    </span>
  );
}

export function ShippingStatus({ status, label }: { status: string; label: string }) {
  const tone = status === 'delivered' ? 'success' : status === 'shipped' ? 'info' : 'neutral';
  return (
    <span className={`status status--${tone}`}>
      <span className="sr-only">Status pengiriman: </span>
      {label}
    </span>
  );
}
