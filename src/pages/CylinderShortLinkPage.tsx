import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { cylinderShortCodeRange } from '../lib/refrigerantCylinderCode';
import { formatBottleLabel } from '../lib/refrigerantBottle';
import { supabase } from '../lib/supabase';

type Hit = { id: string; serial_number: string | null; notes: string | null };

/** /p/<8 hex> → avaa pullon tiedot varastossa (vaatii kirjautumisen). */
export default function CylinderShortLinkPage() {
  const { code = '' } = useParams();
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Uniikki avain: varasto-näkymä avautuu tuoreena joka skannauksella (KeepAliveRoutes). */
  const stamp = useMemo(() => Date.now(), []);
  const [attempt, setAttempt] = useState(0);
  const valid = /^[0-9a-f]{8}$/i.test(code);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    setHits(null);
    setError(null);
    const range = cylinderShortCodeRange(code);
    const run = async () => {
      // Verkkovirhe → yksi uusintayritys ennen virheilmoitusta; "ei löytynyt" vain kun haku onnistui ja tulos on tyhjä.
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error: err } = await supabase
          .from('refrigerant_cylinders')
          .select('id, serial_number, notes')
          .gte('id', range.from)
          .lte('id', range.to)
          .limit(10);
        if (cancelled) return;
        if (!err) {
          setHits((data ?? []) as Hit[]);
          return;
        }
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1500));
        else setError(err.message);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [code, valid, attempt]);

  if (hits?.length === 1) {
    return <Navigate to={`/varasto?cylinder=${encodeURIComponent(hits[0].id)}&k=${stamp}`} replace />;
  }

  return (
    <div className="panel" data-testid="cylinder-short-link">
      <h1>Pullo</h1>
      {!valid || (hits && hits.length === 0) ? <p>Pulloa ei löytynyt tai ei oikeuksia.</p> : null}
      {error ? (
        <>
          <p className="error">Pullon haku epäonnistui.</p>
          <button type="button" className="btn btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            Yritä uudelleen
          </button>
        </>
      ) : null}
      {hits === null && valid && !error ? <p className="muted" data-testid="cylinder-short-loading">Ladataan…</p> : null}
      {hits && hits.length > 1 ? (
        <ul>
          {hits.map((hit) => (
            <li key={hit.id}>
              <Link to={`/varasto?cylinder=${encodeURIComponent(hit.id)}`}>{formatBottleLabel(hit)}</Link>
            </li>
          ))}
        </ul>
      ) : null}
      <p>
        <Link to="/varasto">Varasto</Link>
      </p>
    </div>
  );
}
