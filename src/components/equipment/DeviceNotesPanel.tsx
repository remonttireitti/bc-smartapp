import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import ToggleSwitch from '../ToggleSwitch';
import { useProfile } from '../../hooks/useProfile';
import { supabase } from '../../lib/supabase';
import { emitDataChanged } from '../../lib/dataRefresh';
import { isPortalView } from '../../lib/portalPreview';
import { formatMaintenanceDateFi } from '../../lib/equipmentMaintenanceHistory';
import { todayYmdLocal } from '../../lib/huoltoSchedule';
import {
  EQUIPMENT_NOTE_QUICK_PICKS,
  insertEquipmentNote,
  noteByline,
  type EquipmentNote,
} from '../../lib/equipmentNotes';

type Props = {
  session: Session | null;
  equipmentId: string;
  /** null = taulua ei ole → ei lisäystä. */
  notes: EquipmentNote[] | null;
  /** Saako käyttäjä lisätä (RLS ratkaisee lopullisesti). */
  canAdd: boolean;
  onAdded: () => void;
  showList?: boolean;
  /** Vain + Merkintä -painike ja lomake (ei korttia/otsikkoa). */
  bare?: boolean;
};

/** Huoltohistoriamerkinnät: pikavalinnat + vapaa teksti; 'Huoltokäynti' päivittää viimeisimmän huollon. */
export default function DeviceNotesPanel({ session, equipmentId, notes, canAdd, onAdded, showList = true, bare = false }: Props) {
  const { profile, reload } = useProfile(session);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayYmdLocal());
  const [text, setText] = useState('');
  const [service, setService] = useState(false);
  const [tukes, setTukes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const companyId = profile?.company_id ?? null;
  const allowed = Boolean(session && notes !== null && canAdd && companyId && !isPortalView(profile));
  const needsTukes = !String(profile?.tukes_number ?? '').trim();

  useEffect(() => {
    if (!allowed || !companyId) return;
    void supabase.from('companies').select('name').eq('id', companyId).maybeSingle().then(({ data }) => {
      setCompanyName((data as { name?: string } | null)?.name ?? null);
    });
  }, [allowed, companyId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!session || !companyId || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      let tukesNumber = String(profile?.tukes_number ?? '').trim() || null;
      if (!tukesNumber && tukes.trim()) {
        tukesNumber = tukes.trim();
        // Kysytään kerran: tallennetaan omaan profiiliin.
        const { error: pErr } = await supabase.from('profiles').update({ tukes_number: tukesNumber }).eq('id', session.user.id);
        if (!pErr) reload();
      }
      await insertEquipmentNote(supabase, {
        equipmentId,
        authorCompanyId: companyId,
        authorCompanyName: companyName,
        installerName: profile?.display_name?.trim() || session.user.email || null,
        installerTukes: tukesNumber,
        entryDate: date || todayYmdLocal(),
        text: text.trim(),
        isServiceVisit: service,
        createdBy: session.user.id,
      });
      setText('');
      setService(false);
      setOpen(false);
      emitDataChanged();
      onAdded();
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
      setError(`Tallennus epäonnistui${msg ? `: ${msg}` : '.'}`);
    } finally {
      setBusy(false);
    }
  }

  const list = (notes ?? []).filter((n) => n.equipment_id === equipmentId);
  if (!allowed && (!showList || list.length === 0)) return null;

  const formEl = (
        <form className="device-notes-form" onSubmit={(e) => void submit(e)}>
          <div className="device-notes-chips">
            {EQUIPMENT_NOTE_QUICK_PICKS.map((q) => (
              <button
                key={q}
                type="button"
                className={`device-notes-chip${text === q ? ' is-active' : ''}`}
                onClick={() => setText(q)}
              >
                {q}
              </button>
            ))}
          </div>
          <input aria-label="Mitä tehtiin" placeholder="Mitä tehtiin" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
          <input aria-label="Päivämäärä" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {needsTukes ? (
            <input aria-label="Tukes-numero" placeholder="Tukes-numero (tallentuu profiiliin)" value={tukes} onChange={(e) => setTukes(e.target.value)} />
          ) : null}
          <div className="equipment-toggle-row">
            <ToggleSwitch label="Huoltokäynti" checked={service} onChange={setService} />
          </div>
          <div className="device-qr-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
              Tallenna
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Peruuta
            </button>
          </div>
          {error ? <p className="error" role="alert">{error}</p> : null}
        </form>
  );

  if (bare) {
    return (
      <div className="device-notes-bare" data-testid="device-notes-panel">
        {!open ? (
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            + Merkintä
          </button>
        ) : (
          formEl
        )}
        {error && !open ? <p className="error" role="alert">{error}</p> : null}
      </div>
    );
  }

  return (
    <section className="panel device-notes-panel" data-testid="device-notes-panel">
      <div className="device-notes-head">
        <h2 className="customer-section-title">Merkinnät</h2>
        {allowed && !open ? (
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            + Merkintä
          </button>
        ) : null}
      </div>
      {open ? formEl : null}
      {showList && list.length > 0 ? (
        <ul className="device-notes-list">
          {list.map((n) => (
            <li key={n.id}>
              <strong>{formatMaintenanceDateFi(n.entry_date)}</strong>
              {n.is_service_visit ? <span className="device-notes-badge">Huoltokäynti</span> : null}
              <span className="device-notes-text">{n.text}</span>
              <span className="muted">{noteByline(n)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
