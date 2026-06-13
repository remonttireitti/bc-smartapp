import { getIilpBaseInstallParts, resolveIilpLaborPricingMode } from '../../lib/quoteRequest/calculations';
import type { IilpLaborPricingMode, QuoteRequestData } from '../../lib/quoteRequest/types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

export default function QuoteIilpOptionsSection({ form, canEdit, onChange }: Props) {
  const mode = resolveIilpLaborPricingMode(form);
  const installParts = getIilpBaseInstallParts(form);

  function setMode(next: IilpLaborPricingMode) {
    if (next === mode) return;
    onChange({
      iilpLaborPricingMode: next,
      ...(next === 'urakka'
        ? {
            laborHours: 0,
            workItems: form.workItems.map((wi) =>
              wi.description === 'Työ' ? { ...wi, hours: 0 } : wi,
            ),
          }
        : {}),
    });
  }

  return (
    <section className="form-section">
      <h2>Asennuksen hinnoittelu</h2>
      <p className="muted">
        Työ hinnoitellaan oletuksena urakkahinnalla. Vaihtoehtoisesti tuntityönä Työt &amp; tarvikkeet
        -välilehdellä. Asennustarvikkeet lasketaan aina erikseen.
      </p>
      <div className="quote-vat-profile-options">
        <label className="quote-vat-profile-option">
          <input
            type="radio"
            name="iilpLaborPricingMode"
            value="urakka"
            checked={mode === 'urakka'}
            disabled={!canEdit}
            onChange={() => setMode('urakka')}
          />
          <span>Urakkahinta</span>
        </label>
        <label className="quote-vat-profile-option">
          <input
            type="radio"
            name="iilpLaborPricingMode"
            value="tuntityo"
            checked={mode === 'tuntityo'}
            disabled={!canEdit}
            onChange={() => setMode('tuntityo')}
          />
          <span>Tuntityönä</span>
        </label>
      </div>

      {mode === 'urakka' && (
        <div className="line-form-grid panel-inset">
          <label>
            Asennustyö urakkahinta (€, sis. ALV)
            <input
              type="number"
              min="0"
              step="1"
              value={form.iilpBaseInstallLaborGross}
              disabled={!canEdit}
              onChange={(e) =>
                onChange({ iilpBaseInstallLaborGross: Number(e.target.value) })
              }
            />
          </label>
        </div>
      )}

      {mode === 'tuntityo' && (
        <p className="muted panel-inset">
          Syötä tunnit ja tuntihinta Työt &amp; tarvikkeet -välilehdellä. Lisätyöt laskutetaan
          erikseen Hinnoittelu-välilehden tuntihinnalla.
        </p>
      )}

      <div className="line-form-grid panel-inset">
        <label>
          Asennustarvikkeet (€, sis. ALV)
          <input
            type="number"
            min="0"
            step="1"
            value={form.iilpBaseInstallMaterialsGross}
            disabled={!canEdit}
            onChange={(e) =>
              onChange({ iilpBaseInstallMaterialsGross: Number(e.target.value) })
            }
          />
        </label>
        <p className="quote-summary-box">
          {mode === 'urakka' ? (
            <>
              Asennus yhteensä:{' '}
              <strong>
                {installParts.totalGross.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
              </strong>{' '}
              (työ + tarvikkeet, alv 0:{' '}
              {installParts.totalNet.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })})
            </>
          ) : (
            <>
              Asennustarvikkeet:{' '}
              <strong>
                {installParts.materialsGross.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
              </strong>{' '}
              (alv 0:{' '}
              {installParts.materialsNet.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })})
            </>
          )}
        </p>
      </div>
    </section>
  );
}
