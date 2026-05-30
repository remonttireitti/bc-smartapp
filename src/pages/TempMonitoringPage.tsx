import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import IconButton from '../components/IconButton';
import TempDeviceDeleteDialog from '../components/tempMonitoring/TempDeviceDeleteDialog';
import { IconTrash } from '../components/icons';
import { useProfile } from '../hooks/useProfile';
import {
  TEMP_DEVICE_SELECT,
  formatRelativeTime,
  formatTempC,
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
      <p className="subtitle">Lämpötilaseuranta — siirrettävät mittauslaitteet</p>

      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}

      {createdKey && (
        <section className="panel temp-key-panel">
          <h2>Laiteavain (näytetään kerran)</h2>
          <p className="muted">
            12-numeroinen avain — syötä laitteen WiFi-valikossa kohdassa Pilviavain (numeronäppäimistö).
          </p>
          <code className="temp-device-key">{createdKey}</code>
          <div className="form-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => void navigator.clipboard.writeText(createdKey)}
            >
              Kopioi avain
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Lisää laite</h2>
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
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Tallennetaan…' : 'Luo laite'}
            </button>
          </div>
        </form>
        {ingestUrl && (
          <p className="muted temp-ingest-url">
            Laitteen lähetysosoite: <code>{ingestUrl}</code>
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Laitteet</h2>
        {loading ? (
          <p className="muted">Ladataan…</p>
        ) : devices.length === 0 ? (
          <p className="muted">Ei laitteita. Luo ensimmäinen laite yllä.</p>
        ) : (
          <ul className="temp-device-list">
            {devices.map((device) => {
              const online = isTempDeviceOnline(device.last_seen_at);
              return (
                <li key={device.id} className="temp-device-list-item">
                  <Link to={`/lampotila/${device.id}`} className="temp-device-card">
                    <div className="temp-device-card-head">
                      <strong>{device.name}</strong>
                      <span className={`temp-status ${online ? 'online' : 'offline'}`}>
                        {online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <div className="temp-device-card-meta">
                      <span>{formatTempC(device.last_temp_c)}</span>
                      <span>{formatRelativeTime(device.last_seen_at)}</span>
                    </div>
                  </Link>
                  <IconButton
                    label="Poista laite"
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(device);
                    }}
                  >
                    <IconTrash />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
