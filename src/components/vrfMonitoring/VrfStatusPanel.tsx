import VrfToggleSwitch from './VrfToggleSwitch';
import {
  formatRelativeTime,
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
  readOnly?: boolean;
  permitDisabled?: boolean;
  onPermitChange?: (next: boolean) => void;
  onResetAlarmDelay?: () => void;
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
              {alarmDelayReset.canReset ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={alarmDelayResetBusy || stale || !online}
                  onClick={onResetAlarmDelay}
                >
                  {alarmDelayResetBusy ? 'Nollataan…' : 'Nollaa hälytysviive'}
                </button>
              ) : (
                alarmDelayReset.blockedReason && (
                  <p className="vrf-status-detail muted">{alarmDelayReset.blockedReason}</p>
                )
              )}
            </div>
          )}
        </article>

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
