import CheckToggle from '../CheckToggle';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  VRF_ALARM_DEFAULT_EMAIL,
  buildVrfAlarmRecipientSettings,
  effectiveVrfAlarmRecipients,
  isValidVrfEmail,
  normalizeVrfEmail,
  type VrfAlarmRecipient,
} from '../../lib/vrfAlarmRecipients';
import './vrfRecipients.css';

type Props = {
  deviceId: string;
  settings: unknown;
  onDelayS: number;
  offDelayS: number;
  readOnly?: boolean;
  onSaved?: () => void | Promise<void>;
};

function sameList(a: VrfAlarmRecipient[], b: VrfAlarmRecipient[]) {
  return JSON.stringify(a.map((r) => [r.email, r.deviation])) === JSON.stringify(b.map((r) => [r.email, r.deviation]));
}

/** Hälytyssähköpostien vastaanottajat — lisää / poista / hälytys päälle-pois, tallennus pilveen. */
export default function VrfAlarmRecipientsCard({ deviceId, settings, onDelayS, offDelayS, readOnly, onSaved }: Props) {
  const saved = effectiveVrfAlarmRecipients(settings);
  const [list, setList] = useState<VrfAlarmRecipient[]>(saved);
  const [dirty, setDirty] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const savedKey = JSON.stringify(saved);

  useEffect(() => {
    if (!dirty) setList(JSON.parse(savedKey) as VrfAlarmRecipient[]);
  }, [savedKey, dirty]);

  const update = (next: VrfAlarmRecipient[]) => {
    setList(next);
    setDirty(true);
    setMsg(null);
  };

  const add = () => {
    const email = normalizeVrfEmail(newEmail);
    if (!isValidVrfEmail(email)) {
      setMsg({ ok: false, text: 'Tarkista sähköpostiosoite.' });
      return;
    }
    if (list.some((r) => r.email === email)) {
      setMsg({ ok: false, text: 'Osoite on jo listalla.' });
      return;
    }
    update([...list, { email, deviation: true }]);
    setNewEmail('');
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    // Tuoreet asetukset ensin: laite/pilvi päivittää samaa riviä (hälytystila), ei ylikirjoiteta sitä.
    const { data, error } = await supabase.from('vrf_devices').select('settings').eq('id', deviceId).maybeSingle();
    if (error || !data) {
      setBusy(false);
      setMsg({ ok: false, text: error?.message ?? 'Laitetta ei löytynyt.' });
      return;
    }
    const next = buildVrfAlarmRecipientSettings((data as { settings: unknown }).settings, list);
    const { error: upErr } = await supabase
      .from('vrf_devices')
      .update({ settings: next, settings_updated_at: new Date().toISOString() })
      .eq('id', deviceId);
    setBusy(false);
    if (upErr) {
      setMsg({ ok: false, text: upErr.message });
      return;
    }
    setDirty(false);
    setMsg({ ok: true, text: 'Vastaanottajat tallennettu.' });
    await onSaved?.();
  };

  const activeCount = list.filter((r) => r.deviation).length;

  return (
    <fieldset className="vrf-settings-fieldset">
      <legend>Hälytyssähköpostit</legend>
      <p className="muted vrf-settings-fieldset-lead">
        Lähtee pilvestä, kun DI3-hälytys on ollut päällä {onDelayS} s. Poistumisviesti {offDelayS} s hälytyksen
        jälkeen.
      </p>
      <ul className="vrf-recipient-list">
        {list.map((r, i) => (
          <li key={r.email}>
            <label className="vrf-recipient-toggle">
              <CheckToggle
                checked={r.deviation}
                disabled={readOnly || busy}
                onChange={(e) => update(list.map((x, j) => (j === i ? { ...x, deviation: e.target.checked } : x)))}
              />
              <span>{r.email}</span>
              {!r.deviation && <span className="muted"> (ei hälytyksiä)</span>}
            </label>
            {!readOnly && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                aria-label={`Poista ${r.email}`}
                onClick={() => update(list.filter((_, j) => j !== i))}
              >
                Poista
              </button>
            )}
          </li>
        ))}
      </ul>
      {activeCount === 0 && (
        <p className="muted">Ei vastaanottajia — hälytys lähtee oletusosoitteeseen {VRF_ALARM_DEFAULT_EMAIL}.</p>
      )}
      {!readOnly && (
        <div className="vrf-recipient-add">
          <input
            type="email"
            inputMode="email"
            placeholder="nimi@yritys.fi"
            value={newEmail}
            disabled={busy}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !newEmail.trim()} onClick={add}>
            Lisää
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !dirty || sameList(list, saved)}
            onClick={() => void save()}
          >
            {busy ? 'Tallennetaan…' : 'Tallenna vastaanottajat'}
          </button>
        </div>
      )}
      {msg && <p className={msg.ok ? 'form-success' : 'form-error'}>{msg.text}</p>}
    </fieldset>
  );
}
