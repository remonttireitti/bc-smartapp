import type { ReactNode } from 'react';
import {
  formatSignedEuro,
  outcomeVarianceExplanation,
  type OutcomeTone,
  type QuoteOutcomeComparison,
  type QuoteOutcomeSummary,
} from '../lib/quoteOutcomeSummary';
import { formatCommissionPercent } from '../lib/workReportBillingQuote';
import { formatEuro } from '../lib/workReportBilling';

type Props = {
  summary: QuoteOutcomeSummary;
  /** Esim. "Tarjous: Messukeskus – …". */
  quoteTitle?: string | null;
  /** Provisiorivin alle (esim. "Muokkaa provisiota"). */
  commissionEditor?: ReactNode;
  commissionExceedsGross?: boolean;
};

function toneClass(tone: OutcomeTone): string {
  return `quote-outcome-tone-${tone}`;
}

function money(value: number | null): string {
  return value == null ? '—' : formatEuro(value);
}

function VarianceCell({ value, tone }: { value: number | null; tone: OutcomeTone }) {
  if (value == null) return <td className="num muted">—</td>;
  return <td className={`num quote-outcome-variance ${toneClass(tone)}`}>{formatSignedEuro(value, formatEuro)}</td>;
}

function ComparisonTile({
  title,
  comparison,
  hint,
}: {
  title: string;
  comparison: QuoteOutcomeComparison;
  hint: string;
}) {
  return (
    <div className={`quote-outcome-tile ${toneClass(comparison.tone)}`}>
      <div className="quote-outcome-tile-title">{title}</div>
      <div className="quote-outcome-tile-values">
        <div>
          <span className="quote-outcome-tile-label">Tarjouspyyntö</span>
          <span className="quote-outcome-tile-value">{money(comparison.estimateNet)}</span>
        </div>
        <div>
          <span className="quote-outcome-tile-label">Toteutunut</span>
          <strong className="quote-outcome-tile-value">{money(comparison.actualNet)}</strong>
        </div>
      </div>
      {comparison.varianceNet != null ? (
        <div className={`quote-outcome-tile-diff ${toneClass(comparison.tone)}`}>
          Ero <strong>{formatSignedEuro(comparison.varianceNet, formatEuro)}</strong>
          <span className="quote-outcome-tile-hint"> · {hint}</span>
        </div>
      ) : (
        <div className="quote-outcome-tile-diff muted">Ei tarjouspyyntöä vertailuun</div>
      )}
    </div>
  );
}

const VERDICT_ICON: Record<OutcomeTone, string> = { better: '▲', worse: '▼', neutral: '●' };

