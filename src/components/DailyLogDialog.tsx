import { FormEvent, useEffect, type ReactNode } from 'react';

import { DailyLogSectionProvider, useDailyLogSectionOpen } from './DailyLogSectionContext';

interface Props {
  open: boolean;
  title: string;
  submitLabel: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onDelete?: () => void;
  children: ReactNode;
}

function DailyLogDialogFrame({
  title,
  submitLabel,
  busy = false,
  onClose,
  onSubmit,
  onDelete,
  children,
}: Omit<Props, 'open'>) {
  const nestedSectionOpen = useDailyLogSectionOpen();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || busy || nestedSectionOpen) return;
      onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, nestedSectionOpen, onClose]);

  return (
    <div
      className="leave-draft-overlay"
      role="presentation"
      onClick={busy || nestedSectionOpen ? undefined : onClose}
    >
      <div
        className="leave-draft-dialog daily-log-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-log-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="daily-log-dialog-title">{title}</h2>
        <p className="muted daily-log-dialog-hint">
          Kirjaa päivän työt, tunnit ja tarvikkeet. Avaa ruudut täyttääksesi tiedot. Voit lisätä kuvia ennen
          tallennusta.
        </p>
        <form className="daily-log-form" onSubmit={onSubmit}>
          <div className="grid work-report-section-grid daily-log-section-grid">{children}</div>
          <div className="leave-draft-actions daily-log-dialog-actions">
            {onDelete ? (
              <button
                type="button"
                className="btn btn-secondary daily-log-dialog-delete"
                disabled={busy}
                onClick={onDelete}
              >
                Poista työkirjaus
              </button>
            ) : null}
            <div className="daily-log-dialog-actions-main">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
                Peruuta
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Tallennetaan…' : submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DailyLogDialog({ open, ...props }: Props) {
  if (!open) return null;

  return (
    <DailyLogSectionProvider dialogOpen={open}>
      <DailyLogDialogFrame {...props} />
    </DailyLogSectionProvider>
  );
}
