import {
  DEFAULT_PARTNER_COMMISSION_PERCENT,
  formatCommissionPercent,
  resolvePartnerCommissionAmount,
  resolvePartnerCommissionPercent,
  type BillingQuoteSettings,
} from './workReportBillingQuote';

/**
 * Tarjouksen provisio (koko työraportti) Provisio-osion lomakkeessa: % katteesta tai sovittu €.
 * Tallennetaan billing_quote.partner_commission_percent / partner_commission_amount -kenttiin.
 * Sovittu € voittaa %:n; tyhjä €-kenttä = prosenttitila.
 */
export type QuoteCommissionDraft = { percent: string; amount: string };

export type QuoteCommissionValue = { percent: number; amount: number | null };

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseDecimal(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatAmountInput(value: number): string {
  return String(roundMoney(value)).replace('.', ',');
}

export function quoteCommissionDraftFromSettings(
  settings: BillingQuoteSettings | null | undefined,
): QuoteCommissionDraft {
  const amount = resolvePartnerCommissionAmount(settings);
  return {
    percent: formatCommissionPercent(resolvePartnerCommissionPercent(settings)),
    amount: amount != null ? formatAmountInput(amount) : '',
  };
}

/**
 * Lomakkeen arvot → tallennettavat arvot. Samat säännöt kuin aiemmassa taulukon editorissa:
 * € syötetty → % säilyy ennallaan; € tyhjä → % (tyhjä = oletus 50 %), 0–100.
 */
export function quoteCommissionFromDraft(
  draft: QuoteCommissionDraft,
  settings: BillingQuoteSettings | null | undefined,
): { value: QuoteCommissionValue } | { error: string } {
  if (draft.amount.trim()) {
    const amount = parseDecimal(draft.amount);
    if (amount == null || amount < 0) {
      return { error: 'Tarkista sovittu provisio (€).' };
    }
    return {
      value: { percent: resolvePartnerCommissionPercent(settings), amount: roundMoney(amount) },
    };
  }
  if (!draft.percent.trim()) {
    return { value: { percent: DEFAULT_PARTNER_COMMISSION_PERCENT, amount: null } };
  }
  const percent = parseDecimal(draft.percent);
  if (percent == null || percent < 0 || percent > 100) {
    return { error: 'Provisio-% pitää olla 0–100.' };
  }
  return { value: { percent: roundMoney(percent), amount: null } };
}

export function quoteCommissionChanged(
  value: QuoteCommissionValue,
  settings: BillingQuoteSettings | null | undefined,
): boolean {
  const currentAmount = resolvePartnerCommissionAmount(settings);
  if ((value.amount == null) !== (currentAmount == null)) return true;
  if (value.amount != null && currentAmount != null) {
    return Math.abs(value.amount - currentAmount) > 0.005;
  }
  return Math.abs(value.percent - resolvePartnerCommissionPercent(settings)) > 0.005;
}

/** Provisio-ruudun alaotsikko, kun tällä kirjauksella ei ole Myyntiprovisiota. */
export function quoteCommissionSubtitle(draft: QuoteCommissionDraft): string {
  if (draft.amount.trim()) return `Tarjous: sovittu ${draft.amount.trim()} €`;
  const percent = draft.percent.trim() || formatCommissionPercent(DEFAULT_PARTNER_COMMISSION_PERCENT);
  return `Tarjous: ${percent} % katteesta`;
}
