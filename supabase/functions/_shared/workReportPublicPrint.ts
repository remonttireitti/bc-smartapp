/**
 * Julkinen asiakastuloste (tulostelinkki /j/:token) — asiakasturvallinen data.
 *
 * Puhdas TS ilman riippuvuuksia: käytetään sekä edge-funktiossa
 * (work-report-print-share, Deno) että selaimessa (WorkReportPublicPrintPage).
 *
 * Säännöt (sama kuin sovelluksen asiakastuloste):
 *  - tarjouksesta luodut / hinnattomat kulurivit (0 €) piilotetaan, kun työraporttiin on linkitetty tarjous
 *  - ei kumppani-/sisäisiä lukuja: hinnat, katteet, urakkasummat, tuntihinnat ja provisio poistetaan
 */

/** Nosta, kun julkisen tulosteen datan muoto muuttuu (näkyy ping-vastauksessa). */
export const WORK_REPORT_PUBLIC_PRINT_VERSION = '2026-10-02';

/** Laite ja km-korvaus eivät ole "hinta puuttuu" -rivejä (vrt. src/lib/expensePriceMissing.ts). */
const PRICE_CHECK_EXCLUDED_TYPES = new Set(['device', 'km']);

type AnyRecord = Record<string, unknown>;

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Sama tarkistus kuin expenseLinePriceMissing (src/lib/expensePriceMissing.ts). */
export function publicPrintExpensePriceMissing(line: AnyRecord): boolean {
  if (PRICE_CHECK_EXCLUDED_TYPES.has(String(line.expense_type ?? ''))) return false;
  if (!String(line.description ?? '').trim()) return false;
  const unit = num(line.unit_price);
  const customer = line.customer_unit_price == null ? 0 : num(line.customer_unit_price);
  return !(unit > 0.005) && !(customer > 0.005);
}

/** Onko työraporttiin linkitetty tarjouspyyntö (billing_quote.quote_request_id). */
export function publicPrintHasLinkedQuote(billingQuote: unknown): boolean {
  if (!billingQuote || typeof billingQuote !== 'object') return false;
  const id = (billingQuote as AnyRecord).quote_request_id;
  return typeof id === 'string' && id.trim().length > 0;
}

const LOG_MONEY_FIELDS = [
  'fixed_price_amount',
  'customer_fixed_price_amount',
  'partner_urakka_margin_percent',
  'hourly_rate_override',
  'customer_hourly_rate_override',
  'commission_amount',
  'commission_note',
  'commission_percent',
  'customer_extra_beyond_quote',
] as const;

const EXPENSE_MONEY_FIELDS = [
  'unit_price',
  'customer_unit_price',
  'customer_margin_percent',
  'warehouse_cost_deducted',
] as const;

const REFRIGERANT_MONEY_FIELDS = ['unit_price', 'customer_unit_price', 'supplier_paid_by'] as const;

function omit(record: AnyRecord, fields: readonly string[]): AnyRecord {
  const copy: AnyRecord = { ...record };
  for (const field of fields) delete copy[field];
  return copy;
}

/**
 * Poista asiakastulosteesta hinnattomat tarjousrivit ja kaikki rahasummat.
 * Idempotentti: voidaan ajaa sekä palvelimella että selaimessa.
 */
export function sanitizeWorkReportPublicPrintLogs<T extends AnyRecord>(
  logs: T[],
  options: { linkedQuoteRequest: boolean },
): T[] {
  return logs.map((log) => {
    const expenseLines = Array.isArray(log.expense_lines) ? (log.expense_lines as AnyRecord[]) : [];
    const visibleExpenses = expenseLines
      .filter((line) => !(options.linkedQuoteRequest && publicPrintExpensePriceMissing(line)))
      .map((line) => omit(line, EXPENSE_MONEY_FIELDS));
    const refrigerantLines = Array.isArray(log.refrigerant_lines)
      ? (log.refrigerant_lines as AnyRecord[]).map((line) => omit(line, REFRIGERANT_MONEY_FIELDS))
      : [];
    const sanitized = omit(log, LOG_MONEY_FIELDS);
    // Asiakkaan lisälaskutusmerkinnät (tuntien "hyväksytty lisätyö" -teksti) säilyvät, summat pois.
    if (log.customer_extra_billing && typeof log.customer_extra_billing === 'object') {
      sanitized.customer_extra_billing = stripMoneyDeep(log.customer_extra_billing);
    }
    return {
      ...sanitized,
      expense_lines: visibleExpenses,
      refrigerant_lines: refrigerantLines,
    } as unknown as T;
  });
}

const MONEY_KEY_PARTS = new Set(['price', 'amount', 'total', 'rate', 'margin', 'cost', 'euro', 'eur', 'percent']);

function isMoneyKey(key: string): boolean {
  return key
    .toLowerCase()
    .split(/[_\s-]+/)
    .some((part) => MONEY_KEY_PARTS.has(part));
}

function stripMoneyDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMoneyDeep);
  if (!value || typeof value !== 'object') return value;
  const out: AnyRecord = {};
  for (const [key, inner] of Object.entries(value as AnyRecord)) {
    if (isMoneyKey(key)) continue;
    out[key] = stripMoneyDeep(inner);
  }
  return out;
}
