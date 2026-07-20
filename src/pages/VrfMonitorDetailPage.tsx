import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Link, useNavigate, useParams } from 'react-router-dom';

import type { Session } from '@supabase/supabase-js';

import AppLayout from '../components/AppLayout';

import CollapsibleSection from '../components/CollapsibleSection';

import IconButton from '../components/IconButton';

import { IconHelp, IconPrint } from '../components/icons';

import TempDeviceDeleteDialog from '../components/tempMonitoring/TempDeviceDeleteDialog';

import TempMonitoringPageHeader from '../components/tempMonitoring/TempMonitoringPageHeader';

import VrfMonitorShareDialog from '../components/vrfMonitoring/VrfMonitorShareDialog';
import VrfReportDialog from '../components/vrfMonitoring/VrfReportDialog';

import VrfStatusPanel from '../components/vrfMonitoring/VrfStatusPanel';
import VrfSchematicBoard from '../components/vrfMonitoring/VrfSchematicBoard';
import VrfToggleSwitch from '../components/vrfMonitoring/VrfToggleSwitch';

import VrfWiringGuideDialog from '../components/vrfMonitoring/VrfWiringGuideDialog';

import VrfTrendDialog from '../components/vrfMonitoring/VrfTrendDialog';

import { useProfile } from '../hooks/useProfile';

import { monitorReaderVrfPath } from '../lib/monitorReaderShares';
import { REMOTE_MONITORING_HUB, VRF_MONITORING_BASE } from '../lib/remoteMonitoringRoutes';

import {

  VRF_DEVICE_SELECT,

  activeVrfAlarmsForDisplay,

  buildAlarmShutdownResetSettings,
  buildOtaRequestSettings,
  buildVrfSettingsForSave,
  defaultVrfSettings,
  vrfDiWiringHint,
  vrfDiOperationalMismatchHint,
  vrfDiStateContradictions,
  vrfPresentDigitalInputs,
  vrfDiInvertedFromTrigger,
  vrfDiLogicDescription,
  vrfDiTriggerDefault,
  vrfDiTriggerFromInverted,
  VRF_CNH_STATUS_LABEL,
  formatVrfDiRaw,
  vrfMeasuredUnitReady,
  inferDefrostLikely,
  sortReadingsByTime,

  isVrfDeviceOnline,

  isVrfTelemetryStale,

  parseVrfSettings,

  parseVrfTelemetry,

  vrfAlarmDelayResetState,
  vrfAlarmBlocksPermitEnable,
  vrfAlarmShutdownBlocksControl,
  vrfExternalAlarmActive,
  vrfCompressorRunning,
  vrfResolveDeviceActivity,

  type VrfBinaryLaneKey,

  type VrfDevice,

  type VrfDeviceSettings,

  type VrfReading,

  type VrfSchematicClickKey,

} from '../lib/vrfMonitoring';

import { supabase } from '../lib/supabase';
import { fetchVrfTrendReadings } from '../lib/vrfTrendReadings';



interface Props {

  session: Session;

}



type TabId = 'seuranta' | 'sulatus' | 'asetukset';



