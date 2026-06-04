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
  readOnly?: boolean;
};

export default function TempZoneFloorPlan({
  zoneConfig: rawConfig,
  lastTempC,
  lastTempC2,
  lastSeenAt,
  historyPoints,
  readOnly = true,
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
      </div>
      <p className="muted temp-zone-subtitle">
        Kylmiöhuoneet ja pakastin — tavoitteet ja mittaus väreinä (vihreä / oranssi / punainen)
      </p>
      <div className="temp-floor-plan-wrap">
        <div className="temp-floor-compass" aria-hidden="true" title="Ilmansuunta">
          N ↑
        </div>
        <div className="temp-floor-plan temp-floor-plan--grid" role="group" aria-label="Huoneet pohjapiirroksessa">
          <ZoneCard zoneKey="k1" config={config.k1} t1={t1} t2={t2} historyPoints={historyPoints} readOnly={readOnly} />
          <div className="temp-floor-corridor" aria-hidden="true">
            <span className="temp-floor-corridor-inner">
              <span className="temp-floor-corridor-label">Käytävä</span>
              <span className="temp-floor-corridor-sub">ovet huoneisiin</span>
            </span>
          </div>
          <ZoneCard zoneKey="k3" config={config.k3} t1={t1} t2={t2} historyPoints={historyPoints} readOnly={readOnly} />
          <ZoneCard zoneKey="k2" config={config.k2} t1={t1} t2={t2} historyPoints={historyPoints} readOnly={readOnly} />
          <ZoneCard
            zoneKey="pakastin"
            config={config.pakastin}
            t1={t1}
            t2={t2}
            historyPoints={historyPoints}
            readOnly={readOnly}
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
  readOnly,
}: {
  zoneKey: ZoneKey;
  config: ZoneConfig[ZoneKey];
  t1: number | null;
  t2: number | null;
  historyPoints: HistoryPoint[];
  readOnly: boolean;
}) {
  const sens = config.sensor;
  const t = sens === 1 ? t1 : sens === 2 ? t2 : null;
  const ev = evalZone(t, config, historyPoints, sens);
  const levelClass = ev.level === 'none' ? 'none' : ev.level;
  const isFreezer = zoneKey === 'pakastin';

  return (
    <article
      className={`temp-zone-room temp-zone--${levelClass}${isFreezer ? ' temp-zone-freezer' : ''}`}
      data-zone={zoneKey}
      id={`zone-card-${zoneKey}`}
    >
      <header className="temp-zone-head">
        <span className="temp-zone-badge">{ev.badge}</span>
      </header>
      <p className="temp-zone-temp">{t != null && Number.isFinite(t) ? `${t.toFixed(1)} °C` : '—'}</p>
      <p className="temp-zone-reason">{ev.text}</p>
      {!readOnly ? (
        <>
          <label htmlFor={`zone-${zoneKey}-label`}>Huone / tunnus</label>
          <input type="text" id={`zone-${zoneKey}-label`} defaultValue={config.label} maxLength={80} />
          <label htmlFor={`zone-${zoneKey}-contents`}>Mitä säilytetään</label>
          <textarea id={`zone-${zoneKey}-contents`} rows={2} defaultValue={config.contents} maxLength={400} />
        </>
      ) : (
        <div className="temp-zone-meta-readonly">
          <p>
            <strong>{config.label || '—'}</strong>
          </p>
          {config.contents ? <p className="muted">{config.contents}</p> : null}
          <p className="muted temp-zone-limits-hint">
            Tavoite {config.min}–{config.max} °C
            {sens === 0 ? ' · ei anturia' : ` · anturi ${sens}`}
          </p>
        </div>
      )}
    </article>
  );
}

export function TempZoneLiveSensors({
  lastTempC,
  lastTempC2,
}: {
  lastTempC: number | null;
  lastTempC2?: number | null;
}) {
  const { t1, t2 } = liveTempsFromDevice(lastTempC, lastTempC2);
  return (
    <dl className="temp-zone-sensor-strip">
      <div>
        <dt>Anturi 1</dt>
        <dd>{formatTempC(t1)}</dd>
      </div>
      <div>
        <dt>Anturi 2</dt>
        <dd>{formatTempC(t2)}</dd>
      </div>
    </dl>
  );
}
