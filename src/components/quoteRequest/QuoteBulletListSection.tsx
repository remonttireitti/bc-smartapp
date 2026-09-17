import { createEmptyBulletItem } from '../../lib/quoteRequest/defaults';
import type { QuoteBulletItem } from '../../lib/quoteRequest/types';

type Props = {
  title: string;
  hint: string;
  items: QuoteBulletItem[];
  canEdit: boolean;
  addLabel: string;
  placeholder?: string;
  hideHeader?: boolean;
  onChange: (items: QuoteBulletItem[]) => void;
};

export default function QuoteBulletListSection({
  title,
  hint,
  items,
  canEdit,
  addLabel,
  placeholder = 'Kirjoita kohta…',
  hideHeader = false,
  onChange,
}: Props) {
  function patchItem(id: string, text: string) {
    onChange(items.map((row) => (row.id === id ? { ...row, text } : row)));
  }

  return (
    <section className={hideHeader ? 'quote-bullet-list-section' : 'form-section'}>
      {!hideHeader ? <h2>{title}</h2> : null}
      <p className="muted">{hint}</p>
      {items.length === 0 ? (
        <p className="muted">Ei kohtia vielä.</p>
      ) : (
        <div className="quote-bullet-list-rows">
          {items.map((item, index) => (
            <div key={item.id} className="quote-line-row panel-inset quote-bullet-list-row">
              <div className="quote-line-head">
                <strong>Kohta {index + 1}</strong>
                {canEdit ? (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onChange(items.filter((row) => row.id !== item.id))}
                  >
                    Poista
                  </button>
                ) : null}
              </div>
              <label>
                Teksti
                <input
                  value={item.text}
                  disabled={!canEdit}
                  placeholder={placeholder}
                  onChange={(e) => patchItem(item.id, e.target.value)}
                />
              </label>
            </div>
          ))}
        </div>
      )}
      {canEdit ? (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onChange([...items, createEmptyBulletItem()])}
        >
          {addLabel}
        </button>
      ) : null}
    </section>
  );
}
