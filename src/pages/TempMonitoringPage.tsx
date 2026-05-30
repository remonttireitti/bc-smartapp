import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import CollapsibleSection from '../components/CollapsibleSection';
import TempApSetupGuide from '../components/tempMonitoring/TempApSetupGuide';
import TempDeviceDeleteDialog from '../components/tempMonitoring/TempDeviceDeleteDialog';
import TempDeviceListCard from '../components/tempMonitoring/TempDeviceListCard';
import TempMonitoringPageHeader from '../components/tempMonitoring/TempMonitoringPageHeader';
import { useProfile } from '../hooks/useProfile';
import {
  TEMP_DEVICE_SELECT,
  generateDeviceKey,
  ingestFunctionUrl,
  isTempDeviceOnline,
  type TempDevice,
} from '../lib/tempMonitoring';
import { supabase } from '../lib/supabase';

interface Props {
  session: Session;
}

export default function TempMonitoringPage({ session }: Props) {
  const { profile } = useProfile(session);
  const companyId = profile?.company_id ?? '';
  const [devices, setDevices] = useState<TempDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TempDevice | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const onlineCount = useMemo(
    () => devices.filter((device) => isTempDeviceOnline(device.last_seen_at)).length,
    [devices],
  );

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from('temp_devices')
      .select(TEMP_DEVICE_SELECT)
      .eq('company_id', companyId)
      .order('name');
    setDevices((data as TempDevice[] | null) ?? []);
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

    const deviceKey = generateDeviceKey();
    const { error: insertError } = await supabase.from('temp_devices').insert({
      company_id: companyId,
      name: newName.trim(),
      device_key: deviceKey,
      created_by: session.user.id,
    });

    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewName('');
    setCreatedKey(deviceKey);
    setMessage('Laite lisätty. Kopioi laiteavain laitteeseen.');
    await load();
  }

  async function confirmDeleteDevice() {
    if (!deleteTarget) return;
    setBusy(true);
    setDeleteError(null);

    const { error: deleteErr } = await supabase.from('temp_devices').delete().eq('id', deleteTarget.id);

    setBusy(false);
    if (deleteErr) {
      setDeleteError(deleteErr.message);
      return;
    }

    setDeleteTarget(null);
    setMessage(`Laite "${deleteTarget.name}" poistettu.`);
    await load();
  }

  const ingestUrl = import.meta.env.VITE_SUPABASE_URL
    ? ingestFunctionUrl(import.meta.env.VITE_SUPABASE_URL)
    : '';

  return (
    <AppLayout session={session}>
      <div className="temp-monitoring-page page-stack">
        <TempMonitoringPageHeader
          sticky
          crumbs={[
            { href: '/', label: 'Etusivu' },
            { label: 'Lämpötilaseuranta' },
          ]}
          title="Lämpötilaseuranta"
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
              12-numeroinen avain — syötä laitteen WiFi-valikossa kohdassa Pilviavain (numeronäppäimistö).
            </p>
            <code className="temp-device-key">{createdKey}</code>
            <TempApSetupGuide deviceKey={createdKey} compact />
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
            <p className="muted">Ei laitteita. Lisää ensimmäinen laite alla.</p>
          ) : (
            <ul className="temp-device-list">
              {devices.map((device) => (
                <TempDeviceListCard
                  key={device.id}
                  device={device}
                  to={`/lampotila/${device.id}`}
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

        <CollapsibleSection
          title="WiFi-asennus asiakkaalla (AP)"
          defaultOpen={devices.length === 0}
          variant="plain"
          className="panel temp-admin-panel"
        >
          <TempApSetupGuide />
        </CollapsibleSection>

        <CollapsibleSection
          title="Lisää laite"
          defaultOpen={devices.length === 0}
          variant="plain"
          className="panel temp-admin-panel"
        >
          <form className="form-grid" onSubmit={(e) => void addDevice(e)}>
            <label>
              Nimi
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Esim. JC3248 #1"
                required
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Tallennetaan…' : 'Luo laite'}
              </button>
            </div>
          </form>
        </CollapsibleSection>

        {ingestUrl && (
          <CollapsibleSection title="Tekninen asetus" defaultOpen={false} variant="plain" className="panel temp-admin-panel">
            <p className="muted temp-ingest-url">
              Laitteen lähetysosoite: <code>{ingestUrl}</code>
            </p>
          </CollapsibleSection>
        )}
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