const HISTORY_HOURS = 24;



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
  const settingsDirtyRef = useRef(false);
  const [settingsDirty, setSettingsDirty] = useState(false);

  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const [trendOpen, setTrendOpen] = useState(false);

  const [trendFocusHotspot, setTrendFocusHotspot] = useState<VrfSchematicClickKey | null>(null);

  const [trendFocusBinary, setTrendFocusBinary] = useState<VrfBinaryLaneKey | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [wiringGuideOpen, setWiringGuideOpen] = useState(false);
  const [otaBusy, setOtaBusy] = useState(false);
  const [permitPending, setPermitPending] = useState<boolean | null>(null);



  const online = isVrfDeviceOnline(device?.last_seen_at);

  const telemetry = useMemo(() => parseVrfTelemetry(device?.latest_payload), [device?.latest_payload]);

  const stale = isVrfTelemetryStale(device?.latest_payload);

  const heatEnabled = device?.control_requested_enabled ?? telemetry?.control.enabled ?? device?.heat_enabled;
  const displayHeatEnabled = permitPending ?? heatEnabled;
  const permitChangeBusy = permitPending !== null;

  const outdoorLock = telemetry?.status.outdoor_safety_lock_active ?? false;
  const alarmShutdownLock = vrfAlarmShutdownBlocksControl(telemetry);

  const compressorRunning = vrfCompressorRunning(telemetry, settingsForm);

  const permitDisabled = stale || !online || outdoorLock || alarmShutdownLock;

  const diStale = stale || !online;

  const defrostLikelyNow = useMemo(() => {

    if (telemetry?.defrost?.active === true) return true;

    const sorted = sortReadingsByTime(readings);

    if (sorted.length === 0) return false;

    return inferDefrostLikely(sorted, sorted.length - 1);

  }, [readings, telemetry?.defrost?.active]);

  const externalAlarm = vrfExternalAlarmActive(telemetry, settingsForm);

  const activitySummary = useMemo(
    () =>
      vrfResolveDeviceActivity({
        telemetry,
        online,
        stale,
        defrostLikely: defrostLikelyNow,
        compressorRunning,
        externalAlarm,
        activeAlarmLabels: activeVrfAlarmsForDisplay(telemetry?.alarms ?? {}, telemetry, settingsForm).map(
          (a) => a.label,
        ),
      }),
    [telemetry, online, stale, defrostLikelyNow, compressorRunning, externalAlarm],
  );

  const diWiringHint = useMemo(
    () => vrfDiWiringHint(telemetry?.digital_inputs ?? null, settingsForm, telemetry),
    [telemetry, settingsForm],
  );

  const diContradictions = useMemo(
    () => vrfDiStateContradictions(telemetry, settingsForm),
    [telemetry, settingsForm],
  );

  const diMismatchHint = useMemo(
    () =>
      diContradictions.length > 0
        ? diContradictions.map((c) => c.message).join(' ')
        : vrfDiOperationalMismatchHint(telemetry, settingsForm),
    [diContradictions, telemetry, settingsForm],
  );

  const patchSettingsForm = useCallback(
    (patch: Partial<VrfDeviceSettings> | ((prev: VrfDeviceSettings) => VrfDeviceSettings)) => {
      settingsDirtyRef.current = true;
      setSettingsDirty(true);
      setSettingsForm((prev) => (typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }));
    },
    [],
  );

  const load = useCallback(async () => {

    if (!deviceId) return;

    setError(null);

    const since = new Date(Date.now() - HISTORY_HOURS * 3600_000).toISOString();

    const [deviceRes, readingsRows] = await Promise.all([
      supabase.from('vrf_devices').select(VRF_DEVICE_SELECT).eq('id', deviceId).maybeSingle(),
      fetchVrfTrendReadings({ deviceId, sinceIso: since, hours: HISTORY_HOURS }),
    ]);

    const nextDevice = (deviceRes.data as VrfDevice | null) ?? null;

    setDevice(nextDevice);

    setReadings(readingsRows);

    if (nextDevice && !settingsDirtyRef.current) {
      setSettingsForm(parseVrfSettings(nextDevice.settings));
    }

    setLastRefreshAt(new Date());

    setLoading(false);

    if (deviceRes.error) setError(deviceRes.error.message);

  }, [deviceId]);



  useEffect(() => {
    if (profile?.role === 'monitor_viewer' && deviceId) {
      navigate(monitorReaderVrfPath(deviceId), { replace: true });
    }
  }, [profile?.role, deviceId, navigate]);

  useEffect(() => {
    settingsDirtyRef.current = false;
    setSettingsDirty(false);
    if (deviceId) void load();
  }, [deviceId, load]);



  useEffect(() => {

    if (!deviceId) return;

    const timer = window.setInterval(() => void load(), 10_000);

    return () => window.clearInterval(timer);

  }, [deviceId, load]);



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



  function closeTrend() {

    setTrendOpen(false);

    setTrendFocusHotspot(null);

    setTrendFocusBinary(null);

  }



  async function setHeatPermit(next: boolean) {

    if (!device || stale || outdoorLock) return;

    const alarmLabels = activeVrfAlarmsForDisplay(telemetry?.alarms ?? {}, telemetry, settingsForm).map(
      (a) => a.label,
    );
    if (next && vrfAlarmBlocksPermitEnable(telemetry, settingsForm, alarmLabels)) {
      if (vrfAlarmShutdownBlocksControl(telemetry)) {
        setMessage('Käyntilupaa ei voi kytkeä päälle hälytysviiveen aikana — käytä Nollaa hälytysviive.');
      } else {
        setMessage('Käyntilupaa ei voi kytkeä päälle kun hälytys on aktiivinen.');
      }
      return;
    }

    setPermitPending(next);
    setMessage(null);

    try {
      const { error: updateError } = await supabase
        .from('vrf_devices')
        .update({
          control_requested_enabled: next,
          control_updated_at: new Date().toISOString(),
        })
        .eq('id', device.id);

      if (updateError) {
        setMessage(updateError.message);
        return;
      }

      setMessage(`Käyntilupa ${next ? 'päällä' : 'pois'} — laite päivittää tilan hetken kuluttua.`);
      await load();
    } finally {
      setPermitPending(null);
    }
  }



  async function resetAlarmDelay(force = false) {
    if (!device || stale || !online) return;
    const resetState = vrfAlarmDelayResetState(telemetry, externalAlarm);
    if (!force && !resetState.canReset) {
      setMessage(resetState.blockedReason ?? 'Hälytysviiven nollaus ei ole mahdollista.');
      return;
    }
    if (force && !resetState.canForceReset) {
      setMessage('Pakotettu nollaus ei ole mahdollista.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error: updateError } = await supabase
      .from('vrf_devices')
      .update({
        settings: buildAlarmShutdownResetSettings(device.settings, { force }),
        settings_updated_at: new Date().toISOString(),
      })
      .eq('id', device.id);
    setBusy(false);
    if (updateError) {
      setMessage(updateError.message);
      return;
    }
    setMessage(
      force
        ? 'Hälytysviive pakotettu nollattu — tarkista DI3-kytkentä jos hälytys palaa.'
        : 'Hälytysviive nollattu — laite päivittää tilan hetken kuluttua.',
    );
    await load();
  }

  async function requestOta() {
    if (!device) return;
    if (!online) {
      setSettingsMessage('Laite ei ole online — OTA vaatii verkkoyhteyden.');
      return;
    }
    setOtaBusy(true);
    setSettingsMessage(null);
    const { error: updateError } = await supabase
      .from('vrf_devices')
      .update({
        settings: buildOtaRequestSettings(device.settings),
        settings_updated_at: new Date().toISOString(),
      })
      .eq('id', device.id);
    setOtaBusy(false);
    if (updateError) {
      setSettingsMessage(updateError.message);
      return;
    }
    setSettingsMessage(
      'OTA-pyyntö lähetetty. Laite lataa firmwaren ~10–60 s sisällä ja käynnistyy uudelleen.',
    );
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

        settings: buildVrfSettingsForSave(settingsForm, device.settings),

        settings_updated_at: new Date().toISOString(),

      })

      .eq('id', device.id);

    setBusy(false);

    if (updateError) {

      setSettingsMessage(updateError.message);

      return;

    }

    settingsDirtyRef.current = false;
    setSettingsDirty(false);
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



  const alarms = activeVrfAlarmsForDisplay(telemetry?.alarms ?? {}, telemetry, settingsForm);



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

              ? `${online ? 'Online' : 'Offline'} · ${activitySummary.headline} · päivitetty ${lastRefreshAt.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}`

              : undefined

          }

          actions={
            <>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setShareOpen(true)}>
                Jaa lukuoikeus
              </button>
              <IconButton label="Tulosta raportti" tooltipSide="bottom" onClick={() => setReportOpen(true)}>
                <IconPrint />
              </IconButton>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void load()}>
                Päivitä
              </button>
            </>
          }

        />



        {error && <p className="form-error">{error}</p>}

        {message && <p className="form-success">{message}</p>}

        {stale && online && (

          <p className="form-error">Mittaus ei ole tuore — ohjaus ja asetukset lukittu kunnes uusi data saapuu.</p>

        )}



        <section className={`vrf-hero panel ${alarms.length > 0 ? 'vrf-hero--alarm' : ''}`}>
          <VrfStatusPanel
            telemetry={telemetry}
            online={online}
            stale={stale}
            defrostLikely={defrostLikelyNow}
            compressorRunning={compressorRunning}
            externalAlarm={externalAlarm}
            activeAlarmLabels={alarms.map((alarm) => alarm.label)}
            requestedEnabled={displayHeatEnabled}
            lastSeenAt={device.last_seen_at}
            firmwareVersion={device.firmware_version}
            permitDisabled={permitDisabled}
            permitChangeBusy={permitChangeBusy}
            onPermitChange={(next) => void setHeatPermit(next)}
            onResetAlarmDelay={(force) => void resetAlarmDelay(force)}
            alarmDelayResetBusy={busy}
            diWiringHint={diWiringHint}
            diMismatchHint={diMismatchHint}
            deviceSettings={settingsForm}
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

        {diContradictions.length > 0 && (
          <div className="panel vrf-di-contradiction-banner" role="alert">
            <p className="vrf-di-contradiction-title">
              <strong>DI-signaalien ristiriita</strong> — näytetään mitattu tila; korjaa kytkentä tai firmware.
            </p>
            <ul className="vrf-alarm-list">
              {diContradictions.map((item) => (
                <li key={item.key} className="vrf-alarm-item">
                  {item.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="vrf-tab-row">

          {(

            [

              ['seuranta', 'Seuranta'],

              ['sulatus', 'Öljypalautus / sulatus'],

              ['asetukset', 'Asetukset'],

            ] as const

          ).map(([id, label]) => (

            <button key={id} type="button" className={`vrf-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>

              {label}

            </button>

          ))}

        </div>



        {tab === 'seuranta' && (

          <section className="panel temp-devices-panel vrf-schematic-panel">

            <div className="temp-panel-head">

              <h2>Järjestelmäkaavio</h2>

              <p className="muted">Lämpötilat, tilat ja trendi — paina kaavion kohtaa.</p>

            </div>

            <VrfSchematicBoard

              temperatures={telemetry?.temperatures ?? {}}

              digitalInputs={vrfPresentDigitalInputs(telemetry, settingsForm)}

              compressorRunning={compressorRunning}

              stale={diStale}

              showTemps={online}

              onHotspotClick={openTrendFromHotspot}

              onDiClick={openTrendFromDi}

            />

          </section>

        )}



        {tab === 'sulatus' && (

          <section className="panel temp-devices-panel">

            <div className="temp-panel-head">

              <h2>Öljypalautus / sulatus</h2>

            </div>

            <p className="muted" style={{ marginTop: 0 }}>
              Lämmityksessä käynnistyksen öljypalautus ja sulatus näyttävät lähes samalta (kenno lämpenee).
              Arvio ei käynnisty heti käyntiluvan jälkeen eikä jos kenno ei ole kylmempi kuin ulkoilma.
            </p>

            <ul className="vrf-status-list">

              <li>

                <span>Käynnissä nyt</span>

                <strong>

                  {telemetry?.defrost.active === true

                    ? 'Kyllä (laite)'

                    : defrostLikelyNow

                      ? 'Todennäköinen (trendi)'

                      : 'Ei'}

                </strong>

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

              <IconButton
                label="Kytkentäohje (DI / RO1)"
                tooltipSide="bottom"
                onClick={() => setWiringGuideOpen(true)}
              >
                <IconHelp className="ui-icon" />
              </IconButton>

            </div>

            <form className="form-grid vrf-settings-form" onSubmit={(e) => void saveSettings(e)}>

              <div className="vrf-settings-toggle-row">

                <div>

                  <strong>Ulkolämpö-automaattikatkaisu</strong>

                  <p className="muted">Sammuttaa käyntiluvan, kun ulkolämpö putoaa rajan alle.</p>

                </div>

                <VrfToggleSwitch

                  checked={settingsForm.auto_stop_enabled}

                  labelOn="ON"

                  labelOff="OFF"

                  ariaLabel="Ulkolämpö-automaattikatkaisu"

                  onChange={(next) => patchSettingsForm((s) => ({ ...s, auto_stop_enabled: next }))}

                />

              </div>

              <label>

                Katkaise alle (°C)

                <input

                  type="number"

                  step="0.1"

                  value={settingsForm.auto_stop_below_outdoor_c}

                  onChange={(e) =>

                    patchSettingsForm((s) => ({ ...s, auto_stop_below_outdoor_c: Number(e.target.value) }))

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

                    patchSettingsForm((s) => ({ ...s, auto_stop_outdoor_hysteresis_c: Number(e.target.value) }))

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

                    patchSettingsForm((s) => ({ ...s, auto_stop_outdoor_smooth_tau_min: Number(e.target.value) }))

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

                    patchSettingsForm((s) => ({ ...s, compressor_alarm_enable_after_s: Number(e.target.value) }))

                  }

                />

              </label>

              <div className="vrf-settings-toggle-row vrf-settings-toggle-row--warn">
                <div>
                  <strong>DI3 hälytys estää käynnistyksen</strong>
                  <p className="muted">
                    Pois päältä: DI3 näkyy vain seurannassa — hälytys ei sammuta RO1:ttä eikä käynnistä
                    hälytysviivettä. Käytä testaukseen (esim. kompressorin DI2-tarkistus).
                  </p>
                </div>
                <VrfToggleSwitch
                  checked={settingsForm.di3_alarm_shutdown_enabled !== false}
                  labelOn="ON"
                  labelOff="OFF"
                  ariaLabel="DI3 hälytys estää käynnistyksen"
                  onChange={(next) =>
                    patchSettingsForm((s) => ({ ...s, di3_alarm_shutdown_enabled: next }))
                  }
                />
              </div>

              <fieldset className="vrf-settings-fieldset">
                <legend>Digitaalitulot (DI)</legend>
                <p className="muted vrf-settings-fieldset-lead">
                  MH-kytkentä: +12 V COM-kiskolla, signaali GND-releellä. di*_raw=1 kun virtapiiri suljettu.
                  DI2 PNP (suljettu=päällä). DI3 INV (auki=hälytys). Katso kytkentäohje (DI-ikoni).
                </p>
                {(
                  [
                    ['di2_trigger_raw_level', 'DI2 — Kompressori'] as const,
                    ['di3_trigger_raw_level', 'DI3 — Hälytys'] as const,
                  ] as const
                ).map(([key, label]) => {
                  const inverted = vrfDiInvertedFromTrigger(
                    settingsForm[key],
                    vrfDiTriggerDefault(key),
                  );
                  return (
                  <div key={key} className="vrf-settings-toggle-row">
                    <div>
                      <strong>{label}</strong>
                      <p className="muted">{vrfDiLogicDescription(key, inverted)}</p>
                    </div>
                    <VrfToggleSwitch
                      checked={inverted}
                      labelOn="INV"
                      labelOff="PNP"
                      ariaLabel={`${label} — käänteinen logiikka`}
                      onChange={(nextInverted) =>
                        patchSettingsForm((s) => {
                          const nextLevel = vrfDiTriggerFromInverted(nextInverted);
                          const patch = { [key]: nextLevel } as Partial<typeof s>;
                          if (key === 'di3_trigger_raw_level') {
                            patch.alarm_input_trigger_raw_level = nextLevel;
                          }
                          return { ...s, ...patch };
                        })
                      }
                    />
                  </div>
                  );
                })}
              </fieldset>

              <details className="vrf-settings-details">
                <summary>{VRF_CNH_STATUS_LABEL} (DI4)</summary>
                <p className="muted vrf-settings-details-lead">
                  DI4-signaali näkyy kaaviossa ja trendissä. Ei ohjaa käyntilupaa. Sammutuksen jälkeen kompressori voi
                  käydä hetken ilman ristiriitahälytystä.
                </p>
                {telemetry?.digital_inputs && (
                  <p className="vrf-cnh-di-readout">
                    Mittaus nyt:{' '}
                    <strong>
                      {vrfMeasuredUnitReady(telemetry) ? 'Signaali päällä' : 'Pois'}
                    </strong>
                    {' · '}
                    {formatVrfDiRaw(telemetry.digital_inputs.di4_raw)}
                  </p>
                )}
                <div className="vrf-settings-toggle-row">
                  <div>
                    <strong>DI4 — {VRF_CNH_STATUS_LABEL}</strong>
                    <p className="muted">
                      {vrfDiLogicDescription(
                        'di4_trigger_raw_level',
                        vrfDiInvertedFromTrigger(
                          settingsForm.di4_trigger_raw_level,
                          vrfDiTriggerDefault('di4_trigger_raw_level'),
                        ),
                      )}
                    </p>
                  </div>
                  <VrfToggleSwitch
                    checked={vrfDiInvertedFromTrigger(
                      settingsForm.di4_trigger_raw_level,
                      vrfDiTriggerDefault('di4_trigger_raw_level'),
                    )}
                    labelOn="INV"
                    labelOff="PNP"
                    ariaLabel={`${VRF_CNH_STATUS_LABEL} — käänteinen logiikka`}
                    onChange={(nextInverted) =>
                      patchSettingsForm((s) => ({
                        ...s,
                        di4_trigger_raw_level: vrfDiTriggerFromInverted(nextInverted),
                      }))
                    }
                  />
                </div>
              </details>

              <fieldset className="vrf-settings-fieldset">

                <legend>Hälytyrajat (°C)</legend>

                <label>

                  Kuumakaasu yläraja

                  <input

                    type="number"

                    step="0.1"

                    value={settingsForm.alarm_limits.hot_gas_high_c}

                    onChange={(e) =>

                      patchSettingsForm((s) => ({

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

                      patchSettingsForm((s) => ({

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

                      patchSettingsForm((s) => ({

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

                      patchSettingsForm((s) => ({

                        ...s,

                        alarm_limits: { ...s.alarm_limits, refrigerant_delta_low_c: Number(e.target.value) },

                      }))

                    }

                  />

                </label>

              </fieldset>

              {settingsDirty && !settingsMessage && (
                <p className="muted">Tallentamattomia muutoksia — seuranta ei ylikirjoita lomaketta ennen tallennusta.</p>
              )}

              {settingsMessage && (

                <p className={settingsMessage.includes('tallennettu') ? 'form-success' : 'form-error'}>{settingsMessage}</p>

              )}

              <fieldset className="vrf-settings-fieldset">
                <legend>Hälytyssähköpostit</legend>
                <p className="muted vrf-settings-fieldset-lead">
                  Lähetetään Supabasesta (Resend), kun DI3-hälytys on vähintään{' '}
                  {settingsForm.notify_on_delay_s ?? 60} s päällä. Poistumisviesti{' '}
                  {settingsForm.notify_off_delay_s ?? 180} s hälytyksen loputtua.
                </p>
                <ul className="vrf-status-list">
                  {(settingsForm.notify_mail_subscribers ?? []).length === 0 ? (
                    <li>
                      <span>Vastaanottajat</span>
                      <strong className="muted">Ei määritelty (oletus: huolto@tuusulankylmahuolto.fi)</strong>
                    </li>
                  ) : (
                    (settingsForm.notify_mail_subscribers ?? []).map((sub) => (
                      <li key={sub.email}>
                        <span>{sub.email}</span>
                        <strong>
                          {[
                            sub.deviation && 'hälytys',
                            sub.defrost_start && 'sulatus',
                            sub.outdoor_lock_on && 'ulkolukko',
                            sub.connectivity && 'yhteys',
                          ]
                            .filter(Boolean)
                            .join(', ') || '—'}
                        </strong>
                      </li>
                    ))
                  )}
                </ul>
                <p className="muted">
                  Vastaanottajalistaa voi muokata toistaiseksi Firebase-asetuksista tai pyydä päivitys bc-smartappiin.
                </p>
              </fieldset>

              <fieldset className="vrf-settings-fieldset">
                <legend>Firmware OTA</legend>
                <p className="muted vrf-settings-fieldset-lead">
                  Etäpäivitys ilman USB:tä. Lataa{' '}
                  <a href="https://bc-smartapp.pages.dev/vrf-firmware/firmware.bin" target="_blank" rel="noreferrer">
                    bc-smartapp/vrf-firmware
                  </a>
                  . Nykyinen: {device.firmware_version ?? '—'}.
                </p>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy || otaBusy || !online}
                    onClick={() => void requestOta()}
                  >
                    {otaBusy ? 'Lähetetään…' : 'Lähetä OTA laitteelle'}
                  </button>
                </div>
              </fieldset>

              <div className="form-actions">

                <button type="submit" className="btn btn-primary" disabled={busy || stale || !online}>

                  Tallenna asetukset

                </button>

              </div>

            </form>

            <CollapsibleSection title="Laitehallinta" defaultOpen={false} variant="plain" className="vrf-settings-danger">
              <p className="muted vrf-settings-danger-lead">
                Poistaa laitteen ja siihen liittyvän seurantadatan pysyvästi.
              </p>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setDeleteTarget(true)}>
                Poista laite
              </button>
            </CollapsibleSection>

          </section>

        )}



      </div>



      <VrfTrendDialog

        open={trendOpen}

        deviceId={device.id}

        focusHotspot={trendFocusHotspot}

        focusBinary={trendFocusBinary}

        onClose={closeTrend}

      />



      <VrfMonitorShareDialog
        open={shareOpen}
        deviceId={device.id}
        deviceName={device.name}
        onClose={() => setShareOpen(false)}
      />

      <VrfWiringGuideDialog open={wiringGuideOpen} onClose={() => setWiringGuideOpen(false)} />

      <VrfReportDialog

        open={reportOpen}

        device={device}

        companyName={profile?.companies?.name ?? 'BC SmartApp'}

        onClose={() => setReportOpen(false)}

      />



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

