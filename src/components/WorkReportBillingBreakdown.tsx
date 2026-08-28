import {
  formatEuro,
  type BillableCalculation,
  type BillableLine,
  type BillableLineKind,
} from '../lib/workReportBilling';
import { formatDate } from '../types';

const LINE_KIND_LABELS: Record<BillableLineKind, string> = {
  hours_regular: 'Tunnit',
  hours_overtime: 'Ylitötunnit',
  hours_on_call: 'Päivystys',
  fixed_price: 'Urakka',
  commission: 'Provisio',
  expense: 'Kulu / tarvike',
  refrigerant: 'Kylmäaine',
  refrigerant_purchase_deduction: 'Kylmäaineosto (vähennys)',
};

type DetailRow = BillableLine & { userName: string };

function formatBillableLineQty(kind: BillableLineKind, qty: number): string {
  if (kind === 'refrigerant' || kind === 'refrigerant_purchase_deduction') return `${qty.toFixed(3)} kg`;
  if (kind === 'hours_regular' || kind === 'hours_overtime' || kind === 'hours_on_call') {
    return `${qty.toFixed(2)} h`;
  }
  if (kind === 'fixed_price' || kind === 'commission') return '1 kpl';
  return Number.isInteger(qty) ? `${qty} kpl` : `${qty} kpl`;
}

function collectDetailRows(calculation: BillableCalculation, includedOnly: boolean): DetailRow[] {
  const rows = calculation.byUser.flatMap((user) =>
    user.lines
      .filter((line) => (includedOnly ? line.included : !line.included))
      .map((line) => ({ ...line, userName: user.userName })),
  );
  return rows.sort((a, b) => {
    const dateCmp = a.logDate.localeCompare(b.logDate);
    if (dateCmp !== 0) return dateCmp;
    return a.userName.localeCompare(b.userName, 'fi');
  });
}

type Props = {
  calculation: BillableCalculation;
  billingSide?: 'partner' | 'customer';
};

const BILLING_SIDE_INTRO: Record<'partner' | 'customer', string> = {
  partner: 'Nämä rivit muodostavat kumppanille tai kumppanilta laskutettavan summan.',
  customer: 'Nämä rivit muodostavat loppuasiakkaalta laskutettavan summan.',
};

export default function WorkReportBillingBreakdown({ calculation, billingSide }: Props) {
  const billedLines = collectDetailRows(calculation, true);
  const excludedLines = collectDetailRows(calculation, false);
  const isQuoteFixed = calculation.billingMode === 'quote_fixed';

  return (
    <div className="billing-breakdown">
      {billingSide ? <p className="muted">{BILLING_SIDE_INTRO[billingSide]}</p> : null}
      {isQuoteFixed ? (
        <p className="muted">
          Kiinteä tarjoushinta
          {calculation.quoteTitle ? `: ${calculation.quoteTitle}` : ''}. Tunti- ja ajolaskentaa ei
          käytetä asiakaslaskutuksessa.
        </p>
      ) : null}
      <div className="table-wrap">
        <table className="billing-table billing-table-summary">
          <thead>
            <tr>
              <th>Henkilö</th>
              <th className="num">Työtunnit</th>
              <th className="num">Työt (€)</th>
              <th className="num">Kulut / urakat</th>
              <th className="num">Yhteensä</th>
            </tr>
          </thead>
          <tbody>
            {calculation.byUser.map((u) => (
              <tr key={u.userId}>
                <td>
                  {u.userName}
                  {!u.effectiveBillHoursEnabled && !u.effectiveBillExpensesEnabled && (
                    <span className="muted"> (ei laskutukseen)</span>
                  )}
                </td>
                <td className="num">{u.hoursQty.toFixed(2)} h</td>
                <td className="num">{formatEuro(u.hoursTotal)}</td>
                <td className="num">{formatEuro(u.expensesTotal + u.fixedTotal + (u.commissionTotal ?? 0))}</td>
                <td className="num">{formatEuro(u.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="billing-breakdown-heading">Laskurivit</h4>
      <div className="table-wrap">
        <table className="billing-table billing-table-detail">
          <thead>
            <tr>
              <th>Päivä</th>
              <th>Henkilö</th>
              <th>Tyyppi</th>
              <th>Kuvaus</th>
              <th className="num">Määrä</th>
              <th className="num">á hinta</th>
              <th className="num">Yhteensä</th>
            </tr>
          </thead>
          <tbody>
            {billedLines.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  Ei laskutettavia rivejä.
                </td>
              </tr>
            ) : (
              billedLines.map((line, index) => (
                <tr key={`${line.logId}-${line.kind}-${index}`}>
                  <td>{formatDate(line.logDate)}</td>
                  <td>{line.userName}</td>
                  <td>{LINE_KIND_LABELS[line.kind]}</td>
                  <td>{line.description}</td>
                  <td className="num">{formatBillableLineQty(line.kind, line.qty)}</td>
                  <td className="num">
                    {line.priceMissing ? (
                      <span className="billing-price-missing" title="Hinta puuttuu — määritä asiakkaalle">
                        ?
                      </span>
                    ) : (
                      formatEuro(line.unitPrice)
                    )}
                  </td>
                  <td className="num">
                    <strong>
                      {line.priceMissing ? (
                        <span className="billing-price-missing" title="Hinta puuttuu — määritä asiakkaalle">
                          ?
                        </span>
                      ) : (
                        formatEuro(line.total)
                      )}
                    </strong>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {billedLines.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} className="num">
                  <strong>Laskutettava yhteensä</strong>
                </td>
                <td className="num">
                  <strong>{formatEuro(calculation.grandTotal)}</strong>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {excludedLines.length > 0 && (
        <>
          <h4 className="billing-breakdown-heading muted-heading">Ei laskutukseen</h4>
          <div className="table-wrap">
            <table className="billing-table billing-table-detail billing-table-excluded">
              <thead>
                <tr>
                  <th>Päivä</th>
                  <th>Henkilö</th>
                  <th>Tyyppi</th>
                  <th>Kuvaus</th>
                  <th className="num">Määrä</th>
                  <th className="num">á hinta</th>
                  <th className="num">Yhteensä</th>
                </tr>
              </thead>
              <tbody>
                {excludedLines.map((line) => (
                  <tr key={`ex-${line.logId}-${line.kind}-${line.description}`}>
                    <td>{formatDate(line.logDate)}</td>
                    <td>{line.userName}</td>
                    <td>{LINE_KIND_LABELS[line.kind]}</td>
                    <td>{line.description}</td>
                    <td className="num">{formatBillableLineQty(line.kind, line.qty)}</td>
                    <td className="num">{formatEuro(line.unitPrice)}</td>
                    <td className="num">{formatEuro(line.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} className="num muted">
                    Yhteensä ei laskutukseen
                  </td>
                  <td className="num muted">{formatEuro(calculation.excludedTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
