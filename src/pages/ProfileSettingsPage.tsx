import { FormEvent, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ROLE_LABELS } from '../lib/management';
import type { ManagementOutletContext } from '../lib/managementOutletContext';

export default function ProfileSettingsPage() {
  const { profile, session, reloadProfile } = useOutletContext<ManagementOutletContext>();
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [tukesNumber, setTukesNumber] = useState(profile.tukes_number ?? '');
  const [homeAddress, setHomeAddress] = useState(profile.home_address ?? '');
  const [workplaceAddress, setWorkplaceAddress] = useState(profile.workplace_address ?? '');
  const [departureSource, setDepartureSource] = useState<'workplace' | 'home'>(
    profile.trip_departure_source === 'home' ? 'home' : 'workplace',
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(profile.display_name ?? '');
    setTukesNumber(profile.tukes_number ?? '');
    setHomeAddress(profile.home_address ?? '');
    setWorkplaceAddress(profile.workplace_address ?? '');
    setDepartureSource(profile.trip_departure_source === 'home' ? 'home' : 'workplace');
  }, [
    profile.display_name,
    profile.tukes_number,
    profile.home_address,
    profile.workplace_address,
    profile.trip_departure_source,
  ]);

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
        home_address: homeAddress.trim() || null,
        workplace_address: workplaceAddress.trim() || null,
        trip_departure_source: departureSource,
      })
      .eq('id', profile.id);

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await reloadProfile?.();
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

        <section className="form-section" style={{ marginTop: '1.25rem' }}>
          <h3>Ajomatkat</h3>
          <p className="muted">
            Uuden työkirjauksen oletuslähtö tulee valitusta osoitteesta. Jos osoite puuttuu, käytetään yrityksen toimiston
            osoitetta (Hallinta → Yritys).
          </p>
          <div className="line-form-grid">
            <label>
              Toimipisteen osoite
              <input
                value={workplaceAddress}
                onChange={(e) => setWorkplaceAddress(e.target.value)}
                placeholder="Esim. Työpajankatu 1, 00100 Helsinki"
                autoComplete="street-address"
              />
            </label>
            <label>
              Kotiosoite
              <input
                value={homeAddress}
                onChange={(e) => setHomeAddress(e.target.value)}
                placeholder="Esim. Kotikatu 2, 00200 Helsinki"
                autoComplete="street-address"
              />
            </label>
          </div>
          <fieldset className="trip-departure-source-fieldset">
            <legend>Oletuslähtö työkirjauksessa</legend>
            <label className="compact-option">
              <input
                type="radio"
                name="trip_departure_source"
                checked={departureSource === 'workplace'}
                onChange={() => setDepartureSource('workplace')}
              />
              Toimipiste
            </label>
            <label className="compact-option">
              <input
                type="radio"
                name="trip_departure_source"
                checked={departureSource === 'home'}
                onChange={() => setDepartureSource('home')}
              />
              Koti
            </label>
          </fieldset>
        </section>

        {error && <p className="error">{error}</p>}
        {message && <p className="muted">{message}</p>}

        <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: '1rem' }}>
          {busy ? 'Tallennetaan…' : 'Tallenna'}
        </button>
      </form>

      <p style={{ marginTop: '1.25rem' }}>
        <Link to="/vaihda-salasana">Vaihda salasana</Link>
      </p>
    </section>
  );
}
