/**
 * "Tarjous ja kate" -yhteenveto: arvio (tarjous) vs toteutunut samalla kustannuspohjalla.
 *
 * Kustannuspohja:
 * - Arvio = tarjous vs toteutunut -vertailun tarjoussarake (työt + tarvikkeet + kulut + laite).
 * - Toteutunut = katteesta vähennetyt rivit (computePartnerNetMargin.deductionRows), eli
 *   tarjoushinta + lisälaskutus − Σ vähennykset = kate ennen provisiota.
 *
 * Siksi: kate-ero = −(kulujen ero) + lisälaskutus. Ilman lisälaskutusta kate-ero on täsmälleen
 * kulujen eron vastaluku.
 */
import type { QuoteCategoryComparison, QuoteCategoryKey } from './quoteCategoryComparison';
import { formatCategoryQty } from './quoteCategoryComparison';
import type { PartnerMarginComputed } from './workReportBillingQuote';

export type OutcomeTone = 'better' | 'worse' | 'neutral';

const EPS = 0.005;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Kulut: toteutunut alle arvion = parempi (vihreä), yli = huonompi (punainen). */
export function costVarianceTone(estimate: number | null | undefined, actual: number): OutcomeTone {
  if (estimate == null) return 'neutral';
  const diff = roundMoney(actual - estimate);
  if (diff < -EPS) return 'better';
  if (diff > EPS) return 'worse';
  return 'neutral';
}

/** Kate: toteutunut yli arvion = parempi (vihreä), alle = huonompi (punainen). */
export function marginVarianceTone(estimate: number | null | undefined, actual: number): OutcomeTone {
  if (estimate == null) return 'neutral';
  const diff = roundMoney(actual - estimate);
  if (diff > EPS) return 'better';
  if (diff < -EPS) return 'worse';
  return 'neutral';
}

/** Etumerkillinen euromäärä: +464,70 € / −464,70 € / 0,00 €. */
export function formatSignedEuro(value: number, formatEuro: (value: number) => string): string {
  const rounded = roundMoney(value);
  if (Math.abs(rounded) < EPS) return formatEuro(0);
  return `${rounded > 0 ? '+' : '−'}${formatEuro(Math.abs(rounded))}`;
}

export type QuoteOutcomeComparison = {
  estimateNet: number | null;
  actualNet: number;
  /** toteutunut − arvio (null, jos arviota ei ole). */
  varianceNet: number | null;
  tone: OutcomeTone;
};

export type QuoteOutcomeRow = {
  key: QuoteCategoryKey | 'other';
  label: string;
  /** Esim. "8 h / 8 h" tai "0 km / 68,3 km". */
  qtyLabel: string | null;
  note: string | null;
} & QuoteOutcomeComparison;

export type QuoteOutcomeVerdict = {
  tone: OutcomeTone;
  /** Kate-ero (toteutunut − arvio). */
  amountNet: number;
  label: string;
};

export type QuoteOutcomeSummary = {
  quoteSaleNet: number;
  /** Hyväksytty lisälaskutus asiakkaalta (alv 0 %). */
  customerExtrasNet: number;
  /** Tarjoushinta + hyväksytyt lisät. */
  saleTotalNet: number;
  costs: QuoteOutcomeComparison;
  /** null, kun katetta ei näytetä (vain kulut). */
  grossMargin: QuoteOutcomeComparison | null;
  rows: QuoteOutcomeRow[];
  commissionNet: number;
  commissionPercent: number;
  commissionSource: PartnerMarginComputed['commissionSource'];
  netMarginNet: number;
  /** Onko kate (provisio, puhdas kate) mukana. */
  hasMargin: boolean;
  /** null, jos tarjousarviota (vertailua) ei ole. */
  verdict: QuoteOutcomeVerdict | null;
  /**
   * Näytetäänkö kate ennen provisiota -rivin Ero-solu. Ilman hyväksyttyjä lisiä kate-ero on
   * täsmälleen −(Kulut yhteensä -ero) eli toistoa → solu jätetään tyhjäksi ("—").
   */
  showMarginVariance: boolean;
};

