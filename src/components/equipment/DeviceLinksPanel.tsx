import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { emitDataChanged } from '../../lib/dataRefresh';
import {
  acceptEquipmentLink,
  removeEquipmentLink,
  sharedByline,
  sharedKindLabel,
  type EquipmentLink,
  type SharedHistoryRow,
} from '../../lib/equipmentLinks';
import { formatMaintenanceDateFi } from '../../lib/equipmentMaintenanceHistory';

const FILL_LABELS: Record<string, string> = {
  model: 'malli',
  serial_number: 'sarjanumero',
  manufacturer: 'valmistaja',
  refrigerant: 'kylmäaine',
  refrigerant_charge_kg: 'täytös',
  installed_on: 'asennuspäivä',
};

type Props = {
  links: EquipmentLink[];
  shared: SharedHistoryRow[];
  /** Tyhjät omat kentät, joihin linkitetyllä on arvo. */
  fillKeys: string[];
  canWrite: boolean;
  onFill: () => Promise<void>;
  onChanged: () => void;
};

/** Linkitetyt laitteet (toisen yrityksen sama fyysinen laite) + jaettu historia (vain yhteenvetorivit). */
export default function DeviceLinksPanel({ links, shared, fillKeys, canWrite, onFill, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      emitDataChanged();
      onChanged();
    } catch {
      setError('Toiminto epäonnistui.');
    } finally {
      setBusy(null);
    }
  }

  if (links.length === 0) return null;
  const rows = [...shared].sort((a, b) => String(b.entry_date ?? '').localeCompare(String(a.entry_date ?? '')));

  return (
    <section className="panel device-links-panel" data-testid="device-links-panel">
      <h2 className="customer-section-title">Linkitetyt laitteet</h2>
      <ul className="device-links-list">
        {links.map((l) => (
          <li key={l.link_id}>
            <span className="device-links-label">
              {l.other_label}
              <span className="muted"> · {l.other_company ?? '—'}{l.status === 'proposed' ? ' · odottaa hyväksyntää' : ''}</span>
            </span>
            <span className="device-qr-actions">
              {l.can_accept ? (
                <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void run(l.link_id, () => acceptEquipmentLink(supabase, l.link_id))}>
                  Hyväksy
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm('Poistetaanko linkitys?')) void run(l.link_id, () => removeEquipmentLink(supabase, l.link_id));
                }}
              >
                {l.status === 'proposed' && l.can_accept ? 'Hylkää' : 'Poista'}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {canWrite && fillKeys.length > 0 ? (
        <div className="device-qr-actions">
          <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void run('fill', onFill)}>
            Täydennä linkitetystä ({fillKeys.map((k) => FILL_LABELS[k] ?? k).join(', ')})
          </button>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <>
          <h3 className="device-links-sub">Linkitettyjen historia</h3>
          <ul className="device-notes-list">
            {rows.map((r, i) => (
              <li key={`${r.entry_date}-${r.kind}-${i}`}>
                <strong>{r.entry_date ? formatMaintenanceDateFi(r.entry_date) : '—'}</strong>
                <span className="device-notes-badge device-notes-badge--work">{sharedKindLabel(r.kind)}</span>
                <span className="device-notes-text">{[r.summary, r.work_done].filter(Boolean).join(': ') || '—'}</span>
                <span className="muted">{sharedByline(r)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
