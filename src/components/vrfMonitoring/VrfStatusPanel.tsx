import { useEffect, useId, useRef, useState } from 'react';
import { IconHelp } from '../icons';
import VrfToggleSwitch from './VrfToggleSwitch';
import {
  formatRelativeTime,
  formatVrfDiRawDisplay,
  vrfAlarmDelayResetState,
  vrfDiSuppressedReason,
  vrfPresentDigitalInputs,
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
  });

  const alarmDelayReset = vrfAlarmDelayResetState(telemetry, externalAlarm);
  const alarmShutdownDisabled = telemetry?.settings?.di3_alarm_shutdown_enabled === false;
  const showAlarmDelayReset =
    !readOnly &&
    onResetAlarmDelay &&
    !alarmShutdownDisabled &&
    (telemetry?.status.alarm_shutdown_active ?? false);

  const toggleChecked = requestedEnabled ?? permit.actualOn ?? permit.isOn ?? false;
  const toggleDisabled = permitDisabled || readOnly || !onPermitChange;
  const di = vrfPresentDigitalInputs(telemetry);
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
                      ? 'Ulkolämpöraja — status-DI:t eivät ole luotettavia.'
                      : diSuppressReason === 'permit_off'
                        ? 'Käyntilupa pois — status-DI:t eivät ole luotettavia.'
                        : 'Signaalikisko ei aktiivinen — jännite-arvot voivat näyttää 0 V vaikka mittarilla näkyisi +12 V.'}
                  </p>
                )}
                <ul className="vrf-di-status-list">
                  <li>
                    <strong>DI4 Käyntitieto</strong>
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
