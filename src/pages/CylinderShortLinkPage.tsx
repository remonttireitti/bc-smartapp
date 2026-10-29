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
  const valid = /^[0-9a-f]{8}$/i.test(code);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    const range = cylinderShortCodeRange(code);
    void supabase
      .from('refrigerant_cylinders')
      .select('id, serial_number, notes')
      .gte('id', range.from)
      .lte('id', range.to)
      .limit(10)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setHits((data ?? []) as Hit[]);
      });
    return () => {
      cancelled = true;
    };
  }, [code, valid]);

  if (hits?.length === 1) {
    return <Navigate to={`/varasto?cylinder=${encodeURIComponent(hits[0].id)}&k=${stamp}`} replace />;
  }

  return (
    <div className="panel" data-testid="cylinder-short-link">
      <h1>Pullo</h1>
      {!valid || (hits && hits.length === 0) ? <p>Pulloa ei löytynyt tai ei oikeuksia.</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {hits === null && valid && !error ? <p className="muted">Haetaan…</p> : null}
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
