import { useEffect, useMemo, useState } from 'react';
import DataTable, { type DataTableColumn } from '../../components/DataTable';
import PriceEstimateTable from '../../components/PriceEstimateTable';
import {
  ADDON_MODULES,
  ADDON_MODULE_LABELS,
  HUOLTO_KEYS,
  HUOLTO_LABELS,
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  estimateMonthly,
  formatEur,
  grossOf,
  parsePriceList,
  type AddonModuleKey,
  type HuoltoCategoryKey,
  type PriceList,
  type StaffRole,
} from '../../lib/companySignup';
import { PRICE_GROUPS, PRICE_ROWS, applyDraft, eurInput, parseEurInput, savePriceList, type PriceRow } from '../../lib/priceListAdmin';
import { supabase } from '../../lib/supabase';

type Example = {
  modules: Record<AddonModuleKey, boolean>;
  huolto: Record<HuoltoCategoryKey, boolean>;
  users: Record<StaffRole, number>;
  devices: number;
};

const START_EXAMPLE: Example = {
  modules: { quotes: false, billing: true, remote_monitoring: false, tools: false, partners: false },
  huolto: { kylma: true, lvi: false, iv: false, sahko: false },
  users: { admin: 1, manager: 0, technician: 2 },
  devices: 0,
};

/** Palvelun hallinta → Hinnasto: kaikki tilaushinnat yhdessä paikassa. */
export default function GlobalAdminPriceListPage() {
  const [stored, setStored] = useState<PriceList | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [trialDraft, setTrialDraft] = useState('30');
  const [example, setExample] = useState<Example>(START_EXAMPLE);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error: e } = await supabase.from('license_catalog').select('*').eq('id', 1).maybeSingle();
    if (e) {
      setError(e.message);
      return;
    }
    const p = parsePriceList(data);
    setStored(p);
    setDraft(Object.fromEntries(PRICE_ROWS.map((r) => [r.key, eurInput(r.get(p))])));
    setTrialDraft(String(p.trial_days));
  }

  useEffect(() => {
    void load();
  }, []);

  // Luonnoshinnat (virheellinen kenttä → tallennettu arvo esimerkissä).
  const livePrices = useMemo(() => {
    if (!stored) return null;
    let p = stored;
    for (const r of PRICE_ROWS) {
      const v = parseEurInput(draft[r.key] ?? '');
      if (v !== null) p = r.set(p, v);
    }
    return p;
  }, [stored, draft]);

  const dirty = useMemo(
    () => !!stored && (PRICE_ROWS.some((r) => parseEurInput(draft[r.key] ?? '') !== r.get(stored)) || trialDraft !== String(stored.trial_days)),
    [stored, draft, trialDraft],
  );

  const exampleEstimate = useMemo(() => {
    if (!livePrices) return null;
    const users: { roles: StaffRole[] }[] = [];
    for (const r of STAFF_ROLES) for (let i = 0; i < example.users[r]; i += 1) users.push({ roles: [r] });
    return estimateMonthly(
      { base: true, modules: example.modules, huolto: example.huolto, users, devices: { default: example.devices } },
      livePrices,
    );
  }, [livePrices, example]);

  async function save() {
    if (!stored) return;
    setError(null);
    setMessage(null);
    const res = applyDraft(stored, draft, trialDraft);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    setBusy(true);
    try {
      await savePriceList(supabase, res.prices);
      setMessage('Hinnasto tallennettu.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tallennus epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  const columns: DataTableColumn<PriceRow>[] = [
    { key: 'label', label: 'Nimi', value: (r) => r.label },
    { key: 'description', label: 'Kuvaus', value: (r) => r.description, className: 'muted' },
    {
      key: 'net',
      label: '€/kk alv 0 %',
      value: (r) => parseEurInput(draft[r.key] ?? '') ?? '',
      render: (r) => {
        const invalid = parseEurInput(draft[r.key] ?? '') === null;
        return (
          <input
            className={invalid ? 'price-input invalid' : 'price-input'}
            inputMode="decimal"
            aria-label={`${r.label} €/kk alv 0 %`}
            value={draft[r.key] ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.value }))}
          />
        );
      },
    },
    {
      key: 'gross',
      label: 'Sis. alv 25,5 %',
      value: (r) => parseEurInput(draft[r.key] ?? '') ?? '',
      render: (r) => {
        const v = parseEurInput(draft[r.key] ?? '');
        return v === null ? '–' : formatEur(grossOf(v));
      },
      className: 'num',
    },
  ];

  if (!stored) return error ? <p className="error">{error}</p> : <p className="muted">Ladataan…</p>;

  const toggle = <K extends 'modules' | 'huolto'>(group: K, key: keyof Example[K]) =>
    setExample((x) => ({ ...x, [group]: { ...x[group], [key]: !(x[group] as Record<string, boolean>)[key as string] } }));

  return (
    <div className="price-list-page">
      {PRICE_GROUPS.map((g) => (
        <section key={g.key} className="panel form-section">
          <h2>{g.title}</h2>
          {g.note && <p className="muted">{g.note}</p>}
          <DataTable
            rows={PRICE_ROWS.filter((r) => r.group === g.key)}
            columns={columns}
            rowKey={(r) => r.key}
            hideFilter
            ariaLabel={g.title}
          />
          {g.key === 'perus' && (
            <label className="price-trial">
              Kokeilujakso (pv)
              <input
                inputMode="numeric"
                value={trialDraft}
                onChange={(e) => setTrialDraft(e.target.value.replace(/\D/g, ''))}
              />
            </label>
          )}
        </section>
      ))}

      <div className="form-actions price-list-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? 'Tallennetaan…' : 'Tallenna'}
        </button>
        {message && <span className="success">{message}</span>}
        {error && <span className="error">{error}</span>}
      </div>

      <section className="panel form-section price-example">
        <h2>Esimerkkilaskelma</h2>
        <div className="price-example-grid">
          <fieldset>
            <legend>Moduulit</legend>
            {ADDON_MODULES.map((k) => (
              <label key={k}>
                <input type="checkbox" checked={example.modules[k]} onChange={() => toggle('modules', k)} /> {ADDON_MODULE_LABELS[k]}
              </label>
            ))}
            {example.modules.remote_monitoring && (
              <label>
                Laitteita{' '}
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={example.devices}
                  onChange={(e) => setExample((x) => ({ ...x, devices: Math.max(0, Number(e.target.value) || 0) }))}
                />
              </label>
            )}
          </fieldset>
          <fieldset>
            <legend>Huoltoraportit</legend>
            {HUOLTO_KEYS.map((k) => (
              <label key={k}>
                <input type="checkbox" checked={example.huolto[k]} onChange={() => toggle('huolto', k)} /> {HUOLTO_LABELS[k]}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Käyttäjät</legend>
            {STAFF_ROLES.map((r) => (
              <label key={r}>
                {STAFF_ROLE_LABELS[r]}{' '}
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={example.users[r]}
                  onChange={(e) =>
                    setExample((x) => ({ ...x, users: { ...x.users, [r]: Math.max(0, Number(e.target.value) || 0) } }))
                  }
                />
              </label>
            ))}
          </fieldset>
        </div>
        {exampleEstimate && <PriceEstimateTable estimate={exampleEstimate} title="Esimerkkiyritys / kk" />}
      </section>
    </div>
  );
}
