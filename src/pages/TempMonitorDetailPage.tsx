import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import IconButton from '../components/IconButton';
import TempSessionSettingsDialog from '../components/tempMonitoring/TempSessionSettingsDialog';
import TempSessionSettingsFields from '../components/tempMonitoring/TempSessionSettingsFields';
import { SettingsIcon } from '../components/tempMonitoring/SettingsIcon';
import TempTrendChart from '../components/tempMonitoring/TempTrendChart';
import { useProfile } from '../hooks/useProfile';
import {
  TEMP_DEVICE_SELECT,
  TEMP_SESSION_SELECT,
  complianceLabel,
  emptySessionSettings,
  evaluateTempCompliance,
  formatRelativeTime,
  formatTempC,
  getEffectiveLimits,
  isTempDeviceOnline,
  sessionSettingsFromRow,
  sessionSettingsToPayload,
  type TempDevice,
  type TempMonitorSession,
  type TempReading,
  type TempSessionSettingsInput,
} from '../lib/tempMonitoring';
import { supabase } from '../lib/supabase';
import type { Customer } from '../types';

interface Props {
  session: Session;
}

export default function TempMonitorDetailPage({ session }: Props) {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { profile } = useProfile(session);
  const companyId = profile?.company_id ?? '';

  const [device, setDevice] = useState<TempDevice | null>(null);
  const [sessions, setSessions] = useState<TempMonitorSession[]>([]);
  const [readings, setReadings] = useState<TempReading[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [sessionForm, setSessionForm] = useState({
    customer_id: '',
    site_label: '',
    notes: '',
    settings: emptySessionSettings(),
  });
  const [settingsForm, setSettingsForm] = useState<TempSessionSettingsInput>(emptySessionSettings());

  const activeSession = useMemo(
    () => sessions.find((s) => !s.ended_at) ?? null,
    [sessions],
  );

  const activeLimits = useMemo(
    () => (activeSession ? getEffectiveLimits(activeSession) : null),
    [activeSession],
  );

  const chartReadings = useMemo(() => {
    if (activeSession) {
      return readings.filter((r) => r.session_id === activeSession.id);
    }
    return readings.slice(-500);
  }, [readings, activeSession]);

  const compliance = useMemo(
    () => evaluateTempCompliance(device?.last_temp_c, chartReadings, activeSession),
    [device?.last_temp_c, chartReadings, activeSession],
  );

  async function load() {
    if (!deviceId || !companyId) return;
    setLoading(true);
    setError(null);

    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const [{ data: deviceRow, error: deviceError }, { data: sessionRows }, { data: readingRows }, { data: customerRows }] =
      await Promise.all([
        supabase.from('temp_devices').select(TEMP_DEVICE_SELECT).eq('id', deviceId).maybeSingle(),
        supabase
          .from('temp_monitor_sessions')
          .select(TEMP_SESSION_SELECT)
          .eq('device_id', deviceId)
          .order('started_at', { ascending: false })
          .limit(20),
        supabase
          .from('temp_readings')
          .select('id, device_id, session_id, recorded_at, temp_c')
          .eq('device_id', deviceId)
          .gte('recorded_at', since)
          .order('recorded_at', { ascending: true })
          .limit(5000),
        supabase.from('customers').select('id, name').eq('owner_company_id', companyId).order('name'),
      ]);

    if (deviceError || !deviceRow) {
      setError(deviceError?.message ?? 'Laitetta ei löydy');
      setLoading(false);
      return;
    }

    setDevice(deviceRow as TempDevice);
    setSessions((sessionRows as TempMonitorSession[] | null) ?? []);
    setReadings((readingRows as TempReading[] | null) ?? []);
    setCustomers((customerRows as Customer[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (deviceId && companyId) void load();
  }, [deviceId, companyId]);

  useEffect(() => {
    if (!deviceId || !companyId) return;
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [deviceId, companyId]);

  useEffect(() => {
    if (activeSession) {
      setSettingsForm(sessionSettingsFromRow(activeSession));
    }
  }, [activeSession?.id]);

  function openSettings() {
    if (!activeSession) return;
    setSettingsForm(sessionSettingsFromRow(activeSession));
    setSettingsError(null);
    setSettingsOpen(true);
  }

  async function startSession(e: FormEvent) {
    e.preventDefault();
    if (!device || !companyId || activeSession) return;
    setBusy(true);
    setError(null);
    setMessage(null);

    const { error: insertError } = await supabase.from('temp_monitor_sessions').insert({
      company_id: companyId,
      device_id: device.id,
      customer_id: sessionForm.customer_id || null,
      site_label: sessionForm.site_label.trim() || null,
      notes: sessionForm.notes.trim() || null,
      created_by: session.user.id,
      ...sessionSettingsToPayload(sessionForm.settings),
    });

    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSessionForm({
      customer_id: '',
      site_label: '',
      notes: '',
      settings: emptySessionSettings(),
    });
    setMessage('Mittaus aloitettu.');
    await load();
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!activeSession) return;
    setBusy(true);
    setSettingsError(null);

    const { error: updateError } = await supabase
      .from('temp_monitor_sessions')
      .update(sessionSettingsToPayload(settingsForm))
      .eq('id', activeSession.id);

    setBusy(false);
    if (updateError) {
      setSettingsError(updateError.message);
      return;
    }
    setSettingsOpen(false);
    setMessage('Asetukset tallennettu.');
    await load();
  }

  async function endSession() {
    if (!activeSession) return;
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('temp_monitor_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', activeSession.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage('Mittaus päättynyt.');
    await load();
  }

  if (loading && !device) {
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
        <Link to="/lampotila">← Takaisin</Link>
      </AppLayout>
    );
  }

  const online = isTempDeviceOnline(device.last_seen_at);

  return (
    <AppLayout session={session}>
      <p className="subtitle">
        <Link to="/lampotila">Lämpötilaseuranta</Link> / {device.name}
      </p>

      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}

      <section className="panel temp-device-summary">
        <div className="temp-device-summary-head">
          <h1>{device.name}</h1>
          <div className="temp-device-summary-badges">
            <span className={`temp-status ${online ? 'online' : 'offline'}`}>
              {online ? 'Online' : 'Offline'}
            </span>
            {activeSession && (
              <span className={`temp-compliance temp-compliance--${compliance}`}>
                {complianceLabel(compliance)}
              </span>
            )}
          </div>
        </div>
        <dl className="temp-summary-grid">
          <div>
            <dt>Lämpötila</dt>
            <dd>{formatTempC(device.last_temp_c)}</dd>
          </div>
          <div>
            <dt>Viimeisin yhteys</dt>
            <dd>{formatRelativeTime(device.last_seen_at)}</dd>
          </div>
          <div>
            <dt>Seurattava</dt>
            <dd>{activeSession?.monitor_label ?? '—'}</dd>
          </div>
          <div>
            <dt>Tavoitealue</dt>
            <dd>
              {activeLimits
                ? `${activeLimits.targetMin}–${activeLimits.targetMax} °C`
                : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <div className="temp-panel-head">
          <h2>Trendi</h2>
          {activeSession && (
            <IconButton label="Mittauksen asetukset" onClick={openSettings}>
              <SettingsIcon />
            </IconButton>
          )}
        </div>
        <TempTrendChart readings={chartReadings} limits={activeLimits} />
      </section>

      <section className="panel">
        <div className="temp-panel-head">
          <h2>Mittausjakso</h2>
          {activeSession && (
            <IconButton label="Mittauksen asetukset" onClick={openSettings}>
              <SettingsIcon />
            </IconButton>
          )}
        </div>
        {activeSession ? (
          <div className="temp-active-session">
            <p>
              <strong>{activeSession.monitor_label ?? 'Aktiivinen mittaus'}</strong>
              {activeSession.customer?.name ? ` — ${activeSession.customer.name}` : ''}
              {activeSession.site_label ? ` (${activeSession.site_label})` : ''}
            </p>
            <p className="muted">Alkoi {new Date(activeSession.started_at).toLocaleString('fi-FI')}</p>
            {activeLimits && (
              <p className="muted">
                Sallittu {activeLimits.acceptableMin.toFixed(1)}–{activeLimits.acceptableMax.toFixed(1)} °C,
                poikkeama max {activeLimits.allowedDeviationMinutes} min
              </p>
            )}
            {activeSession.notes && <p>{activeSession.notes}</p>}
            <button type="button" className="btn secondary" disabled={busy} onClick={() => void endSession()}>
              Lopeta mittaus
            </button>
          </div>
        ) : (
          <form className="form-grid" onSubmit={(e) => void startSession(e)}>
            <label>
              Asiakas (valinnainen)
              <select
                value={sessionForm.customer_id}
                onChange={(e) => setSessionForm((f) => ({ ...f, customer_id: e.target.value }))}
              >
                <option value="">— Ei valittu —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kohde / paikka
              <input
                value={sessionForm.site_label}
                onChange={(e) => setSessionForm((f) => ({ ...f, site_label: e.target.value }))}
                placeholder="Esim. Kylmähuone A"
              />
            </label>
            <TempSessionSettingsFields
              value={sessionForm.settings}
              onChange={(settings) => setSessionForm((f) => ({ ...f, settings }))}
              idPrefix="temp-start"
            />
            <label>
              Muistiinpanot
              <textarea
                value={sessionForm.notes}
                onChange={(e) => setSessionForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={busy}>
                Aloita mittaus
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="panel">
        <h2>Aiemmat jaksot</h2>
        {sessions.filter((s) => s.ended_at).length === 0 ? (
          <p className="muted">Ei päättyneitä mittausjaksoja.</p>
        ) : (
          <ul className="temp-session-list">
            {sessions
              .filter((s) => s.ended_at)
              .map((s) => (
                <li key={s.id}>
                  <strong>{s.monitor_label ?? s.customer?.name ?? 'Ilman otsikkoa'}</strong>
                  {s.customer?.name && s.monitor_label ? ` — ${s.customer.name}` : ''}
                  {s.site_label ? ` (${s.site_label})` : ''}
                  <div className="muted">
                    {new Date(s.started_at).toLocaleString('fi-FI')}
                    {' – '}
                    {s.ended_at ? new Date(s.ended_at).toLocaleString('fi-FI') : '—'}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>

      <TempSessionSettingsDialog
        open={settingsOpen}
        busy={busy}
        error={settingsError}
        value={settingsForm}
        onChange={setSettingsForm}
        onClose={() => setSettingsOpen(false)}
        onSubmit={(e) => void saveSettings(e)}
      />
    </AppLayout>
  );
}
