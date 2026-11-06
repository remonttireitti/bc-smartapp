import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CollapsibleSection from './CollapsibleSection';
import { newHuoltoReportHrefForDevice, type HuoltoAccess } from '../lib/huoltoCategories';
import type { withNavTrail } from '../lib/navigationTrail';
import {
  MAINTENANCE_SEASON_LABELS,
  SEASON_DEVICE_STATUS_LABELS,
  groupMaintenanceProtocols,
  protocolsForAudience,
  seasonDeviceRows,
  type MaintenanceProtocolRef,
  type MaintenanceSeason,
} from '../lib/maintenanceSeasonOverview';
import { getMaintenanceReportStatusLabel } from '../types';

type Device = { id: string; name: string; tag?: string | null; device_type?: string | null };

type Props = {
  portal: boolean;
  customerId: string;
  protocols: readonly MaintenanceProtocolRef[];
  devices: readonly Device[];
  huoltoAccess: HuoltoAccess;
  navTrail?: ReturnType<typeof withNavTrail>;
};

function deviceLabel(device: Device): string {
  const tag = device.tag?.trim();
  const name = device.name?.trim() || 'Laite';
  return tag && tag !== name ? `${tag} — ${name}` : name;
}

function dateFi(ymd: string | null): string {
  if (!ymd) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[3])}.${Number(m[2])}.${m[1]}`;
}

function yearLabel(year: number | null): string {
  return year == null ? 'Vuosi ei tiedossa' : String(year);
}

export default function CustomerMaintenanceOverview({
  portal,
  customerId,
  protocols,
  devices,
  huoltoAccess,
  navTrail,
}: Props) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const [year, setYear] = useState(currentYear);
  const [season, setSeason] = useState<MaintenanceSeason>(today.getMonth() >= 6 ? 'syksy' : 'kevat');

  const visible = useMemo(
    () => protocolsForAudience(protocols, portal ? 'portal' : 'installer'),
    [protocols, portal],
  );
  const groups = useMemo(
    () => groupMaintenanceProtocols(visible, { currentYear }),
    [visible, currentYear],
  );
  const deviceRows = useMemo(
    () => seasonDeviceRows({
      devices: devices.map((device) => ({
        id: device.id,
        label: deviceLabel(device),
        deviceType: device.device_type,
      })),
      protocols: visible,
      year,
      season,
    }),
    [devices, visible, year, season],
  );
  const yearOptions = useMemo(() => {
    const years = new Set<number>([currentYear, year]);
    for (const group of groups) {
      if (group.year != null) years.add(group.year);
    }
    return [...years].sort((a, b) => b - a);
  }, [groups, currentYear, year]);

  function protocolHref(id: string): string {
    return portal ? `/huoltoraportit/${id}/tuloste` : `/huoltoraportit/${id}`;
  }

  function startHref(deviceId: string, deviceType: string | null): string {
    const query = new URLSearchParams({
      customerId,
      equipmentId: deviceId,
      huoltokausi: season,
      huoltokausiVuosi: String(year),
    });
    return newHuoltoReportHrefForDevice(huoltoAccess, deviceType, query.toString());
  }

  return (
    <CollapsibleSection
      variant="plain"
      className="customer-section customer-collapsible maintenance-overview"
      title={portal ? 'Huoltopöytäkirjat' : 'Huoltokatsaus'}
      collapseKey={portal ? 'portal-customer:maintenance-overview' : 'customer:maintenance-overview'}
      defaultOpen
    >
      <p className="muted maintenance-overview-lead">
        {portal
          ? 'Valmiit pöytäkirjat vuosittain. Kevät- ja syyshuolto näkyvät vain, kun pöytäkirjaan on merkitty kausi.'
          : 'Kevät- ja syyshuolto näkyvät vain pöytäkirjoissa, joihin kausi on merkitty. Korjaus ilman kautta ei ole kausihuolto.'}
      </p>

      {groups.map((group) => (
        <section key={yearLabel(group.year)} className="maintenance-year">
          <h3>{yearLabel(group.year)}</h3>
          {group.seasons.map((bucket) => (
            <div key={bucket.season} className="maintenance-season-block">
              <h4>{bucket.label}</h4>
              {bucket.protocols.length === 0 ? (
                <p className="muted">Ei pöytäkirjoja.</p>
              ) : (
                <ul className="maintenance-protocol-list">
                  {bucket.protocols.map((protocol) => (
                    <li key={protocol.id}>
                      <Link to={protocolHref(protocol.id)} {...navTrail}>
                        <span>{dateFi(protocol.dateYmd)}</span>
                        <span>{protocol.title}</span>
                        {!portal ? <span>{getMaintenanceReportStatusLabel(protocol.status)}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {group.other.length > 0 ? (
            <div className="maintenance-season-block">
              <h4>Muu huolto</h4>
              <ul className="maintenance-protocol-list">
                {group.other.map((protocol) => (
                  <li key={protocol.id}>
                    <Link to={protocolHref(protocol.id)} {...navTrail}>
                      <span>{dateFi(protocol.dateYmd)}</span>
                      <span>{protocol.title}</span>
                      {!portal ? <span>{getMaintenanceReportStatusLabel(protocol.status)}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ))}

      {!portal ? (
        <section className="maintenance-season-devices">
          <h3>Laitteet kaudella</h3>
          <div className="maintenance-overview-controls">
            <label>
              Vuosi
              <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {yearOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <div className="maintenance-season-toggle" role="group" aria-label="Huoltokausi">
              {(['syksy', 'kevat'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={option === season ? 'btn btn-primary' : 'btn btn-secondary'}
                  aria-pressed={option === season}
                  onClick={() => setSeason(option)}
                >
                  {MAINTENANCE_SEASON_LABELS[option]}
                </button>
              ))}
            </div>
          </div>
          {deviceRows.length === 0 ? (
            <p className="muted">Ei käytössä olevia laitteita.</p>
          ) : (
            <ul className="maintenance-device-list">
              {deviceRows.map((device) => (
                <li key={device.deviceId} className="maintenance-device-row">
                  <div className="maintenance-device-head">
                    <strong>{device.label}</strong>
                    <span className={`maintenance-device-status maintenance-device-status-${device.status}`}>
                      {SEASON_DEVICE_STATUS_LABELS[device.status]}
                    </span>
                  </div>
                  {device.protocols.length > 0 ? (
                    <ul className="maintenance-protocol-list">
                      {device.protocols.map((protocol) => (
                        <li key={protocol.id}>
                          <Link to={protocolHref(protocol.id)} {...navTrail}>
                            <span>{dateFi(protocol.dateYmd)}</span>
                            <span>{protocol.title}</span>
                            <span>{getMaintenanceReportStatusLabel(protocol.status)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Link className="btn btn-secondary" to={startHref(device.deviceId, device.deviceType)} {...navTrail}>
                      Aloita huolto
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </CollapsibleSection>
  );
}
