import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import VrfSchematicBoard from './VrfSchematicBoard';
import VrfTrendDialog from './VrfTrendDialog';
import {
  VRF_DEVICE_SELECT,
  activeVrfAlarms,
  formatRelativeTime,
  isVrfDeviceOnline,
  isVrfTelemetryStale,
  parseVrfTelemetry,
  vrfCompressorRunning,
  vrfOperatingStateLabel,
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
  const online = isVrfDeviceOnline(device?.last_seen_at);
  const stale = isVrfTelemetryStale(device?.latest_payload);
  const compressorRunning = vrfCompressorRunning(telemetry);
  const diStale = stale || !online;
  const heatEnabled = device?.control_requested_enabled ?? telemetry?.control.enabled ?? device?.heat_enabled;
  const outdoorLock = telemetry?.status.outdoor_safety_lock_active ?? false;
  const alarms = activeVrfAlarms(telemetry?.alarms ?? {});

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
            {online ? 'Online' : 'Offline'} · {vrfOperatingStateLabel(telemetry?.status.operating_state ?? device.operating_state)}
            {lastRefreshAt
              ? ` · päivitetty ${lastRefreshAt.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void load()}>
          Päivitä
        </button>
      </header>

      {stale && online && (
        <p className="form-error">Mittaus ei ole tuore — näytetään viimeisin saatu data.</p>
      )}

      <section className={`vrf-hero panel vrf-hero--reader ${alarms.length > 0 ? 'vrf-hero--alarm' : ''}`}>
        <div className="vrf-hero-main">
          <div className="vrf-hero-badges">
            <span className={`temp-status ${online ? 'online' : 'offline'}`}>
              <span className="temp-status-dot" aria-hidden="true" />
              {online ? 'Online' : 'Offline'}
            </span>
            {alarms.length > 0 && <span className="badge badge-alert">Hälytys</span>}
            {outdoorLock && <span className="badge badge-warning">Ulkolämpö lukko</span>}
            <span className="muted">{vrfOperatingStateLabel(telemetry?.status.operating_state ?? device.operating_state)}</span>
            <span className="muted">Viimeisin yhteys: {formatRelativeTime(device.last_seen_at)}</span>
          </div>
          <div className="vrf-reader-status-grid">
            <div className="vrf-reader-status-item">
              <span className="muted">Käyntilupa (RO1)</span>
              <strong>{heatEnabled ? 'ON' : 'OFF'}</strong>
            </div>
            <div className="vrf-reader-status-item">
              <span className="muted">Kompressori (DI2)</span>
              <strong>
                {diStale
                  ? '—'
                  : telemetry?.digital_inputs?.di2_compressor_running
                    ? 'Käy'
                    : 'Pois'}
              </strong>
            </div>
            <div className="vrf-reader-status-item">
              <span className="muted">Laite (DI4)</span>
              <strong>
                {diStale
                  ? '—'
                  : telemetry?.digital_inputs?.di4_unit_ready
                    ? 'Päällä'
                    : 'Pois'}
              </strong>
            </div>
          </div>
        </div>
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
          digitalInputs={telemetry?.digital_inputs ?? null}
          compressorRunning={compressorRunning}
          stale={diStale}
          showTemps={online}
          onHotspotClick={openTrendFromHotspot}
          onDiClick={openTrendFromDi}
        />
      </section>

      {device.id && (
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
      )}

      {session && (
        <p className="muted vrf-reader-login-note">
          Kirjautuneena: {session.user.email}. Näkymä on vain luku — ohjausta ei voi muuttaa.
        </p>
      )}
    </div>
  );
}
