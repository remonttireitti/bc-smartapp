import { FormEvent, useEffect } from 'react';
import TempSessionSettingsFields from './TempSessionSettingsFields';
import type { TempSessionSettingsInput } from '../../lib/tempMonitoring';

type Props = {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  value: TempSessionSettingsInput;
  onChange: (next: TempSessionSettingsInput) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
};

export default function TempSessionSettingsDialog({
  open,
  busy = false,
  error = null,
  value,
  onChange,
  onClose,
  onSubmit,
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
        className="leave-draft-dialog temp-session-settings-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="temp-session-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="temp-session-settings-title">Mittauksen asetukset</h2>
        <form className="form-grid" onSubmit={onSubmit}>
          <TempSessionSettingsFields value={value} onChange={onChange} idPrefix="temp-session-dialog" />
          {error && <p className="form-error">{error}</p>}
          <div className="leave-draft-actions">
            <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
              Peruuta
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Tallennetaan…' : 'Tallenna'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
