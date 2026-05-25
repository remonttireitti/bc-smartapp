import { getIilpBaseInstallParts } from '../../lib/quoteRequest/calculations';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

export default function QuoteIilpOptionsSection({ form, canEdit, onChange }: Props) {
  const baseInstall = getIilpBaseInstallParts(form);

  return (
    <section className="form-section">
      <h2>Ilmalämpöpumpun asennus</h2>
      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={form.iilpBaseInstallEnabled}
          disabled={!canEdit}
          onChange={(e) =>
            onChange({
              iilpBaseInstallEnabled: e.target.checked,
              laborHours: e.target.checked ? 0 : form.laborHours,
            })
          }
        />
        Sisällytä perusasennuspaketti (työ + tarvikkeet)
      </label>

      {form.iilpBaseInstallEnabled && (
        <div className="line-form-grid panel-inset">
          <label>
            Työn osuus (€, sis. ALV)
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
          <label>
            Tarvikkeet (€, sis. ALV)
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
            Perusasennus yhteensä:{' '}
            <strong>
              {baseInstall.totalGross.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
            </strong>{' '}
            (alv 0: {baseInstall.totalNet.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })})
          </p>
        </div>
      )}
    </section>
  );
}
