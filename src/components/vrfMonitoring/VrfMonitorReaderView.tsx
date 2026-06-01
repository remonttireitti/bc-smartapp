import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import VrfStatusPanel from './VrfStatusPanel';
import VrfSchematicBoard from './VrfSchematicBoard';
import VrfTrendDialog from './VrfTrendDialog';
import VrfReportDialog from './VrfReportDialog';
import IconButton from '../IconButton';
import { IconPrint } from '../icons';
import {
  VRF_DEVICE_SELECT,
  activeVrfAlarmsForDisplay,
  isVrfDeviceOnline,
  isVrfTelemetryStale,
  parseVrfSettings,
  parseVrfTelemetry,
  vrfExternalAlarmActive,
  vrfPresentDigitalInputs,
  vrfCompressorRunning,
  vrfResolveDeviceActivity,
  type VrfBinaryLaneKey,
  type VrfDevice,
  type VrfSchematicClickKey,
} from '../../lib/vrfMonitoring';
import { loadMonitorShareViewPublic } from '../../lib/monitorReaderShares';
import { supabase } from '../../lib/supabase';

type Props = {
  session?: Session | null;
  deviceId?: string;
  shareToken?: string;
  shareLabel?: string | null;
  showReaderBadge?: boolean;
};

export default function VrfMonitorReaderView({
  session,
  deviceId,
  shareToken,
  shareLabel,
  showReaderBadge = true,
}: Props) {
  const [device, setDevice] = useState<VrfDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [trendOpen, setTrendOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [trendFocusHotspot, setTrendFocusHotspot] = useState<VrfSchematicClickKey | null>(null);
  const [trendFocusBinary, setTrendFocusBinary] = useState<VrfBinaryLaneKey | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (shareToken) {
        const bundle = await loadMonitorShareViewPublic(shareToken, 24);
        setDevice(bundle.device as VrfDevice);
      } else if (deviceId) {
        const { data, error: fetchError } = await supabase
          .from('vrf_devices')
          .select(VRF_DEVICE_SELECT)
          .eq('id', deviceId)
          .maybeSingle();
        if (fetchError) throw new Error(fetchError.message);
        setDevice((data as VrfDevice | null) ?? null);
      } else {
        throw new Error('Laite puuttuu');
      }
      setLastRefreshAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lataus epäonnistui');
      setDevice(null);
    } finally {
      setLoading(false);
    }
  }, [deviceId, shareToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const telemetry = useMemo(() => parseVrfTelemetry(device?.latest_payload), [device?.latest_payload]);
  const deviceSettings = useMemo(() => parseVrfSettings(device?.settings), [device?.settings]);
  const online = isVrfDeviceOnline(device?.last_seen_at);
  const stale = isVrfTelemetryStale(device?.latest_payload);
  const compressorRunning = vrfCompressorRunning(telemetry, deviceSettings);
  const diStale = stale || !online;
  const heatEnabled = device?.control_requested_enabled ?? telemetry?.control.enabled ?? device?.heat_enabled;
  const alarms = activeVrfAlarmsForDisplay(telemetry?.alarms ?? {}, telemetry, deviceSettings);
  const externalAlarm = vrfExternalAlarmActive(telemetry, deviceSettings);
  const defrostLikely = telemetry?.defrost?.active === true;

  const activitySummary = useMemo(
    () =>
      vrfResolveDeviceActivity({
        telemetry,
        online,
        stale,
        defrostLikely,
        compressorRunning,
        externalAlarm,
        activeAlarmLabels: alarms.map((alarm) => alarm.label),
      }),
    [telemetry, online, stale, defrostLikely, compressorRunning, externalAlarm],
  );

  function openTrendFromHotspot(key: VrfSchematicClickKey) {
    setTrendFocusHotspot(key);
    setTrendFocusBinary(null);
    setTrendOpen(true);
  }

  function openTrendFromDi(lane: VrfBinaryLaneKey) {
    setTrendFocusHotspot(null);
    setTrendFocusBinary(lane);
    setTrendOpen(true);
  }

  if (loading && !device) {
    return <p className="muted">Ladataan seurantaa…</p>;
  }

  if (error || !device) {
    return <p className="form-error">{error ?? 'Seurantaa ei löydy'}</p>;
  }

  const title = shareLabel?.trim() || device.name;

  return (
    <div className="temp-monitoring-page vrf-detail-page vrf-reader-view page-stack">
      <header className="vrf-reader-head">
        <div>
          {showReaderBadge && <span className="badge vrf-reader-badge">Lukuoikeus</span>}
          <h1>{title}</h1>
          <p className="muted vrf-reader-subtitle">
            {online ? 'Online' : 'Offline'} · {activitySummary.headline}
            {lastRefreshAt
              ? ` · päivitetty ${lastRefreshAt.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </p>
        </div>
        <div className="vrf-reader-head-actions">
          <IconButton label="Tulosta raportti" tooltipSide="bottom" onClick={() => setReportOpen(true)}>
            <IconPrint />
          </IconButton>
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            Päivitä
          </button>
        </div>
      </header>

      {stale && online && (
        <p className="form-error">Mittaus ei ole tuore — näytetään viimeisin saatu data.</p>
      )}

      <section className={`vrf-hero panel vrf-hero--reader ${alarms.length > 0 ? 'vrf-hero--alarm' : ''}`}>
        <VrfStatusPanel
          telemetry={telemetry}
          online={online}
          stale={stale}
          defrostLikely={defrostLikely}
          compressorRunning={compressorRunning}
          externalAlarm={externalAlarm}
          activeAlarmLabels={alarms.map((alarm) => alarm.label)}
          requestedEnabled={heatEnabled}
          lastSeenAt={device.last_seen_at}
          firmwareVersion={device.firmware_version}
          readOnly
          deviceSettings={deviceSettings}
        />
      </section>

      {alarms.length > 0 && (
        <ul className="vrf-alarm-list vrf-alarm-banner">
          {alarms.map((alarm) => (
            <li key={alarm.key} className="vrf-alarm-item">
              {alarm.label}
            </li>
          ))}
        </ul>
      )}

      <section className="panel temp-devices-panel vrf-schematic-panel">
        <div className="temp-panel-head">
          <h2>Järjestelmäkaavio</h2>
          <p className="muted">Paina lämpötilaa tai DI-merkkiä avataksesi trendin.</p>
        </div>
        <VrfSchematicBoard
          temperatures={telemetry?.temperatures ?? {}}
          digitalInputs={vrfPresentDigitalInputs(telemetry, deviceSettings)}
          compressorRunning={compressorRunning}
          stale={diStale}
          showTemps={online}
          onHotspotClick={openTrendFromHotspot}
          onDiClick={openTrendFromDi}
        />
      </section>

      {device.id && (
        <>
          <VrfTrendDialog
            open={trendOpen}
            deviceId={device.id}
            shareToken={shareToken}
            focusHotspot={trendFocusHotspot}
            focusBinary={trendFocusBinary}
            onClose={() => {
              setTrendOpen(false);
              setTrendFocusHotspot(null);
              setTrendFocusBinary(null);
            }}
          />
          <VrfReportDialog
            open={reportOpen}
            device={device}
            companyName="BC SmartApp"
            shareToken={shareToken}
            onClose={() => setReportOpen(false)}
          />
        </>
      )}

      {session && (
        <p className="muted vrf-reader-login-note">
          Kirjautuneena: {session.user.email}. Näkymä on vain luku — ohjausta ei voi muuttaa.
        </p>
      )}
    </div>
  );
}
