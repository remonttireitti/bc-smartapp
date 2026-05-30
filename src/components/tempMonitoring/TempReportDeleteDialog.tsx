import { useEffect } from 'react';

type Props = {
  open: boolean;
  reportTitle: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export default function TempReportDeleteDialog({
  open,
  reportTitle,
  busy = false,
  error = null,
  onClose,
  onConfirm,
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
        className="leave-draft-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="temp-report-delete-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="temp-report-delete-title">Poista raportti</h2>
        <p>
          Poistetaanko raportti <strong>{reportTitle}</strong>? Toimintoa ei voi perua.
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="leave-draft-actions">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            Peruuta
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Poistetaan…' : 'Poista raportti'}
          </button>
        </div>
      </div>
    </div>
  );
}
