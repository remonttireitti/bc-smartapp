import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  quickSearchEntityLabel,
  quickSearchHitPath,
  type QuickSearchHit,
} from '../lib/quickSearch';
import { supabase } from '../lib/supabase';

type Props = {
  placeholder?: string;
  resultLimit?: number;
  minChars?: number;
};

export default function QuickSearch({
  placeholder = 'Esim. laitetagi, asiakas, osoite…',
  resultLimit = 24,
  minChars = 2,
}: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<QuickSearchHit[]>([]);
  const [hitsFor, setHitsFor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < minChars) {
      setHits([]);
      setHitsFor('');
      setError(null);
      return;
    }

    const normalized = trimmed.toLowerCase();
    setLoading(true);
    const timer = window.setTimeout(() => {
      void supabase
        .rpc('company_search', { query: trimmed, result_limit: resultLimit })
        .then(({ data, error: rpcError }) => {
          if (rpcError) {
            setError(rpcError.message);
            setHits([]);
            setHitsFor('');
            setLoading(false);
            return;
          }
          setHits((data as QuickSearchHit[]) ?? []);
          setHitsFor(normalized);
          setError(null);
          setLoading(false);
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, minChars, resultLimit]);

  const showResults = query.trim().length >= minChars && hitsFor === query.trim().toLowerCase();

  return (
    <div className="quick-search">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label="Pikahaku"
      />

      {loading && showResults && <p className="muted quick-search-status">Haetaan…</p>}
      {error && <p className="error quick-search-status">{error}</p>}

      {showResults && !loading && hits.length === 0 && !error && (
        <p className="muted quick-search-status">Ei tuloksia haulle “{query.trim()}”.</p>
      )}

      {showResults && hits.length > 0 && (
        <ul className="quick-search-results">
          {hits.map((hit) => {
            const path = quickSearchHitPath(hit);
            const label = quickSearchEntityLabel(hit.entity_type);
            return (
              <li key={`${hit.entity_type}-${hit.entity_id}`}>
                {path ? (
                  <Link to={path} className="report-link">
                    <div className="report-link-body">
                      <strong>{hit.title}</strong>
                      <span className="muted">
                        {label}
                        {hit.subtitle ? ` • ${hit.subtitle}` : ''}
                      </span>
                    </div>
                  </Link>
                ) : (
                  <div className="report-link-body quick-search-unlinked">
                    <strong>{hit.title}</strong>
                    <span className="muted">
                      {label}
                      {hit.subtitle ? ` • ${hit.subtitle}` : ''}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
