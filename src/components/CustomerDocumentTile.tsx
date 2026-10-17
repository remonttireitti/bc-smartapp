import { Link } from 'react-router-dom';
import DataTable, { StatusMark, type DataTableColumn } from './DataTable';
import { PrinterIcon } from './PrintIcons';
import { CUSTOMER_DOCUMENT_TILE_COLORS } from '../lib/customerSectionHelpers';
import { CUSTOMER_DOCUMENT_KIND_LABELS, type CustomerLinkedDocument } from '../lib/customerDocuments';

/** Asiakkaan / laitteen dokumentit taulukkona. */
export function CustomerDocumentTable({ documents }: { documents: CustomerLinkedDocument[] }) {
  const columns: DataTableColumn<CustomerLinkedDocument>[] = [
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
  const anyPrint = documents.some((d) => d.printHref);
  return (
    <DataTable
      rows={documents}
      columns={columns}
      rowKey={(d) => `${d.kind}:${d.id}`}
      rowHref={(d) => (d.kind === 'file' ? null : d.href)}
      initialSort={{ key: 'date', dir: 'desc' }}
      ariaLabel="Dokumentit"
      actions={
        anyPrint
          ? (d) =>
              d.printHref ? (
                <Link to={d.printHref} target="_blank" rel="noopener noreferrer" className="icon-action-btn" aria-label="Tulosta">
                  <PrinterIcon title="Tulosta" />
                </Link>
              ) : null
          : undefined
      }
    />
  );
}
