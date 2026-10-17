import CheckToggle from './CheckToggle';
import { Link } from 'react-router-dom';
import DataTable, { type DataTableColumn } from './DataTable';
import { DeviceCardIcon, HistoryIcon } from './PrintIcons';
import Tooltip from './Tooltip';
import type { Equipment } from '../types';
import { formatRefrigerant, type EquipmentDeviceFields } from '../lib/equipmentDeviceFields';
import type { withNavTrail } from '../lib/navigationTrail';

type NavTrailProps = ReturnType<typeof withNavTrail>;

type Props = {
  equipment: Equipment[];
  customerId: string;
  deviceFields?: (eq: Equipment) => EquipmentDeviceFields;
  /** Viimeisin huolto: raaka päivä (lajittelu) ja näytettävä teksti. */
  latestMaintenance: (eq: Equipment) => { raw: string; label: string } | null;
  selectedIds: Set<string>;
  canWrite: boolean;
  canDelete: boolean;
  busy: boolean;
  printBusyId: string | null;
  navTrail?: NavTrailProps;
  onToggleSelected: (id: string, checked: boolean) => void;
  onPrintCard: (eq: Equipment) => void;
  onPrintHistory: (eq: Equipment) => void;
  onDelete: (eq: Equipment) => void;
};

/** Asiakkaan laitteet taulukkona. */
export function CustomerEquipmentTable({
  equipment,
  customerId,
  deviceFields,
  latestMaintenance,
  selectedIds,
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
  const columns: DataTableColumn<Equipment>[] = [
    {
      key: 'name',
      label: 'Laite',
      value: (eq) => eq.name,
      render: (eq) => (
        <span className="customer-equipment-name-cell">
          <label className="customer-equipment-row-select" onClick={(e) => e.stopPropagation()}>
            <CheckToggle
              checked={selectedIds.has(eq.id)}
              onChange={(e) => onToggleSelected(eq.id, e.target.checked)}
            />
            <span className="sr-only">Valitse {eq.name}</span>
          </label>
          {eq.name}
          {eq.is_onboarding_demo ? <span className="badge badge-demo">Esimerkki</span> : null}
        </span>
      ),
    },
    { key: 'tag', label: 'Tunnus', value: (eq) => eq.tag ?? '' },
    { key: 'brand', label: 'Merkki', value: (eq) => deviceFields?.(eq).manufacturer ?? '' },
    { key: 'model', label: 'Malli', value: (eq) => eq.model ?? '' },
    { key: 'refrigerant', label: 'Kylmäaine', value: (eq) => (deviceFields ? formatRefrigerant(deviceFields(eq)) : '') },
    { key: 'serial', label: 'Sarjanumero', value: (eq) => eq.serial_number ?? '' },
    { key: 'location', label: 'Sijainti', value: (eq) => eq.location ?? '' },
    {
      key: 'latest',
      label: 'Viimeisin huolto',
      value: (eq) => latestMaintenance(eq)?.raw ?? '',
      render: (eq) => latestMaintenance(eq)?.label ?? '—',
      className: 'nowrap',
    },
  ];

  return (
    <DataTable
      rows={equipment}
      columns={columns}
      rowKey={(eq) => eq.id}
      rowHref={(eq) => `/asiakkaat/${customerId}/laitteet/${eq.id}`}
      rowState={() => navTrail?.state}
      initialSort={{ key: 'name', dir: 'asc' }}
      ariaLabel="Laitteet"
      actions={(eq) => (
        <>
          <Tooltip label="Tulosta laitekortti">
            <button
              type="button"
              className="icon-action-btn"
              disabled={printBusyId === `card:${eq.id}`}
              onClick={() => onPrintCard(eq)}
              aria-label="Tulosta laitekortti"
            >
              <DeviceCardIcon />
            </button>
          </Tooltip>
          <Tooltip label="Tulosta huoltohistoria">
            <button
              type="button"
              className="icon-action-btn"
              disabled={printBusyId === `history:${eq.id}`}
              onClick={() => onPrintHistory(eq)}
              aria-label="Tulosta huoltohistoria"
            >
              <HistoryIcon />
            </button>
          </Tooltip>
          {canWrite ? (
            <Link
              to={`/huoltoraportit/uusi?customerId=${customerId}&equipmentId=${eq.id}`}
              className="btn btn-secondary btn-sm"
              {...(navTrail ?? {})}
            >
              Uusi huolto
            </Link>
          ) : null}
          {canDelete ? (
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => onDelete(eq)}>
              Poista
            </button>
          ) : null}
        </>
      )}
    />
  );
}
