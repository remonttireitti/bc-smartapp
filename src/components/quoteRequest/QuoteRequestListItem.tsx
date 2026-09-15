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

const QUOTE_STATUS_TILE_COLORS: Record<string, string> = {
  draft: 'linear-gradient(135deg, #475569 0%, #64748b 100%)',
  sent: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
  ordered: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
};

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
  const tileColor = QUOTE_STATUS_TILE_COLORS[row.status] ?? QUOTE_STATUS_TILE_COLORS.draft;

  return (
    <div className="quote-request-tile-wrap">
      <Link
        to={`/tarjouspyynnot/${row.id}`}
        className="tile quote-request-tile"
        style={{ background: tileColor }}
        {...withNavTrail(quoteListTrail())}
      >
        <div className="quote-request-tile-body">
          <span className="quote-request-tile-badge">
            {QUOTE_STATUS_LABELS[row.status] ?? row.status}
          </span>
          <strong className="quote-request-tile-title">{displayTitle}</strong>
          <span className="quote-request-tile-line">{subtitleParts.join(' • ')}</span>
          <span className="quote-request-tile-price">
            {total.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
          </span>
          <span className="quote-request-tile-meta">
            {row.branding_company?.name ?? '—'} · {updated}
          </span>
        </div>
      </Link>
      {row.status === 'ordered' && row.work_report_id ? (
        <Link
          to={`/tyoraportit/${row.work_report_id}`}
          className="btn btn-secondary btn-sm quote-request-tile-action"
        >
          Työraportti
        </Link>
      ) : null}
    </div>
  );
}
