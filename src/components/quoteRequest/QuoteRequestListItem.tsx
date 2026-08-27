import { Link } from 'react-router-dom';
import { computeQuoteTotals } from '../../lib/quoteRequest/calculations';
import { QUOTE_TYPE_LABELS } from '../../lib/quoteRequest/constants';
import {
  QUOTE_STATUS_LABELS,
  normalizeQuoteRequestData,
  resolveQuoteDisplayTitle,
} from '../../lib/quoteRequest/defaults';
import { quoteCustomerDisplayName, quoteDeviceDisplayLabel } from '../../lib/quoteRequest/legacyImport';
import type { QuoteRequestRow } from '../../lib/quoteRequest/types';
import { quoteListTrail, withNavTrail } from '../../lib/navigationTrail';

type Props = {
  row: QuoteRequestRow;
};

export function QuoteRequestListItem({ row }: Props) {
  const data = normalizeQuoteRequestData(row.data);
  const total = computeQuoteTotals(data).grossTotal;
  const updated = new Date(row.updated_at).toLocaleString('fi-FI');
  const displayTitle = resolveQuoteDisplayTitle({
    customerName: row.customers?.name,
    quoteTypeLabel: QUOTE_TYPE_LABELS[data.type],
    storedTitle: row.title,
  });
  const deviceLabel = quoteDeviceDisplayLabel(data, row.equipment?.name ?? row.equipment?.tag);
  const subtitleParts = [
    QUOTE_TYPE_LABELS[data.type],
    quoteCustomerDisplayName(row),
    deviceLabel,
  ].filter(Boolean);

  return (
    <li>
      <Link
        to={`/tarjouspyynnot/${row.id}`}
        className="quote-request-list-link"
        {...withNavTrail(quoteListTrail())}
      >
        <div className="quote-request-list-head">
          <strong>{displayTitle}</strong>
          <span className="muted">{subtitleParts.join(' • ')}</span>
        </div>
        <div className="quote-request-list-meta">
          <span className="badge">{QUOTE_STATUS_LABELS[row.status] ?? row.status}</span>
          <span className="quote-request-list-price">
            {total.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
          </span>
          <span className="muted">{row.branding_company?.name ?? '—'}</span>
          <span className="muted">{updated}</span>
        </div>
      </Link>
    </li>
  );
}
