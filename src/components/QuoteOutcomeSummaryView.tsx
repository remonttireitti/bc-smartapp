import type { ReactNode } from 'react';
import {
  buildAccountingStatement,
  formatSignedEuro,
  type AccountingLine,
  type OutcomeTone,
  type QuoteOutcomeSummary,
} from '../lib/quoteOutcomeSummary';
import { formatEuro } from '../lib/workReportBilling';
import { unpricedRowsLabel } from '../lib/quoteSeededRows';

type Props = {
  summary: QuoteOutcomeSummary;
  /** Esim. "Tarjous: Messukeskus – …". */
  quoteTitle?: string | null;
  /** Tarjouksen nimen perään (esim. Vaihda tarjous / Poista kohdistus). */
  quoteTitleActions?: ReactNode;
  commissionExceedsGross?: boolean;
  /** Kulurivit ilman hintaa (esim. tarjouksesta luodut 0 €-rivit): tulos on alustava. */
  unpricedRowCount?: number;
  /** Laskutuslaskelman riveille laskun tila / toiminto (avain = osapuolirivi). */
  partyStatus?: Partial<Record<string, ReactNode>>;
  /** Laskutuslaskelman otsikkorivin perään (esim. esikatselu → Käytä laskutuksessa). */
  partiesAction?: ReactNode;
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

const VERDICT_ICON: Record<OutcomeTone, string> = { better: '▲', worse: '▼', neutral: '●' };

export default function QuoteOutcomeSummaryView({
  summary,
  quoteTitle,
  quoteTitleActions,
  commissionExceedsGross = false,
  unpricedRowCount = 0,
  partyStatus,
  partiesAction = null,
}: Props) {
  const statement = buildAccountingStatement(summary);

  const lineRow = (line: AccountingLine) => {
    const cls =
      line.key === 'net'
        ? 'quote-outcome-net-row'
        : line.kind === 'result'
          ? 'quote-outcome-margin-row'
          : line.kind === 'total'
            ? 'quote-outcome-subtotal'
            : undefined;
    return (
      <tr key={line.key} className={cls}>
        <td>
          <span className="quote-outcome-row-label">{line.label}</span>
          {line.sub ? <span className="quote-outcome-row-sub">{line.sub}</span> : null}
          {line.key === 'commission' && commissionExceedsGross ? (
            <span className="quote-outcome-row-sub error">Provisio on suurempi kuin kate.</span>
          ) : null}
        </td>
        <td className="num">{money(line.estimateNet)}</td>
        <td className="num">{line.key === 'commission' ? `− ${formatEuro(Math.abs(line.actualNet))}` : line.kind === 'result' ? <strong>{formatEuro(line.actualNet)}</strong> : formatEuro(line.actualNet)}</td>
        <VarianceCell value={line.varianceNet} tone={line.tone} />
      </tr>
    );
  };
  const section = (title: string, action: ReactNode = null) => (
    <tr className="quote-outcome-section-row">
      <td colSpan={4}>
        {title}
        {action ? <span className="quote-outcome-section-action">{action}</span> : null}
      </td>
    </tr>
  );

  return (
    <div className="quote-outcome">
      <div className="quote-outcome-card">
        {quoteTitle ? (
          <div className="quote-outcome-price">
            <span className="muted quote-outcome-price-sub">
              Tarjous: {quoteTitle} · alv 0 %
              {quoteTitleActions}
            </span>
          </div>
        ) : null}

        {summary.verdict ? (
          <div className={`quote-outcome-verdict ${toneClass(summary.verdict.tone)}`} role="status">
            <span aria-hidden="true" className="quote-outcome-verdict-icon">
              {VERDICT_ICON[summary.verdict.tone]}
            </span>
            <strong>{summary.verdict.label}</strong>
            {unpricedRowCount > 0 ? (
              <span className="quote-outcome-verdict-sub quote-outcome-unpriced">
                · {unpricedRowsLabel(unpricedRowCount)} — alustava
              </span>
            ) : null}
          </div>
        ) : unpricedRowCount > 0 ? (
          <p className="quote-outcome-unpriced">{unpricedRowsLabel(unpricedRowCount)}</p>
        ) : null}
      </div>

      <div className="table-wrap">
        <table className="billing-table quote-outcome-table">
          <thead>
            <tr>
              <th></th>
              <th className="num">{'Tarjous\u00ADpyyntö'}</th>
              <th className="num">Toteutunut</th>
              <th className="num">Ero</th>
            </tr>
          </thead>
          <tbody>
            {statement.income ? (
              <>
                {section('Tulot')}
                {statement.income.map(lineRow)}
              </>
            ) : null}
            {section('Kulut')}
            {statement.costs.map(lineRow)}
            {statement.result ? (
              <>
                {section('Kate')}
                {statement.result.map(lineRow)}
              </>
            ) : null}
            {summary.parties ? section('Laskutuslaskelma', partiesAction) : null}
            {summary.parties
              ? summary.parties.filter((row) => row.key !== 'customer').map((row, index, all) => {
                  const last = index === all.length - 1;
                  return (
                    <tr key={row.key} className={last ? 'quote-outcome-net-row' : 'quote-outcome-party-row'}>
                      <td>
                        <span className="quote-outcome-row-label">{row.label}</span>
                        {row.note ? <span className="quote-outcome-row-sub">{row.note}</span> : null}
                        {partyStatus?.[row.key] ? (
                          <span className="quote-outcome-row-sub quote-outcome-party-status">{partyStatus[row.key]}</span>
                        ) : null}
                      </td>
                      <td className="num">{money(row.estimateNet)}</td>
                      <td className="num">{last ? <strong>{formatEuro(row.actualNet)}</strong> : formatEuro(row.actualNet)}</td>
                      <VarianceCell value={row.varianceNet} tone={row.tone} />
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
