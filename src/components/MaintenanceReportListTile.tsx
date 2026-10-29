import { useMemo } from 'react';
import PortalPdfCell from './PortalPdfCell';
import { usePrintLog } from '../hooks/usePrintLog';
import DataTable, { StatusMark, type DataTableColumn } from './DataTable';
import {
  maintenanceReportTileColor,
  maintenanceReportTileLines,
  type MaintenanceReportListItem,
} from '../lib/maintenanceReportListHelpers';
import { maintenanceListTrail, withNavTrail } from '../lib/navigationTrail';
import { getMaintenanceReportStatusLabel } from '../types';
import { reportTypeListLabel } from '../lib/huoltoCategories';

type Props<T extends MaintenanceReportListItem> = {
  reports: T[];
  myCompanyId: string | null;
  linkTo: (report: T) => string;
  canDelete?: (report: T) => boolean;
  onDelete?: (report: T) => void;
  deletingId?: string | null;
};

function fiDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fi-FI');
}

/** Huoltoraportit taulukkona: Asiakas, Laite, Tunnus/sijainti, Osoite, Laji, Tila, Päivitetty, Rekisteri. */
export function MaintenanceReportListTable<T extends MaintenanceReportListItem>({
  reports,
  myCompanyId,
  linkTo,
  canDelete,
  onDelete,
  deletingId,
  portal = false,
}: Props<T> & { portal?: boolean }) {
  const allColumns: DataTableColumn<T>[] = [
    { key: 'customer', label: 'Asiakas', value: (r) => maintenanceReportTileLines(r, myCompanyId).customerLine },
    {
      key: 'device',
      label: 'Laite',
      value: (r) => r.equipment?.name || [r.data?.laiteValmistaja, r.data?.laiteMalli].filter(Boolean).join(' ') || '',
      render: (r) => (
        <>
          {r.equipment?.name || [r.data?.laiteValmistaja, r.data?.laiteMalli].filter(Boolean).join(' ')}
          {(r.data as { onboardingDemo?: boolean } | null | undefined)?.onboardingDemo ? (
            <span className="badge badge-demo">Esimerkki</span>
          ) : null}
        </>
      ),
    },
    {
      key: 'tag',
      label: 'Tunnus / sijainti',
      value: (r) => [r.equipment?.tag || r.data?.laiteTunnus, r.data?.laiteSijainti].filter((v) => v && String(v).trim()).join(' · '),
    },
    { key: 'address', label: 'Osoite', value: (r) => r.data?.osoite?.trim() ?? '' },
    { key: 'type', label: 'Laji', value: (r) => reportTypeListLabel(r.data) },
    {
      key: 'status',
      label: 'Tila',
      value: (r) => getMaintenanceReportStatusLabel(r.status),
      render: (r) => <StatusMark color={maintenanceReportTileColor(r.status)} label={getMaintenanceReportStatusLabel(r.status)} />,
    },
    { key: 'updated', label: 'Päivitetty', value: (r) => r.updated_at, render: (r) => fiDate(r.updated_at), className: 'nowrap' },
    { key: 'registry', label: 'Rekisteri', value: (r) => maintenanceReportTileLines(r, myCompanyId).registryLine ?? '' },
  ];
  // Portaali: ei asiakas-, osoite- eikä rekisterisaraketta (vain oma kohde).
  const columns = portal ? allColumns.filter((c) => !['customer', 'address', 'registry'].includes(c.key)) : allColumns;
  const anyDelete = !!onDelete && !!canDelete && reports.some((r) => canDelete(r));
  const printItems = useMemo(
    () => (portal ? reports.map((r) => ({ kind: 'maintenance_report' as const, id: r.id })) : []),
    [portal, reports],
  );
  const { log, reload } = usePrintLog(printItems);

  return (
    <DataTable
      rows={reports}
      columns={columns}
      rowKey={(r) => r.id}
      rowHref={linkTo}
      rowState={() => withNavTrail(maintenanceListTrail()).state}
      hideFilter
      initialSort={{ key: 'updated', dir: 'desc' }}
      rowAccent={(r) => maintenanceReportTileColor(r.status)}
      ariaLabel="Huoltoraportit"
      actions={
        portal
          ? (r) => <PortalPdfCell kind="maintenance_report" id={r.id} log={log} onPrinted={reload} />
          : anyDelete
          ? (r) =>
              canDelete!(r) ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={deletingId === r.id}
                  onClick={() => onDelete!(r)}
                >
                  {deletingId === r.id ? 'Poistetaan…' : 'Poista luonnos'}
                </button>
              ) : null
          : undefined
      }
    />
  );
}