/** Kate-ero poikkeaa kulujen eron vastaluvusta (esim. hyväksytyt lisät) → näytä se taulukossa. */
export function marginVarianceDiffersFromCosts(
  costs: QuoteOutcomeComparison,
  grossMargin: QuoteOutcomeComparison | null,
): boolean {
  if (!grossMargin || grossMargin.varianceNet == null) return false;
  if (costs.varianceNet == null) return true;
  return Math.abs(roundMoney(grossMargin.varianceNet + costs.varianceNet)) > EPS;
}

const CATEGORY_DEDUCTION_KEYS = new Set(['labor_expenses', 'device', 'supplies']);

function comparisonOf(
  estimate: number | null,
  actual: number,
  tone: (estimate: number | null, actual: number) => OutcomeTone,
): QuoteOutcomeComparison {
  const actualNet = roundMoney(actual);
  const estimateNet = estimate == null ? null : roundMoney(estimate);
  return {
    estimateNet,
    actualNet,
    varianceNet: estimateNet == null ? null : roundMoney(actualNet - estimateNet),
    tone: tone(estimateNet, actualNet),
  };
}

function qtyLabelFor(row: QuoteCategoryComparison['rows'][number]): string | null {
  if (row.key !== 'labor' && row.key !== 'expenses') return null;
  if (row.quoteQty == null && row.actualQty == null) return null;
  return `${formatCategoryQty(row, row.quoteQty ?? 0)} / ${formatCategoryQty(row, row.actualQty ?? 0)}`;
}

export function verdictFor(
  marginVarianceNet: number | null,
  formatEuro: (value: number) => string,
): QuoteOutcomeVerdict | null {
  if (marginVarianceNet == null) return null;
  const amountNet = roundMoney(marginVarianceNet);
  if (amountNet > EPS) {
    return { tone: 'better', amountNet, label: `Meni tarjouspyyntöä paremmin ${formatSignedEuro(amountNet, formatEuro)}` };
  }
  if (amountNet < -EPS) {
    return { tone: 'worse', amountNet, label: `Meni tarjouspyyntöä huonommin ${formatSignedEuro(amountNet, formatEuro)}` };
  }
  return { tone: 'neutral', amountNet: 0, label: 'Meni tarjouspyynnön mukaan' };
}

/**
 * Yhdistä tarjous vs toteutunut -vertailu ja puhdas kate yhdeksi yhteenvedoksi.
 * Toteutuneet rivit summautuvat aina kate ennen provisiota -lukuun (tarvittaessa
 * "Muut kate-erät" -rivi, esim. katetta syövät kulut).
 *
 * Ilman partnerMarginia (katetta ei näytetä) yhteenveto sisältää vain kulut.
 */
