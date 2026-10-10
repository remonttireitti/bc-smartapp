/** Kulurivin hinta puuttuu -tarkistus (ilman riippuvuuksia, jotta sitä voi käyttää kaikkialla). */
export type PriceCheckExpenseLine = {
  expense_type?: string | null;
  description?: string | null;
  unit_price?: number | string | null;
  customer_unit_price?: number | string | null;
  /** Käyttäjä vahvisti hinnaksi 0 € (kulua ei syntynyt) — customer_extra_billing.supply_line_flags. */
  price_confirmed?: boolean | null;
};

/** Laite ja km-korvaus eivät ole "hinta puuttuu" -rivejä (laite omalla ruudullaan, km hinnoitellaan taksalla). */
const PRICE_CHECK_EXCLUDED_TYPES = new Set(['device', 'km']);

/** Kulurivi ilman hintaa: hankinta 0 € eikä asiakashintaa. */
export function expenseLinePriceMissing(line: PriceCheckExpenseLine): boolean {
  if (line.price_confirmed === true) return false;
  return expenseLineHasNoPrice(line);
}

/** Rivillä ei ole hintaa (0 €), riippumatta 0 €:n vahvistuksesta (esim. asiakastuloste piilottaa). */
export function expenseLineHasNoPrice(line: PriceCheckExpenseLine): boolean {
  if (PRICE_CHECK_EXCLUDED_TYPES.has(String(line.expense_type ?? ''))) return false;
  if (!String(line.description ?? '').trim()) return false;
  const unit = Number(line.unit_price);
  const customer = line.customer_unit_price == null ? 0 : Number(line.customer_unit_price);
  return !(Number.isFinite(unit) && unit > 0.005) && !(Number.isFinite(customer) && customer > 0.005);
}

