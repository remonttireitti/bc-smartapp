import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import {
  fetchMonitorSharesForViewer,
  monitorReaderVrfPath,
  type MonitorReaderShare,
} from '../lib/monitorReaderShares';
import { supabase } from '../lib/supabase';
import { VRF_DEVICE_SELECT, type VrfDevice } from '../lib/vrfMonitoring';

interface Props {
  session: Session;
}

export default function MonitorReaderHubPage({ session }: Props) {
  const [shares, setShares] = useState<MonitorReaderShare[]>([]);
  const [devices, setDevices] = useState<Record<string, VrfDevice>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchMonitorSharesForViewer();
      setShares(rows);
      const vrfIds = rows.filter((row) => row.kind === 'vrf' && row.vrf_device_id).map((row) => row.vrf_device_id!);
      if (vrfIds.length > 0) {
        const { data, error: deviceError } = await supabase
          .from('vrf_devices')
          .select(VRF_DEVICE_SELECT)
          .in('id', vrfIds);
        if (deviceError) throw new Error(deviceError.message);
        const map: Record<string, VrfDevice> = {};
        for (const device of (data as VrfDevice[] | null) ?? []) {
          map[device.id] = device;
        }
        setDevices(map);
      } else {
        setDevices({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lataus epäonnistui');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout session={session}>
      <div className="temp-monitoring-page page-stack monitor-reader-hub">
        <header className="temp-panel-head">
          <div>
            <span className="badge vrf-reader-badge">Lukuoikeus</span>
            <h1>Jaettu seuranta</h1>
            <p className="muted">Sinulle jaetut laitteet — vain katselu, ei ohjausta.</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            Päivitä
          </button>
        </header>

        {error && <p className="form-error">{error}</p>}
        {loading ? (
          <p className="muted">Ladataan…</p>
        ) : shares.length === 0 ? (
          <p className="muted">Sinulle ei ole jaettu seurantaa.</p>
        ) : (
          <ul className="monitor-reader-hub-list">
            {shares.map((share) => {
              if (share.kind === 'vrf' && share.vrf_device_id) {
                const device = devices[share.vrf_device_id];
                return (
                  <li key={share.id}>
                    <Link to={monitorReaderVrfPath(share.vrf_device_id)} className="monitor-reader-hub-card panel">
                      <strong>{share.label ?? device?.name ?? 'VRF-laite'}</strong>
                      <span className="muted">VRF ohjaus ja seuranta</span>
                      {device && <span className="muted">{device.name}</span>}
                    </Link>
                  </li>
                );
              }
              return (
                <li key={share.id}>
                  <div className="panel monitor-reader-hub-card disabled">
                    <strong>{share.label ?? 'Lämpötilaseuranta'}</strong>
                    <span className="muted">Lämpötilaseurannan lukunäkymä tulossa</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
