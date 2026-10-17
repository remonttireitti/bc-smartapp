import DataTable, { StatusMark, type DataTableColumn } from './DataTable';
import {
  maintenanceReportTileColor,
  maintenanceReportTileLines,
  type MaintenanceReportListItem,
} from '../lib/maintenanceReportListHelpers';
import { maintenanceListTrail, withNavTrail } from '../lib/navigationTrail';
import { getMaintenanceReportStatusLabel } from '../types';

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

/** Huoltoraportit taulukkona: Asiakas, Laite, Tunnus/sijainti, Osoite, Tyyppi, Tila, Päivitetty, Rekisteri. */
export function MaintenanceReportListTable<T extends MaintenanceReportListItem>({
  reports,
  myCompanyId,
  linkTo,
  canDelete,
  onDelete,
  deletingId,
}: Props<T>) {
  const columns: DataTableColumn<T>[] = [
    { key: 'customer', label: 'Asiakas', value: (r) => maintenanceReportTileLines(r, myCompanyId).customerLine },
    {
      key: 'device',
      label: 'Laite',
      value: (r) => r.equipment?.name || [r.data?.laiteValmistaja, r.data?.laiteMalli].filter(Boolean).join(' ') || '',
    },
    {
      key: 'tag',
      label: 'Tunnus / sijainti',
      value: (r) => [r.equipment?.tag || r.data?.laiteTunnus, r.data?.laiteSijainti].filter((v) => v && String(v).trim()).join(' · '),
    },
    { key: 'address', label: 'Osoite', value: (r) => r.data?.osoite?.trim() ?? '' },
    { key: 'type', label: 'Tyyppi', value: (r) => r.data?.laiteTyyppi?.trim() ?? '' },
    {
      key: 'status',
      label: 'Tila',
      value: (r) => getMaintenanceReportStatusLabel(r.status),
      render: (r) => <StatusMark color={maintenanceReportTileColor(r.status)} label={getMaintenanceReportStatusLabel(r.status)} />,
    },
    { key: 'updated', label: 'Päivitetty', value: (r) => r.updated_at, render: (r) => fiDate(r.updated_at), className: 'nowrap' },
    { key: 'registry', label: 'Rekisteri', value: (r) => maintenanceReportTileLines(r, myCompanyId).registryLine ?? '' },
  ];
  const anyDelete = !!onDelete && !!canDelete && reports.some((r) => canDelete(r));

  return (
    <DataTable
      rows={reports}
      columns={columns}
      rowKey={(r) => r.id}
      rowHref={linkTo}
      rowState={() => withNavTrail(maintenanceListTrail()).state}
      hideFilter
      initialSort={{ key: 'updated', dir: 'desc' }}
      ariaLabel="Huoltoraportit"
      actions={
        anyDelete
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
