import type { ReactNode } from 'react';

export function LoadingState({ label = 'Memuat…', cards = 0 }: { label?: string; cards?: number }) {
  if (cards > 0) {
    return (
      <div className="product-grid" aria-busy="true" aria-label={label}>
        {Array.from({ length: cards }).map((_, index) => (
          <div className="skeleton-card" key={index}>
            <div className="skeleton skeleton--image" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--short" />
          </div>
        ))}
        <span className="sr-only" role="status">
          {label}
        </span>
      </div>
    );
  }
  return (
    <div className="state-block" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({
  title = 'Ada yang tidak berhasil dimuat',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state-block state-block--error" role="alert">
      <p className="eyebrow">Gagal memuat</p>
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          Coba lagi
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="state-block">
      <p className="eyebrow">Kosong</p>
      <h2>{title}</h2>
      <p>{message}</p>
      {children}
    </div>
  );
}
