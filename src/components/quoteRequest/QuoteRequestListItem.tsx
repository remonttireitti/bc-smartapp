import { Link } from 'react-router-dom';
import DataTable, { StatusMark, type DataTableColumn } from '../DataTable';
import { computeQuoteTotals } from '../../lib/quoteRequest/calculations';
import { QUOTE_TYPE_LABELS } from '../../lib/quoteRequest/constants';
import {
  QUOTE_STATUS_LABELS,
  normalizeQuoteRequestData,
  quoteTitleSubject,
  resolveQuoteDisplayTitle,
} from '../../lib/quoteRequest/defaults';
import { quoteCustomerDisplayName, quoteDeviceDisplayLabel } from '../../lib/quoteRequest/legacyImport';
import type { QuoteRequestRow } from '../../lib/quoteRequest/types';
import { quoteListTrail, withNavTrail } from '../../lib/navigationTrail';

const QUOTE_STATUS_COLORS: Record<string, string> = {
  draft: '#64748b',
  sent: '#3b82f6',
  ordered: '#10b981',
};

type Derived = {
  row: QuoteRequestRow;
  title: string;
  type: string;
  customer: string;
  device: string;
  total: number;
  linkedReportId: string | null;
  missingReport: boolean;
};

type Props = {
  rows: QuoteRequestRow[];
  linkedReportId: (row: QuoteRequestRow) => string | null;
  missingReport: (row: QuoteRequestRow) => boolean;
  canDelete: (row: QuoteRequestRow) => boolean;
  onDelete: (row: QuoteRequestRow) => void;
  deletingId: string | null;
};

const eur = (n: number) => n.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' });

/** Tarjouspyynnöt taulukkona. */
export function QuoteRequestListTable({ rows, linkedReportId, missingReport, canDelete, onDelete, deletingId }: Props) {
  const derived: Derived[] = rows.map((row) => {
    const data = normalizeQuoteRequestData(row.data);
    return {
      row,
      title: resolveQuoteDisplayTitle({
        customerName: row.customers?.name,
        quoteTypeLabel: quoteTitleSubject(data),
        storedTitle: row.title,
      }),
      type: QUOTE_TYPE_LABELS[data.type] ?? '',
      customer: quoteCustomerDisplayName(row) ?? '',
      device: quoteDeviceDisplayLabel(data, row.equipment?.name ?? row.equipment?.tag) ?? '',
      total: computeQuoteTotals(data).grossTotal,
      linkedReportId: row.work_report_id ?? linkedReportId(row),
      missingReport: missingReport(row),
    };
  });

  const columns: DataTableColumn<Derived>[] = [
    { key: 'title', label: 'Otsikko', value: (d) => d.title },
    { key: 'customer', label: 'Asiakas', value: (d) => d.customer },
    { key: 'type', label: 'Tyyppi', value: (d) => d.type },
    { key: 'device', label: 'Laite', value: (d) => d.device },
    {
      key: 'total',
      label: 'Summa',
      value: (d) => d.total,
      render: (d) => eur(d.total),
      className: 'nowrap data-table-num',
    },
    {
      key: 'status',
      label: 'Tila',
      value: (d) => QUOTE_STATUS_LABELS[d.row.status] ?? d.row.status,
      render: (d) => (
        <StatusMark
          color={QUOTE_STATUS_COLORS[d.row.status] ?? QUOTE_STATUS_COLORS.draft}
          label={`${QUOTE_STATUS_LABELS[d.row.status] ?? d.row.status}${d.missingReport ? ' · ei työraporttia' : ''}`}
        />
      ),
    },
    {
      key: 'updated',
      label: 'Päivitetty',
      value: (d) => d.row.updated_at,
      render: (d) => new Date(d.row.updated_at).toLocaleDateString('fi-FI'),
      className: 'nowrap',
    },
    { key: 'brand', label: 'Yritys', value: (d) => d.row.branding_company?.name ?? '' },
  ];

  const hasActions = derived.some(
    (d) => (d.row.status === 'ordered' && d.linkedReportId) || d.missingReport || canDelete(d.row),
  );

  return (
    <DataTable
      rows={derived}
      columns={columns}
      rowKey={(d) => d.row.id}
      rowHref={(d) => `/tarjouspyynnot/${d.row.id}`}
      rowState={() => withNavTrail(quoteListTrail()).state}
      hideFilter
      rowAccent={(d) => QUOTE_STATUS_COLORS[d.row.status] ?? QUOTE_STATUS_COLORS.draft}
      ariaLabel="Tarjouspyynnöt"
      actions={
        hasActions
          ? (d) => (
              <>
                {d.row.status === 'ordered' && d.linkedReportId ? (
                  <Link to={`/tyoraportit/${d.linkedReportId}`} className="btn btn-secondary btn-sm">
                    Työraportti
                  </Link>
                ) : d.missingReport ? (
                  <Link to={`/tarjouspyynnot/${d.row.id}`} className="btn btn-secondary btn-sm" {...withNavTrail(quoteListTrail())}>
                    Kohdista työraporttiin
                  </Link>
                ) : null}
                {canDelete(d.row) ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={deletingId === d.row.id}
                    onClick={() => onDelete(d.row)}
                  >
                    {deletingId === d.row.id ? 'Poistetaan…' : d.row.status === 'sent' ? 'Poista tarjous' : 'Poista luonnos'}
                  </button>
                ) : null}
              </>
            )
          : undefined
      }
    />
  );
}
