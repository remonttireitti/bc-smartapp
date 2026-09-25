import { useEffect } from 'react';

export type QuoteLinkPickerItem = {
  id: string;
  title: string;
  meta: string;
  /** Pieniä merkintöjä, esim. "Sama asiakas", "Nykyinen", "Kohdistettu: …". */
  badges: Array<{ label: string; tone: 'good' | 'warn' | 'info' }>;
};

type Props = {
  open: boolean;
  title: string;
  intro?: string;
  searchPlaceholder: string;
  query: string;
  onQueryChange: (value: string) => void;
  items: QuoteLinkPickerItem[];
  loading: boolean;
  busy: boolean;
  error?: string | null;
  emptyText: string;
  onPick: (id: string) => void;
  onClose: () => void;
};

/** Valitsin tarjouksen ↔ työraportin kohdistukseen (haku + lista). */
export default function QuoteLinkPickerDialog({
  open,
  title,
  intro,
  searchPlaceholder,
  query,
  onQueryChange,
  items,
  loading,
  busy,
  error,
  emptyText,
  onPick,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="leave-draft-dialog panel quote-link-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-link-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="quote-link-picker-title">{title}</h2>
        {intro ? <p className="muted quote-link-picker-intro">{intro}</p> : null}
        <input
          type="search"
          className="quote-link-picker-search"
          value={query}
          placeholder={searchPlaceholder}
          autoFocus
          disabled={busy}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {error ? <p className="error">{error}</p> : null}
        <div className="quote-link-picker-list" role="listbox" aria-label={title}>
          {loading ? (
            <p className="muted">Ladataan…</p>
          ) : items.length === 0 ? (
            <p className="muted">{emptyText}</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={false}
                className="quote-link-picker-item"
                disabled={busy}
                onClick={() => onPick(item.id)}
              >
                <span className="quote-link-picker-item-title">{item.title}</span>
                <span className="quote-link-picker-item-meta">{item.meta}</span>
                {item.badges.length > 0 ? (
                  <span className="quote-link-picker-badges">
                    {item.badges.map((badge) => (
                      <span key={badge.label} className={`quote-link-picker-badge is-${badge.tone}`}>
                        {badge.label}
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
        <div className="leave-draft-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {busy ? 'Tallennetaan…' : 'Peruuta'}
          </button>
        </div>
      </div>
    </div>
  );
}
