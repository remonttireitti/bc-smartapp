import type { RefObject } from 'react';
import ToggleSwitch from '../ToggleSwitch';
import type { UnreviewedSiteDefault } from '../../lib/quoteRequest/siteDefaultsReview';

type Props = {
  pending: UnreviewedSiteDefault[];
  canEdit: boolean;
  highlight?: boolean;
  panelRef?: RefObject<HTMLElement | null>;
  onAccept: (key: string) => void;
  onAcceptAll: () => void;
  onGoToField: (key: string) => void;
};

export default function QuoteSiteDefaultsReviewPanel({
  pending,
  canEdit,
  highlight = false,
  panelRef,
  onAccept,
  onAcceptAll,
  onGoToField,
}: Props) {
  if (pending.length === 0) return null;

  return (
    <section
      ref={panelRef}
      className={`panel quote-site-defaults-review${highlight ? ' quote-site-defaults-review--highlight' : ''}`}
      role="alert"
      aria-live="polite"
    >
      <h2 className="quote-site-defaults-review-title">Tarkista kohdetiedot ennen tallennusta</h2>
      <p className="muted">
        Seuraavat arvot ovat vielä oletuksia. Muokkaa kenttää välilehdellä tai merkitse oletus hyväksytyksi —
        tallennus onnistuu vasta kun kaikki on käsitelty.
      </p>
      <ul className="quote-site-defaults-review-list">
        {pending.map((item) => (
          <li key={item.key} className="quote-site-defaults-review-row">
            <ToggleSwitch
              checked={false}
              disabled={!canEdit}
              label={item.label}
              className="quote-site-defaults-review-check"
              onChange={(checked) => {
                if (checked) onAccept(item.key);
              }}
            />
            <button
              type="button"
              className="link-button quote-site-defaults-review-goto"
              onClick={() => onGoToField(item.key)}
            >
              Siirry kentälle
            </button>
          </li>
        ))}
      </ul>
      {canEdit && pending.length > 1 && (
        <div className="quote-site-defaults-review-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onAcceptAll}>
            Hyväksy kaikki oletukset
          </button>
        </div>
      )}
    </section>
  );
}
