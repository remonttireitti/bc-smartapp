import type { QuoteRequestData } from '../../lib/quoteRequest/types';
import { syncManualDeviceSalePatch } from '../../lib/quoteRequest/manualDevicePricing';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

export function QuoteManualDevicePricingSection({ form, canEdit, onChange }: Props) {
  function patchDevice(patch: Partial<QuoteRequestData>) {
    onChange(syncManualDeviceSalePatch(form, patch));
  }

  return (
    <section className="form-section quote-manual-device-pricing">
      <h3>Laite / urakka</h3>
      <p className="muted">
        Syötä laitteen hankintahinta ja kate — myyntihinta lasketaan kuten tarvikkeilla. Laitteen nimi
        tulostuu Kohde-välilehden merkki/malli -kentistä.
      </p>
      <div className="quote-line-row panel-inset">
        <div className="line-form-grid">
          <label>
            Hankintahinta (€, alv 0)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.devicePurchaseOverrideNet ?? ''}
              onChange={(e) =>
                patchDevice({
                  devicePurchaseOverrideNet: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              disabled={!canEdit}
            />
          </label>
          <label>
            Kate (%)
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.deviceMarginPercent}
              onChange={(e) =>
                patchDevice({
                  deviceMarginPercent: Number(e.target.value),
                })
              }
              disabled={!canEdit}
            />
          </label>
          <label>
            Myyntihinta (€, alv 0)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.deviceSaleOverrideNet ?? ''}
              onChange={(e) =>
                onChange({
                  deviceSaleOverrideNet: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              disabled={!canEdit}
            />
          </label>
        </div>
      </div>
    </section>
  );
}
