import { useEffect } from 'react';

import { getWorkStatusLabel, type WorkStatus } from '../types';

type Props = {
  open: boolean;
  busy: boolean;
  reportTitle: string;
  currentStatus: WorkStatus | string;
  onMarkCompleted: () => void;
  onKeepInProgress: () => void;
  onCancel: () => void;
};

export default function PartnerBillWorkflowDialog({
  open,
  busy,
  reportTitle,
  currentStatus,
  onMarkCompleted,
  onKeepInProgress,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const statusLabel = getWorkStatusLabel(currentStatus);

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="leave-draft-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="partner-bill-workflow-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="partner-bill-workflow-title">Merkitään laskutetuksi</h2>
        <p className="muted">
          <strong>{reportTitle}</strong> on tilassa <strong>{statusLabel}</strong>. Haluatko merkitä työraportin
          valmiiksi vai jättää sen työn alle?
        </p>
        <div className="leave-draft-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Peruuta
          </button>
          <button type="button" className="btn btn-secondary" onClick={onKeepInProgress} disabled={busy}>
            Jää työn alle
          </button>
          <button type="button" className="btn btn-primary" onClick={onMarkCompleted} disabled={busy}>
            {busy ? 'Tallennetaan…' : 'Merkitse valmis'}
          </button>
        </div>
      </div>
    </div>
  );
}
