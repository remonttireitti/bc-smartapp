import { createEmptyWorkItem } from '../../lib/quoteRequest/defaults';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';
import QuoteInstallationLaborSection from './QuoteInstallationLaborSection';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
  variant?: 'all' | 'work' | 'materials';
};

export default function QuoteWorkMaterialsSection({
  form,
  canEdit,
  onChange,
  variant = 'all',
}: Props) {
  const showWork = variant === 'all' || variant === 'work';

  if (!showWork) return null;

  return (
    <>
      <div className="section-header-row">
        <h3>Työrivit</h3>
        {canEdit && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onChange({ workItems: [...form.workItems, createEmptyWorkItem()] })}
          >
            + Lisää työ
          </button>
        )}
      </div>
      {form.workItems.map((item, index) => (
        <div key={item.id} className="quote-line-row panel-inset">
          <div className="quote-line-head">
            <strong>Työ {index + 1}</strong>
            {canEdit && form.workItems.length > 1 && (
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  onChange({ workItems: form.workItems.filter((row) => row.id !== item.id) })
                }
              >
                Poista
              </button>
            )}
          </div>
          <label>
            Kuvaus
            <input
              value={item.description}
              onChange={(e) =>
                onChange({
                  workItems: form.workItems.map((row) =>
                    row.id === item.id ? { ...row, description: e.target.value } : row,
                  ),
                })
              }
              disabled={!canEdit}
            />
          </label>
          <div className="line-form-grid">
            <label>
              Tunnit
              <input
                type="number"
                step="0.25"
                min="0"
                value={item.hours}
                onChange={(e) =>
                  onChange({
                    workItems: form.workItems.map((row) =>
                      row.id === item.id ? { ...row, hours: Number(e.target.value) } : row,
                    ),
                  })
                }
                disabled={!canEdit}
              />
            </label>
            <label>
              Tuntihinta (€)
              <input
                type="number"
                step="0.01"
                min="0"
                value={item.pricePerHour}
                onChange={(e) =>
                  onChange({
                    workItems: form.workItems.map((row) =>
                      row.id === item.id ? { ...row, pricePerHour: Number(e.target.value) } : row,
                    ),
                  })
                }
                disabled={!canEdit}
              />
            </label>
          </div>
        </div>
      ))}

      <QuoteInstallationLaborSection form={form} canEdit={canEdit} onChange={onChange} />
    </>
  );
}
