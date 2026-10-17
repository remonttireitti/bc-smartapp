import {
  BILLING_PERIODS,
  formatEur,
  periodPrice,
  type BillingPeriod,
  type PriceLine,
  type PriceList,
} from '../lib/companySignup';

type Props = {
  /** Kuukausirivit (alv 0 %). */
  lines: Pick<PriceLine, 'key' | 'label' | 'qty' | 'total'>[];
  /** Kuukausihinta alv 0 % ennen jakson alennusta. */
  monthlyNet: number;
  value: BillingPeriod;
  onChange?: (v: BillingPeriod) => void;
  prices: Pick<PriceList, 'billing_discounts'>;
  title?: string;
  disabled?: boolean;
};

const SHORT: Record<BillingPeriod, string> = { monthly: 'Kuukausi', semi_annual: '6 kk', annual: 'Vuosi' };
const pct = (n: number) => `${n.toLocaleString('fi-FI')} %`;

/** Kuukausihinta-kortti: jaksovalinta (yksi rivi), rivit, yhteensä ja jakson hinta. */
export default function BillingPeriodPicker({ lines, monthlyNet, value, onChange, prices, title = 'Kuukausihinta', disabled }: Props) {
  const p = periodPrice(monthlyNet, value, prices);
  const discount = value !== 'monthly' && p.discount_pct > 0;
  return (
    <section className="price-card">
      <div className="price-card-head">
        <h4>{title}</h4>
        {onChange && (
          <div className="seg" role="radiogroup" aria-label="Laskutusjakso">
            {BILLING_PERIODS.map((b) => {
              const d = b.value === 'monthly' ? 0 : prices.billing_discounts?.[b.value] ?? 0;
              return (
                <button
                  key={b.value}
                  type="button"
                  role="radio"
                  aria-checked={value === b.value}
                  disabled={disabled}
                  className={value === b.value ? 'is-on' : undefined}
                  onClick={() => onChange(b.value)}
                >
                  {SHORT[b.value]}
                  {d > 0 && <span className="seg-pct">·{pct(d)}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <dl className="price-card-lines">
        {lines.map((l) => (
          <div key={l.key}>
            <dt>{l.label}{l.qty > 1 ? ` × ${l.qty}` : ''}</dt>
            <dd>{formatEur(l.total)}</dd>
          </div>
        ))}
        {discount && (
          <div className="price-card-discount">
            <dt>{SHORT[value]} −{pct(p.discount_pct)}</dt>
            <dd>−{formatEur(Math.round((monthlyNet - p.monthly_net) * 100) / 100)}</dd>
          </div>
        )}
        <div className="price-card-total">
          <dt>Yhteensä alv 0 %</dt>
          <dd>{formatEur(discount ? p.monthly_net : monthlyNet)}/kk</dd>
        </div>
        <div className="price-card-muted">
          <dt>Sis. alv 25,5 %</dt>
          <dd>{formatEur(discount ? Math.round((p.gross / p.months) * 100) / 100 : p.gross)}/kk</dd>
        </div>
      </dl>
      {value !== 'monthly' && (
        <p className="price-card-period">
          {value === 'annual' ? 'Vuosi' : '6 kk'}: {formatEur(p.net)} alv 0 % · {formatEur(p.gross)} sis. alv
          {p.saving_net > 0 && <> · säästö {formatEur(p.saving_net)}</>}
        </p>
      )}
    </section>
  );
}
