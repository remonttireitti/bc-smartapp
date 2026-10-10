import { useEffect, useState } from 'react';
import { formatEuro } from '../lib/workReportBilling';
import { unpricedRowsLabel, type UnpricedQuoteRow } from '../lib/quoteSeededRows';

type Props = {
  rows: UnpricedQuoteRow[];
  readOnly?: boolean;
  /** Tallentaa rivin toteutuneen hinnan (yhteensä, alv 0 %) päiväkirjan kuluriville. Palauttaa virheen tai null. */
  onPrice?: (row: UnpricedQuoteRow, totalNet: number) => Promise<string | null>;
};

/** "12,50" / "12.5" / "1 200" → 12.5; tyhjä tai virheellinen → null. */
export function parsePriceInput(value: string): number | null {
  const cleaned = value.replace(/\s|€/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export default function UnpricedQuoteRowsTable({ rows, readOnly = false, onPrice }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(null), 4000);
    return () => window.clearTimeout(t);
  }, [saved]);

  async function commit(row: UnpricedQuoteRow) {
    const raw = drafts[row.key] ?? '';
    const total = parsePriceInput(raw);
    if (total == null || !onPrice || busyKey) return;
    setBusyKey(row.key);
    setError(null);
    const err = await onPrice(row, total);
    setBusyKey(null);
    if (err) {
      setError(err);
      return;
    }
    setDrafts((d) => {
      const next = { ...d };
      delete next[row.key];
      return next;
    });
    setSaved(`${row.description} ${formatEuro(total)}`);
  }

  const tick = saved ? <span className="billing-unpriced-saved">✓ tallennettu: {saved}</span> : null;
  if (rows.length === 0) return tick ? <p className="billing-unpriced-rows">{tick}</p> : null;
  const quoteTotal = rows.reduce((sum, row) => sum + (row.quoteNet ?? 0), 0);
  const canEdit = !readOnly && !!onPrice;

  return (
    <div className="billing-unpriced-rows">
      <h4 className="billing-unpriced-rows-title">
        {unpricedRowsLabel(rows.length)} — tarjouspyynnöstä {tick}
      </h4>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="table-wrap">
        <table className="billing-table billing-unpriced-rows-table">
          <thead>
            <tr>
              <th>Päivä</th>
              <th>Kuvaus</th>
              <th className="num">Määrä</th>
              <th className="num">Tarjouspyyntö €</th>
              <th className="num">Toteutunut € (yht.)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.logDate ?? '—'}</td>
                <td>{row.description}</td>
                <td className="num">{row.qty.toLocaleString('fi-FI', { maximumFractionDigits: 2 })}</td>
                <td className="num muted">{row.quoteNet != null ? formatEuro(row.quoteNet) : '—'}</td>
                <td className="num">
                  {canEdit && row.lineId ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      className="billing-unpriced-input"
                      aria-label={`Toteutunut hinta: ${row.description}`}
                      placeholder="hinta puuttuu"
                      value={drafts[row.key] ?? ''}
                      disabled={busyKey === row.key}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))}
                      onBlur={() => void commit(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void commit(row);
                        }
                      }}
                    />
                  ) : (
                    <span className="quote-outcome-unpriced">hinta puuttuu</span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="quote-outcome-subtotal">
              <td colSpan={3}>Yhteensä</td>
              <td className="num">{formatEuro(quoteTotal)}</td>
              <td className="num">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
