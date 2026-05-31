import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import CollapsibleSection from '../components/CollapsibleSection';
import TempDeviceDeleteDialog from '../components/tempMonitoring/TempDeviceDeleteDialog';
import TempMonitoringPageHeader from '../components/tempMonitoring/TempMonitoringPageHeader';
import VrfTrendChart from '../components/vrfMonitoring/VrfTrendChart';
import { useProfile } from '../hooks/useProfile';
import { REMOTE_MONITORING_HUB, VRF_MONITORING_BASE } from '../lib/remoteMonitoringRoutes';
import {
  VRF_DEVICE_SELECT,
  VRF_READING_SELECT,
  VRF_SENSOR_KEYS,
  VRF_SENSOR_LABELS,
  activeVrfAlarms,
  defaultVrfSettings,
  formatRelativeTime,
  formatTempC,
  isVrfDeviceOnline,
  isVrfTelemetryStale,
  parseVrfSettings,
  parseVrfTelemetry,
  vrfOperatingStateLabel,
  type VrfDevice,
  type VrfDeviceSettings,
  type VrfReading,
} from '../lib/vrfMonitoring';
import { supabase } from '../lib/supabase';

interface Props {
  session: Session;
}

type TabId = 'seuranta' | 'sulatus' | 'asetukset';

