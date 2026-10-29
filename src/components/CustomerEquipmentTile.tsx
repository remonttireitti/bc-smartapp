import { useMemo, useState } from 'react';
import CheckToggle from './CheckToggle';
import { leakStatusText, serviceStatusText, todayYmdLocal, type DeviceSchedule } from '../lib/huoltoSchedule';
import { formatMaintenanceDateFi } from '../lib/equipmentMaintenanceHistory';
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
  /** Huolto- ja vuototarkastustila (vain varoitus). */
  schedule?: (eq: Equipment) => DeviceSchedule | null;
  selectedIds: Set<string>;
  canWrite: boolean;
  canDelete: boolean;
  /** Rivivalinta (joukkotulostus); piilossa portaalinäkymässä. */
  selectable?: boolean;
  /** Rivin linkki (portaali: vain luku -laitekortti). */
  hrefFor?: (eq: Equipment) => string;
  busy: boolean;
  printBusyId: string | null;
  navTrail?: NavTrailProps;
  onToggleSelected: (id: string, checked: boolean) => void;
  onPrintCard?: (eq: Equipment) => void;
  onPrintHistory?: (eq: Equipment) => void;
  onDelete: (eq: Equipment) => void;
};

/** Laitetyypin ryhmä suodatinta varten (kylmiö + pakastin yhdessä). */
const TYPE_GROUPS: { key: string; label: string; types: string[] }[] = [
  { key: 'ilp', label: 'ILP', types: ['lämpöpumppu'] },
  { key: 'kylmio', label: 'Kylmiö / pakastin', types: ['kylmäkoneikko', 'pakastin'] },
  { key: 'vjk', label: 'VJK', types: ['vedenjäähdytyskone'] },
  { key: 'mlp', label: 'MLP', types: ['mlp'] },
  { key: 'vak', label: 'VAK', types: ['vakioilmastointtikone'] },
  { key: 'vilp', label: 'VILP', types: ['vesiilmalampopumppu'] },
  { key: 'konvektorit', label: 'Konvektorit', types: ['konvektorit'] },
];

function typeGroupOf(deviceType: string | null | undefined): string {
  const t = String(deviceType ?? '').trim();
  return TYPE_GROUPS.find((g) => g.types.includes(t))?.key ?? 'muu';
}

type SortKey = 'huolto_vanhin' | 'huolto_uusin' | 'nimi' | 'sijainti' | 'erääntyvät';

function ScheduleChips({ s }: { s: DeviceSchedule }) {
  const today = todayYmdLocal();
  const svcText = serviceStatusText(s.service, today);
  const svc = { label: svcText.label, cls: svcText.tone === 'ok' ? 'chip-ok' : svcText.tone === 'late' ? 'chip-late' : 'chip-warn' };
  const leakText = leakStatusText(s.leak, today);
  const leakTitle = s.leak.dueYmd ? `Vuototarkastus ${formatMaintenanceDateFi(s.leak.dueYmd)}` : 'Vuototarkastus';
  return (
    <span className="device-chips">
      {svc ? (
        <span className={`device-chip ${svc.cls}`} title={s.service.dueYmd ? `Seuraava huolto ${formatMaintenanceDateFi(s.service.dueYmd)}` : undefined}>
          {svc.label}
        </span>
      ) : null}
      {leakText ? (
        <span className={`device-chip ${leakText.tone === 'late' ? 'chip-late' : 'chip-warn'}`} title={s.combineHint ? `${leakTitle} – tee huollon yhteydessä` : leakTitle}>
          {leakText.label}
        </span>
      ) : null}
    </span>
  );
}