export function buildQuoteOutcomeSummary(input: {
  partnerMargin: PartnerMarginComputed | null;
  comparison: QuoteCategoryComparison | null;
  /** Tarjoushinta, kun partnerMargin puuttuu. */
  quoteSaleNet?: number | null;
  formatEuro: (value: number) => string;
}): QuoteOutcomeSummary | null {
  const { partnerMargin, comparison, formatEuro } = input;
  if (!partnerMargin && !comparison) return null;
  const quoteSaleNet = roundMoney(partnerMargin?.quoteSaleNet ?? input.quoteSaleNet ?? 0);
  const customerExtrasNet = roundMoney(partnerMargin?.customerExtrasNet ?? 0);
  const saleTotalNet = roundMoney(quoteSaleNet + customerExtrasNet);
  const actualCostsNet = partnerMargin
    ? roundMoney(partnerMargin.deductionRows.reduce((sum, row) => sum + row.amount, 0))
    : roundMoney(comparison?.actualTotalNet ?? 0);

  const rows: QuoteOutcomeRow[] = [];
  if (comparison) {
    for (const row of comparison.rows) {
      rows.push({
        key: row.key,
        label: row.label,
        qtyLabel: qtyLabelFor(row),
        note: row.quoteNote ?? null,
        ...comparisonOf(row.quoteNet, row.actualNet, costVarianceTone),
      });
    }
    const otherNet = roundMoney(actualCostsNet - comparison.actualTotalNet);
    if (Math.abs(otherNet) > EPS) {
      const labels = (partnerMargin?.deductionRows ?? [])
        .filter((row) => !CATEGORY_DEDUCTION_KEYS.has(row.key))
        .map((row) => row.label);
      rows.push({
        key: 'other',
        label: 'Muut kate-erät',
        qtyLabel: null,
        note: labels.length > 0 ? labels.join(' · ') : 'Ero vertailun ja katteen vähennysten välillä',
        ...comparisonOf(0, otherNet, costVarianceTone),
      });
    }
  } else if (partnerMargin) {
    for (const row of partnerMargin.deductionRows) {
      rows.push({
        key:
          row.key === 'device'
            ? 'device'
            : row.key === 'supplies'
              ? 'supplies'
              : row.key === 'labor_expenses'
                ? 'labor'
                : 'other',
        label: row.label,
        qtyLabel: null,
        note: row.details?.length
          ? row.details.map((detail) => `${detail.description} ${formatEuro(detail.total)}`).join(' · ')
          : null,
        ...comparisonOf(null, row.amount, costVarianceTone),
      });
    }
  }

  const estimateCostsNet = comparison ? roundMoney(comparison.quoteTotalNet) : null;
  const costs = comparisonOf(estimateCostsNet, actualCostsNet, costVarianceTone);
  // Arvioitu kate = tarjoushinta − arvioidut kulut (sama pohja kuin toteutunut kate).
  const estimateGrossNet =
    estimateCostsNet == null ? null : roundMoney(quoteSaleNet - estimateCostsNet);
  const grossMargin = partnerMargin
    ? comparisonOf(estimateGrossNet, partnerMargin.grossMarginNet, marginVarianceTone)
    : null;

  const verdictAmount = grossMargin
    ? grossMargin.varianceNet
    : costs.varianceNet == null
      ? null
      : -costs.varianceNet;

  return {
    quoteSaleNet,
    customerExtrasNet,
    saleTotalNet,
    costs,
    grossMargin,
    rows,
    commissionNet: roundMoney(partnerMargin?.commissionNet ?? 0),
    commissionPercent: partnerMargin?.commissionPercent ?? 0,
    commissionSource: partnerMargin?.commissionSource ?? 'percent',
    netMarginNet: roundMoney(partnerMargin?.netMarginNet ?? 0),
    hasMargin: partnerMargin != null,
    verdict: verdictFor(verdictAmount, formatEuro),
    showMarginVariance: marginVarianceDiffersFromCosts(costs, grossMargin),
  };
}

const PRINT_TONE_COLOR: Record<OutcomeTone, string> = {
  better: '#15803d',
  worse: '#dc2626',
  neutral: '#334155',
};