export default function QuoteOutcomeSummaryView({
  summary,
  quoteTitle,
  commissionEditor,
  commissionExceedsGross = false,
}: Props) {
  const hasExtras = summary.customerExtrasNet > 0.005;
  const explanation = outcomeVarianceExplanation(summary, formatEuro);
  const gross = summary.grossMargin;
  const saleEstimate = summary.costs.estimateNet == null ? null : summary.quoteSaleNet;

  return (
    <div className="quote-outcome">
      <div className="quote-outcome-card">
        <div className="quote-outcome-price">
          <span className="quote-outcome-price-label">
            {hasExtras ? 'Kiinteä tarjoushinta + hyväksytyt lisät' : 'Kiinteä tarjoushinta'}
            <span className="muted"> (alv 0 %)</span>
          </span>
          <strong className="quote-outcome-price-value">{formatEuro(summary.saleTotalNet)}</strong>
          {hasExtras ? (
            <span className="muted quote-outcome-price-sub">
              tarjous {formatEuro(summary.quoteSaleNet)} + lisät {formatEuro(summary.customerExtrasNet)}
            </span>
          ) : null}
          {quoteTitle ? <span className="muted quote-outcome-price-sub">Tarjous: {quoteTitle}</span> : null}
        </div>

        <div className="quote-outcome-tiles">
          <ComparisonTile
            title="Kulut"
            comparison={summary.costs}
            hint={summary.costs.tone === 'worse' ? 'yli tarjouspyynnön' : summary.costs.tone === 'better' ? 'alle tarjouspyynnön' : 'tarjouspyynnön mukaan'}
          />
          {gross ? (
            <ComparisonTile
              title="Kate ennen provisiota"
              comparison={gross}
              hint={gross.tone === 'worse' ? 'alle tarjouspyynnön' : gross.tone === 'better' ? 'yli tarjouspyynnön' : 'tarjouspyynnön mukaan'}
            />
          ) : null}
        </div>

        {summary.verdict ? (
          <div className={`quote-outcome-verdict ${toneClass(summary.verdict.tone)}`} role="status">
            <span aria-hidden="true" className="quote-outcome-verdict-icon">
              {VERDICT_ICON[summary.verdict.tone]}
            </span>
            <strong>{summary.verdict.label}</strong>
            {explanation ? <span className="quote-outcome-verdict-sub">{explanation}</span> : null}
          </div>
        ) : null}
      </div>

      <div className="table-wrap">
        <table className="billing-table quote-outcome-table">
          <thead>
            <tr>
              <th>Kulut</th>
              <th className="num">{'Tarjous\u00ADpyyntö'}</th>
              <th className="num">Toteutunut</th>
              <th className="num">Ero</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.key}>
                <td>
                  <span className="quote-outcome-row-label">{row.label}</span>
                  {row.qtyLabel ? <span className="quote-outcome-row-sub">{row.qtyLabel}</span> : null}
                  {row.note ? <span className="quote-outcome-row-sub">{row.note}</span> : null}
                </td>
                <td className="num">{money(row.estimateNet)}</td>
                <td className="num">{money(row.actualNet)}</td>
                <VarianceCell value={row.varianceNet} tone={row.tone} />
              </tr>
            ))}
            <tr className="quote-outcome-subtotal">
              <td>Kulut yhteensä</td>
              <td className="num">{money(summary.costs.estimateNet)}</td>
              <td className="num">{money(summary.costs.actualNet)}</td>
              <VarianceCell value={summary.costs.varianceNet} tone={summary.costs.tone} />
            </tr>
            {gross ? (
              <>
                {hasExtras ? (
                  <tr>
                    <td>
                      <span className="quote-outcome-row-label">Myynti</span>
                      <span className="quote-outcome-row-sub">tarjous + hyväksytyt lisät</span>
                    </td>
                    <td className="num">{money(saleEstimate)}</td>
                    <td className="num">{formatEuro(summary.saleTotalNet)}</td>
                    <VarianceCell
                      value={saleEstimate == null ? null : summary.customerExtrasNet}
                      tone={saleEstimate == null ? 'neutral' : 'better'}
                    />
                  </tr>
                ) : null}
                <tr className="quote-outcome-margin-row">
                  <td>
                    <span className="quote-outcome-row-label">Kate ennen provisiota</span>
                    <span className="quote-outcome-row-sub">
                      {hasExtras ? 'myynti − kulut' : 'tarjoushinta − kulut'}
                    </span>
                  </td>
                  <td className="num">{money(gross.estimateNet)}</td>
                  <td className="num">
                    <strong>{formatEuro(gross.actualNet)}</strong>
                  </td>
                  <VarianceCell value={gross.varianceNet} tone={gross.tone} />
                </tr>
                <tr className="quote-outcome-commission-row">
                  <td colSpan={2}>
                    <span className="quote-outcome-row-label">
                      Provisio ({formatCommissionPercent(summary.commissionPercent)} %)
                    </span>
                    <span className="quote-outcome-row-sub">
                      {summary.commissionSource === 'daily_log'
                        ? 'Päiväkirjan Myyntiprovisio-merkinnöistä'
                        : summary.commissionSource === 'amount'
                          ? 'Sovittu summa'
                          : 'Prosentti katteesta'}
                    </span>
                    {commissionExceedsGross ? (
                      <span className="quote-outcome-row-sub error">
                        Provisio on suurempi kuin kate ennen provisiota.
                      </span>
                    ) : null}
                  </td>
                  <td className="num">− {formatEuro(summary.commissionNet)}</td>
                  <td className="num muted">—</td>
                </tr>
                {commissionEditor ? (
                  <tr className="quote-outcome-commission-edit-row">
                    <td colSpan={4}>{commissionEditor}</td>
                  </tr>
                ) : null}
                <tr className="quote-outcome-net-row">
                  <td colSpan={2}>Puhdas kate</td>
                  <td className="num">{formatEuro(summary.netMarginNet)}</td>
                  <td className="num muted">—</td>
                </tr>
              </>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
