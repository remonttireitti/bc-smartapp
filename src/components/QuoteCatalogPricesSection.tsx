import { useState } from 'react';
import { QUOTE_TYPE_LABELS } from '../lib/quoteRequest/constants';
import { TRADE_CATALOG, TRADE_QUOTE_TYPES, type TradeCatalogPrices } from '../lib/quoteRequest/tradeCatalog';

type Props = {
  prices: TradeCatalogPrices;
  onChange: (next: TradeCatalogPrices) => void;
};

function fmt(n: number | undefined): string {
  return n != null && n > 0 ? String(n).replace('.', ',') : '';
}

function parse(raw: string): number | null {
  const s = raw.trim().replace(/\s|€/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Yritystiedot → Huoltohinnasto: LVI/IV/sähkö-tarjousten tyyppirivien omat hinnat (alv 0 %). */
export default function QuoteCatalogPricesSection({ prices, onChange }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function setPrice(key: string, raw: string) {
    setDrafts((d) => ({ ...d, [key]: raw }));
    const next = { ...prices };
    const n = parse(raw);
    if (n == null) delete next[key];
    else next[key] = n;
    onChange(next);
  }

  return (
    <section className="form-section" id="tarjoushinnasto">
      <h2>Tarjousrivien hinnat</h2>
      <p className="muted">LVI-, IV- ja sähkötarjousten rivit. Tyhjä = hinta puuttuu tarjouksella.</p>
      {TRADE_QUOTE_TYPES.map((type) => {
        const priced = TRADE_CATALOG[type].flatMap((g) => g.items).filter((i) => prices[i.key] > 0).length;
        return (
          <details key={type} className="quote-catalog-prices">
            <summary>
              <strong>{QUOTE_TYPE_LABELS[type]}</strong>
              <span className="muted"> · {priced} hinnoiteltu</span>
            </summary>
            <div className="huolto-settings-table-wrap">
              <table className="huolto-settings-table quote-catalog-price-table">
                <thead>
                  <tr>
                    <th>Rivi</th>
                    <th>Yksikkö</th>
                    <th className="num">€ / yks. (alv 0 %)</th>
                  </tr>
                </thead>
                <tbody>
                  {TRADE_CATALOG[type].map((group) =>
                    group.items.map((item, index) => (
                      <tr key={item.key}>
                        <td>
                          {index === 0 ? <small className="muted">{group.title} · </small> : null}
                          {item.name}
                        </td>
                        <td>{item.unit}</td>
                        <td className="num">
                          <input
                            inputMode="decimal"
                            aria-label={`${item.name} hinta`}
                            value={drafts[item.key] ?? fmt(prices[item.key])}
                            onChange={(e) => setPrice(item.key, e.target.value)}
                            onBlur={() => setDrafts((d) => {
                              const next = { ...d };
                              delete next[item.key];
                              return next;
                            })}
                          />
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </section>
  );
}