export default function VrfMonitorDetailPage({ session }: Props) {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { profile } = useProfile(session);
  const [device, setDevice] = useState<VrfDevice | null>(null);
  const [readings, setReadings] = useState<VrfReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('seuranta');
  const [deleteTarget, setDeleteTarget] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] = useState<VrfDeviceSettings>(defaultVrfSettings());
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const online = isVrfDeviceOnline(device?.last_seen_at);
  const telemetry = useMemo(() => parseVrfTelemetry(device?.latest_payload), [device?.latest_payload]);
  const stale = isVrfTelemetryStale(device?.latest_payload);
  const heatEnabled = device?.control_requested_enabled ?? telemetry?.control.enabled ?? device?.heat_enabled;
  const outdoorLock = telemetry?.status.outdoor_safety_lock_active ?? false;

  const load = useCallback(async () => {
    if (!deviceId) return;
    setError(null);
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [deviceRes, readingsRes] = await Promise.all([
      supabase.from('vrf_devices').select(VRF_DEVICE_SELECT).eq('id', deviceId).maybeSingle(),
      supabase
        .from('vrf_readings')
        .select(VRF_READING_SELECT)
        .eq('device_id', deviceId)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: true })
        .limit(500),
    ]);
    const nextDevice = (deviceRes.data as VrfDevice | null) ?? null;
    setDevice(nextDevice);
    setReadings((readingsRes.data as VrfReading[] | null) ?? []);
    if (nextDevice) {
      const fromDb = parseVrfSettings(nextDevice.settings);
      const fromPayload = parseVrfTelemetry(nextDevice.latest_payload)?.settings;
      setSettingsForm(parseVrfSettings({ ...fromDb, ...fromPayload }));
    }
    setLastRefreshAt(new Date());
    setLoading(false);
    if (deviceRes.error) setError(deviceRes.error.message);
    else if (readingsRes.error) setError(readingsRes.error.message);
  }, [deviceId]);

  useEffect(() => {
    if (deviceId) void load();
  }, [deviceId, load]);

  useEffect(() => {
    if (!deviceId) return;
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [deviceId, load]);

  async function setHeatPermit(next: boolean) {
    if (!device || stale || outdoorLock) return;
    setBusy(true);
    setMessage(null);
    const { error: updateError } = await supabase
      .from('vrf_devices')
      .update({
        control_requested_enabled: next,
        control_updated_at: new Date().toISOString(),
      })
      .eq('id', device.id);
    setBusy(false);
    if (updateError) {
      setMessage(updateError.message);
      return;
    }
    setMessage(`Käyntilupa ${next ? 'päällä' : 'pois'} — laite päivittää tilan hetken kuluttua.`);
    await load();
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!device || stale) {
      setSettingsMessage('Laite ei lähetä tuoretta dataa — tallennus lukittu.');
      return;
    }
    setBusy(true);
    setSettingsMessage(null);
    const { error: updateError } = await supabase
      .from('vrf_devices')
      .update({
        settings: settingsForm,
        settings_updated_at: new Date().toISOString(),
      })
      .eq('id', device.id);
    setBusy(false);
    if (updateError) {
      setSettingsMessage(updateError.message);
      return;
    }
    setSettingsMessage('Asetukset tallennettu.');
    await load();
  }

  async function confirmDelete() {
    if (!device) return;
    setBusy(true);
    setDeleteError(null);
    const { error: deleteErr } = await supabase.from('vrf_devices').delete().eq('id', device.id);
    setBusy(false);
    if (deleteErr) {
      setDeleteError(deleteErr.message);
      return;
    }
    navigate(VRF_MONITORING_BASE);
  }

  if (loading) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  if (!device) {
    return (
      <AppLayout session={session}>
        <p className="form-error">{error ?? 'Laitetta ei löydy'}</p>
        <Link to={VRF_MONITORING_BASE}>← Takaisin</Link>
      </AppLayout>
    );
  }

  const alarms = activeVrfAlarms(telemetry?.alarms ?? {});

  return (
    <AppLayout session={session}>
      <div className="temp-monitoring-page temp-monitoring-detail vrf-detail-page page-stack">
        <TempMonitoringPageHeader
          sticky
          crumbs={[
            { href: '/', label: 'Etusivu' },
            { href: REMOTE_MONITORING_HUB, label: 'Etäohjaus ja seuranta' },
            { href: VRF_MONITORING_BASE, label: 'VRF ohjaus ja seuranta' },
            { label: device.name },
          ]}
          title={device.name}
          subtitle={
            lastRefreshAt
              ? `${online ? 'Online' : 'Offline'} · ${vrfOperatingStateLabel(device.operating_state)} · päivitetty ${lastRefreshAt.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}`
              : undefined
          }
          actions={
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void load()}>
              Päivitä
            </button>
          }
        />

        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}
        {stale && online && (
          <p className="form-error">Mittaus ei ole tuore — ohjaus ja asetukset lukittu kunnes uusi data saapuu.</p>
        )}

        <section className={`vrf-hero panel ${alarms.length > 0 ? 'vrf-hero--alarm' : ''}`}>
          <div className="vrf-hero-main">
            <div className="vrf-hero-badges">
              <span className={`temp-status ${online ? 'online' : 'offline'}`}>
                <span className="temp-status-dot" aria-hidden="true" />
                {online ? 'Online' : 'Offline'}
              </span>
              {alarms.length > 0 && <span className="badge badge-alert">Hälytys</span>}
              {outdoorLock && <span className="badge badge-warning">Ulkolämpö lukko</span>}
              <span className="muted">{vrfOperatingStateLabel(telemetry?.status.operating_state ?? device.operating_state)}</span>
            </div>
            <p className="temp-live-hero-label">Käyntilupa</p>
            <button
              type="button"
              className={`vrf-permit-toggle ${heatEnabled ? 'on' : 'off'}`}
              disabled={busy || stale || !online || outdoorLock}
              aria-pressed={heatEnabled === true}
              onClick={() => void setHeatPermit(!heatEnabled)}
            >
              <span className="vrf-permit-toggle-knob" aria-hidden="true" />
              <span>{heatEnabled ? 'PÄÄLLÄ' : 'POIS'}</span>
            </button>
            {outdoorLock && (
              <p className="temp-live-hero-offline-note muted">Ulkolämpötilaraja estää lämmityksen.</p>
            )}
          </div>
          <div className="vrf-hero-side">
            <p className="muted">Ulkoilma</p>
            <p className="temp-live-hero-temp">{online && !stale ? formatTempC(device.outdoor_c) : '—'}</p>
            <p className="muted">Viimeisin yhteys: {formatRelativeTime(device.last_seen_at)}</p>
            {device.firmware_version && <p className="muted">Firmware {device.firmware_version}</p>}
          </div>
        </section>

        <div className="vrf-tab-row">
          {(
            [
              ['seuranta', 'Seuranta'],
              ['sulatus', 'Sulatukset'],
              ['asetukset', 'Asetukset'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={`vrf-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'seuranta' && (
          <>
            <section className="panel temp-devices-panel">
              <div className="temp-panel-head">
                <h2>Lämpötilat</h2>
              </div>
              <div className="vrf-temp-grid">
                {VRF_SENSOR_KEYS.map((key) => (
                  <div key={key} className="vrf-temp-card">
                    <span className="vrf-temp-label">{VRF_SENSOR_LABELS[key] ?? key}</span>
                    <strong className="vrf-temp-value">
                      {online && !stale ? formatTempC(telemetry?.temperatures[key]) : '—'}
                    </strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel temp-devices-panel">
              <div className="temp-panel-head">
                <h2>Tila ja hälytykset</h2>
              </div>
              <ul className="vrf-status-list">
                <li>
                  <span>Kompressori (arvio)</span>
                  <strong>{telemetry?.status.compressor_likely_running ? 'Käy' : 'Ei'}</strong>
                </li>
                <li>
                  <span>Tila</span>
                  <strong>{telemetry?.status.operating_text ?? vrfOperatingStateLabel(device.operating_state)}</strong>
                </li>
                <li>
                  <span>Verkko</span>
                  <strong>{typeof telemetry?.network.type === 'string' ? telemetry.network.type : '—'}</strong>
                </li>
              </ul>
              {alarms.length > 0 ? (
                <ul className="vrf-alarm-list">
                  {alarms.map((alarm) => (
                    <li key={alarm.key} className="vrf-alarm-item">
                      {alarm.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Ei aktiivisia hälytyksiä.</p>
              )}
            </section>

            <section className="panel temp-devices-panel">
              <div className="temp-panel-head">
                <h2>Trendi (24 h)</h2>
              </div>
              <VrfTrendChart readings={readings} />
            </section>
          </>
        )}

        {tab === 'sulatus' && (
          <section className="panel temp-devices-panel">
            <div className="temp-panel-head">
              <h2>Sulatus</h2>
            </div>
            <ul className="vrf-status-list">
              <li>
                <span>Sulatus nyt</span>
                <strong>{telemetry?.defrost.active === true ? 'Kyllä' : 'Ei'}</strong>
              </li>
              <li>
                <span>Tänään</span>
                <strong>{String(telemetry?.defrost.today_count ?? '—')}</strong>
              </li>
              <li>
                <span>Eilen</span>
                <strong>{String(telemetry?.defrost.yesterday_count ?? '—')}</strong>
              </li>
              <li>
                <span>Keskikesto (min)</span>
                <strong>{String(telemetry?.defrost.avg_duration_min ?? '—')}</strong>
              </li>
              <li>
                <span>Viimeisin kesto (min)</span>
                <strong>{String(telemetry?.defrost.last_duration_min ?? '—')}</strong>
              </li>
            </ul>
          </section>
        )}

        {tab === 'asetukset' && (
          <section className="panel temp-devices-panel">
            <div className="temp-panel-head">
              <h2>Laiteasetukset</h2>
            </div>
            <form className="form-grid vrf-settings-form" onSubmit={(e) => void saveSettings(e)}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={settingsForm.auto_stop_enabled}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, auto_stop_enabled: e.target.checked }))}
                />
                Ulkolämpö-automaattikatkaisu käytössä
              </label>
              <label>
                Katkaise alle (°C)
                <input
                  type="number"
                  step="0.1"
                  value={settingsForm.auto_stop_below_outdoor_c}
                  onChange={(e) =>
                    setSettingsForm((s) => ({ ...s, auto_stop_below_outdoor_c: Number(e.target.value) }))
                  }
                />
              </label>
              <label>
                Hysteresis (°C)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={settingsForm.auto_stop_outdoor_hysteresis_c}
                  onChange={(e) =>
                    setSettingsForm((s) => ({ ...s, auto_stop_outdoor_hysteresis_c: Number(e.target.value) }))
                  }
                />
              </label>
              <label>
                Ulkoilman tasoitus (min)
                <input
                  type="number"
                  min="0"
                  max="720"
                  value={settingsForm.auto_stop_outdoor_smooth_tau_min}
                  onChange={(e) =>
                    setSettingsForm((s) => ({ ...s, auto_stop_outdoor_smooth_tau_min: Number(e.target.value) }))
                  }
                />
              </label>
              <label>
                Kompressorihälytys viive (s)
                <input
                  type="number"
                  min="0"
                  value={settingsForm.compressor_alarm_enable_after_s}
                  onChange={(e) =>
                    setSettingsForm((s) => ({ ...s, compressor_alarm_enable_after_s: Number(e.target.value) }))
                  }
                />
              </label>
              <label>
                DI3 laukaisutaso (0/1)
                <input
                  type="number"
                  min="0"
                  max="1"
                  value={settingsForm.alarm_input_trigger_raw_level}
                  onChange={(e) =>
                    setSettingsForm((s) => ({ ...s, alarm_input_trigger_raw_level: Number(e.target.value) }))
                  }
                />
              </label>
              <fieldset className="vrf-settings-fieldset">
                <legend>Hälytyrajat (°C)</legend>
                <label>
                  Kuumakaasu yläraja
                  <input
                    type="number"
                    step="0.1"
                    value={settingsForm.alarm_limits.hot_gas_high_c}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        alarm_limits: { ...s.alarm_limits, hot_gas_high_c: Number(e.target.value) },
                      }))
                    }
                  />
                </label>
                <label>
                  Paluu alaraja
                  <input
                    type="number"
                    step="0.1"
                    value={settingsForm.alarm_limits.refrigerant_return_low_c}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        alarm_limits: { ...s.alarm_limits, refrigerant_return_low_c: Number(e.target.value) },
                      }))
                    }
                  />
                </label>
                <label>
                  Meno/paluu-ero yläraja
                  <input
                    type="number"
                    step="0.1"
                    value={settingsForm.alarm_limits.refrigerant_delta_high_c}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        alarm_limits: { ...s.alarm_limits, refrigerant_delta_high_c: Number(e.target.value) },
                      }))
                    }
                  />
                </label>
                <label>
                  Meno/paluu-ero alaraja
                  <input
                    type="number"
                    step="0.1"
                    value={settingsForm.alarm_limits.refrigerant_delta_low_c}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        alarm_limits: { ...s.alarm_limits, refrigerant_delta_low_c: Number(e.target.value) },
                      }))
                    }
                  />
                </label>
              </fieldset>
              {settingsMessage && (
                <p className={settingsMessage.includes('tallennettu') ? 'form-success' : 'form-error'}>{settingsMessage}</p>
              )}
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy || stale || !online}>
                  Tallenna asetukset
                </button>
              </div>
            </form>
            <p className="muted vrf-settings-note">
              Sähköpostihälytykset toimivat toistaiseksi Firebase-integraation kautta.
            </p>
          </section>
        )}

        <CollapsibleSection title="Laite" defaultOpen={false} variant="plain" className="panel temp-admin-panel">
          <ul className="vrf-status-list">
            <li>
              <span>Laite-ID</span>
              <strong>{device.external_device_id ?? '—'}</strong>
            </li>
            <li>
              <span>Yritys</span>
              <strong>{profile?.companies?.name ?? '—'}</strong>
            </li>
          </ul>
          <div className="form-actions">
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setDeleteTarget(true)}>
              Poista laite
            </button>
            <Link to={VRF_MONITORING_BASE} className="btn btn-secondary">
              ← Takaisin listaan
            </Link>
          </div>
        </CollapsibleSection>
      </div>

      <TempDeviceDeleteDialog
        open={deleteTarget}
        deviceName={device.name}
        busy={busy}
        error={deleteError}
        onClose={() => {
          if (busy) return;
          setDeleteTarget(false);
          setDeleteError(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </AppLayout>
  );
}
