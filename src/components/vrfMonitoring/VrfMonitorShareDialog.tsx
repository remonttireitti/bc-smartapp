import { FormEvent, useEffect, useState } from 'react';
import {
  createMonitorShare,
  fetchMonitorSharesForVrfDevice,
  monitorReaderShareUrl,
  regenerateMonitorShareToken,
  setMonitorShareEnabled,
  type MonitorReaderShare,
} from '../../lib/monitorReaderShares';

type Props = {
  open: boolean;
  deviceId: string;
  deviceName: string;
  onClose: () => void;
};

export default function VrfMonitorShareDialog({ open, deviceId, deviceName, onClose }: Props) {
  const [shares, setShares] = useState<MonitorReaderShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [viewerEmail, setViewerEmail] = useState('');
  const [viewerPassword, setViewerPassword] = useState('Lukija2026!');
  const [createUser, setCreateUser] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function loadShares() {
    setLoading(true);
    setError(null);
    try {
      setShares(await fetchMonitorSharesForVrfDevice(deviceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Jakojen lataus epäonnistui');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setLabel(deviceName);
    setViewerEmail('');
    setCreateUser(false);
    setMessage(null);
    setError(null);
    void loadShares();
  }, [open, deviceId, deviceName]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await createMonitorShare({
        kind: 'vrf',
        device_id: deviceId,
        label: label.trim() || deviceName,
        viewer_email: createUser ? viewerEmail.trim() : undefined,
        viewer_password: createUser ? viewerPassword : undefined,
        viewer_display_name: createUser ? label.trim() || deviceName : undefined,
      });
      setMessage(
        createUser && viewerEmail.trim()
          ? `Jakolinkki luotu ja lukijakäyttäjä ${viewerEmail.trim()}`
          : 'Jakolinkki luotu',
      );
      await loadShares();
      await copyShareUrl(result.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Jaon luonti epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  async function copyShareUrl(token: string) {
    const url = monitorReaderShareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken((current) => (current === token ? null : current)), 2500);
    } catch {
      window.prompt('Kopioi jakolinkki:', url);
    }
  }

  if (!open) return null;

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="leave-draft-dialog vrf-share-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vrf-share-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="vrf-share-dialog-title">Jaa lukuoikeus</h2>
        <p className="muted temp-report-dialog-lead">
          Luo jakolinkki, jolla lukija näkee seurannan ilman ohjausoikeuksia. Voit valinnaisesti luoda
          kirjautuvan lukijakäyttäjän.
        </p>

        <form className="form-grid vrf-share-form" onSubmit={(e) => void handleCreate(e)}>
          <label>
            Nimi jaetulle näkymälle
            <input value={label} onChange={(e) => setLabel(e.target.value)} required />
          </label>
          <label className="vrf-share-check">
            <input type="checkbox" checked={createUser} onChange={(e) => setCreateUser(e.target.checked)} />
            Luo kirjautuva lukijakäyttäjä
          </label>
          {createUser && (
            <>
              <label>
                Lukijan sähköposti
                <input
                  type="email"
                  value={viewerEmail}
                  onChange={(e) => setViewerEmail(e.target.value)}
                  required={createUser}
                />
              </label>
              <label>
                Alkusalasana
                <input
                  type="text"
                  value={viewerPassword}
                  onChange={(e) => setViewerPassword(e.target.value)}
                  required={createUser}
                />
              </label>
            </>
          )}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Luo jakolinkki
            </button>
          </div>
        </form>

        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}

        <section className="vrf-share-list">
          <h3 className="vrf-trend-subtitle">Aktiiviset jaot</h3>
          {loading ? (
            <p className="muted">Ladataan…</p>
          ) : shares.length === 0 ? (
            <p className="muted">Ei vielä jaettuja lukuoikeuksia.</p>
          ) : (
            <ul className="vrf-share-items">
              {shares.map((share) => (
                <li key={share.id} className={`vrf-share-item ${share.enabled ? '' : 'disabled'}`}>
                  <div>
                    <strong>{share.label ?? deviceName}</strong>
                    <p className="muted">
                      {share.enabled ? 'Käytössä' : 'Poistettu käytöstä'}
                      {share.viewer_user_id ? ' · kirjautuva käyttäjä' : ' · vain linkki'}
                    </p>
                    <code className="vrf-share-url">{monitorReaderShareUrl(share.access_token)}</code>
                  </div>
                  <div className="vrf-share-item-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => void copyShareUrl(share.access_token)}
                    >
                      {copiedToken === share.access_token ? 'Kopioitu' : 'Kopioi linkki'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const token = await regenerateMonitorShareToken(share.id);
                          await copyShareUrl(token);
                          await loadShares();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Uuden linkin luonti epäonnistui');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Uusi linkki
                    </button>
                    <button
                      type="button"
                      className={`btn ${share.enabled ? 'btn-danger' : 'btn-secondary'}`}
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await setMonitorShareEnabled(share.id, !share.enabled);
                          await loadShares();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Tilan päivitys epäonnistui');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {share.enabled ? 'Poista käytöstä' : 'Ota käyttöön'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="leave-draft-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            Sulje
          </button>
        </div>
      </div>
    </div>
  );
}
