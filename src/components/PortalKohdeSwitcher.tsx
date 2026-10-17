import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/** Tilaajaportaali: vaihda kohteen (oman asiakkaan) portaaliin. Vain tilaajan omat kohteet. */
export default function PortalKohdeSwitcher({ subscriberId }: { subscriberId: string }) {
  const [rows, setRows] = useState<{ id: string; name: string }[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let alive = true;
    void supabase
      .from('customers')
      .select('id, name')
      .eq('subscriber_id', subscriberId)
      .order('name')
      .then(({ data }) => { if (alive) setRows((data as { id: string; name: string }[]) ?? []); });
    return () => { alive = false; };
  }, [subscriberId]);

  const m = location.pathname.match(/^\/asiakkaat\/([0-9a-f-]{36})/);
  const current = m && rows.some((r) => r.id === m[1]) ? m[1] : '';
  if (rows.length === 0) return null;
  return (
    <label className="portal-kohde-switcher">
      <span>Kohde</span>
      <select
        value={current}
        onChange={(e) => navigate(e.target.value ? `/asiakkaat/${e.target.value}` : '/tyoraportit')}
      >
        <option value="">Kaikki kohteet</option>
        {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </label>
  );
}
