import { FormEvent, useEffect, useState } from 'react';
import type { SiblingEquipmentCopyInput } from '../../lib/huoltoRaportti/siblingEquipmentCopy';

export type SiblingEquipmentCopyDialogDefaults = {
  malli?: string;
  valmistaja?: string;
};

interface Props {
  open: boolean;
  busy: boolean;
  sourceLabel?: string;
  defaults?: SiblingEquipmentCopyDialogDefaults;
  onConfirm: (input: SiblingEquipmentCopyInput) => void;
  onCancel: () => void;
}

export function SiblingEquipmentCopyDialog({
  open,
  busy,
  sourceLabel,
  defaults,
  onConfirm,
  onCancel,
}: Props) {
  const [tunnus, setTunnus] = useState('');
  const [sarjanumero, setSarjanumero] = useState('');
  const [sameModel, setSameModel] = useState(true);
  const [malli, setMalli] = useState('');
  const [valmistaja, setValmistaja] = useState('');

  useEffect(() => {
    if (!open) return;
    setTunnus('');
    setSarjanumero('');
    setSameModel(true);
    setMalli(defaults?.malli ?? '');
    setValmistaja(defaults?.valmistaja ?? '');
  }, [open, defaults?.malli, defaults?.valmistaja]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tunnus.trim()) return;
    onConfirm({
      tunnus: tunnus.trim(),
      sarjanumero: sarjanumero.trim(),
      sameModel,
      malli: sameModel ? undefined : malli.trim(),
      valmistaja: sameModel ? undefined : valmistaja.trim(),
    });
  }

  return (
    <div className="leave-draft-overlay konvektori-dialog-overlay" role="presentation" onClick={busy ? undefined : onCancel}>
      <form
        className="leave-draft-dialog panel sibling-equipment-copy-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sibling-equipment-copy-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 id="sibling-equipment-copy-title">Uusi laite ja huoltopöytäkirja</h2>
        <p className="muted konvektori-dialog-help">
          {sourceLabel
            ? `Luodaan kopio laitteesta ${sourceLabel}. Täytä uuden laitteen tunnistetiedot — laite tallennetaan rekisteriin ja uusi luonnospöytäkirja avataan automaattisesti.`
            : 'Luodaan uusi laite rekisteriin ja huoltopöytäkirja kopiona. Täytä uuden laitteen tunnistetiedot.'}
        </p>

        <label className="konvektori-mittaus-field">
          Laitetunnus *
          <input
            value={tunnus}
            onChange={(e) => setTunnus(e.target.value)}
            placeholder="esim. Jäähdytyskone 2"
            required
            autoFocus
            disabled={busy}
          />
        </label>

        <label className="konvektori-mittaus-field">
          Sarjanumero
          <input
            value={sarjanumero}
            onChange={(e) => setSarjanumero(e.target.value)}
            placeholder="Uuden laitteen sarjanumero"
            disabled={busy}
          />
        </label>

        <label className="konvektori-tarkastus-item sibling-equipment-copy-same-model">
          <input
            type="checkbox"
            checked={sameModel}
            onChange={(e) => setSameModel(e.target.checked)}
            disabled={busy}
          />
          <span className="konvektori-tarkastus-label">
            Sama malli ja valmistaja
            {defaults?.malli || defaults?.valmistaja ? (
              <span className="muted sibling-equipment-copy-source-model">
                {' '}
                ({[defaults?.valmistaja, defaults?.malli].filter(Boolean).join(' ') || '—'})
              </span>
            ) : null}
          </span>
        </label>

        {!sameModel ? (
          <div className="line-form-grid sibling-equipment-copy-model-fields">
            <label className="konvektori-mittaus-field">
              Valmistaja
              <input
                value={valmistaja}
                onChange={(e) => setValmistaja(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="konvektori-mittaus-field">
              Malli
              <input
                value={malli}
                onChange={(e) => setMalli(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>
        ) : null}

        <div className="leave-draft-actions konvektori-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Peruuta
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !tunnus.trim()}>
            {busy ? 'Luodaan…' : 'Luo laite ja pöytäkirja'}
          </button>
        </div>
      </form>
    </div>
  );
}
