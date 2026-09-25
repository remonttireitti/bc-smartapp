import { DEFAULT_QUOTE_INTRO_TEXT, QUOTE_TYPE_LABELS, isRepairQuoteType } from './constants';
import type { QuoteType } from './types';

/** Alkaako teksti asiakasnimellä (jolloin nimeä ei toisteta otsikossa). */
function startsWithName(text: string, name: string): boolean {
  const t = text.trim().toLocaleLowerCase('fi-FI');
  const n = name.trim().toLocaleLowerCase('fi-FI');
  if (!n || !t.startsWith(n)) return false;
  const rest = t.slice(n.length);
  return rest === '' || /^[\s–—\-:,.]/.test(rest);
}

/**
 * Käyttäjän kirjoittama "Tarjouksen otsikko" (huolto/korjaus: introText), tai '' jos
 * kenttä on tyhjä tai siinä on vain oletusteksti.
 */
export function quoteCustomTitleText(data: { type: QuoteType; introText?: string | null }): string {
  if (!isRepairQuoteType(data.type)) return '';
  const text = String(data.introText ?? '').replace(/\s+/g, ' ').trim();
  if (!text || text === DEFAULT_QUOTE_INTRO_TEXT) return '';
  return text;
}

/** Otsikon osa asiakasnimen jälkeen: oma "Tarjouksen otsikko" tai tarjoustyypin oletus. */
export function quoteTitleSubject(data: { type: QuoteType; introText?: string | null }): string {
  return quoteCustomTitleText(data) || QUOTE_TYPE_LABELS[data.type] || 'Tarjous';
}

export function quoteRequestTitle(
  customerName: string | undefined,
  quoteTypeLabel?: string,
  extra?: string,
): string {
  const base = customerName?.trim() || 'Tarjouspyyntö';
  const parts = [quoteTypeLabel?.trim(), extra?.trim()].filter(Boolean) as string[];
  if (parts.length === 0) return base;
  const joined = parts.join(' • ');
  // Oma otsikko voi jo alkaa asiakasnimellä → ei "Messukeskus – Messukeskus …".
  if (customerName?.trim() && startsWithName(joined, customerName)) return joined;
  return `${base} – ${joined}`;
}

/** Poistaa vanhan vikakuvauksen, joka liitettiin otsikkoon " • "-erottimella. */
export function stripLegacyQuoteTitleSuffix(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  const bullet = text.indexOf(' • ');
  if (bullet > 0) return text.slice(0, bullet).trim();
  return text;
}

/** Asiakasnimi / vanha title-kenttä ilman tyyppiä ja vikatekstiä. */
export function quoteCustomerNameForTitle(
  customerName: string | undefined | null,
  quoteTypeLabel?: string,
): string {
  let base = stripLegacyQuoteTitleSuffix(customerName ?? '');
  if (!base) return '';
  if (quoteTypeLabel) {
    const legacySuffix = ` – ${quoteTypeLabel}`;
    if (base.endsWith(legacySuffix)) {
      base = base.slice(0, -legacySuffix.length).trim();
    }
  }
  return base;
}

export function quoteRequestPageTitle(
  customerName: string | undefined,
  quoteTypeLabel?: string,
): string {
  const shortName = quoteCustomerNameForTitle(customerName, quoteTypeLabel);
  return quoteRequestTitle(shortName || undefined, quoteTypeLabel);
}

export function quoteRequestStoredTitle(
  customerName: string | undefined,
  quoteTypeLabel?: string,
): string {
  return quoteRequestPageTitle(customerName, quoteTypeLabel);
}

export function resolveQuoteDisplayTitle(input: {
  customerName?: string | null;
  quoteTypeLabel?: string;
  storedTitle?: string | null;
}): string {
  if (input.customerName?.trim()) {
    return quoteRequestPageTitle(input.customerName, input.quoteTypeLabel);
  }
  const stripped = stripLegacyQuoteTitleSuffix(input.storedTitle ?? '');
  if (!stripped) return quoteRequestPageTitle(undefined, input.quoteTypeLabel);
  let shortName = quoteCustomerNameForTitle(stripped, input.quoteTypeLabel) || stripped;
  // Tallennettu otsikko "Asiakas – vanha osa" (esim. oletustyyppi ennen omaa otsikkoa)
  // → käytä vain asiakasosaa, ettei otsikko ketjuunnu.
  if (shortName.includes(' – ')) shortName = shortName.split(' – ')[0]?.trim() || shortName;
  return quoteRequestPageTitle(shortName, input.quoteTypeLabel);
}
