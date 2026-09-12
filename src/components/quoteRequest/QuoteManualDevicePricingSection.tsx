import { hasOfferedDeviceRows } from '../../lib/quoteRequest/installationSupplies';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';
import { syncManualDeviceSalePatch } from '../../lib/quoteRequest/manualDevicePricing';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
  hideHeader?: boolean;
};

export function QuoteManualDevicePricingSection({ form, canEdit, onChange, hideHeader = false }: Props) {
  function patchDevice(patch: Partial<QuoteRequestData>) {
    onChange(syncManualDeviceSalePatch(form, patch));
  }

  if (hasOfferedDeviceRows(form.installationSupplies)) {
    return (
      <section className={`quote-manual-device-pricing${hideHeader ? '' : ' form-section'}`}>
        <p className="muted">
          Laitteet on merkitty <strong>Työt &amp; tarvikkeet</strong> -osion riveille tyypillä{' '}
          <strong>Tarjottu laite</strong>. Tämä erillinen kenttä on piilotettu, jotta hankintaa ei
          kirjata kahteen paikkaan.
        </p>
      </section>
    );
  }

  return (
    <section className={`quote-manual-device-pricing${hideHeader ? '' : ' form-section'}`}>
      {!hideHeader ? (
        <>
          <h3>Laite / urakka</h3>
          <p className="muted">
            Syötä laitteen hankintahinta ja kate — myyntihinta lasketaan kuten tarvikkeilla. Kun myyntihinta on
            sovittu, hankinnan muutos päivittää kate-%:n. Laitteen nimi tulostuu Kohde-välilehden merkki/malli
            -kentistä.
          </p>
        </>
      ) : (
        <p className="muted">
          Syötä laitteen hankintahinta ja kate — myyntihinta lasketaan kuten tarvikkeilla. Kun myyntihinta on
          sovittu, hankinnan muutos päivittää kate-%:n.
        </p>
      )}
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
                patchDevice({
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
