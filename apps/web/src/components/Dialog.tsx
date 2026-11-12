import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Dialog({
  open,
  onClose,
  title,
  children,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement | null;
      if (!dialog.open) dialog.showModal();
      document.body.classList.add('no-scroll');
      const focusable =
        dialog.querySelector<HTMLElement>('.dialog__body input, .dialog__body select, .dialog__body textarea') ??
        dialog.querySelector<HTMLElement>('.dialog__body button, .dialog__body [href]') ??
        dialog.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
      const timer = window.setTimeout(() => focusable?.focus(), 0);
      return () => {
        window.clearTimeout(timer);
        document.body.classList.remove('no-scroll');
      };
    } else {
      if (dialog.open) dialog.close();
      document.body.classList.remove('no-scroll');
      previousFocus.current?.focus();
    }
    return () => {
      document.body.classList.remove('no-scroll');
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog__panel">
        <div className="dialog__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup panel">
            ×
          </button>
        </div>
        <div className="dialog__body">{children}</div>
      </div>
    </dialog>
  );
}
