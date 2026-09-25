/**
 * Laskutusnäkymän "Vähennykset (varasto ja piikki)" -osion näkyvyys:
 * - avoimia vähennettäviä → koko osio näkyy (oletussuodatin Avoimet)
 * - ei avoimia, mutta vähennettyjä → vain tiivis oikopolkurivi, josta osion voi avata
 * - ei yhtään vähennystä → ei mitään
 */
import { formatEuro } from './workReportBilling';

export type BillingDeductionPanelFilter = 'open' | 'charged' | 'all';

export type BillingDeductionTotalsLike = {
  pending: number;
  charged: number;
  pendingCount: number;
  chargedCount: number;
  totalCount: number;
};

export type BillingDeductionPanelMode = 'full' | 'collapsed' | 'hidden';

export function billingDeductionPanelMode(
  totals: BillingDeductionTotalsLike,
  expanded: boolean,
): BillingDeductionPanelMode {
  if (totals.totalCount === 0) return 'hidden';
  if (totals.pendingCount > 0) return 'full';
  return expanded ? 'full' : 'collapsed';
}

/** Suodatin, jolla osio avataan oikopolusta (ei avoimia → Vähennetty). */
export function billingDeductionExpandFilter(
  totals: BillingDeductionTotalsLike,
): BillingDeductionPanelFilter {
  if (totals.pendingCount > 0) return 'open';
  return totals.chargedCount > 0 ? 'charged' : 'all';
}

/** Voiko täyden osion piilottaa takaisin oikopoluksi. */
export function canCollapseBillingDeductionPanel(totals: BillingDeductionTotalsLike): boolean {
  return totals.totalCount > 0 && totals.pendingCount === 0;
}

/** Oikopolkurivin teksti, esim. "ei avoimia · 2 vähennetty (271,11 €)". */
export function billingDeductionShortcutSummary(totals: BillingDeductionTotalsLike): string {
  const parts: string[] = ['ei avoimia'];
  if (totals.chargedCount > 0) {
    parts.push(`${totals.chargedCount} vähennetty (${formatEuro(totals.charged)})`);
  }
  return parts.join(' · ');
}
