import { useEffect, useState } from 'react';
import {
  ADDON_MODULE_LABELS,
  HUOLTO_KEYS,
  HUOLTO_LABELS,
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  parsePriceList,
  type PriceList,
} from '../lib/companySignup';
import { supabase } from '../lib/supabase';

type Row = { key: string; group: string; label: string; get: (p: PriceList) => number; set: (p: PriceList, v: number) => PriceList };

/** Peruspaketti ja vanhat moduulit hinnoitellaan yllä olevassa lomakkeessa; tässä vain uudet hinnat. */
const ROWS: Row[] = [
  {
    key: 'm:partners', group: 'Moduuli', label: ADDON_MODULE_LABELS.partners,
    get: (p) => p.module_prices.partners, set: (p, v) => ({ ...p, module_prices: { ...p.module_prices, partners: v } }),
  },
  ...HUOLTO_KEYS.map<Row>((k) => ({
    key: `h:${k}`, group: 'Huolto', label: HUOLTO_LABELS[k],
    get: (p) => p.huolto_prices[k], set: (p, v) => ({ ...p, huolto_prices: { ...p.huolto_prices, [k]: v } }),
  })),
  ...STAFF_ROLES.map<Row>((k) => ({
    key: `r:${k}`, group: 'Käyttäjä', label: STAFF_ROLE_LABELS[k],
    get: (p) => p.role_prices[k], set: (p, v) => ({ ...p, role_prices: { ...p.role_prices, [k]: v } }),
  })),
];

function parseEur(raw: string): number | null {
  const n = Number(raw.replace(',', '.').trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** Globaali admin: tilaushinnasto €/kk alv 0 %. */
export default function SubscriptionPriceEditor() {
  const [prices, setPrices] = useState<PriceList | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('license_catalog').select('*').eq('id', 1).maybeSingle();
    const p = parsePriceList(data);
    setPrices(p);
    setDraft(Object.fromEntries(ROWS.map((r) => [r.key, String(r.get(p)).replace('.', ',')])));
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!prices) return;
    setError(null);
    setMsg(null);
    let next = prices;
    for (const r of ROWS) {
      const v = parseEur(draft[r.key] ?? '');
      if (v === null) {
        setError(`Tarkista hinta: ${r.label}`);
        return;
      }
      next = r.set(next, v);
    }
    setBusy(true);
    const { error: saveError } = await supabase.rpc('global_admin_update_subscription_prices', {
      p_base_monthly_eur: null,
      p_module_prices: { partners: next.module_prices.partners },
      p_huolto_prices: next.huolto_prices,
      p_role_prices: next.role_prices,
    });
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setMsg('Tallennettu');
    await load();
  }

  if (!prices) return null;
  return (
    <div className="price-editor">
      <table className="price-editor-table">
        <thead>
          <tr>
            <th>Ryhmä</th>
            <th>Hinta</th>
            <th className="num">€/kk alv 0 %</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.key}>
              <td className="muted">{r.group}</td>
              <td>{r.label}</td>
              <td className="num">
                <input
                  inputMode="decimal"
                  value={draft[r.key] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                  aria-label={`${r.label} €/kk`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Usean roolin käyttäjä maksaa kerran, kalleimman roolinsa hinnan.</p>
      {error && <p className="error">{error}</p>}
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>
        {busy ? 'Tallennetaan…' : 'Tallenna hinnasto'}
      </button>
      {msg && <span className="muted"> {msg}</span>}
    </div>
  );
}
