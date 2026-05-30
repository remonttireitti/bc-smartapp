import { FormEvent, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import {
  addCustomTripDestination,
  deleteCustomTripDestination,
  loadTripDestinations,
  type TripDestination,
} from '../lib/tripDestinations';

type Props = {
  companyId: string;
};

export default function TripDestinationsSettingsSection({ companyId }: Props) {
  const [destinations, setDestinations] = useState<TripDestination[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const rows = await loadTripDestinations(supabase, companyId);
      setDestinations(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kohteiden lataus epäonnistui.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (companyId) void reload();
  }, [companyId]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !address.trim()) {
      setError('Anna kohteen nimi ja osoite.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await addCustomTripDestination(supabase, companyId, name, address);
      setName('');
      setAddress('');
      await reload();
      setMessage('Kohde lisätty.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kohteen lisäys epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await deleteCustomTripDestination(supabase, id);
      await reload();
      setMessage('Kohde poistettu.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kohteen poisto epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  const suppliers = destinations.filter((row) => row.category === 'supplier');
  const custom = destinations.filter((row) => row.category === 'custom');

  return (
    <section className="form-section">
      <h2>Ajomatkojen kohderekisteri</h2>
      <p className="muted">
        Tukkurien oletuskohteet lisätään automaattisesti. Voit lisätä omia toistuvia kohteita (esim. varastot tai
        toimipisteet). Asiakkaat haetaan työkirjauksessa asiakasrekisteristä.
      </p>

      {loading ? (
        <p className="muted">Ladataan kohteita…</p>
      ) : (
        <>
          {suppliers.length > 0 && (
            <div className="trip-destinations-group">
              <h3>Tukkurit</h3>
              <ul className="trip-destinations-list">
                {suppliers.map((row) => (
                  <li key={row.id}>
                    <strong>{row.name}</strong>
                    <span className="muted">{row.address}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="trip-destinations-group">
            <h3>Omat kohteet</h3>
            {custom.length === 0 ? (
              <p className="muted">Ei omia kohteita.</p>
            ) : (
              <ul className="trip-destinations-list">
                {custom.map((row) => (
                  <li key={row.id}>
                    <div>
                      <strong>{row.name}</strong>
                      <span className="muted">{row.address}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => void onDelete(row.id)}
                    >
                      Poista
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <form className="trip-destination-add-form" onSubmit={(e) => void onAdd(e)}>
        <div className="line-form-grid">
          <label>
            Nimi
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Esim. Varaasto" />
          </label>
          <label>
            Osoite
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Katu, postinumero kaupunki"
            />
          </label>
        </div>
        <button type="submit" className="btn btn-secondary" disabled={busy || loading}>
          {busy ? 'Tallennetaan…' : 'Lisää kohde'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}
    </section>
  );
}
