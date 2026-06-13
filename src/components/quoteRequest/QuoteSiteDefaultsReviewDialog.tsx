import { useEffect, useState } from 'react';
import type { UnreviewedSiteDefault } from '../../lib/quoteRequest/siteDefaultsReview';

type Props = {
  open: boolean;
  pending: UnreviewedSiteDefault[];
  busy?: boolean;
  onBackToEdit: () => void;
  /** Tallenna; valitut rivit merkitään hyväksytyiksi oletusarvoiksi. */
  onSave: (acceptedKeys: string[]) => void;
  /** Hyväksy kaikki listatut oletukset ja tallenna. */
  onSaveAcceptAll: () => void;
};

export default function QuoteSiteDefaultsReviewDialog({
  open,
  pending,
  busy = false,
  onBackToEdit,
  onSave,
  onSaveAcceptAll,
}: Props) {
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setCheckedKeys(new Set());
  }, [open, pending]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onBackToEdit();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onBackToEdit]);

  if (!open || pending.length === 0) return null;

  function toggleKey(key: string) {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={busy ? undefined : onBackToEdit}>
      <div
        className="leave-draft-dialog quote-site-defaults-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-site-defaults-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="quote-site-defaults-title">Tarkista kohdetiedot</h2>
        <p className="muted">
          Seuraavat tiedot ovat vielä oletusarvoja. Muokkaa arvoja Kohde-välilehdellä tai merkitse ne
          hyväksytyiksi, jos oletus sopii tälle kohteelle.
        </p>
        <ul className="quote-site-defaults-checklist">
          {pending.map((item) => (
            <li key={item.key}>
              <label className="checkbox-inline quote-site-defaults-check">
                <input
                  type="checkbox"
                  checked={checkedKeys.has(item.key)}
                  disabled={busy}
                  onChange={() => toggleKey(item.key)}
                />
                <span>{item.label}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="muted quote-site-defaults-hint">
          Voit tallentaa ilman hyväksyntää — tallennus onnistuu, mutta varoitus näkyy, kunnes kaikki
          oletukset on muokattu tai hyväksytty.
        </p>
        <div className="leave-draft-actions quote-site-defaults-actions">
          <button type="button" className="btn btn-secondary" onClick={onBackToEdit} disabled={busy}>
            Takaisin muokkaukseen
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onSave([...checkedKeys])}
            disabled={busy}
          >
            {busy ? 'Tallennetaan…' : 'Tallenna'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onSaveAcceptAll} disabled={busy}>
            {busy ? 'Tallennetaan…' : 'Hyväksy kaikki ja tallenna'}
          </button>
        </div>
      </div>
    </div>
  );
}
