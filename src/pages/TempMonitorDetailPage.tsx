import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import CollapsibleSection from '../components/CollapsibleSection';
import IconButton from '../components/IconButton';
import TempMonitoringPageHeader from '../components/tempMonitoring/TempMonitoringPageHeader';
import TempMonitorReportDialog, {
  buildReportPayloadFromForm,
  emptyReportForm,
  type TempReportFormState,
} from '../components/tempMonitoring/TempMonitorReportDialog';
import TempApSetupGuide from '../components/tempMonitoring/TempApSetupGuide';
import TempDeviceDeleteDialog from '../components/tempMonitoring/TempDeviceDeleteDialog';
import TempReportDeleteDialog from '../components/tempMonitoring/TempReportDeleteDialog';
import TempSessionSettingsDialog from '../components/tempMonitoring/TempSessionSettingsDialog';
import TempSessionSettingsFields from '../components/tempMonitoring/TempSessionSettingsFields';
import { SettingsIcon } from '../components/tempMonitoring/SettingsIcon';
import TempTrendChart from '../components/tempMonitoring/TempTrendChart';
import TempZoneFloorPlan, { TempZoneLiveSensors } from '../components/tempMonitoring/TempZoneFloorPlan';
import TempZoneSettingsDialog from '../components/tempMonitoring/TempZoneSettingsDialog';
import TempZoneTrendDialog from '../components/tempMonitoring/TempZoneTrendDialog';
import { useProfile } from '../hooks/useProfile';
import { loadAccessibleReportCustomers, loadReportPartnerships } from '../lib/reportCustomerRegistry';
import {
  appendLiveTrendSample,
  buildHistoryPoints,
  parseZoneConfig,
  serializeZoneConfig,
  type ZoneConfig,
  type ZoneKey,
} from '../lib/tempZoneMonitoring';
import {
  TEMP_DEVICE_SELECT,
  TEMP_READING_SELECT,
  TEMP_REPORT_SELECT,
  TEMP_SESSION_SELECT,
  isEsp32ZoneDevice,
  isSharedTempDemo,
  complianceLabel,
  emptySessionSettings,
  evaluateTempCompliance,
  formatRelativeTime,
  formatTempC,
  getEffectiveLimits,
  isTempDeviceOnline,
  sessionSettingsFromRow,
  sessionSettingsToPayload,
  customerOptionLabel,
  type TempDevice,
  type TempMonitorReport,
  type TempMonitorSession,
  type TempReading,
  type TempSessionSettingsInput,
} from '../lib/tempMonitoring';
import {
  REMOTE_MONITORING_HUB,
  TEMP_MONITORING_BASE,
  tempMonitoringReportPrintPath,
} from '../lib/remoteMonitoringRoutes';
import { supabase } from '../lib/supabase';
import type { Customer } from '../types';

interface Props {
  session: Session;
}

