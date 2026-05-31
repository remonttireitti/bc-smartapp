import VrfToggleSwitch from './VrfToggleSwitch';
import {
  formatRelativeTime,
  formatVrfDiRaw,
  vrfAlarmDelayResetState,
  vrfResolveDeviceActivity,
  vrfResolvePermitStatus,
  type VrfTelemetry,
} from '../../lib/vrfMonitoring';

type Props = {
  telemetry: VrfTelemetry | null;
  online: boolean;
  stale: boolean;
  defrostLikely: boolean;
  compressorRunning: boolean;
  externalAlarm: boolean;
  activeAlarmLabels: string[];
  requestedEnabled: boolean | null | undefined;
  lastSeenAt: string | null;
  firmwareVersion?: string | null;
  diWiringHint?: string | null;
  readOnly?: boolean;
  permitDisabled?: boolean;
  onPermitChange?: (next: boolean) => void;
  onResetAlarmDelay?: (force?: boolean) => void;
  alarmDelayResetBusy?: boolean;
};

export default function VrfStatusPanel({
  telemetry,
  online,
  stale,
  defrostLikely,
  compressorRunning,
  externalAlarm,
  activeAlarmLabels,
  requestedEnabled,
  lastSeenAt,
  firmwareVersion,
  readOnly = false,
  permitDisabled = false,
  onPermitChange,
  onResetAlarmDelay,
  alarmDelayResetBusy = false,
  diWiringHint = null,
}: Props) {
  const activity = vrfResolveDeviceActivity({
    telemetry,
    online,
    stale,
    defrostLikely,
    compressorRunning,
    externalAlarm,
    activeAlarmLabels,
  });

  const permit = vrfResolvePermitStatus({
    telemetry,
    requestedEnabled,
    online,
    stale,
  });

  const alarmDelayReset = vrfAlarmDelayResetState(telemetry, externalAlarm);
  const showAlarmDelayReset =
    !readOnly &&
    onResetAlarmDelay &&
    (telemetry?.status.alarm_shutdown_active ?? false);

  const toggleChecked = requestedEnabled ?? permit.actualOn ?? permit.isOn ?? false;
  const toggleDisabled = permitDisabled || readOnly || !onPermitChange;
  const di = telemetry?.digital_inputs;

  return (
    <section className="vrf-status-panel">
      <div className="vrf-status-meta">
        <span className={`temp-status ${online ? 'online' : 'offline'}`}>
          <span className="temp-status-dot" aria-hidden="true" />
          {online ? 'Online' : 'Offline'}
        </span>
        <span className="muted">Viimeisin yhteys: {formatRelativeTime(lastSeenAt)}</span>
        {firmwareVersion && <span className="muted">Firmware {firmwareVersion}</span>}
      </div>

      <div className="vrf-status-grid">
        <article className={`vrf-status-card vrf-status-card--${activity.tone}`}>
          <span className="vrf-status-card-label">Tilatieto</span>
          <h2 className="vrf-status-headline">{activity.headline}</h2>
          {activity.detail && <p className="vrf-status-detail">{activity.detail}</p>}
          {showAlarmDelayReset && (
            <div className="vrf-status-delay-reset">
              {alarmDelayReset.canReset && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={alarmDelayResetBusy || stale || !online}
                  onClick={() => onResetAlarmDelay?.(false)}
                >
                  {alarmDelayResetBusy ? 'Nollataan…' : 'Nollaa hälytysviive'}
                </button>
              )}
              {!alarmDelayReset.canReset && alarmDelayReset.canForceReset && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={alarmDelayResetBusy || stale || !online}
                  onClick={() => onResetAlarmDelay?.(true)}
                >
                  {alarmDelayResetBusy ? 'Nollataan…' : 'Pakota viiveen nollaus'}
                </button>
              )}
              {alarmDelayReset.blockedReason && (
                <p className="vrf-status-detail muted">{alarmDelayReset.blockedReason}</p>
              )}
            </div>
          )}
        </article>

        {di && (
          <article className="vrf-status-card vrf-status-card--di">
            <span className="vrf-status-card-label">Digitaalitulot (FDC400KXZE2)</span>
            <ul className="vrf-di-status-list">
              <li>
                <strong>DI4 Käyntitieto</strong> · {di.di4_unit_ready ? 'Päällä' : 'Pois'} ·{' '}
                {formatVrfDiRaw(di.di4_raw)}
              </li>
              <li>
                <strong>DI2 Kompressori</strong> · {di.di2_compressor_running ? 'Käy' : 'Pois'} ·{' '}
                {formatVrfDiRaw(di.di2_raw)}
              </li>
              <li>
                <strong>DI3 Hälytys</strong> · {di.di3_alarm ? 'Hälytys' : 'Normaali'} ·{' '}
                {formatVrfDiRaw(di.di3_raw)}
              </li>
            </ul>
            {diWiringHint && <p className="vrf-status-detail">{diWiringHint}</p>}
          </article>
        )}

        <article className={`vrf-status-card vrf-status-card--permit-${permit.tone}`}>
          <div className="vrf-status-permit-head">
            <span className="vrf-status-card-label">Käyntilupa (RO1)</span>
            {!readOnly && onPermitChange && (
              <VrfToggleSwitch
                checked={toggleChecked === true}
                disabled={toggleDisabled}
                size="lg"
                labelOn="ON"
                labelOff="OFF"
                ariaLabel={
                  toggleChecked
                    ? 'Käyntilupa päällä — sammuta painamalla'
                    : 'Käyntilupa pois — kytke päälle painamalla'
                }
                onChange={onPermitChange}
              />
            )}
          </div>
          <p className={`vrf-status-permit-value vrf-status-permit-value--${permit.tone}`}>{permit.label}</p>
          {permit.reason && <p className="vrf-status-detail">{permit.reason}</p>}
          {permit.requestedOn === true && permit.actualOn === false && permit.tone === 'blocked' && (
            <p className="vrf-status-detail muted">RO1-rele pois — VRF-yksikkö voi silti olla valmiustilassa (DI4)</p>
          )}
          {readOnly && permit.requestedOn != null && permit.actualOn != null && permit.requestedOn !== permit.actualOn && (
            <p className="vrf-status-detail muted">
              Pyydetty {permit.requestedOn ? 'päälle' : 'pois'} · RO1 {permit.actualOn ? 'päällä' : 'pois'}
            </p>
          )}
        </article>
      </div>
    </section>
  );
}
