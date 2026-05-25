import { useEffect } from 'react';

interface Props {
  open: boolean;
  saveBusy: boolean;
  onSaveAndLeave: () => void;
  onLeaveWithoutSaving: () => void;
  onCancel: () => void;
}

export default function LeaveDraftDialog({
  open,
  saveBusy,
  onSaveAndLeave,
  onLeaveWithoutSaving,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saveBusy) onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saveBusy, onCancel]);

  if (!open) return null;

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={saveBusy ? undefined : onCancel}>
      <div
        className="leave-draft-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-draft-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="leave-draft-title">Poistutaanko raportista?</h2>
        <p className="muted">
          Sinulla on tallentamattomia muutoksia. Haluatko tallentaa luonnoksen ennen poistumista?
        </p>
        <div className="leave-draft-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saveBusy}>
            Jatka muokkausta
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onLeaveWithoutSaving}
            disabled={saveBusy}
          >
            Poistu tallentamatta
          </button>
          <button type="button" className="btn btn-primary" onClick={onSaveAndLeave} disabled={saveBusy}>
            {saveBusy ? 'Tallennetaan…' : 'Tallenna ja poistu'}
          </button>
        </div>
      </div>
    </div>
  );
}