export default function TempMonitorDetailPage({ session }: Props) {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportForm, setReportForm] = useState<TempReportFormState | null>(null);
  const [savedReports, setSavedReports] = useState<TempMonitorReport[]>([]);
  const [deleteReportTarget, setDeleteReportTarget] = useState<TempMonitorReport | null>(null);
  const [deleteReportError, setDeleteReportError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [liveTick, setLiveTick] = useState(0);
  const lastReadingAtRef = useRef<string | null>(null);
  const [liveTrendSamples, setLiveTrendSamples] = useState<TempReading[]>([]);

  const [sessionForm, setSessionForm] = useState({
    customer_id: '',
    site_label: '',
    notes: '',
    settings: emptySessionSettings(),
  });
  const [settingsForm, setSettingsForm] = useState<TempSessionSettingsInput>(emptySessionSettings());
  const [zoneSettingsOpen, setZoneSettingsOpen] = useState(false);
  const [zoneSettingsError, setZoneSettingsError] = useState<string | null>(null);
  const [zoneConfigForm, setZoneConfigForm] = useState<ZoneConfig | null>(null);
  const [trendZoneKey, setTrendZoneKey] = useState<ZoneKey | null>(null);

  const activeSession = useMemo(
    () => sessions.find((s) => !s.ended_at) ?? null,
    [sessions],
  );

  const activeLimits = useMemo(
    () => (activeSession ? getEffectiveLimits(activeSession) : null),
    [activeSession],
  );

  const chartReadings = useMemo(() => {
    let rows = activeSession
      ? readings.filter((r) => r.session_id === activeSession.id)
      : readings.slice(-500);

    if (device?.last_temp_c != null && device.last_seen_at) {
      const liveTs = new Date(device.last_seen_at).getTime();
      const lastRow = rows[rows.length - 1];
      const lastTs = lastRow ? new Date(lastRow.recorded_at).getTime() : 0;
      if (liveTs >= lastTs) {
        rows = [
          ...rows.filter((r) => r.id >= 0),
          {
            id: -1,
            device_id: device.id,
            session_id: activeSession?.id ?? null,
            recorded_at: device.last_seen_at,
            temp_c: device.last_temp_c,
          },
        ];
      }
    }

    return rows;
  }, [readings, activeSession, device?.id, device?.last_seen_at, device?.last_temp_c]);

  const compliance = useMemo(
    () => evaluateTempCompliance(device?.last_temp_c, chartReadings, activeSession),
    [device?.last_temp_c, chartReadings, activeSession, liveTick],
  );

  const historyPoints = useMemo(() => buildHistoryPoints(readings), [readings]);

  useEffect(() => {
    if (!device?.id || !device.last_seen_at) return;
    setLiveTrendSamples((prev) =>
      appendLiveTrendSample(
        prev,
        {
          id: device.id,
          last_seen_at: device.last_seen_at,
          last_temp_c: device.last_temp_c,
          last_temp_c2: device.last_temp_c2,
        },
        activeSession?.id ?? null,
      ),
    );
  }, [
    device?.id,
    device?.last_seen_at,
    device?.last_temp_c,
    device?.last_temp_c2,
    activeSession?.id,
  ]);

  const mergeReadings = useCallback((prev: TempReading[], incoming: TempReading[]) => {
    const map = new Map(prev.map((row) => [row.id, row]));
    for (const row of incoming) {
      map.set(row.id, row);
    }
    return [...map.values()].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );
  }, []);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!deviceId || !companyId) return;
      const silent = options?.silent ?? false;
      if (!silent) setLoading(true);
      if (!silent) setError(null);

      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

      if (silent) {
        const cursor =
          lastReadingAtRef.current ??
          new Date(Date.now() - 2 * 3600 * 1000).toISOString();

        const [{ data: deviceRow, error: deviceError }, { data: readingRows, error: readingError }] =
          await Promise.all([
            supabase.from('temp_devices').select(TEMP_DEVICE_SELECT).eq('id', deviceId).maybeSingle(),
            supabase
              .from('temp_readings')
              .select(TEMP_READING_SELECT)
              .eq('device_id', deviceId)
              .gt('recorded_at', cursor)
              .order('recorded_at', { ascending: true })
              .limit(500),
          ]);

        if (deviceError) {
          setError(deviceError.message);
          return;
        }
        if (deviceRow) setDevice(deviceRow as TempDevice);
        if (readingError) {
          setError(readingError.message);
          return;
        }
        if (readingRows?.length) {
          setReadings((prev) => mergeReadings(prev, readingRows as TempReading[]));
          lastReadingAtRef.current = (readingRows as TempReading[])[readingRows.length - 1].recorded_at;
        } else if (deviceRow) {
          lastReadingAtRef.current =
            (deviceRow as TempDevice).last_seen_at ?? lastReadingAtRef.current;
        }
        setLastRefreshAt(new Date());
        return;
      }

      const partnerRows = await loadReportPartnerships(supabase, companyId, 'customers', 'read').catch(
        () => [],
      );

      const [
        { data: deviceRow, error: deviceError },
        { data: sessionRows },
        { data: readingRows },
        { data: reportRows },
        customerRows,
      ] = await Promise.all([
        supabase.from('temp_devices').select(TEMP_DEVICE_SELECT).eq('id', deviceId).maybeSingle(),
        supabase
          .from('temp_monitor_sessions')
          .select(TEMP_SESSION_SELECT)
          .eq('device_id', deviceId)
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1),
        supabase
          .from('temp_readings')
          .select(TEMP_READING_SELECT)
          .eq('device_id', deviceId)
          .gte('recorded_at', since)
          .order('recorded_at', { ascending: true })
          .limit(10000),
        supabase
          .from('temp_monitor_reports')
          .select(TEMP_REPORT_SELECT)
          .eq('device_id', deviceId)
          .order('created_at', { ascending: false })
          .limit(20),
        loadAccessibleReportCustomers(supabase, companyId, partnerRows).catch(() => [] as Customer[]),
      ]);

      if (deviceError || !deviceRow) {
        setError(deviceError?.message ?? 'Laitetta ei löydy');
        if (!silent) setLoading(false);
        return;
      }

      const nextReadings = (readingRows as TempReading[] | null) ?? [];
      setDevice(deviceRow as TempDevice);
      setSessions((sessionRows as TempMonitorSession[] | null) ?? []);
      setReadings(nextReadings);
      setSavedReports((reportRows as TempMonitorReport[] | null) ?? []);
      setCustomers(customerRows);
      lastReadingAtRef.current = nextReadings[nextReadings.length - 1]?.recorded_at ?? null;
      setLastRefreshAt(new Date());
      if (!silent) setLoading(false);
    },
    [companyId, deviceId, mergeReadings],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (deviceId && companyId) void loadRef.current();
  }, [deviceId, companyId]);

  const pollMs = trendZoneKey != null ? 5_000 : activeSession ? 10_000 : 20_000;

  useEffect(() => {
    if (!deviceId || !companyId) return;
    const timer = window.setInterval(() => void loadRef.current({ silent: true }), pollMs);
    return () => window.clearInterval(timer);
  }, [deviceId, companyId, pollMs, trendZoneKey]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') void loadRef.current({ silent: true });
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (!activeSession) return;
    const timer = window.setInterval(() => setLiveTick((n) => n + 1), 15_000);
    return () => window.clearInterval(timer);
  }, [activeSession?.id]);

  useEffect(() => {
    if (activeSession) {
      setSettingsForm(sessionSettingsFromRow(activeSession));
    }
  }, [activeSession?.id]);

  useEffect(() => {
    if (!device?.zone_config) return;
    setZoneConfigForm(parseZoneConfig(device.zone_config));
  }, [device?.id, device?.zone_config]);

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
    setMessage('Seuranta aloitettu.');
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
    setMessage('Seuranta päättynyt. Mittausdataa ei tallennettu raportiksi.');
    await load();
  }

  async function deleteDevice() {
    if (!device || isSharedTempDemo(device)) return;
    setBusy(true);
    setDeleteError(null);

    const { error: deleteErr } = await supabase.from('temp_devices').delete().eq('id', device.id);

    setBusy(false);
    if (deleteErr) {
      setDeleteError(deleteErr.message);
      return;
    }

    navigate(TEMP_MONITORING_BASE);
  }

  async function deleteReport() {
    if (!deleteReportTarget) return;
    setBusy(true);
    setDeleteReportError(null);

    const { error: deleteErr } = await supabase
      .from('temp_monitor_reports')
      .delete()
      .eq('id', deleteReportTarget.id);

    setBusy(false);
    if (deleteErr) {
      setDeleteReportError(deleteErr.message);
      return;
    }

    const title = deleteReportTarget.title;
    setDeleteReportTarget(null);
    setMessage(`Raportti "${title}" poistettu.`);
    await load();
  }

  function openReportDialog() {
    if (!device) return;
    setReportForm(emptyReportForm(activeSession, readings, device.name));
    setReportError(null);
    setReportOpen(true);
  }

  async function saveZoneSettings(e: FormEvent) {
    e.preventDefault();
    if (!device || !zoneConfigForm) return;
    setBusy(true);
    setZoneSettingsError(null);
    const { error: updateError } = await supabase
      .from('temp_devices')
      .update({ zone_config: serializeZoneConfig(zoneConfigForm) })
      .eq('id', device.id);
    setBusy(false);
    if (updateError) {
      setZoneSettingsError(updateError.message);
      return;
    }
    setDevice({ ...device, zone_config: serializeZoneConfig(zoneConfigForm) });
    setZoneSettingsOpen(false);
    setMessage('Huoltoasetukset tallennettu.');
  }

  async function saveReport(e: FormEvent) {
    e.preventDefault();
    if (!device || !companyId || !reportForm) return;
    setBusy(true);
    setReportError(null);

    try {
      const payload = buildReportPayloadFromForm({
        form: reportForm,
        device,
        activeSession,
        customers,
        readings,
        companyId,
        userId: session.user.id,
      });
      const { data, error: insertError } = await supabase
        .from('temp_monitor_reports')
        .insert(payload)
        .select('id')
        .single();

      if (insertError) throw new Error(insertError.message);

      if (activeSession) {
        await supabase
          .from('temp_monitor_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', activeSession.id);
      }

      setReportOpen(false);
      setMessage('Raportti tallennettu.');
      await load();
      if (data?.id) {
        navigate(tempMonitoringReportPrintPath(data.id));
      }
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Raportin tallennus epäonnistui.');
    } finally {
      setBusy(false);
    }
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
        <Link to={TEMP_MONITORING_BASE}>← Takaisin</Link>
      </AppLayout>
    );
  }

  const online = isTempDeviceOnline(device.last_seen_at);
  const zoneView = isEsp32ZoneDevice(device);
  const sharedDemo = isSharedTempDemo(device);
  const ownsDevice = device.company_id === companyId;
  const canEditZoneSettings =
    zoneView && (ownsDevice || profile?.is_global_admin === true);
  const activeZoneConfig = zoneConfigForm ?? parseZoneConfig(device.zone_config);
  const trendZone =
    trendZoneKey && activeZoneConfig ? activeZoneConfig[trendZoneKey] : null;

  const heroClass =
    activeSession && compliance !== 'unknown'
      ? `temp-live-hero--${compliance}`
      : online
        ? 'temp-live-hero--online'
        : 'temp-live-hero--offline';

  return (
    <AppLayout session={session}>
      <div className="temp-monitoring-page temp-monitoring-detail page-stack">
        <TempMonitoringPageHeader
          sticky
          crumbs={[
            { href: '/', label: 'Etusivu' },
            { href: REMOTE_MONITORING_HUB, label: 'Etäohjaus ja seuranta' },
            { href: TEMP_MONITORING_BASE, label: 'Lämpötilaseuranta' },
            { label: device.name },
          ]}
          title={device.name}
          subtitle={
            lastRefreshAt
              ? `Päivitetty ${lastRefreshAt.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}`
              : undefined
          }
          actions={
            <button type="button" className="btn btn-secondary" disabled={loading || busy} onClick={() => void load()}>
              Päivitä
            </button>
          }
        />

        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}

        {sharedDemo && (
          <section className="panel temp-demo-banner" role="note">
            <strong>Oikea laite — demo kokeilujakson käyttäjille</strong>
            <p className="muted">
              {device.notes ??
                'Kyseessä on oikea ESP32-mittaus ylläpitäjän kylmiöstä ja pakastimesta. Data päivittyy reaaliajassa samalla tavalla kuin omissa laitteissa.'}
            </p>
          </section>
        )}

        {zoneView && activeZoneConfig && (
          <TempZoneFloorPlan
            zoneConfig={activeZoneConfig}
            lastTempC={device.last_temp_c}
            lastTempC2={device.last_temp_c2}
            lastSeenAt={device.last_seen_at}
            historyPoints={historyPoints}
            canEditSettings={canEditZoneSettings}
            onOpenSettings={() => {
              setZoneConfigForm(parseZoneConfig(device.zone_config) ?? activeZoneConfig);
              setZoneSettingsError(null);
              setZoneSettingsOpen(true);
            }}
            onTempClick={(zoneKey) => setTrendZoneKey(zoneKey)}
          />
        )}

        {zoneView && !sharedDemo && (activeSession || readings.length >= 2) && (
          <div className="temp-zone-report-actions">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={openReportDialog}>
              Tallenna raportti
            </button>
          </div>
        )}

        <section className={`temp-live-hero panel ${heroClass}`}>
          <div className="temp-live-hero-main">
            <p className="temp-live-hero-label">{activeSession?.monitor_label ?? 'Lämpötila nyt'}</p>
            <p className="temp-live-hero-temp">
              {online ? formatTempC(device.last_temp_c) : '—'}
            </p>
            {!online && (
              <p className="temp-live-hero-offline-note muted">Laite offline — lämpötilaa ei päivitetä</p>
            )}
          </div>
          <div className="temp-live-hero-badges">
            <span className={`temp-status ${online ? 'online' : 'offline'}`}>
              <span className="temp-status-dot" aria-hidden="true" />
              {online ? 'Online' : 'Offline'}
            </span>
            {activeSession && (
              <span className={`temp-compliance temp-compliance--${compliance}`}>
                {complianceLabel(compliance)}
              </span>
            )}
          </div>
          <dl className="temp-live-hero-grid">
            <div>
              <dt>Viimeisin yhteys</dt>
              <dd>{formatRelativeTime(device.last_seen_at)}</dd>
            </div>
            <div>
              <dt>Missä</dt>
              <dd>{activeSession?.site_label ?? '—'}</dd>
            </div>
            <div>
              <dt>Asiakas</dt>
              <dd>{activeSession?.customer?.name ?? '—'}</dd>
            </div>
            <div>
              <dt>Tavoitealue</dt>
              <dd>
                {activeLimits ? `${activeLimits.targetMin}–${activeLimits.targetMax} °C` : '—'}
              </dd>
            </div>
          </dl>
          {zoneView && (
            <TempZoneLiveSensors
              zoneConfig={activeZoneConfig}
              lastTempC={device.last_temp_c}
              lastTempC2={device.last_temp_c2}
            />
          )}
        </section>

        {!zoneView && (
          <section className="panel temp-trend-panel">
            <div className="temp-panel-head">
              <div>
                <h2>Trendi</h2>
                {activeSession && lastRefreshAt && (
                  <p className="temp-trend-live muted">
                    Live · päivitetty{' '}
                    {lastRefreshAt.toLocaleTimeString('fi-FI', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </p>
                )}
              </div>
              <div className="temp-panel-head-actions">
                {!sharedDemo && (activeSession || readings.length >= 2) && (
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={openReportDialog}>
                    Tallenna raportti
                  </button>
                )}
                {activeSession && (
                  <IconButton label="Mittauksen asetukset" onClick={openSettings}>
                    <SettingsIcon />
                  </IconButton>
                )}
              </div>
            </div>
            <TempTrendChart readings={chartReadings} limits={activeLimits} height={240} />
          </section>
        )}

      {!sharedDemo && (
      <section className="panel">
        <div className="temp-panel-head">
          <h2>Live-seuranta</h2>
          {activeSession && (
            <IconButton label="Mittauksen asetukset" onClick={openSettings}>
              <SettingsIcon />
            </IconButton>
          )}
        </div>
        {activeSession ? (
          <div className="temp-active-session">
            <p>
              <strong>{activeSession.monitor_label ?? 'Aktiivinen seuranta'}</strong>
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
            <p className="muted temp-live-session-note">
              Vain tallennetut raportit jäävät muistiin. Lopeta seuranta ilman raporttia, jos et tarvitse tulostetta.
            </p>
            <button type="button" className="btn btn-secondary btn-block" disabled={busy} onClick={() => void endSession()}>
              Lopeta seuranta
            </button>
          </div>
        ) : (
          <form className="form-grid" onSubmit={(e) => void startSession(e)}>
            <p className="muted temp-live-session-note">
              Aloita seuranta reaaliaikaista mittausta varten. Pysyvä tallennus tapahtuu raportilla.
            </p>
            <label>
              Asiakas (valinnainen)
              <select
                value={sessionForm.customer_id}
                onChange={(e) => setSessionForm((f) => ({ ...f, customer_id: e.target.value }))}
              >
                <option value="">— Ei valittu —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {customerOptionLabel(c, companyId)}
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
                Aloita seuranta
              </button>
            </div>
          </form>
        )}
      </section>
      )}

      {sharedDemo && (
        <section className="panel">
          <p className="muted">
            Demo-laitteella ei aloiteta yrityskohtaista seurantaa. Voit seurata lämpötiloja pohjapiirroksessa ja trendissä.
            Lisää oma ESP32 tai JC3248 -laite listasta, kun haluat tallentaa raportteja.
          </p>
        </section>
      )}

      <CollapsibleSection
        title={`Tallennetut raportit (${savedReports.length})`}
        defaultOpen={!sharedDemo && savedReports.length > 0}
        variant="plain"
        className="panel temp-admin-panel"
      >
        {savedReports.length === 0 ? (
          <p className="muted">Ei tallennettuja raportteja. Tallenna raportti trendin yläpuolelta — vain raportit jäävät muistiin.</p>
        ) : (
          <ul className="temp-session-list">
            {savedReports.map((report) => (
              <li key={report.id} className="temp-report-list-item">
                <div>
                  <strong>{report.title}</strong>
                  {report.customer?.name ? ` — ${report.customer.name}` : ''}
                  <div className="muted">
                    {new Date(report.period_start).toLocaleString('fi-FI')}
                    {' – '}
                    {new Date(report.period_end).toLocaleString('fi-FI')}
                  </div>
                </div>
                <div className="temp-report-list-actions">
                  <Link to={tempMonitoringReportPrintPath(report.id)} className="btn btn-secondary">
                    Tuloste
                  </Link>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy}
                    onClick={() => {
                      setDeleteReportError(null);
                      setDeleteReportTarget(report);
                    }}
                  >
                    Poista
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      {ownsDevice && (
      <CollapsibleSection title="Laitehallinta" defaultOpen={!online && !sharedDemo} variant="plain" className="panel temp-admin-panel">
        {!online && !sharedDemo && (
          <>
            <h3 className="temp-admin-subtitle">WiFi-asennus (AP)</h3>
            <TempApSetupGuide deviceKey={device.device_key} compact />
          </>
        )}
        {!sharedDemo && (
        <button
          type="button"
          className="btn btn-danger btn-block"
          disabled={busy}
          onClick={() => {
            setDeleteError(null);
            setDeleteOpen(true);
          }}
        >
          Poista laite
        </button>
        )}
      </CollapsibleSection>
      )}
      </div>

      <TempSessionSettingsDialog
        open={settingsOpen}
        busy={busy}
        error={settingsError}
        value={settingsForm}
        onChange={setSettingsForm}
        onClose={() => setSettingsOpen(false)}
        onSubmit={(e) => void saveSettings(e)}
      />

      <TempDeviceDeleteDialog
        open={deleteOpen}
        deviceName={device.name}
        busy={busy}
        error={deleteError}
        onClose={() => {
          if (busy) return;
          setDeleteOpen(false);
          setDeleteError(null);
        }}
        onConfirm={() => void deleteDevice()}
      />

      <TempReportDeleteDialog
        open={deleteReportTarget != null}
        reportTitle={deleteReportTarget?.title ?? ''}
        busy={busy}
        error={deleteReportError}
        onClose={() => {
          if (busy) return;
          setDeleteReportTarget(null);
          setDeleteReportError(null);
        }}
        onConfirm={() => void deleteReport()}
      />

      {zoneConfigForm && (
        <TempZoneSettingsDialog
          open={zoneSettingsOpen}
          busy={busy}
          error={zoneSettingsError}
          value={zoneConfigForm}
          onChange={setZoneConfigForm}
          onClose={() => setZoneSettingsOpen(false)}
          onSubmit={(e) => void saveZoneSettings(e)}
        />
      )}

      <TempZoneTrendDialog
        open={trendZoneKey != null}
        deviceId={device?.id ?? null}
        device={
          device
            ? {
                id: device.id,
                last_seen_at: device.last_seen_at,
                last_temp_c: device.last_temp_c,
                last_temp_c2: device.last_temp_c2,
              }
            : null
        }
        activeSessionId={activeSession?.id ?? null}
        liveSamples={liveTrendSamples}
        zoneKey={trendZoneKey}
        zone={trendZone}
        readings={readings}
        onClose={() => setTrendZoneKey(null)}
      />

      {reportForm && (
        <TempMonitorReportDialog
          open={reportOpen}
          busy={busy}
          error={reportError}
          activeSession={activeSession}
          customers={customers}
          readings={readings}
          companyId={companyId}
          value={reportForm}
          onChange={setReportForm}
          onClose={() => setReportOpen(false)}
          onSubmit={(e) => void saveReport(e)}
        />
      )}
    </AppLayout>
  );
}