/** Sisäisen tulosteen versio samasta yhteenvedosta (sama laskenta kuin paneelissa). */
export function renderQuoteOutcomeSummaryHtml(
  summary: QuoteOutcomeSummary,
  options: {
    escapeHtml: (value: string) => string;
    formatEuro: (value: number) => string;
    quoteTitle?: string | null;
  },
): string {
  const esc = options.escapeHtml;
  const euro = options.formatEuro;
  const money = (value: number | null) => (value == null ? '—' : euro(value));
  const variance = (value: number | null, tone: OutcomeTone) =>
    value == null
      ? '<td class="num">—</td>'
      : `<td class="num" style="color:${PRINT_TONE_COLOR[tone]};font-weight:600">${esc(formatSignedEuro(value, euro))}</td>`;
  const hasExtras = summary.customerExtrasNet > EPS;
  const gross = summary.grossMargin;


  const rowsHtml = summary.rows
    .map((row) => {
      const sub = [row.qtyLabel, row.note].filter(Boolean).map((t) => `<div class="muted" style="font-size:11px">${esc(String(t))}</div>`).join('');
      return `<tr><td>${esc(row.label)}${sub}</td><td class="num">${esc(money(row.estimateNet))}</td><td class="num">${esc(money(row.actualNet))}</td>${variance(row.varianceNet, row.tone)}</tr>`;
    })
    .join('');

  const marginRows = gross
    ? `${hasExtras ? `<tr><td>Myynti (tarjous + hyväksytyt lisät)</td><td class="num">${esc(money(summary.costs.estimateNet == null ? null : summary.quoteSaleNet))}</td><td class="num">${esc(euro(summary.saleTotalNet))}</td>${variance(summary.costs.estimateNet == null ? null : summary.customerExtrasNet, 'better')}</tr>` : ''}
      <tr><td><strong>Kate ennen provisiota</strong></td><td class="num">${esc(money(gross.estimateNet))}</td><td class="num"><strong>${esc(euro(gross.actualNet))}</strong></td>${summary.showMarginVariance ? variance(gross.varianceNet, gross.tone) : '<td class="num">—</td>'}</tr>
      <tr><td>Provisio (${esc(String(Math.round(summary.commissionPercent * 100) / 100).replace('.', ','))} %)${summary.commissionSource === 'daily_log' ? '<div class="muted" style="font-size:11px">Päiväkirjan Myyntiprovisio-merkinnöistä</div>' : summary.commissionSource === 'amount' ? '<div class="muted" style="font-size:11px">Sovittu summa</div>' : ''}</td><td class="num">—</td><td class="num">− ${esc(euro(summary.commissionNet))}</td><td class="num">—</td></tr>
      <tr class="profit-row"><td><strong>Puhdas kate</strong></td><td class="num">—</td><td class="num"><strong style="font-size:15px">${esc(euro(summary.netMarginNet))}</strong></td><td class="num">—</td></tr>`
    : '';

  const verdictHtml = summary.verdict
    ? `<p style="margin:6px 0 10px;padding:6px 10px;border-left:5px solid ${PRINT_TONE_COLOR[summary.verdict.tone]};font-size:17px;color:${PRINT_TONE_COLOR[summary.verdict.tone]}"><strong>${esc(summary.verdict.label)}</strong></p>`
    : '';

  return `<div class="quote-outcome-print">
    <p style="margin:0 0 4px"><span style="font-size:11px;text-transform:uppercase;color:#475569;font-weight:700">${hasExtras ? 'Kiinteä tarjoushinta + hyväksytyt lisät' : 'Kiinteä tarjoushinta'} (alv 0 %)</span><br/><strong style="font-size:20px">${esc(euro(summary.saleTotalNet))}</strong>${hasExtras ? ` <span class="muted">(tarjous ${esc(euro(summary.quoteSaleNet))} + lisät ${esc(euro(summary.customerExtrasNet))})</span>` : ''}</p>
    ${options.quoteTitle ? `<p class="meta-line">Tarjous: ${esc(options.quoteTitle)}</p>` : ''}
    ${verdictHtml}
    <table>
      <thead><tr><th>Kulut</th><th class="num">Tarjouspyyntö</th><th class="num">Toteutunut</th><th class="num">Ero</th></tr></thead>
      <tbody>
        ${rowsHtml}
        <tr><td><strong>Kulut yhteensä</strong></td><td class="num"><strong>${esc(money(summary.costs.estimateNet))}</strong></td><td class="num"><strong>${esc(money(summary.costs.actualNet))}</strong></td>${variance(summary.costs.varianceNet, summary.costs.tone)}</tr>
        ${marginRows}
      </tbody>
    </table>
  </div>`;
}
