import { useEffect, useState } from 'react';
import { todayYmdLocal } from '../../lib/huoltoSchedule';

type Props = {
  open: boolean;
  deviceName: string;
  busy: boolean;
  error?: string | null;
  onConfirm: (ymd: string) => void;
  onCancel: () => void;
};

/** Vahvistus: laite poistetaan käytöstä (ei rekisteristä), poistopäivä valinnainen (oletus tänään). */
export default function DecommissionDialog({ open, deviceName, busy, error, onConfirm, onCancel }: Props) {
  const [ymd, setYmd] = useState(todayYmdLocal());

  useEffect(() => {
    if (open) setYmd(todayYmdLocal());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="leave-draft-dialog panel decommission-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="decommission-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="decommission-title">Poista käytöstä?</h2>
        <p className="muted">{deviceName}. Huoltohistoria säilyy, huoltoa ei enää vaadita.</p>
        <label className="decommission-date">
          Poistopäivä
          <input type="date" value={ymd} onChange={(e) => setYmd(e.target.value)} disabled={busy} />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <div className="leave-draft-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Peruuta
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onConfirm(ymd || todayYmdLocal())}
            disabled={busy}
          >
            {busy ? 'Tallennetaan…' : 'Poista käytöstä'}
          </button>
        </div>
      </div>
    </div>
  );
}
