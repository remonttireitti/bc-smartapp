import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import PortalPdfCell from './PortalPdfCell';
import { usePrintLog } from '../hooks/usePrintLog';
import type { PortalDocKind } from '../lib/portalDocumentPdf';
import DataTable, { StatusMark, type DataTableColumn } from './DataTable';
import { PrinterIcon } from './PrintIcons';
import { CUSTOMER_DOCUMENT_TILE_COLORS } from '../lib/customerSectionHelpers';
import { CUSTOMER_DOCUMENT_KIND_LABELS, type CustomerLinkedDocument } from '../lib/customerDocuments';

const PDF_KINDS = new Set<string>(['work_report', 'maintenance_report', 'quote_request']);

/** Asiakkaan / laitteen dokumentit taulukkona. portal: PDF-lataus + "Tulostettu"-merkintä. onDelete: Poista-painike (yrityksen näkymä). */
export function CustomerDocumentTable({
  documents,
  hideKind = false,
  portal = false,
  onDelete,
  canDelete,
  deletingKey,
}: {
  documents: CustomerLinkedDocument[];
  hideKind?: boolean;
  portal?: boolean;
  onDelete?: (d: CustomerLinkedDocument) => void;
  canDelete?: (d: CustomerLinkedDocument) => boolean;
  deletingKey?: string | null;
}) {
  const printItems = useMemo(
    () => (portal ? documents.filter((d) => PDF_KINDS.has(d.kind)).map((d) => ({ kind: d.kind as PortalDocKind, id: d.id })) : []),
    [portal, documents],
  );
  const { log, reload } = usePrintLog(printItems);
  const allColumns: DataTableColumn<CustomerLinkedDocument>[] = [
    { key: 'title', label: 'Dokumentti', value: (d) => d.title },
    {
      key: 'kind',
      label: 'Tyyppi',
      value: (d) => CUSTOMER_DOCUMENT_KIND_LABELS[d.kind] ?? d.kind,
      render: (d) => (
        <StatusMark color={CUSTOMER_DOCUMENT_TILE_COLORS[d.kind] ?? '#64748B'} label={CUSTOMER_DOCUMENT_KIND_LABELS[d.kind] ?? d.kind} />
      ),
    },
    { key: 'subtitle', label: 'Lisätieto', value: (d) => d.subtitle ?? '' },
    { key: 'status', label: 'Tila', value: (d) => d.statusLabel ?? '' },
    {
      key: 'date',
      label: 'Päivä',
      value: (d) => d.date,
      render: (d) => new Date(d.date).toLocaleDateString('fi-FI'),
      className: 'nowrap',
    },
    { key: 'equipment', label: 'Laite', value: (d) => d.equipmentLabel ?? '' },
  ];
  const columns = allColumns.filter((c) => !(hideKind && c.key === 'kind'));
  const anyPrint = documents.some((d) => d.printHref);
  const anyAction = portal ? documents.some((d) => PDF_KINDS.has(d.kind)) : anyPrint || (!!onDelete && documents.some((d) => canDelete?.(d)));
  return (
    <DataTable
      rows={documents}
      columns={columns}
      rowKey={(d) => `${d.kind}:${d.id}`}
      rowHref={(d) => (d.kind === 'file' ? null : d.href)}
      initialSort={{ key: 'date', dir: 'desc' }}
      ariaLabel="Dokumentit"
      actions={
        anyAction
          ? (d) => {
              if (portal) {
                return PDF_KINDS.has(d.kind) ? <PortalPdfCell kind={d.kind as PortalDocKind} id={d.id} log={log} onPrinted={reload} /> : null;
              }
              return (
                <>
                  {d.printHref ? (
                    <Link to={d.printHref} target="_blank" rel="noopener noreferrer" className="icon-action-btn" aria-label="Tulosta">
                      <PrinterIcon title="Tulosta" />
                    </Link>
                  ) : null}
                  {onDelete && canDelete?.(d) ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={deletingKey === `${d.kind}:${d.id}`}
                      onClick={() => onDelete(d)}
                    >
                      {deletingKey === `${d.kind}:${d.id}` ? 'Poistetaan…' : 'Poista'}
                    </button>
                  ) : null}
                </>
              );
            }
          : undefined
      }
    />
  );
}
