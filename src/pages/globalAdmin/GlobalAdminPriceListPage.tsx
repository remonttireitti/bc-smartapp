import { useEffect, useMemo, useState } from 'react';
import DataTable, { type DataTableColumn } from '../../components/DataTable';
import { DescriptionWithNote } from '../../components/ModuleDescription';
import { formatEur, grossOf, parsePriceList, type PriceList } from '../../lib/companySignup';
import { PRICE_GROUPS, PRICE_ROWS, applyDraft, eurInput, parseEurInput, savePriceList, type PriceRow } from '../../lib/priceListAdmin';
import { supabase } from '../../lib/supabase';

/** Palvelun hallinta → Hinnasto: kaikki tilaushinnat yhdessä paikassa. */
export default function GlobalAdminPriceListPage() {
  const [stored, setStored] = useState<PriceList | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [trialDraft, setTrialDraft] = useState('30');
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

  const dirty = useMemo(
    () => !!stored && (PRICE_ROWS.some((r) => (!r.available || r.available(stored)) && parseEurInput(draft[r.key] ?? '') !== r.get(stored)) || trialDraft !== String(stored.trial_days)),
    [stored, draft, trialDraft],
  );

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
    {
      key: 'description',
      label: 'Kuvaus',
      value: (r) => r.description,
      render: (r) => <DescriptionWithNote description={r.description} note={r.note} />,
      className: 'muted price-row-desc',
    },
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

  return (
    <div className="price-list-page">
      {PRICE_GROUPS.map((g) => (
        <section key={g.key} className="panel form-section">
          <h2>{g.title}</h2>
          {g.note && <p className="muted">{g.note}</p>}
          <DataTable
            rows={PRICE_ROWS.filter((r) => r.group === g.key && (!r.available || r.available(stored)))}
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

    </div>
  );
}
