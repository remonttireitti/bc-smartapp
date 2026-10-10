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
  /** Osio, joka avataan heti dialogin avautuessa. */
  initialSectionKey?: string | null;
  /** Kohdistettu muokkaus: vain nämä osiot (esim. ['expenses']) suoraan auki. */
  focusSectionKeys?: string[] | null;
  /** "Avaa koko kirjaus" kohdistetusta muokkauksesta. */
  onOpenFull?: () => void;
  children: ReactNode;
}

function DailyLogDialogFrame({
  title,
  submitLabel,
  busy = false,
  onClose,
  onSubmit,
  onDelete,
  onOpenFull,
  focused = false,
  children,
}: Omit<Props, 'open' | 'initialSectionKey' | 'focusSectionKeys'> & { focused?: boolean }) {
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
        {focused ? (
          onOpenFull ? (
            <p className="daily-log-dialog-hint">
              <button type="button" className="btn-link" onClick={onOpenFull} disabled={busy}>
                Avaa koko kirjaus
              </button>
            </p>
          ) : null
        ) : (
          <p className="muted daily-log-dialog-hint">
            Kirjaa päivän työt, tunnit ja tarvikkeet. Avaa ruudut täyttääksesi tiedot. Voit lisätä kuvia ennen
            tallennusta.
          </p>
        )}
        <form className="daily-log-form" onSubmit={onSubmit}>
          <div className={focused ? 'daily-log-focus-body' : 'grid work-report-section-grid daily-log-section-grid'}>
            {children}
          </div>
          <div className="leave-draft-actions daily-log-dialog-actions">
            {onDelete && !focused ? (
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

export default function DailyLogDialog({
  open,
  initialSectionKey = null,
  focusSectionKeys = null,
  ...props
}: Props) {
  if (!open) return null;
  const focused = !!focusSectionKeys?.length;

  return (
    <DailyLogSectionProvider
      key={focused ? focusSectionKeys!.join(',') : 'full'}
      dialogOpen={open}
      initialOpenKey={focused ? null : initialSectionKey}
      focusKeys={focused ? focusSectionKeys : null}
    >
      <DailyLogDialogFrame {...props} focused={focused} />
    </DailyLogSectionProvider>
  );
}
