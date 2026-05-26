export function quoteRequestTitle(
  customerName: string | undefined,
  quoteTypeLabel?: string,
  extra?: string,
): string {
  const base = customerName?.trim() || 'Tarjouspyyntö';
  const parts = [quoteTypeLabel, extra?.trim()].filter(Boolean);
  return parts.length > 0 ? `${base} – ${parts.join(' • ')}` : base;
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
  const shortName =
    quoteCustomerNameForTitle(stripped, input.quoteTypeLabel) ||
    stripped.split(' – ')[0]?.trim() ||
    stripped;
  return quoteRequestPageTitle(shortName, input.quoteTypeLabel);
}
