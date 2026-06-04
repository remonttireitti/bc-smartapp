import { FormEvent, useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  submitLabel: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
}

export default function DailyLogDialog({
  open,
  title,
  submitLabel,
  busy = false,
  onClose,
  onSubmit,
  children,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="leave-draft-dialog daily-log-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-log-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="daily-log-dialog-title">{title}</h2>
        <p className="muted daily-log-dialog-hint">
          Kirjaa päivän työt, tunnit ja tarvikkeet. Voit lisätä kuvia ennen tallennusta.
        </p>
        <form className="daily-log-form" onSubmit={onSubmit}>
          {children}
          <div className="leave-draft-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Peruuta
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Tallennetaan…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
