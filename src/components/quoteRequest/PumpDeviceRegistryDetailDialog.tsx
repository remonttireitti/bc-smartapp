import { useEffect } from 'react';
import { IILP_FEATURE_OPTIONS, VILP_FEATURE_OPTIONS } from '../../data/deviceFeatureOptions';
import { getDefaultDiscountFromListPercent } from '../../data/devicePricingShared';
import type { DeviceRegistryOverride } from '../../data/deviceRegistryTypes';
import type { HeatPumpDevice } from '../../data/pumpDeviceCatalog';

type Props = {
  device: HeatPumpDevice;
  override: DeviceRegistryOverride | undefined;
  draft: Partial<DeviceRegistryOverride>;
  onDraftChange: (patch: Partial<DeviceRegistryOverride>) => void;
  onSave: () => void;
  onClose: () => void;
  busy: boolean;
};

export default function PumpDeviceRegistryDetailDialog({
  device,
  override,
  draft,
  onDraftChange,
  onSave,
  onClose,
  busy,
}: Props) {
  const merged = { deviceId: device.id, ...override, ...draft } as DeviceRegistryOverride;
  const featureOptions =
    device.category === 'ilmalampopumppu' ? IILP_FEATURE_OPTIONS : VILP_FEATURE_OPTIONS;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

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
        aria-labelledby="pump-device-registry-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pump-device-registry-dialog-head">
          <div>
            <h2 id="pump-device-registry-title">{device.name}</h2>
            <p className="muted pump-device-registry-dialog-meta">
              {device.brand} • {device.model} • {device.category === 'ilmalampopumppu' ? 'IILP' : 'VILP'}
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Sulje
          </button>
        </div>

        <p className="muted pump-device-registry-dialog-intro">
          Kuvat: suora URL (sisä- ja ulkoyksikkö erikseen). Ominaisuudet näkyvät tarjouksen tulosteessa.
        </p>

        <form
          className="form-grid pump-device-registry-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <section className="form-section">
            <h3>Kuvat</h3>
            <div className="line-form-grid pump-device-registry-field-stack">
              <label>
                Sisäyksikkö (URL)
                <input
                  type="url"
                  placeholder="https://…"
                  value={merged.imageUrlIndoor ?? ''}
                  onChange={(e) => onDraftChange({ imageUrlIndoor: e.target.value || null })}
                />
              </label>
              <label>
                Ulkoyksikkö (URL)
                <input
                  type="url"
                  placeholder="https://…"
                  value={merged.imageUrlOutdoor ?? ''}
                  onChange={(e) => onDraftChange({ imageUrlOutdoor: e.target.value || null })}
                />
              </label>
            </div>
          </section>

          <section className="form-section pump-device-registry-pricing">
            <h3>Hinnoittelu</h3>
            <div className="line-form-grid pump-device-registry-pricing-grid">
              <label>
                Alennus % listasta
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder={`Oletus ${getDefaultDiscountFromListPercent(device)}`}
                  value={merged.discountFromListPercentOverride ?? ''}
                  onChange={(e) =>
                    onDraftChange({
                      discountFromListPercentOverride:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </label>

              {device.category === 'ilmalampopumppu' && (
                <label>
                  Myyntitapa
                  <select
                    value={merged.iilpProductModeOverride ?? '__catalog__'}
                    onChange={(e) =>
                      onDraftChange({
                        iilpProductModeOverride:
                          e.target.value === '__catalog__'
                            ? null
                            : (e.target.value as 'cooling_only' | 'cooling_and_heating'),
                      })
                    }
                  >
                    <option value="__catalog__">
                      Katalogin oletus (
                      {(device.iilpProductMode ?? 'cooling_and_heating') === 'cooling_only'
                        ? 'pelkkä jäähdytys'
                        : 'jäähdytys + lämmitys'}
                      )
                    </option>
                    <option value="cooling_and_heating">Jäähdytys + lämmitys (pakota)</option>
                    <option value="cooling_only">Pelkkä jäähdytys (pakota)</option>
                  </select>
                </label>
              )}

              {device.category === 'vesi-ilmalampopumppu' && (
                <label>
                  Ulkoyksikön syöttö
                  <select
                    value={merged.vilpOutdoorSupplyPhases ?? ''}
                    onChange={(e) =>
                      onDraftChange({
                        vilpOutdoorSupplyPhases:
                          e.target.value === '' ? null : (Number(e.target.value) as 1 | 3),
                      })
                    }
                  >
                    <option value="">— ei valittu</option>
                    <option value="1">1-vaihe</option>
                    <option value="3">3-vaihe</option>
                  </select>
                </label>
              )}
            </div>
            <p className="field-hint muted pump-device-registry-pricing-hint">
              Alennus: tyhjä = oletus {getDefaultDiscountFromListPercent(device)} %
            </p>
          </section>

          <section className="form-section pump-device-registry-features">
            <h3>Ominaisuudet tulosteessa</h3>
            <div className="pump-device-feature-grid">
              {featureOptions.map((opt) => {
                const selected = new Set(merged.selectedFeatureIds || []);
                return (
                  <label key={opt.id} className="pump-device-feature-option">
                    <input
                      type="checkbox"
                      checked={selected.has(opt.id)}
                      onChange={(e) => {
                        const next = new Set(merged.selectedFeatureIds || []);
                        if (e.target.checked) next.add(opt.id);
                        else next.delete(opt.id);
                        onDraftChange({ selectedFeatureIds: [...next] });
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="form-section">
            <h3>Muistiinpanot</h3>
            <div className="pump-device-registry-field-stack">
              <label>
                Vain rekisteriin (ei tulosteeseen)
                <textarea
                  rows={2}
                  value={merged.notes ?? ''}
                  onChange={(e) => onDraftChange({ notes: e.target.value || null })}
                />
              </label>
              <label>
                Lisäominaisuudet tulosteeseen (yksi rivi / ominaisuus)
                <textarea
                  rows={3}
                  value={merged.extraPrintFeatures ?? ''}
                  onChange={(e) => onDraftChange({ extraPrintFeatures: e.target.value })}
                />
              </label>
            </div>
          </section>

          <div className="leave-draft-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Peruuta
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Tallennetaan…' : 'Tallenna ja sulje'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
