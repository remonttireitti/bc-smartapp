import { FormEvent, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ROLE_LABELS } from '../lib/management';
import type { Profile } from '../types';

type Context = { profile: Profile; session: Session; reloadProfile: () => void };

export default function ProfileSettingsPage() {
  const { profile, session, reloadProfile } = useOutletContext<Context>();
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [tukesNumber, setTukesNumber] = useState(profile.tukes_number ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(profile.display_name ?? '');
  }, [profile.display_name]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const trimmed = displayName.trim();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        display_name: trimmed || null,
        tukes_number: tukesNumber.trim() || null,
      })
      .eq('id', profile.id);

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    reloadProfile();
    setMessage('Profiili päivitetty.');
  }

  return (
    <section className="panel form-grid">
      <h2>Omat tiedot</h2>
      <p className="muted">
        Nimi ja TUKES-numero täyttyvät automaattisesti huoltopöytäkirjaan raportin laatijana. Sähköpostia ja roolia voi
        muuttaa vain ylläpitäjä.
      </p>

      <form onSubmit={(e) => void saveProfile(e)}>
        <div className="line-form-grid">
          <label>
            Nimi
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={session.user.email?.split('@')[0] ?? 'Nimi'}
              autoComplete="name"
            />
          </label>
          <label>
            TUKES-numero
            <input
              value={tukesNumber}
              onChange={(e) => setTukesNumber(e.target.value)}
              placeholder="esim. 12345"
              autoComplete="off"
            />
          </label>
          <label>
            Sähköposti
            <input value={profile.email ?? session.user.email ?? ''} readOnly disabled />
          </label>
          <label>
            Yritys
            <input value={profile.companies?.name ?? '—'} readOnly disabled />
          </label>
          <label>
            Rooli
            <input value={ROLE_LABELS[profile.role] ?? profile.role} readOnly disabled />
          </label>
        </div>

        {error && <p className="error">{error}</p>}
        {message && <p className="muted">{message}</p>}

        <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: '1rem' }}>
          {busy ? 'Tallennetaan…' : 'Tallenna'}
        </button>
      </form>
    </section>
  );
}
