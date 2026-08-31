import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  maintenanceReportTileColor,
  maintenanceReportTileLines,
  maintenanceReportTileTitle,
  type MaintenanceReportListItem,
} from '../lib/maintenanceReportListHelpers';
import { maintenanceListTrail, withNavTrail } from '../lib/navigationTrail';
import { getMaintenanceReportStatusLabel } from '../types';

type Props = {
  report: MaintenanceReportListItem;
  myCompanyId: string | null;
  linkTo: string;
  onDelete?: () => void;
  deleteBusy?: boolean;
};

export function MaintenanceReportListTile({ report, myCompanyId, linkTo, onDelete, deleteBusy = false }: Props) {
  const title = maintenanceReportTileTitle(report);
  const { customerLine, detailLine, registryLine } = maintenanceReportTileLines(report, myCompanyId);
  const updatedLabel = new Date(report.updated_at).toLocaleDateString('fi-FI');

  return (
    <div className="maintenance-report-list-tile-wrap">
      <Link
        to={linkTo}
        className="tile maintenance-report-list-tile"
        style={{ background: maintenanceReportTileColor(report.status) }}
        {...withNavTrail(maintenanceListTrail())}
      >
        <div className="maintenance-report-list-tile-body">
          <strong className="maintenance-report-list-tile-title">{title}</strong>
          <span className="maintenance-report-list-tile-line">{customerLine}</span>
          <span className="maintenance-report-list-tile-line">{detailLine}</span>
          {registryLine ? (
            <span className="maintenance-report-list-tile-meta">{registryLine}</span>
          ) : null}
          <span className="maintenance-report-list-tile-meta">Päivitetty {updatedLabel}</span>
        </div>
        <div className="maintenance-report-list-tile-footer">
          <span className="badge">{getMaintenanceReportStatusLabel(report.status)}</span>
        </div>
      </Link>
      {onDelete ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm maintenance-report-list-tile-delete"
          disabled={deleteBusy}
          onClick={onDelete}
        >
          {deleteBusy ? 'Poistetaan…' : 'Poista luonnos'}
        </button>
      ) : null}
    </div>
  );
}

export function MaintenanceReportListGrid({ children }: { children: ReactNode }) {
  return <div className="grid maintenance-report-list-grid">{children}</div>;
}
