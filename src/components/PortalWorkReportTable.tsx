import DataTable, { type DataTableColumn } from './DataTable';
import type { WorkReport } from '../types';

const DONE = new Set(['completed', 'billed_partner', 'billed_customer']);

function portalStatus(status: string): string {
  if (DONE.has(status)) return 'Valmis';
  if (status === 'in_progress') return 'Käynnissä';
  if (status === 'draft') return 'Lähetetty';
  return 'Avoin';
}

function fiDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString('fi-FI') : '—';
}

function equipmentLabel(r: WorkReport): string {
  const eq = (r as { equipment?: { name?: string | null; tag?: string | null } | null }).equipment;
  return [eq?.name, eq?.tag].filter(Boolean).join(' · ');
}

/** Asiakasportaalin työraporttilista: työ, laite, päivä, tila. Ei laskutus- eikä sisäisiä tietoja. */
export default function PortalWorkReportTable({
  reports,
  hrefFor = (r) => `/tyoraportit/${r.id}/tuloste`,
}: {
  reports: WorkReport[];
  hrefFor?: (r: WorkReport) => string;
}) {
  const columns: DataTableColumn<WorkReport>[] = [
    { key: 'title', label: 'Työ', value: (r) => r.heading || r.title || '' },
    { key: 'equipment', label: 'Laite', value: (r) => equipmentLabel(r) },
    {
      key: 'date',
      label: 'Päivä',
      value: (r) => r.completed_at ?? r.scheduled_start ?? r.created_at,
      render: (r) => fiDate(r.completed_at ?? r.scheduled_start ?? r.created_at),
      className: 'nowrap',
    },
    { key: 'status', label: 'Tila', value: (r) => portalStatus(r.status), className: 'nowrap' },
  ];
  return (
    <div className="customer-collapsible">
      <DataTable
        rows={reports}
        columns={columns}
        rowKey={(r) => r.id}
        rowHref={hrefFor}
        hideFilter
        initialSort={{ key: 'date', dir: 'desc' }}
        ariaLabel="Työraportit"
      />
    </div>
  );
}
