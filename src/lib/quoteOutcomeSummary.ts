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
import { EXTRAS_DEDUCTION_KEYS, type PartnerMarginComputed } from './workReportBillingQuote';
import {
  computeDeviceSellerChain,
  deviceSellerLabels,
  type DeviceSellerChain,
} from './workReportDeviceSeller';

export type OutcomeTone = 'better' | 'worse' | 'neutral';

const EPS = 0.005;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100 || 0;
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

/** Laitemyyjä-ketjun laskutuslaskelman rivi (osapuolittain). */
export type QuoteOutcomePartyRow = {
  key: keyof DeviceSellerChain;
  label: string;
  /** Lyhyt erittely (esim. "laitekate 350,00 € + lisätyö 130,00 €"). */
  note?: string | null;
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
  /** Hyväksytyn lisälaskutuksen kate (asiakas − kumppani − hankinta). */
  extrasMarginNet: number;
  /** Kate-taulukon myynti: tarjoushinta + hyväksyttyjen lisien kate. */
  marginSaleNet: number;
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
  /**
   * Laitemyyjä-ketju (laitteen myyntihinta asetettu): laskutuslaskelma osapuolittain. Korvaa
   * myynti-, kate- ja provisiorivit; puhdas kate = urakoitsijalle jäävä osuus.
   */
  parties: QuoteOutcomePartyRow[] | null;
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
  /** Laitemyyjä-ketju: laitteen myyntihinta + osapuolten nimet. */
  deviceSeller?: {
    deviceSaleNet: number;
    ownerName: string;
    contractorName?: string | null;
    installerName: string;
    installerBillsSupplies?: boolean;
  } | null;
  /**
   * Hinnattomat kulurivit (tarjouksesta luodut 0 €-rivit): tarjouspyynnön hinta lasketaan
   * alustavaksi toteutuneeksi kuluksi, jottei tulos näytä liian hyvältä ennen hintojen syöttöä.
   */
  provisionalCosts?: { supplies: number; expenses: number } | null;
}): QuoteOutcomeSummary | null {
  const { partnerMargin, comparison, formatEuro } = input;
  if (!partnerMargin && !comparison) return null;
  const quoteSaleNet = roundMoney(partnerMargin?.quoteSaleNet ?? input.quoteSaleNet ?? 0);
  const customerExtrasNet = roundMoney(partnerMargin?.customerExtrasNet ?? 0);
  const saleTotalNet = roundMoney(quoteSaleNet + customerExtrasNet);
  // Lisälaskutus (kumppanikulut, hankinta) ei kuulu kiinteän tarjouksen kuluihin.
  const quoteDeductionRows = (partnerMargin?.deductionRows ?? []).filter(
    (row) => !EXTRAS_DEDUCTION_KEYS.has(row.key),
  );
  const actualCostsNet = partnerMargin
    ? roundMoney(quoteDeductionRows.reduce((sum, row) => sum + row.amount, 0))
    : roundMoney(comparison?.actualTotalNet ?? 0);
  const extrasMarginNet = partnerMargin
    ? roundMoney(partnerMargin.grossMarginNet - (quoteSaleNet - actualCostsNet))
    : 0;

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
      const labels = quoteDeductionRows
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
    for (const row of quoteDeductionRows) {
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
  const provisionalTotal = roundMoney(
    (input.provisionalCosts?.supplies ?? 0) + (input.provisionalCosts?.expenses ?? 0),
  );
  if (provisionalTotal > EPS) {
    for (const key of ['supplies', 'expenses'] as const) {
      const amount = roundMoney(input.provisionalCosts?.[key] ?? 0);
      if (!(amount > EPS)) continue;
      const note = `sis. hinnattomat rivit tarjouspyynnön hinnalla ${formatEuro(amount)} (alustava)`;
      const index = rows.findIndex((row) => row.key === key);
      if (index >= 0) {
        const row = rows[index];
        rows[index] = {
          ...row,
          note: row.note ? `${row.note} · ${note}` : note,
          ...comparisonOf(row.estimateNet, row.actualNet + amount, costVarianceTone),
        };
      } else {
        rows.push({
          key,
          label: key === 'supplies' ? 'Tarvikkeet' : 'Kulut (ajot ja muut)',
          qtyLabel: null,
          note,
          ...comparisonOf(comparison ? 0 : null, amount, costVarianceTone),
        });
      }
    }
  }
  const actualCostsWithProvisional = roundMoney(actualCostsNet + provisionalTotal);
  const costs = comparisonOf(estimateCostsNet, actualCostsWithProvisional, costVarianceTone);
  // Arvioitu kate = tarjoushinta − arvioidut kulut (sama pohja kuin toteutunut kate).
  const estimateGrossNet =
    estimateCostsNet == null ? null : roundMoney(quoteSaleNet - estimateCostsNet);
  const grossMargin = partnerMargin
    ? comparisonOf(estimateGrossNet, partnerMargin.grossMarginNet - provisionalTotal, marginVarianceTone)
    : null;

  let parties: QuoteOutcomePartyRow[] | null = null;
  let chain: DeviceSellerChain | null = null;
  if (input.deviceSeller && partnerMargin) {
    const category = (key: QuoteOutcomeRow['key']) => {
      const matching = rows.filter((row) => row.key === key);
      const estimates = matching.map((row) => row.estimateNet);
      return {
        estimate: !comparison
          ? null
          : estimates.some((value) => value == null)
            ? null
            : roundMoney(estimates.reduce<number>((sum, value) => sum + (value ?? 0), 0)),
        actual: roundMoney(matching.reduce((sum, row) => sum + row.actualNet, 0)),
      };
    };
    chain = computeDeviceSellerChain({
      margin: partnerMargin,
      deviceSaleNet: input.deviceSeller.deviceSaleNet,
      installerBillsSupplies: !!input.deviceSeller.contractorName && !!input.deviceSeller.installerBillsSupplies,
      costs: {
        labor: category('labor'),
        expenses: category('expenses'),
        supplies: category('supplies'),
        device: category('device'),
        other: category('other'),
      },
    });
    const labels = deviceSellerLabels(input.deviceSeller);
    const order: Array<keyof DeviceSellerChain> = [
      'customer',
      'ownerKeeps',
      'contractorInvoice',
      'installerInvoice',
      'contractorKeeps',
    ];
    const deviceMarginNet = roundMoney(input.deviceSeller.deviceSaleNet - category('device').actual);
    const ownerExtrasNet = roundMoney(chain.ownerKeeps.actual - deviceMarginNet);
    const ownerNote =
      Math.abs(ownerExtrasNet) > EPS
        ? `laitekate ${formatEuro(deviceMarginNet)} ${ownerExtrasNet >= 0 ? '+' : '−'} lisätyö ${formatEuro(Math.abs(ownerExtrasNet))}`
        : null;
    parties = order.map((key) => ({
      key,
      label: labels[key],
      note: key === 'ownerKeeps' ? ownerNote : null,
      ...comparisonOf(
        chain![key].estimate,
        chain![key].actual,
        key === 'installerInvoice' ? costVarianceTone : marginVarianceTone,
      ),
    }));
  }

  // Tuomio vertaa vain kiinteää tarjousta tarjouspyyntöön (ei lisälaskutusta).
  // Laitemyyjä-ketjussa tuomio on urakoitsijalle jäävän osuuden ero.
  const contractorKeepsRow = parties?.find((row) => row.key === 'contractorKeeps') ?? null;
  const verdictAmount = contractorKeepsRow
    ? contractorKeepsRow.varianceNet
    : grossMargin
    ? grossMargin.varianceNet == null
      ? null
      : roundMoney(grossMargin.varianceNet - extrasMarginNet)
    : costs.varianceNet == null
      ? null
      : -costs.varianceNet;

  return {
    quoteSaleNet,
    customerExtrasNet,
    saleTotalNet,
    extrasMarginNet,
    marginSaleNet: roundMoney(quoteSaleNet + extrasMarginNet),
    costs,
    grossMargin,
    rows,
    commissionNet: chain ? 0 : roundMoney(partnerMargin?.commissionNet ?? 0),
    commissionPercent: partnerMargin?.commissionPercent ?? 0,
    commissionSource: partnerMargin?.commissionSource ?? 'percent',
    netMarginNet: chain
      ? chain.contractorKeeps.actual
      : roundMoney((partnerMargin?.netMarginNet ?? 0) - provisionalTotal),
    hasMargin: partnerMargin != null,
    verdict: verdictFor(verdictAmount, formatEuro),
    showMarginVariance: marginVarianceDiffersFromCosts(costs, grossMargin),
    parties,
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
  const statement = buildAccountingStatement(summary);
  const lineHtml = (line: AccountingLine) => {
    const strong = line.kind !== 'line';
    const sub = line.sub ? `<div class="muted" style="font-size:11px">${esc(line.sub)}</div>` : '';
    const label = strong ? `<strong>${esc(line.label)}</strong>` : esc(line.label);
    const cell = (value: string) => (strong ? `<strong>${value}</strong>` : value);
    const actual = line.key === 'commission' ? esc(`− ${euro(Math.abs(line.actualNet))}`) : line.key === 'net' ? `<strong style="font-size:15px">${esc(euro(line.actualNet))}</strong>` : cell(esc(euro(line.actualNet)));
    const style = line.kind === 'total' ? ' style="border-top:1px solid #94a3b8"' : '';
    return `<tr${line.kind === 'result' ? ' class="profit-row"' : ''}${style}><td>${label}${sub}</td><td class="num">${cell(esc(money(line.estimateNet)))}</td><td class="num">${actual}</td>${variance(line.varianceNet, line.tone)}</tr>`;
  };
  const section = (title: string) =>
    `<tr><td colspan="4" style="padding-top:8px;font-size:11px;text-transform:uppercase;color:#475569;font-weight:700">${title}</td></tr>`;
  // Asiakas maksaa = Tulot yhteensä → ei toisteta laskutuslaskelmassa.
  const partyRows = summary.parties
    ? summary.parties
        .filter((row) => row.key !== 'customer')
        .map((row, index, all) => {
          const last = index === all.length - 1;
          const noteHtml = row.note ? `<div class="muted" style="font-size:11px">${esc(row.note)}</div>` : '';
          const label = `${last ? `<strong>${esc(row.label)}</strong>` : esc(row.label)}${noteHtml}`;
          const actual = last ? `<strong style="font-size:15px">${esc(euro(row.actualNet))}</strong>` : esc(euro(row.actualNet));
          return `<tr${last ? ' class="profit-row"' : ''}><td>${label}</td><td class="num">${esc(money(row.estimateNet))}</td><td class="num">${actual}</td>${variance(row.varianceNet, row.tone)}</tr>`;
        })
        .join('')
    : '';

  const verdictHtml = summary.verdict
    ? `<p style="margin:6px 0 10px;padding:6px 10px;border-left:5px solid ${PRINT_TONE_COLOR[summary.verdict.tone]};font-size:17px;color:${PRINT_TONE_COLOR[summary.verdict.tone]}"><strong>${esc(summary.verdict.label)}</strong></p>`
    : '';

  return `<div class="quote-outcome-print">
    ${options.quoteTitle ? `<p class="meta-line">Tarjous: ${esc(options.quoteTitle)} · alv 0 %</p>` : ''}
    ${verdictHtml}
    <table>
      <thead><tr><th></th><th class="num">Tarjouspyyntö</th><th class="num">Toteutunut</th><th class="num">Ero</th></tr></thead>
      <tbody>
        ${statement.income ? `${section('Tulot')}${statement.income.map(lineHtml).join('')}` : ''}
        ${section('Kulut')}${statement.costs.map(lineHtml).join('')}
        ${statement.result ? `${section('Kate')}${statement.result.map(lineHtml).join('')}` : ''}
        ${summary.parties ? `${section('Laskutuslaskelma')}${partyRows}` : ''}
      </tbody>
    </table>
  </div>`;
}

/** Tuloslaskelman rivi (TULOT / KULUT / KATE). */
export type AccountingLine = {
  key: string;
  label: string;
  sub: string | null;
  /** total = yhteensä-rivi, result = kate / puhdas kate. */
  kind: 'line' | 'total' | 'result';
} & QuoteOutcomeComparison;

export type AccountingStatement = {
  income: AccountingLine[] | null;
  costs: AccountingLine[];
  /** Kate, provisio, puhdas kate (null: ei katetta tai laskutuslaskelma). */
  result: AccountingLine[] | null;
};

/**
 * Yksinkertainen tuloslaskelma yhteenvedosta: TULOT − KULUT = KATE − provisio = puhdas kate.
 * Luvut ovat täsmälleen samat kuin yhteenvedossa; hyväksyttyjen lisien kulut (kumppani,
 * hankinta) näkyvät omana kulurivinään, jotta tulot − kulut = kate.
 */
export function buildAccountingStatement(summary: QuoteOutcomeSummary): AccountingStatement {
  const hasEstimate = summary.costs.estimateNet != null;
  const line = (
    key: string,
    label: string,
    estimate: number | null,
    actual: number,
    tone: (e: number | null, a: number) => OutcomeTone,
    kind: AccountingLine['kind'] = 'line',
    sub: string | null = null,
  ): AccountingLine => ({ key, label, sub, kind, ...comparisonOf(hasEstimate ? estimate : null, actual, tone) });

  const extrasCostNet = roundMoney(summary.customerExtrasNet - summary.extrasMarginNet);
  const costs: AccountingLine[] = summary.rows.map((row) => ({
    key: row.key,
    label: row.label,
    sub: [row.qtyLabel, row.note].filter(Boolean).join(' · ') || null,
    kind: 'line' as const,
    estimateNet: row.estimateNet,
    actualNet: row.actualNet,
    varianceNet: row.varianceNet,
    tone: row.tone,
  }));
  if (summary.hasMargin && Math.abs(extrasCostNet) > EPS) {
    costs.push(line('extras_costs', 'Lisätöiden kulut', 0, extrasCostNet, costVarianceTone));
  }
  const costsTotal = summary.hasMargin
    ? roundMoney(summary.costs.actualNet + extrasCostNet)
    : summary.costs.actualNet;
  costs.push(line('costs_total', 'Kulut yhteensä', summary.costs.estimateNet, costsTotal, costVarianceTone, 'total'));

  if (!summary.hasMargin || !summary.grossMargin) return { income: null, costs, result: null };

  const income: AccountingLine[] = [
    // Tarjoushinta on sama molemmissa sarakkeissa → ei Ero-lukua.
    { ...line('quote', 'Tarjoushinta', summary.quoteSaleNet, summary.quoteSaleNet, marginVarianceTone), varianceNet: null },
  ];
  if (summary.customerExtrasNet > EPS) {
    income.push(line('extras', 'Lisälaskutus', 0, summary.customerExtrasNet, marginVarianceTone, 'line', 'hyväksytyt lisätyöt ja -kulut'));
  }
  const incomeTotal = line('income_total', 'Tulot yhteensä', summary.quoteSaleNet, summary.saleTotalNet, marginVarianceTone, 'total');
  income.push(summary.customerExtrasNet > EPS ? incomeTotal : { ...incomeTotal, varianceNet: null });

  const gross = summary.grossMargin;
  const kate: AccountingLine = {
    key: 'gross',
    label: 'Kate',
    sub: summary.parties ? 'tulot − kulut, kaikki osapuolet yhteensä' : 'tulot − kulut',
    kind: 'result',
    ...gross,
    // Ilman lisiä kate-ero = tuomio → ei toisteta.
    ...(summary.showMarginVariance ? {} : { varianceNet: null }),
  };
  if (summary.parties) return { income, costs, result: [kate] };
  return {
    income,
    costs,
    result: [
      kate,
      line('commission', `Provisio (${String(Math.round(summary.commissionPercent * 100) / 100).replace('.', ',')} %)`, null, -summary.commissionNet, marginVarianceTone, 'line',
        summary.commissionSource === 'daily_log' ? 'päiväkirjan provisiomerkinnöistä' : summary.commissionSource === 'amount' ? 'sovittu summa' : null),
      line('net', 'Puhdas kate', null, summary.netMarginNet, marginVarianceTone, 'result'),
    ],
  };
}
