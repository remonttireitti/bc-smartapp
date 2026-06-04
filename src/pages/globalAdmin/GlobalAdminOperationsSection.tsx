import { useCallback, useEffect, useState } from 'react';
import {
  fetchPlatformAuditEvents,
  recordPlatformAudit,
  type PlatformAuditRow,
} from '../../lib/platformAudit';
import {
  downloadPlatformBackup,
  fetchPlatformBackupSnapshots,
  restorePlatformBackup,
  runPlatformBackup,
  type PlatformBackupKind,
  type PlatformBackupSnapshot,
} from '../../lib/platformBackup';
import type { Company } from '../../types';

function formatBytes(bytes: number | null) {
  if (bytes == null || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTs(iso: string) {
  return new Date(iso).toLocaleString('fi-FI');
}

const KIND_LABELS: Record<PlatformBackupKind, string> = {
  daily: 'Päivittäinen',
  weekly: 'Viikoittainen',
  manual: 'Manuaalinen',
};

type Props = {
  companies: Company[];
};

export default function GlobalAdminOperationsSection({ companies }: Props) {
  const [auditRows, setAuditRows] = useState<PlatformAuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const [backups, setBackups] = useState<PlatformBackupSnapshot[]>([]);
  const [backupLoading, setBackupLoading] = useState(true);
  const [backupBusy, setBackupBusy] = useState<PlatformBackupKind | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState('');

  const loadAudit = useCallback(async (offset = 0) => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const result = await fetchPlatformAuditEvents({
        limit: 80,
        offset,
        companyId: filterCompanyId || undefined,
        actionContains: filterAction.trim() || undefined,
      });
      setAuditRows(result.rows);
      setAuditTotal(result.total);
      setAuditOffset(offset);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Loki epäonnistui');
    } finally {
      setAuditLoading(false);
    }
  }, [filterCompanyId, filterAction]);

  const loadBackups = useCallback(async () => {
    setBackupLoading(true);
    try {
      setBackups(await fetchPlatformBackupSnapshots(40));
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Varmuuskopiolista epäonnistui');
    } finally {
      setBackupLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAudit(0);
    void loadBackups();
  }, [loadAudit, loadBackups]);

  async function handleBackup(kind: PlatformBackupKind) {
    setBackupBusy(kind);
    setBackupMessage(null);
    setBackupError(null);
    try {
      const result = await runPlatformBackup(kind);
      setBackupMessage(
        `Varmuuskopio valmis (${KIND_LABELS[kind]}). Koko ${formatBytes(result.byte_size)}.`,
      );
      await loadBackups();
      void recordPlatformAudit('backup.manual_trigger', `Käynnistettiin ${kind}-varmuuskopio`, {
        metadata: { snapshot_id: result.snapshot_id },
      });
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Varmuuskopio epäonnistui');
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleDownload(snapshotId: string, fileName: string) {
    setBackupError(null);
    try {
      const { url } = await downloadPlatformBackup(snapshotId);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.rel = 'noopener';
      link.click();
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Lataus epäonnistui');
    }
  }

  async function handleRestore(snapshotId: string) {
    if (restoreConfirm !== 'PALAUTA') {
      setBackupError('Kirjoita vahvistukseksi PALAUTA');
      return;
    }
    setBackupBusy('manual');
    setBackupError(null);
    setBackupMessage(null);
    try {
      const result = await restorePlatformBackup(snapshotId);
      setBackupMessage(result.message);
      setRestoreId(null);
      setRestoreConfirm('');
      await loadAudit(0);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Palautus epäonnistui');
    } finally {
      setBackupBusy(null);
    }
  }

  return (
    <>
      <section className="card global-admin-block">
        <h2>Käyttäjä- ja järjestelmäloki</h2>
        <p className="muted global-admin-hint">
          Kirjaa sivun avaukset, tietokantamuutokset (työraportit, asiakkaat, yritykset jne.) ja GBA-toiminnot.
          Suodata yrityksen tai tekstin perusteella.
        </p>
        <div className="line-form-grid global-admin-audit-filters">
          <label>
            Yritys
            <select value={filterCompanyId} onChange={(e) => setFilterCompanyId(e.target.value)}>
              <option value="">Kaikki</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hae toiminnosta / tekstistä
            <input
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              placeholder="esim. work_reports, navigation"
            />
          </label>
          <div className="form-actions global-admin-form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void loadAudit(0)}>
              Päivitä loki
            </button>
          </div>
        </div>
        {auditError && <p className="error">{auditError}</p>}
        {auditLoading ? (
          <p className="muted">Ladataan lokia…</p>
        ) : (
          <>
            <p className="muted">
              Näytetään {auditRows.length} / {auditTotal} riviä
            </p>
            <div className="global-admin-audit-table-wrap">
              <table className="data-table global-admin-audit-table">
                <thead>
                  <tr>
                    <th>Aika</th>
                    <th>Käyttäjä</th>
                    <th>Yritys</th>
                    <th>Toiminto</th>
                    <th>Kuvaus</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatTs(row.created_at)}</td>
                      <td>{row.actor_email ?? row.actor_user_id ?? '—'}</td>
                      <td>{row.actor_company_name ?? '—'}</td>
                      <td>
                        <code>{row.action}</code>
                      </td>
                      <td>{row.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions global-admin-form-actions">
              {auditOffset > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void loadAudit(Math.max(0, auditOffset - 80))}
                >
                  Edelliset
                </button>
              )}
              {auditOffset + auditRows.length < auditTotal && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void loadAudit(auditOffset + 80)}
                >
                  Seuraavat
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <section className="card global-admin-block">
        <h2>Varmuuskopiot</h2>
        <p className="muted global-admin-hint">
          JSON-vedos liiketoimintadatasta (ei auth-käyttäjiä). Säilytys: 14 päivittäistä ja 8 viikoittaista.
          Aja automaatio ulkoisella ajastuksella POST{' '}
          <code>platform-backup-run</code> otsikolla <code>x-backup-cron-secret</code> (päivittäin ja
          viikoittain eri <code>kind</code>).
        </p>
        <div className="global-admin-backup-actions">
          {(['manual', 'daily', 'weekly'] as PlatformBackupKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              className="btn btn-primary"
              disabled={!!backupBusy}
              onClick={() => void handleBackup(kind)}
            >
              {backupBusy === kind ? 'Ajetaan…' : `Luo ${KIND_LABELS[kind].toLowerCase()}`}
            </button>
          ))}
        </div>
        {backupMessage && <p className="success">{backupMessage}</p>}
        {backupError && <p className="error">{backupError}</p>}
        {backupLoading ? (
          <p className="muted">Ladataan varmuuskopioita…</p>
        ) : backups.length === 0 ? (
          <p className="muted">Ei varmuuskopioita vielä.</p>
        ) : (
          <ul className="global-admin-backup-list">
            {backups.map((snap) => (
              <li key={snap.id} className="global-admin-backup-row">
                <div className="global-admin-backup-row-main">
                  <strong>{KIND_LABELS[snap.kind]}</strong>
                  <span className="muted">{snap.file_name}</span>
                  <span className="muted">{formatTs(snap.started_at)}</span>
                  <span
                    className={
                      snap.status === 'completed'
                        ? 'success'
                        : snap.status === 'failed'
                          ? 'error'
                          : 'muted'
                    }
                  >
                    {snap.status}
                  </span>
                  <span>{formatBytes(snap.byte_size)}</span>
                </div>
                <div className="global-admin-backup-row-actions">
                  {snap.status === 'completed' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void handleDownload(snap.id, snap.file_name)}
                      >
                        Lataa
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          setRestoreId(snap.id);
                          setRestoreConfirm('');
                          setBackupError(null);
                        }}
                      >
                        Palauta
                      </button>
                    </>
                  )}
                </div>
                {restoreId === snap.id && (
                  <div className="global-admin-restore-confirm panel">
                    <p className="error" style={{ marginTop: 0 }}>
                      Palautus ylikirjoittaa samat id:t tietokannassa. Auth-käyttäjiä ei palauteta.
                    </p>
                    <label>
                      Kirjoita <code>PALAUTA</code>
                      <input
                        value={restoreConfirm}
                        onChange={(e) => setRestoreConfirm(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <div className="form-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setRestoreId(null)}
                      >
                        Peruuta
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={!!backupBusy}
                        onClick={() => void handleRestore(snap.id)}
                      >
                        Vahvista palautus
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