/** Asiakkaan laitteet taulukkona. */
export function CustomerEquipmentTable({
  equipment,
  customerId,
  deviceFields,
  latestMaintenance,
  schedule,
  selectedIds,
  canWrite,
  canDelete,
  selectable = true,
  hrefFor,
  busy,
  printBusyId,
  navTrail,
  onToggleSelected,
  onPrintCard,
  onPrintHistory,
  onDelete,
}: Props) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('nimi');
  const [typeFilter, setTypeFilter] = useState('');

  const typeOptions = useMemo(() => {
    const present = new Set(equipment.map((eq) => typeGroupOf(eq.device_type)));
    const opts = TYPE_GROUPS.filter((g) => present.has(g.key)).map((g) => ({ key: g.key, label: g.label }));
    if (present.has('muu')) opts.push({ key: 'muu', label: 'Muu' });
    return opts;
  }, [equipment]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = equipment.filter((eq) => {
      if (typeFilter === 'huollettavat') {
        if (!schedule?.(eq)?.needsService) return false;
      } else if (typeFilter && typeGroupOf(eq.device_type) !== typeFilter) return false;
      if (!q) return true;
      const f = deviceFields?.(eq);
      const hay = [eq.name, eq.tag, f?.manufacturer, eq.model, eq.serial_number, eq.location, f ? formatRefrigerant(f) : '']
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
    const name = (eq: Equipment) => `${eq.name ?? ''} ${eq.tag ?? ''}`;
    const cmp = (a: string, b: string) => a.localeCompare(b, 'fi', { numeric: true, sensitivity: 'base' });
    return filtered
      .map((eq, i) => ({ eq, i }))
      .sort((x, y) => {
        let c = 0;
        if (sortKey === 'erääntyvät') {
          const ka = schedule?.(x.eq)?.sortKey ?? '9999';
          const kb = schedule?.(y.eq)?.sortKey ?? '9999';
          c = ka < kb ? -1 : ka > kb ? 1 : 0;
        } else if (sortKey === 'nimi') c = cmp(name(x.eq), name(y.eq));
        else if (sortKey === 'sijainti') c = cmp(x.eq.location ?? '\uffff', y.eq.location ?? '\uffff');
        else {
          const ra = latestMaintenance(x.eq)?.raw ?? '';
          const rb = latestMaintenance(y.eq)?.raw ?? '';
          // Ei huoltoa: vanhin-järjestyksessä ensin (huoltamatta), uusin-järjestyksessä viimeisenä.
          const dir = sortKey === 'huolto_uusin' ? -1 : 1;
          if (!ra || !rb) c = !ra && !rb ? 0 : (!ra ? -1 : 1) * dir;
          else c = (ra < rb ? -1 : ra > rb ? 1 : 0) * dir;
        }
        return c || cmp(name(x.eq), name(y.eq)) || x.i - y.i;
      })
      .map((x) => x.eq);
  }, [equipment, query, typeFilter, sortKey, deviceFields, latestMaintenance, schedule]);

  const counts = useMemo(() => {
    if (!schedule) return null;
    let due = 0;
    let done = 0;
    for (const eq of equipment) {
      const sc = schedule(eq);
      if (!sc) continue;
      if (sc.service.state === 'huollettu') done++;
      else if (sc.needsService) due++;
    }
    return { due, done };
  }, [equipment, schedule]);

  const columns: DataTableColumn<Equipment>[] = [
    {
      key: 'name',
      label: 'Laite',
      value: (eq) => eq.name,
      render: (eq) => (
        <span className="customer-equipment-name-cell">
          {selectable ? <label className="customer-equipment-row-select" onClick={(e) => e.stopPropagation()}>
            <CheckToggle
              checked={selectedIds.has(eq.id)}
              onChange={(e) => onToggleSelected(eq.id, e.target.checked)}
            />
            <span className="sr-only">Valitse {eq.name}</span>
          </label> : null}
          <span className="customer-equipment-name-text">
            {eq.name}
            {eq.tag ? <small className="muted">{eq.tag}</small> : null}
          </span>
          {eq.is_onboarding_demo ? <span className="badge badge-demo">Esimerkki</span> : null}
          {(() => {
            const sc = schedule?.(eq);
            return sc ? <ScheduleChips s={sc} /> : null;
          })()}
        </span>
      ),
    },
    {
      key: 'model',
      label: 'Merkki / malli',
      value: (eq) => [deviceFields?.(eq).manufacturer, eq.model].filter(Boolean).join(' '),
      render: (eq) => {
        const text = [deviceFields?.(eq).manufacturer, eq.model].filter(Boolean).join(' ');
        return (
          <span className="customer-equipment-stack">
            {text || '—'}
            {eq.serial_number ? <small className="muted">SN {eq.serial_number}</small> : null}
          </span>
        );
      },
    },
    { key: 'refrigerant', label: 'Kylmäaine', value: (eq) => (deviceFields ? formatRefrigerant(deviceFields(eq)) : ''), className: 'nowrap' },
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
    <div className="customer-equipment-list">
    {counts && equipment.length > 0 ? (
      <p className="customer-equipment-counts">
        {counts.due} huollettavaa · {counts.done} huollettu
      </p>
    ) : null}
    <div className="customer-equipment-toolbar">
      <input
        type="search"
        className="customer-equipment-search"
        placeholder="Hae nimi, tunnus, SN…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Hae laitteita"
      />
      <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="Järjestys">
        <option value="nimi">Nimi A–Ö</option>
        <option value="huolto_vanhin">Huolto: vanhin</option>
        <option value="huolto_uusin">Huolto: uusin</option>
        <option value="sijainti">Sijainti</option>
        {schedule ? <option value="erääntyvät">Erääntyvät ensin</option> : null}
      </select>
      {typeOptions.length > 1 || schedule ? (
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Laitetyyppi">
          <option value="">Kaikki</option>
          {schedule ? <option value="huollettavat">Huollettavat</option> : null}
          {typeOptions.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      ) : null}
    </div>
    <DataTable
      key={`${sortKey}|${typeFilter}`}
      hideFilter
      emptyText="Ei hakua vastaavia laitteita."
      rows={visibleRows}
      columns={columns}
      rowKey={(eq) => eq.id}
      rowHref={hrefFor ?? ((eq) => `/asiakkaat/${customerId}/laitteet/${eq.id}`)}
      rowState={() => navTrail?.state}
      ariaLabel="Laitteet"
      actions={(eq) => (
        <>
          {onPrintCard ? <Tooltip label="Tulosta laitekortti">
            <button
              type="button"
              className="icon-action-btn"
              disabled={printBusyId === `card:${eq.id}`}
              onClick={() => onPrintCard(eq)}
              aria-label="Tulosta laitekortti"
            >
              <DeviceCardIcon />
            </button>
          </Tooltip> : null}
          {onPrintHistory ? <Tooltip label="Tulosta huoltohistoria">
            <button
              type="button"
              className="icon-action-btn"
              disabled={printBusyId === `history:${eq.id}`}
              onClick={() => onPrintHistory(eq)}
              aria-label="Tulosta huoltohistoria"
            >
              <HistoryIcon />
            </button>
          </Tooltip> : null}
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
    </div>
  );
}
