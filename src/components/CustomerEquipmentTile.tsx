import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DeviceCardIcon, HistoryIcon } from './PrintIcons';
import Tooltip from './Tooltip';
import { equipmentTileSubtitle } from '../lib/customerSectionHelpers';
import type { Equipment } from '../types';
import type { withNavTrail } from '../lib/navigationTrail';

type NavTrailProps = ReturnType<typeof withNavTrail>;

type Props = {
  equipment: Equipment;
  customerId: string;
  color: string;
  latestMaintenanceLabel: string | null;
  selected: boolean;
  canWrite: boolean;
  canDelete: boolean;
  busy: boolean;
  printBusyId: string | null;
  navTrail?: NavTrailProps;
  onToggleSelected: (checked: boolean) => void;
  onPrintCard: () => void;
  onPrintHistory: () => void;
  onDelete: () => void;
};

export function CustomerEquipmentTile({
  equipment,
  customerId,
  color,
  latestMaintenanceLabel,
  selected,
  canWrite,
  canDelete,
  busy,
  printBusyId,
  navTrail,
  onToggleSelected,
  onPrintCard,
  onPrintHistory,
  onDelete,
}: Props) {
  return (
    <div className={`customer-equipment-tile-wrap${selected ? ' is-selected' : ''}`}>
      <label className="customer-equipment-tile-select">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggleSelected(e.target.checked)}
        />
        <span className="sr-only">Valitse {equipment.name}</span>
      </label>
      <Link
        to={`/asiakkaat/${customerId}/laitteet/${equipment.id}`}
        className="tile customer-equipment-tile"
        style={{ background: color }}
        {...(navTrail ?? {})}
      >
        <div className="customer-equipment-tile-body">
          <strong className="customer-equipment-tile-title">{equipment.name}</strong>
          <span className="customer-equipment-tile-line">
            {equipmentTileSubtitle(equipment, latestMaintenanceLabel)}
          </span>
          {equipment.location ? <span className="customer-equipment-tile-meta">{equipment.location}</span> : null}
        </div>
      </Link>
      <div className="customer-equipment-tile-actions">
        <Tooltip label="Tulosta laitekortti">
          <button
            type="button"
            className="icon-action-btn"
            disabled={printBusyId === `card:${equipment.id}`}
            onClick={onPrintCard}
            aria-label="Tulosta laitekortti"
          >
            <DeviceCardIcon />
          </button>
        </Tooltip>
        <Tooltip label="Tulosta huoltohistoria">
          <button
            type="button"
            className="icon-action-btn"
            disabled={printBusyId === `history:${equipment.id}`}
            onClick={onPrintHistory}
            aria-label="Tulosta huoltohistoria"
          >
            <HistoryIcon />
          </button>
        </Tooltip>
        {canWrite ? (
          <Link
            to={`/huoltoraportit/uusi?customerId=${customerId}&equipmentId=${equipment.id}`}
            className="btn btn-secondary btn-sm"
            {...(navTrail ?? {})}
          >
            Uusi huolto
          </Link>
        ) : null}
        {canDelete ? (
          <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={onDelete}>
            Poista
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CustomerEquipmentGrid({ children }: { children: ReactNode }) {
  return <div className="grid customer-equipment-grid">{children}</div>;
}
