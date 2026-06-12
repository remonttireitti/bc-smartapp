import { useEffect, useState } from 'react';
import { createEmptyCustomPumpDeviceDraft } from '../../data/customPumpDevices';
import type { CustomHeatPumpDeviceEntry } from '../../data/deviceRegistryTypes';
import { DEVICE_REGISTRY_BRANDS } from '../../lib/quoteRequest/constants';

type Props = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (entry: CustomHeatPumpDeviceEntry) => void;
};

export default function PumpDeviceRegistryAddDialog({ open, busy, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<CustomHeatPumpDeviceEntry>(() => createEmptyCustomPumpDeviceDraft());

  useEffect(() => {
    if (open) {
      setDraft(createEmptyCustomPumpDeviceDraft());
    }
  }, [open]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    if (open) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  const canSave = draft.brand.trim() && draft.name.trim() && Number(draft.listPrice) > 0;

  return (
    <div
      className="leave-draft-overlay pump-device-registry-overlay"
      role="presentation"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="leave-draft-dialog pump-device-registry-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pump-device-add-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pump-device-registry-dialog-head">
          <div>
            <h2 id="pump-device-add-title">Lisää oma laite</h2>
            <p className="muted pump-device-registry-dialog-meta">
              Kirjoita laitteen tiedot käsin. Laite näkyy tarjouspyynnöissä ja rekisterissä.
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Sulje
          </button>
        </div>

        <form
          className="form-grid pump-device-registry-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave || busy) return;
            onSave({
              ...draft,
              brand: draft.brand.trim(),
              name: draft.name.trim(),
              model: draft.model.trim() || draft.name.trim(),
              listPrice: Number(draft.listPrice) || 0,
              heatingPowerMin: Number(draft.heatingPowerMin) || 0,
              heatingPowerMax: Number(draft.heatingPowerMax) || 0,
              defaultDiscountPercent: Number(draft.defaultDiscountPercent) || 0,
            });
          }}
        >
          <div className="line-form-grid">
            <label>
              Tyyppi *
              <select
                value={draft.category}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    category: e.target.value as CustomHeatPumpDeviceEntry['category'],
                  }))
                }
              >
                <option value="ilmalampopumppu">IILP (ilmalämpöpumppu)</option>
                <option value="vesi-ilmalampopumppu">VILP (vesi-ilmalämpöpumppu)</option>
              </select>
            </label>
            <label>
              Brändi *
              <input
                list="pump-device-brand-options"
                value={draft.brand}
                onChange={(e) => setDraft((prev) => ({ ...prev, brand: e.target.value }))}
                placeholder="Esim. Daikin, Mitsubishi"
              />
              <datalist id="pump-device-brand-options">
                {DEVICE_REGISTRY_BRANDS.map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>
            </label>
            <label>
              Nimi / paketti *
              <input
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Esim. Mitsubishi MSZ-AP35VG"
              />
            </label>
            <label>
              Mallikoodi
              <input
                value={draft.model}
                onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
                placeholder="Valinnainen, tulosteeseen"
              />
            </label>
            <label>
              Listahinta € (alv 0) *
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.listPrice || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, listPrice: Number(e.target.value) }))}
              />
            </label>
            <label>
              Lämmitysteho max (kW)
              <input
                type="number"
                min="0"
                step="0.1"
                value={draft.heatingPowerMax || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, heatingPowerMax: Number(e.target.value) }))}
              />
            </label>
            <label>
              Lämmitysteho min (kW)
              <input
                type="number"
                min="0"
                step="0.1"
                value={draft.heatingPowerMin || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, heatingPowerMin: Number(e.target.value) }))}
              />
            </label>
            <label>
              Oletusalennus listasta (%)
              <input
                type="number"
                min="0"
                step="0.1"
                value={draft.defaultDiscountPercent ?? ''}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, defaultDiscountPercent: Number(e.target.value) }))
                }
              />
            </label>
          </div>

          <label>
            Muistiinpanot
            <textarea
              rows={2}
              value={draft.notes ?? ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Valinnainen"
            />
          </label>

          <div className="btn-group">
            <button type="submit" className="btn btn-primary" disabled={!canSave || busy}>
              {busy ? 'Tallennetaan…' : 'Tallenna laite'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Peruuta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
