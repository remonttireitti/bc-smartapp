import { useEffect, useState } from 'react';
import ToggleSwitch from './ToggleSwitch';
import { supabase } from '../lib/supabase';

type Candidate = { user_id: string; display_name: string | null; email: string | null; selected: boolean };

/** Kenelle asiakas voi lähettää työtilauksia. Ei valintoja = yritykselle. */
export default function PortalOrderRecipients({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error: e } = await supabase.rpc('portal_order_recipient_candidates', { p_customer_id: customerId });
    // Ennen SQL-päivitystä funktiota ei ole: osio piilossa.
    setRows(e ? null : ((data as Candidate[]) ?? []));
  }

  useEffect(() => {
    void load();
  }, [customerId]);

  async function toggle(row: Candidate, on: boolean) {
    setError(null);
    setRows((prev) => prev?.map((r) => (r.user_id === row.user_id ? { ...r, selected: on } : r)) ?? prev);
    const res = on
      ? await supabase.from('portal_order_recipients').insert({ customer_id: customerId, user_id: row.user_id })
      : await supabase.from('portal_order_recipients').delete().eq('customer_id', customerId).eq('user_id', row.user_id);
    if (res.error) {
      setError('Tallennus epäonnistui.');
      void load();
    }
  }

  if (!rows || rows.length === 0) return null;
  const none = rows.every((r) => !r.selected);
  return (
    <div className="portal-order-recipients">
      <h3>Työtilausten vastaanottaja</h3>
      <p className="muted">{none ? 'Tilaukset menevät yritykselle.' : 'Tilaus kohdistetaan ensimmäiseksi valittuun.'}</p>
      {error && <p className="error">{error}</p>}
      {rows.map((r) => (
        <ToggleSwitch
          key={r.user_id}
          checked={r.selected}
          onChange={(on) => void toggle(r, on)}
          label={r.display_name || r.email || '—'}
        />
      ))}
    </div>
  );
}
