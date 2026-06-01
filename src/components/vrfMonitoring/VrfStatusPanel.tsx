import { useEffect, useId, useRef, useState } from 'react';
import { IconHelp } from '../icons';
import VrfToggleSwitch from './VrfToggleSwitch';
import {
  formatRelativeTime,
  formatVrfDiRawDisplay,
  vrfAlarmDelayResetState,
  vrfAlarmShutdownBlocksControl,
  vrfDiSuppressedReason,
  VRF_CNH_STATUS_LABEL,
  vrfDiStateContradictions,
  vrfPresentDigitalInputs,
  vrfResolveDeviceActivity,
  vrfAlarmBlocksPermitEnable,
  vrfResolvePermitStatus,
  type VrfDeviceSettings,
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
  diMismatchHint?: string | null;
  deviceSettings?: Partial<VrfDeviceSettings> | null;
  readOnly?: boolean;
  permitDisabled?: boolean;
  permitChangeBusy?: boolean;
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
  permitChangeBusy = false,
  onPermitChange,
  onResetAlarmDelay,
  alarmDelayResetBusy = false,
  diWiringHint = null,
  diMismatchHint = null,
  deviceSettings = null,
}: Props) {
  const [diOpen, setDiOpen] = useState(false);
  const diPopoverId = useId();
  const diAnchorRef = useRef<HTMLSpanElement>(null);

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
    externalAlarm,
    activeAlarmLabels,
  });

  const permitEnableBlocked = vrfAlarmBlocksPermitEnable(
    telemetry,
    deviceSettings,
    activeAlarmLabels,
  );

  const alarmDelayReset = vrfAlarmDelayResetState(telemetry, externalAlarm);
  const alarmShutdownDisabled = telemetry?.settings?.di3_alarm_shutdown_enabled === false;
  const showAlarmDelayReset =
    !readOnly &&
    onResetAlarmDelay &&
    !alarmShutdownDisabled &&
    (telemetry?.status.alarm_shutdown_active ?? false);

  const alarmShutdownLock = vrfAlarmShutdownBlocksControl(telemetry);
  const toggleChecked = alarmShutdownLock
    ? false
    : requestedEnabled ?? permit.actualOn ?? permit.isOn ?? false;
  const toggleDisabled =
    permitDisabled || readOnly || !onPermitChange || (permitEnableBlocked && !toggleChecked);

  function handlePermitChange(next: boolean) {
    if (next && permitEnableBlocked) return;
    onPermitChange?.(next);
  }
  const di = vrfPresentDigitalInputs(telemetry, deviceSettings);
  const diContradictions = vrfDiStateContradictions(telemetry, deviceSettings);
  const diMismatchHintResolved =
    diMismatchHint ??
    (diContradictions.length > 0 ? diContradictions.map((c) => c.message).join(' ') : null);
  const diSuppressReason = vrfDiSuppressedReason(telemetry);

  useEffect(() => {
    if (!diOpen) return;

    function onDocumentClick(event: MouseEvent) {
      if (!diAnchorRef.current?.contains(event.target as Node)) {
        setDiOpen(false);
      }
    }

    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [diOpen]);

  return (
    <section className="vrf-status-panel">
      <div className="vrf-status-meta">
        <span className={`temp-status ${online ? 'online' : 'offline'}`}>
          <span className="temp-status-dot" aria-hidden="true" />
          {online ? 'Online' : 'Offline'}
        </span>
        <span className="muted">Viimeisin yhteys: {formatRelativeTime(lastSeenAt)}</span>
        {firmwareVersion && <span className="muted">Firmware {firmwareVersion}</span>}
        {di && (
          <span ref={diAnchorRef} className="vrf-di-info-anchor">
            <button
              type="button"
              className={`btn btn-sm vrf-di-info-btn${diOpen ? ' vrf-di-info-btn--open' : ''}`}
              aria-label="Digitaalitulot (FDC400KXZE2)"
              aria-expanded={diOpen}
              aria-controls={diPopoverId}
              onClick={(event) => {
                event.stopPropagation();
                setDiOpen((open) => !open);
              }}
            >
              <IconHelp className="ui-icon" />
              <span>DI</span>
            </button>
            {diOpen && (
              <div id={diPopoverId} className="vrf-di-popover" role="dialog" aria-label="Digitaalitulot">
                <p className="vrf-di-popover-title">Digitaalitulot (FDC400KXZE2)</p>
                {diSuppressReason && (
                  <p className="vrf-di-popover-hint">
                    {diSuppressReason === 'outdoor_lock'
                      ? 'Ulkolämpöraja — signaalikisko voi olla pois.'
                      : diSuppressReason === 'bus_open'
                        ? 'Kaikki DI-optot auki — ei virtaa signaalipoluissa.'
                        : null}
                  </p>
                )}
                <ul className="vrf-di-status-list">
                  <li>
                    <strong>DI4 {VRF_CNH_STATUS_LABEL}</strong>
                    <span>
                      {di.di4_unit_ready ? 'Päällä' : 'Pois'} · {formatVrfDiRawDisplay(di.di4_raw, telemetry)}
                    </span>
                  </li>
                  <li>
                    <strong>DI2 Kompressori</strong>
                    <span>
                      {di.di2_compressor_running ? 'Käy' : 'Pois'} · {formatVrfDiRawDisplay(di.di2_raw, telemetry)}
                    </span>
                  </li>
                  <li>
                    <strong>DI3 Hälytys</strong>
                    <span>
                      {di.di3_alarm ? 'Hälytys' : 'Normaali'} · {formatVrfDiRawDisplay(di.di3_raw, telemetry)}
                    </span>
                  </li>
                </ul>
                {diMismatchHintResolved && <p className="vrf-di-popover-hint">{diMismatchHintResolved}</p>}
                {diWiringHint && <p className="vrf-di-popover-hint">{diWiringHint}</p>}
              </div>
            )}
          </span>
        )}
      </div>

      <div className="vrf-status-grid">
        <article className={`vrf-status-card vrf-status-card--${activity.tone}`}>
          <span className="vrf-status-card-label">Tilatieto</span>
          <h2 className="vrf-status-headline">{activity.headline}</h2>
          {activity.detail && <p className="vrf-status-detail">{activity.detail}</p>}
          {alarmShutdownDisabled && (
            <p className="vrf-status-detail muted">DI3-hälytyksen esto pois — vain seuranta, ei vaikutusta RO1:een</p>
          )}
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

        <article className={`vrf-status-card vrf-status-card--permit-${permit.tone}`}>
          <div className="vrf-status-permit-head">
            <span className="vrf-status-card-label">Käyntilupa (RO1)</span>
            {!readOnly && onPermitChange && (
              <VrfToggleSwitch
                checked={toggleChecked === true}
                disabled={toggleDisabled}
                pending={permitChangeBusy}
                size="lg"
                labelOn="ON"
                labelOff="OFF"
                ariaLabel={
                  toggleDisabled && alarmShutdownLock
                    ? 'Käyntilupa lukittu hälytysviiveen takia — nollaa viive ensin'
                    : toggleDisabled && permitEnableBlocked
                      ? 'Käyntilupa ei kytkettävissä päälle — hälytys aktiivinen'
                      : toggleChecked
                        ? 'Käyntilupa päällä — sammuta painamalla'
                        : 'Käyntilupa pois — kytke päälle painamalla'
                }
                onChange={handlePermitChange}
              />
            )}
          </div>
          <p className={`vrf-status-permit-value vrf-status-permit-value--${permit.tone}`}>{permit.label}</p>
          {permitChangeBusy && (
            <p className="vrf-status-detail vrf-status-permit-saving">Tallennetaan käyntilupaa…</p>
          )}
          {permit.reason && !permitChangeBusy && <p className="vrf-status-detail">{permit.reason}</p>}
          {toggleDisabled && alarmShutdownLock && (
            <p className="vrf-status-detail muted">
              Kytkin pois käytöstä — käytä Tilatiedossa &quot;Nollaa hälytysviive&quot; tai &quot;Pakota viiveen nollaus&quot;.
            </p>
          )}
          {toggleDisabled && permitEnableBlocked && !alarmShutdownLock && (
            <p className="vrf-status-detail muted">
              Käyntilupaa ei voi kytkeä päälle ennen kuin hälytys on poistunut. Voit sammuttaa (OFF), jos kytkin on päällä.
            </p>
          )}
          {permit.requestedOn === true && permit.actualOn === false && permit.tone === 'blocked' && (
            <p className="vrf-status-detail muted">RO1-rele pois — laite ei saa lämmityslupaa</p>
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
