import ToggleSwitch from '../ToggleSwitch';
import { createEmptyOptionalItem } from '../../lib/quoteRequest/defaults';
import { formatOptionalItemPrintPrice } from '../../lib/quoteRequest/optionalItemsPrint';
import type { QuoteOptionalItem, QuoteRequestData } from '../../lib/quoteRequest/types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
  title?: string;
  hint?: string;
  hideHeader?: boolean;
};

function patchItem(
  items: QuoteOptionalItem[],
  id: string,
  patch: Partial<QuoteOptionalItem>,
): QuoteOptionalItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export default function QuoteOptionalItemsSection({
  form,
  canEdit,
  onChange,
  title = 'Valinnaiset lisät',
  hint = 'Optionaaliset lisätyöt ja -tarvikkeet. Näitä ei sisällytetä tarjouksen kokonaishintaan — ne esitetään erikseen tarpeen mukaan.',
  hideHeader = false,
}: Props) {
  const items = form.optionalItems ?? [];

  return (
    <section className={hideHeader ? 'quote-optional-items-section' : 'form-section'}>
      {!hideHeader ? <h2>{title}</h2> : null}
      <p className="muted">{hint}</p>
      {items.map((item, index) => (
        <div key={item.id} className="quote-line-row panel-inset">
          <div className="quote-line-head">
            <strong>Option {index + 1}</strong>
            {canEdit && items.length > 1 && (
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  onChange({ optionalItems: items.filter((row) => row.id !== item.id) })
                }
              >
                Poista
              </button>
            )}
          </div>
          <ToggleSwitch
            id={`optional-item-${item.id}`}
            checked={item.enabled}
            disabled={!canEdit}
            label="Tarjoa asiakkaalle"
            onChange={(checked) =>
              onChange({ optionalItems: patchItem(items, item.id, { enabled: checked }) })
            }
          />
          <div className="quote-field-grid quote-field-grid-2">
            <label>
              Kuvaus
              <input
                value={item.description}
                disabled={!canEdit}
                onChange={(e) =>
                  onChange({
                    optionalItems: patchItem(items, item.id, { description: e.target.value }),
                  })
                }
              />
            </label>
            <label>
              Hinta (€, alv 0 %)
              <input
                type="number"
                min="0"
                step="1"
                value={item.priceGross}
                disabled={!canEdit}
                onChange={(e) =>
                  onChange({
                    optionalItems: patchItem(items, item.id, { priceGross: Number(e.target.value) }),
                  })
                }
              />
            </label>
          </div>
          {item.enabled && item.description.trim() && (
            <p className="muted">
              Tulosteessa: {item.description.trim()} —{' '}
              {formatOptionalItemPrintPrice(item.priceGross, form.vatRate)}
              {form.vatRate > 0 ? ` (sis. ALV ${form.vatRate} %)` : ''}
            </p>
          )}
        </div>
      ))}
      {canEdit && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            onChange({ optionalItems: [...items, createEmptyOptionalItem({ description: 'Uusi option' })] })
          }
        >
          + Lisää option
        </button>
      )}
    </section>
  );
}
