import {
  connectionBadgeLabel,
  evalZone,
  liveTempsFromDevice,
  parseZoneConfig,
  type HistoryPoint,
  type ZoneConfig,
  type ZoneKey,
} from '../../lib/tempZoneMonitoring';
import { formatTempC, isTempDeviceOnline } from '../../lib/tempMonitoring';

type Props = {
  zoneConfig: unknown;
  lastTempC: number | null;
  lastTempC2?: number | null;
  lastSeenAt: string | null;
  historyPoints: HistoryPoint[];
  canEditSettings?: boolean;
  onOpenSettings?: () => void;
  onTempClick?: (zoneKey: ZoneKey) => void;
};

export default function TempZoneFloorPlan({
  zoneConfig: rawConfig,
  lastTempC,
  lastTempC2,
  lastSeenAt,
  historyPoints,
  canEditSettings = false,
  onOpenSettings,
  onTempClick,
}: Props) {
  const config = parseZoneConfig(rawConfig);
  if (!config) return null;

  const online = isTempDeviceOnline(lastSeenAt);
  const { t1, t2 } = liveTempsFromDevice(lastTempC, lastTempC2);
  const conn = connectionBadgeLabel(lastSeenAt, online);

  return (
    <section className="panel temp-zone-panel" aria-label="Lämpötilat ja huoneet">
      <div className="temp-zone-toolbar">
        <span className={`temp-zone-conn-badge ${conn.warn ? 'warn' : 'ok'}`}>{conn.text}</span>
        {canEditSettings && onOpenSettings && (
          <button type="button" className="btn btn-secondary" onClick={onOpenSettings}>
            Huoltoasetukset
          </button>
        )}
      </div>
      <p className="muted temp-zone-subtitle">
        Kylmiöhuoneet ja pakastin — tavoitteet ja mittaus väreinä. Paina lämpötilaa nähdäksesi trendin.
      </p>
      <div className="temp-floor-plan-wrap">
        <div className="temp-floor-compass" aria-hidden="true" title="Ilmansuunta">
          N ↑
        </div>
        <div className="temp-floor-plan temp-floor-plan--grid" role="group" aria-label="Huoneet pohjapiirroksessa">
          <ZoneCard
            zoneKey="k1"
            config={config.k1}
            t1={t1}
            t2={t2}
            historyPoints={historyPoints}
            onTempClick={onTempClick}
          />
          <div className="temp-floor-corridor" aria-hidden="true">
            <span className="temp-floor-corridor-inner">
              <span className="temp-floor-corridor-label">Käytävä</span>
              <span className="temp-floor-corridor-sub">ovet huoneisiin</span>
            </span>
          </div>
          <ZoneCard
            zoneKey="k3"
            config={config.k3}
            t1={t1}
            t2={t2}
            historyPoints={historyPoints}
            onTempClick={onTempClick}
          />
          <ZoneCard
            zoneKey="k2"
            config={config.k2}
            t1={t1}
            t2={t2}
            historyPoints={historyPoints}
            onTempClick={onTempClick}
          />
          <ZoneCard
            zoneKey="pakastin"
            config={config.pakastin}
            t1={t1}
            t2={t2}
            historyPoints={historyPoints}
            onTempClick={onTempClick}
          />
        </div>
      </div>
    </section>
  );
}

function ZoneCard({
  zoneKey,
  config,
  t1,
  t2,
  historyPoints,
  onTempClick,
}: {
  zoneKey: ZoneKey;
  config: ZoneConfig[ZoneKey];
  t1: number | null;
  t2: number | null;
  historyPoints: HistoryPoint[];
  onTempClick?: (zoneKey: ZoneKey) => void;
}) {
  const sens = config.sensor;
  const t = sens === 1 ? t1 : sens === 2 ? t2 : null;
  const ev = evalZone(t, config, historyPoints, sens);
  const levelClass = ev.level === 'none' ? 'none' : ev.level;
  const isFreezer = zoneKey === 'pakastin';
  const tempLabel = t != null && Number.isFinite(t) ? `${t.toFixed(1)} °C` : '—';

  return (
    <article
      className={`temp-zone-room temp-zone--${levelClass}${isFreezer ? ' temp-zone-freezer' : ''}`}
      data-zone={zoneKey}
      id={`zone-card-${zoneKey}`}
    >
      <header className="temp-zone-head">
        <span className="temp-zone-badge">{ev.badge}</span>
      </header>
      {onTempClick && sens > 0 ? (
        <button
          type="button"
          className="temp-zone-temp temp-zone-temp--clickable"
          onClick={() => onTempClick(zoneKey)}
        >
          {tempLabel}
        </button>
      ) : (
        <p className="temp-zone-temp">{tempLabel}</p>
      )}
      <p className="temp-zone-reason">{ev.text}</p>
      <div className="temp-zone-meta-readonly">
        <p>
          <strong>{config.label || '—'}</strong>
        </p>
        {config.contents ? <p className="muted">{config.contents}</p> : null}
        <p className="muted temp-zone-limits-hint">
          Hälytysrajat {config.min}–{config.max} °C
          {sens === 0 ? ' · ei anturia' : ` · anturi ${sens}`}
        </p>
      </div>
    </article>
  );
}

export function TempZoneLiveSensors({
  zoneConfig,
  lastTempC,
  lastTempC2,
}: {
  zoneConfig?: unknown;
  lastTempC: number | null;
  lastTempC2?: number | null;
}) {
  const config = parseZoneConfig(zoneConfig);
  const { t1, t2 } = liveTempsFromDevice(lastTempC, lastTempC2);
  const k1Label = config?.k1?.label;
  const pakLabel = config?.pakastin?.label;

  return (
    <dl className="temp-zone-sensor-strip">
      <div>
        <dt>
          Anturi 1
          {config?.pakastin?.sensor === 1 && pakLabel ? ` (${pakLabel})` : ''}
        </dt>
        <dd>{formatTempC(t1)}</dd>
      </div>
      <div>
        <dt>
          Anturi 2
          {config?.k1?.sensor === 2 && k1Label ? ` (${k1Label})` : ''}
        </dt>
        <dd>{formatTempC(t2)}</dd>
      </div>
    </dl>
  );
}
