import {
  BILLING_PERIODS,
  formatEur,
  periodPrice,
  type BillingPeriod,
  type PriceList,
} from '../lib/companySignup';

type Props = {
  value: BillingPeriod;
  onChange: (v: BillingPeriod) => void;
  /** Kuukausihinta alv 0 % ennen jakson alennusta. */
  monthlyNet: number;
  prices: Pick<PriceList, 'billing_discounts'>;
  disabled?: boolean;
};

/** Kuukausilaskutus / 6 kk laskutus / Vuosilaskutus + jakson hinta ja säästö. */
export default function BillingPeriodPicker({ value, onChange, monthlyNet, prices, disabled }: Props) {
  const p = periodPrice(monthlyNet, value, prices);
  return (
    <div className="billing-period-picker">
      <div className="billing-period-options" role="radiogroup" aria-label="Laskutusjakso">
        {BILLING_PERIODS.map((b) => {
          const pct = b.value === 'monthly' ? 0 : prices.billing_discounts?.[b.value] ?? 0;
          return (
            <button
              key={b.value}
              type="button"
              role="radio"
              aria-checked={value === b.value}
              disabled={disabled}
              className={`billing-period-option${value === b.value ? ' is-active' : ''}`}
              onClick={() => onChange(b.value)}
            >
              {b.label}
              {pct > 0 && <span className="billing-period-badge">−{pct.toLocaleString('fi-FI')} %</span>}
            </button>
          );
        })}
      </div>
      {value !== 'monthly' && (
        <table className="price-estimate-table billing-period-summary">
          <tbody>
            <tr>
              <td>Kuukausihinta alennuksen jälkeen</td>
              <td className="num">{formatEur(p.monthly_net)}/kk</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th>{p.months === 12 ? 'Vuosihinta' : `${p.months} kk hinta`} alv 0 %</th>
              <th className="num">{formatEur(p.net)}</th>
            </tr>
            <tr className="muted">
              <td>Sis. alv 25,5 %</td>
              <td className="num">{formatEur(p.gross)}</td>
            </tr>
            {p.saving_net > 0 && (
              <tr className="billing-period-saving">
                <td>Säästö ({p.discount_pct.toLocaleString('fi-FI')} %)</td>
                <td className="num">−{formatEur(p.saving_net)}/{p.months === 12 ? 'v' : `${p.months} kk`}</td>
              </tr>
            )}
          </tfoot>
        </table>
      )}
    </div>
  );
}
