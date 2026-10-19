import { useEffect, useState } from 'react';
import ToggleSwitch from './ToggleSwitch';
import { supabase } from '../lib/supabase';

type Candidate = { kind: 'user' | 'partner'; target_id: string; label: string; selected: boolean };
type RawCandidate = Partial<Candidate> & { user_id?: string; display_name?: string | null; email?: string | null };

function normalize(r: RawCandidate): Candidate {
  // Yhteensopiva myös vanhan funktion (vain henkilöt) kanssa.
  return {
    kind: r.kind === 'partner' ? 'partner' : 'user',
    target_id: String(r.target_id ?? r.user_id ?? ''),
    label: String(r.label ?? r.display_name ?? r.email ?? '—'),
    selected: r.selected === true,
  };
}

/** Kenelle asiakas voi lähettää työtilauksia: oma henkilöstö tai kumppaniyritys. Ei valintoja = yritykselle. */
export default function PortalOrderRecipients({ customerId, subscriberId }: { customerId?: string; subscriberId?: string }) {
  const ownerCol = subscriberId ? 'subscriber_id' : 'customer_id';
  const ownerId = (subscriberId ?? customerId) as string;
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    // Tilaajatason vastaanottajat vaativat SQL:n (subscriber_portal_recipients.sql); ennen sitä osio piilossa.
    const { data, error: e } = subscriberId
      ? await supabase.rpc('portal_order_recipient_candidates_subscriber', { p_subscriber_id: subscriberId })
      : await supabase.rpc('portal_order_recipient_candidates', { p_customer_id: customerId });
    setRows(e ? null : ((data as RawCandidate[]) ?? []).map(normalize));
  }

  useEffect(() => {
    void load();
  }, [ownerId]);

  async function toggle(row: Candidate, on: boolean) {
    setError(null);
    setRows((prev) => prev?.map((r) => (r.kind === row.kind && r.target_id === row.target_id ? { ...r, selected: on } : r)) ?? prev);
    const col = row.kind === 'partner' ? 'partner_company_id' : 'user_id';
    const res = on
      ? await supabase.from('portal_order_recipients').insert({ [ownerCol]: ownerId, [col]: row.target_id } as Record<string, string> as never)
      : await supabase.from('portal_order_recipients').delete().eq(ownerCol, ownerId).eq(col, row.target_id);
    if (res.error) {
      setError('Tallennus epäonnistui.');
      void load();
    }
  }

  if (!rows || rows.length === 0) return null;
  const none = rows.every((r) => !r.selected);
  const users = rows.filter((r) => r.kind === 'user');
  const partners = rows.filter((r) => r.kind === 'partner');
  const item = (r: Candidate) => (
    <ToggleSwitch key={`${r.kind}:${r.target_id}`} checked={r.selected} onChange={(on) => void toggle(r, on)} label={r.label} />
  );
  return (
    <div className="portal-order-recipients">
      <h3>Työtilausten vastaanottaja</h3>
      <p className="muted">{none ? 'Tilaukset menevät yritykselle.' : 'Tilaus menee ensimmäiseksi valitulle.'}</p>
      {error && <p className="error">{error}</p>}
      {users.length > 0 ? <span className="portal-order-recipients-group">Henkilöt</span> : null}
      {users.map(item)}
      {partners.length > 0 ? <span className="portal-order-recipients-group">Kumppanit</span> : null}
      {partners.map(item)}
    </div>
  );
}
