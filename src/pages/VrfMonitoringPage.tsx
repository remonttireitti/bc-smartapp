import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import CollapsibleSection from '../components/CollapsibleSection';
import TempDeviceDeleteDialog from '../components/tempMonitoring/TempDeviceDeleteDialog';
import TempMonitoringPageHeader from '../components/tempMonitoring/TempMonitoringPageHeader';
import VrfDeviceListCard from '../components/vrfMonitoring/VrfDeviceListCard';
import { useProfile } from '../hooks/useProfile';
import { REMOTE_MONITORING_HUB } from '../lib/remoteMonitoringRoutes';
import {
  VRF_DEVICE_SELECT,
  generateVrfDeviceKey,
  isVrfDeviceOnline,
  vrfIngestFunctionUrl,
  type VrfDevice,
} from '../lib/vrfMonitoring';
import { supabase } from '../lib/supabase';

interface Props {
  session: Session;
}

export default function VrfMonitoringPage({ session }: Props) {
  const { profile } = useProfile(session);
  const companyId = profile?.company_id ?? '';
  const [devices, setDevices] = useState<VrfDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newExternalId, setNewExternalId] = useState('vrf-heating-01');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VrfDevice | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const ingestUrl = import.meta.env.VITE_SUPABASE_URL
    ? vrfIngestFunctionUrl(import.meta.env.VITE_SUPABASE_URL)
    : '';

  const onlineCount = useMemo(
    () => devices.filter((device) => isVrfDeviceOnline(device.last_seen_at)).length,
    [devices],
  );

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from('vrf_devices')
      .select(VRF_DEVICE_SELECT)
      .eq('company_id', companyId)
      .order('name');
    setDevices((data as VrfDevice[] | null) ?? []);
    setLastRefreshAt(new Date());
    setLoading(false);
    if (loadError) setError(loadError.message);
  }

  useEffect(() => {
    if (companyId) void load();
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [companyId]);

  async function addDevice(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !newName.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setCreatedKey(null);

    const deviceKey = generateVrfDeviceKey();
    const { error: insertError } = await supabase.from('vrf_devices').insert({
      company_id: companyId,
      name: newName.trim(),
      device_key: deviceKey,
      external_device_id: newExternalId.trim() || null,
      created_by: session.user.id,
    });

    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewName('');
    setCreatedKey(deviceKey);
    setMessage('Laite lisätty. Kopioi laiteavain firmwareen ennen Supabase-lähetystä.');
    await load();
  }

  async function confirmDeleteDevice() {
    if (!deleteTarget) return;
    setBusy(true);
    setDeleteError(null);

    const { error: deleteErr } = await supabase.from('vrf_devices').delete().eq('id', deleteTarget.id);

    setBusy(false);
    if (deleteErr) {
      setDeleteError(deleteErr.message);
      return;
    }

    setDeleteTarget(null);
    setMessage(`Laite "${deleteTarget.name}" poistettu.`);
    await load();
  }

  return (
    <AppLayout session={session}>
      <div className="temp-monitoring-page page-stack">
        <TempMonitoringPageHeader
          sticky
          crumbs={[
            { href: '/', label: 'Etusivu' },
            { href: REMOTE_MONITORING_HUB, label: 'Etäohjaus ja seuranta' },
            { label: 'VRF ohjaus ja seuranta' },
          ]}
          title="VRF ohjaus ja seuranta"
          subtitle={
            loading
              ? 'Ladataan laitteita…'
              : `${onlineCount}/${devices.length} online · päivitetty ${lastRefreshAt ? lastRefreshAt.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }) : '—'}`
          }
          actions={
            <button type="button" className="btn btn-secondary" disabled={loading || busy} onClick={() => void load()}>
              Päivitä
            </button>
          }
        />

        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}

        {createdKey && (
          <section className="panel temp-key-panel">
            <h2>Laiteavain (näytetään kerran)</h2>
            <p className="muted">
              12-numeroinen avain — lisää firmwareen Supabase-ingestiä varten (`X-Device-Key`-otsikko).
            </p>
            <code className="temp-device-key">{createdKey}</code>
            {ingestUrl && (
              <p className="muted temp-ingest-url">
                Lähetysosoite: <code>{ingestUrl}</code>
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void navigator.clipboard.writeText(createdKey)}
              >
                Kopioi avain
              </button>
            </div>
          </section>
        )}

        <section className="panel temp-devices-panel">
          <div className="temp-panel-head">
            <h2>Online-seuranta</h2>
            {!loading && devices.length > 0 && (
              <span className="temp-devices-count muted">{devices.length} laitetta</span>
            )}
          </div>
          {loading ? (
            <p className="muted">Ladataan…</p>
          ) : devices.length === 0 ? (
            <p className="muted">Ei laitteita. Lisää laite alla tai käytä toistaiseksi Firebase-seurantaa.</p>
          ) : (
            <ul className="temp-device-list">
              {devices.map((device) => (
                <VrfDeviceListCard
                  key={device.id}
                  device={device}
                  deleteDisabled={busy}
                  onDelete={() => {
                    setDeleteError(null);
                    setDeleteTarget(device);
                  }}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="panel temp-devices-panel">
          <div className="temp-panel-head">
            <h2>Lisää laite</h2>
          </div>
          <form className="form-grid" onSubmit={(e) => void addDevice(e)}>
            <label>
              Nimi
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Esim. Hyrylä VRF"
                required
              />
            </label>
            <label>
              Laitteen ID (valinnainen)
              <input
                value={newExternalId}
                onChange={(e) => setNewExternalId(e.target.value)}
                placeholder="vrf-heating-01"
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Tallennetaan…' : 'Luo laite'}
              </button>
            </div>
          </form>
        </section>

        <CollapsibleSection
          title="Nykyinen Firebase-seuranta"
          defaultOpen={false}
          variant="plain"
          className="panel temp-admin-panel"
        >
          <p className="muted">
            Kentällä oleva laite lähettää vielä Firebaseen. Avaa vanha käyttöliittymä ohjaukseen ja asetuksiin, kunnes
            Supabase-siirto on valmis.
          </p>
          <div className="form-actions">
            <a
              href="https://hyrylavrf.web.app"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              Avaa Firebase VRF-seuranta
            </a>
            <Link to={REMOTE_MONITORING_HUB} className="btn btn-secondary">
              ← Takaisin
            </Link>
          </div>
        </CollapsibleSection>
      </div>

      <TempDeviceDeleteDialog
        open={deleteTarget != null}
        deviceName={deleteTarget?.name ?? ''}
        busy={busy}
        error={deleteError}
        onClose={() => {
          if (busy) return;
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={() => void confirmDeleteDevice()}
      />
    </AppLayout>
  );
}
