import type { QuoteRequestData } from './types';

/** Maps legacy Firestore quote fields before normalizing to QuoteRequestData. */
export function applyLegacyQuoteFields(
  raw: Record<string, unknown>,
  meta: Record<string, unknown> = {},
): Record<string, unknown> {
  const source = { ...meta, ...raw };
  const out = { ...raw };

  if (!out.selectedDeviceId && typeof source.deviceId === 'string' && source.deviceId.trim()) {
    out.selectedDeviceId = source.deviceId.trim();
  }

  if (!out.validUntil) {
    if (typeof source.offerValidUntil === 'string' && source.offerValidUntil.trim()) {
      out.validUntil = source.offerValidUntil.slice(0, 10);
    } else if (typeof source.date === 'string' && source.date.trim()) {
      out.validUntil = source.date.slice(0, 10);
    }
  }

  const deviceOptions = source.deviceOptions;
  if (Array.isArray(deviceOptions) && deviceOptions.length > 0) {
    deviceOptions.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const row = entry as Record<string, unknown>;
      const id =
        typeof row.deviceId === 'string' ? row.deviceId : typeof row.id === 'string' ? row.id : '';
      if (!id) return;
      if (index === 0 && !out.selectedDeviceId) out.selectedDeviceId = id;
      if (index === 1 && !out.altDevice1Id) out.altDevice1Id = id;
      if (index === 2 && !out.altDevice2Id) out.altDevice2Id = id;
    });
  }

  if (typeof source.customerName === 'string' && source.customerName.trim()) {
    out.legacyCustomerName = source.customerName.trim();
  }

  if (!out.customerPhone && typeof source.customerPhone === 'string') {
    out.customerPhone = source.customerPhone;
  }
  if (!out.customerEmail && typeof source.customerEmail === 'string') {
    out.customerEmail = source.customerEmail;
  }

  if (!out.deviceModel && typeof source.deviceName === 'string' && source.deviceName.trim()) {
    out.deviceModel = source.deviceName.trim();
  }

  if (!out.roomHeight && source.roomHeight != null) {
    const height = Number(source.roomHeight);
    if (Number.isFinite(height) && height > 0) out.roomHeight = height;
  }

  // Migrate legacy situation report text only when notes was never stored (empty string = cleared).
  if (
    typeof source.notes !== 'string' &&
    typeof source.situationReportText === 'string' &&
    source.situationReportText.trim()
  ) {
    out.notes = source.situationReportText.trim();
  }

  if (!out.vilpBrandChoice && typeof source.deviceBrand === 'string') {
    const brand = source.deviceBrand.trim();
    if (brand === 'Daikin' || brand === 'Inventor' || brand === 'Samsung') {
      out.vilpBrandChoice = brand;
    }
  }

  return out;
}

import { quoteCustomerNameForTitle, stripLegacyQuoteTitleSuffix } from './title';

export function quoteCustomerDisplayName(input: {
  title?: string | null;
  customers?: { name?: string | null } | null;
  data?: unknown;
}): string {
  const data = input.data;
  if (data && typeof data === 'object' && 'legacyCustomerName' in data) {
    const legacy = (data as { legacyCustomerName?: string }).legacyCustomerName?.trim();
    if (legacy) return quoteCustomerNameForTitle(legacy) || legacy;
  }
  if (input.customers?.name?.trim()) {
    const short = quoteCustomerNameForTitle(input.customers.name);
    return short || input.customers.name.trim();
  }
  const title = stripLegacyQuoteTitleSuffix(input.title ?? '');
  if (title) return title.split(' – ')[0]?.trim() || title;
  return 'Ei asiakasta';
}

export function quoteDeviceDisplayLabel(data: QuoteRequestData, equipmentName?: string | null): string {
  if (equipmentName?.trim()) return equipmentName.trim();
  if (data.deviceModel.trim()) return data.deviceModel.trim();
  if (data.selectedDeviceId.trim()) return data.selectedDeviceId.trim();
  return '';
}
