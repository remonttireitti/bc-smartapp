import { useEffect } from 'react';

export type ActionStatusVariant = 'success' | 'error' | 'warning' | 'info' | 'loading';

const VARIANT_LABELS: Record<ActionStatusVariant, string> = {
  success: 'Onnistui',
  error: 'Virhe',
  warning: 'Huomio',
  info: 'Ilmoitus',
  loading: 'Odota hetki',
};

type Props = {
  open: boolean;
  variant: ActionStatusVariant;
  title?: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onClose: () => void;
};

export function actionStatusTitle(variant: ActionStatusVariant, title?: string) {
  return title?.trim() || VARIANT_LABELS[variant];
}

export default function ActionStatusDialog({
  open,
  variant,
  title,
  message,
  confirmLabel = 'OK',
  busy = false,
  onClose,
}: Props) {
  const isLoading = variant === 'loading' || busy;
  const resolvedTitle = actionStatusTitle(variant, title);

  useEffect(() => {
    if (!open || isLoading) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isLoading, onClose]);

  if (!open) return null;

  return (
    <div
      className="action-status-overlay leave-draft-overlay"
      role="presentation"
      onClick={isLoading ? undefined : onClose}
    >
      <div
        className={`leave-draft-dialog panel action-status-dialog action-status-dialog--${variant}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="action-status-dialog-title"
        aria-describedby="action-status-dialog-message"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="action-status-dialog-title">{resolvedTitle}</h2>
        <p id="action-status-dialog-message" className="action-status-dialog-message">
          {message}
        </p>
        {!isLoading && (
          <div className="leave-draft-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {confirmLabel}
            </button>
          </div>
        )}
        {isLoading && <p className="muted action-status-dialog-loading">Odota hetki…</p>}
      </div>
    </div>
  );
}
