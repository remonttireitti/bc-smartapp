import type { CompanySettings } from './management';

export const LAMPOKATSASTUS_MARKETING_TAGLINE =
  'Valitse Lämpökatsastus Oy, kun tarvitset luotettavaa lämpökatsastajaa tai LVI-asiantuntijaa. Voit pyytää meiltä tarjouksen kaiken kattavalle kokonaisuudelle tai vain yksittäiselle tehtävälle. Me panostamme luotettavaan, nopeaan ja asiakaslähtöiseen palveluun. Asioidessasi yli 20 vuoden kokemuksen omaavan toimijan kanssa, voit olla varma, että saat vain parasta laatua!';

export type LampokatsastusContactMeta = {
  companyName: string;
  logoUrl?: string;
  settings?: CompanySettings | null;
};

export function isLampokatsastusCompanyName(companyName: string): boolean {
  const normalized = (companyName || '').toLowerCase();
  return normalized.includes('lämpökatsastus') || normalized.includes('lampokatsastus');
}

export function lampokatsastusContactLines(settings?: CompanySettings | null): string[] {
  const billing = settings?.billing ?? {};
  return [
    settings?.address,
    [settings?.postal_code, settings?.city].filter(Boolean).join(' '),
    settings?.phone ? `Puh. ${settings.phone}` : '',
    settings?.email,
    settings?.website,
    billing.business_id ? `Y-tunnus ${billing.business_id}` : '',
  ].filter((line): line is string => Boolean(line && String(line).trim()));
}

export function lampokatsastusBrandingStyles(): string {
  return `
    .lk-header {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 3px solid #c62828;
    }
    .lk-header-top {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .lk-logo img {
      max-height: 68px;
      max-width: 240px;
      width: auto;
      object-fit: contain;
      display: block;
    }
    .lk-contact {
      text-align: right;
      color: #334155;
      font-size: 10px;
      line-height: 1.5;
    }
    .lk-company-name {
      display: block;
      font-size: 13px;
      color: #1e3a5f;
      margin-bottom: 4px;
    }
    .lk-tagline {
      margin: 12px 0 0;
      padding: 10px 12px;
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
      border-left: 4px solid #2f6aa8;
      border-radius: 0 8px 8px 0;
      color: #334155;
      font-size: 10px;
      line-height: 1.55;
    }
    .lk-header-work-report .lk-work-title-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: end;
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #dbe3ee;
    }
    .lk-header-work-report .lk-work-title-main h1 {
      margin: 4px 0 0;
      font-size: 16px;
      line-height: 1.25;
      color: #0f172a;
    }
    .lk-header-work-report .doc-label {
      font-size: 8.5pt;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: #64748b;
    }
    .lk-header-work-report .lk-print-date {
      text-align: right;
      font-size: 10px;
      color: #475569;
      white-space: nowrap;
    }
    .lk-header-work-report .lk-print-date strong {
      display: block;
      color: #0f172a;
      font-size: 11px;
    }
  `;
}

export function buildLampokatsastusQuoteHeaderHtml(
  meta: LampokatsastusContactMeta,
  helpers: {
    esc: (value: unknown) => string;
    attrUrl: (url: string) => string;
    logoSrc: string;
  },
): string {
  const lines = lampokatsastusContactLines(meta.settings);
  return `<header class="lk-header">
    <div class="lk-header-top">
      <div class="lk-logo"><img src="${helpers.attrUrl(helpers.logoSrc)}" alt="${helpers.esc(meta.companyName)}" /></div>
      <div class="lk-contact">
        <strong class="lk-company-name">${helpers.esc(meta.companyName)}</strong>
        ${lines.map((line) => `<div>${helpers.esc(line)}</div>`).join('')}
      </div>
    </div>
    <p class="lk-tagline">${helpers.esc(LAMPOKATSASTUS_MARKETING_TAGLINE)}</p>
  </header>`;
}

export function buildLampokatsastusWorkReportHeaderHtml(
  meta: LampokatsastusContactMeta,
  helpers: {
    esc: (value: unknown) => string;
    attrUrl: (url: string) => string;
    logoSrc: string;
    printHeadline: string;
    printDate: string;
  },
): string {
  const lines = lampokatsastusContactLines(meta.settings);
  const logoHtml = helpers.logoSrc
    ? `<img src="${helpers.attrUrl(helpers.logoSrc)}" alt="${helpers.esc(meta.companyName)}" />`
    : `<strong>${helpers.esc(meta.companyName)}</strong>`;

  return `<header class="lk-header lk-header-work-report">
    <div class="lk-header-top">
      <div class="lk-logo">${logoHtml}</div>
      <div class="lk-contact">
        <strong class="lk-company-name">${helpers.esc(meta.companyName)}</strong>
        ${lines.map((line) => `<div>${helpers.esc(line)}</div>`).join('')}
      </div>
    </div>
    <div class="lk-work-title-row">
      <div class="lk-work-title-main">
        <div class="doc-label">Työraportti</div>
        <h1>${helpers.esc(helpers.printHeadline)}</h1>
      </div>
      <div class="lk-print-date">
        <span class="doc-label">Tulostettu</span>
        <strong>${helpers.esc(helpers.printDate)}</strong>
      </div>
    </div>
    <p class="lk-tagline">${helpers.esc(LAMPOKATSASTUS_MARKETING_TAGLINE)}</p>
  </header>`;
}
