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
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 3px solid #c62828;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .lk-header-top {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .lk-header--quote .lk-header-top {
      grid-template-columns: 1fr;
      justify-items: center;
    }
    .lk-header--quote .lk-logo img {
      margin: 0 auto;
    }
    .lk-logo img {
      max-height: 56px;
      max-width: 220px;
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
      margin: 10px 0 0;
      padding: 10px 14px;
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
      border-left: 4px solid #2f6aa8;
      border-radius: 0 8px 8px 0;
      color: #334155;
      font-size: var(--quote-tagline-font-size, 11.5px);
      line-height: 1.5;
      text-align: center;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .lk-header--quote .lk-tagline {
      border-left: none;
      border-radius: 8px;
      border-top: 3px solid #2f6aa8;
    }
    .lk-footer {
      margin-top: auto;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 16px;
      align-items: start;
      font-size: 9px;
      color: #475569;
      line-height: 1.45;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .lk-footer--contact-only {
      grid-template-columns: 1fr;
    }
    .lk-footer--contact-only .lk-footer-contact {
      text-align: center;
    }
    .lk-footer-terms-title {
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .lk-footer-contact {
      text-align: right;
    }
    .lk-footer-contact .lk-company-name {
      font-size: 11px;
      margin-bottom: 2px;
    }
    .quote-print-page-2 {
      page-break-before: always;
      break-before: page;
      min-height: calc(297mm - 24mm);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .quote-print-page-2-body {
      flex: 1 1 auto;
    }
    .lk-work-title-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: end;
      margin: 0 0 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid #dbe3ee;
    }
    .lk-work-title-main h1 {
      margin: 4px 0 0;
      font-size: 16px;
      line-height: 1.25;
      color: #0f172a;
    }
    .lk-work-title-row .doc-label {
      font-size: 8.5pt;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: #64748b;
    }
    .lk-work-title-row .lk-print-date {
      text-align: right;
      font-size: 10px;
      color: #475569;
      white-space: nowrap;
    }
    .lk-work-title-row .lk-print-date strong {
      display: block;
      color: #0f172a;
      font-size: 11px;
    }
  `;
}

export const LAMPOKATSASTUS_SERVICE_TERMS_TITLE_SUFFIX = 'Huoltoehdot';
export const LAMPOKATSASTUS_SERVICE_TERMS_BODY =
  'Työ suoritetaan alan hyvän työtavan mukaisesti. Hinnat sisältävät tarjouksessa eritellyt työt ja materiaalit. Lisätyöt ja odottamattomat vauriot sovitaan erikseen ennen jatkotoimenpiteitä.';

export const LAMPOKATSASTUS_OFFER_TERMS_TITLE_SUFFIX = 'Takuut, huolto ja asennusehdot';
export const LAMPOKATSASTUS_OFFER_TERMS_BODY =
  'Tämä tarjous on suuntaa-antava. Hinnat ovat voimassa tarjouksen voimassaoloaikana ellei toisin mainita. Työhön sisältyvät materiaalit ja tuntityöt kuten eritelty. Asennus- ja huoltotyöt suoritetaan alan hyvän työtavan mukaisesti. Takuuehdot ja mahdolliset lisätyöt sovitaan erikseen ennen tilausta.';

export function buildLampokatsastusQuoteHeaderHtml(
  meta: LampokatsastusContactMeta,
  helpers: {
    esc: (value: unknown) => string;
    attrUrl: (url: string) => string;
    logoSrc: string;
  },
): string {
  return `<header class="lk-header lk-header--quote">
    <div class="lk-header-top">
      <div class="lk-logo"><img src="${helpers.attrUrl(helpers.logoSrc)}" alt="${helpers.esc(meta.companyName)}" /></div>
    </div>
    <p class="lk-tagline">${helpers.esc(LAMPOKATSASTUS_MARKETING_TAGLINE)}</p>
  </header>`;
}

export function buildLampokatsastusQuoteTaglineHtml(helpers: {
  esc: (value: unknown) => string;
}): string {
  return `<p class="lk-tagline">${helpers.esc(LAMPOKATSASTUS_MARKETING_TAGLINE)}</p>`;
}

export function buildLampokatsastusQuoteFooterHtml(
  meta: LampokatsastusContactMeta,
  helpers: {
    esc: (value: unknown) => string;
    termsTitleSuffix: string;
    termsBody: string;
  },
): string {
  const lines = lampokatsastusContactLines(meta.settings);
  return `<footer class="lk-footer">
    <div class="lk-footer-terms">
      <div class="lk-footer-terms-title">${helpers.esc(meta.companyName)} – ${helpers.esc(helpers.termsTitleSuffix)}</div>
      <div>${helpers.esc(helpers.termsBody)}</div>
    </div>
    <div class="lk-footer-contact">
      <strong class="lk-company-name">${helpers.esc(meta.companyName)}</strong>
      ${lines.map((line) => `<div>${helpers.esc(line)}</div>`).join('')}
    </div>
  </footer>`;
}

export function buildLampokatsastusWorkReportHeaderHtml(
  meta: LampokatsastusContactMeta,
  helpers: {
    esc: (value: unknown) => string;
    attrUrl: (url: string) => string;
    logoSrc: string;
  },
): string {
  // Identical structure to tarjousasiakastuloste: logo top-center + centered tagline.
  // Document title and company contact live outside this header (title below, contact in footer).
  return buildLampokatsastusQuoteHeaderHtml(meta, helpers);
}

export const LAMPOKATSASTUS_WORK_REPORT_TERMS_TITLE_SUFFIX = 'Huolto- ja työehdot';
export const LAMPOKATSASTUS_WORK_REPORT_TERMS_BODY =
  'Työ suoritetaan alan hyvän työtavan mukaisesti. Raportti kuvaa suoritetut työt ja käytetyt materiaalit. Lisätyöt ja odottamattomat vauriot sovitaan erikseen ennen jatkotoimenpiteitä.';

/** Yritystiedot footerissa — sama rakenne kuin tarjoustulosteessa. */
export function buildLampokatsastusWorkReportFooterHtml(
  meta: LampokatsastusContactMeta,
  helpers: {
    esc: (value: unknown) => string;
  },
): string {
  return buildLampokatsastusQuoteFooterHtml(meta, {
    esc: helpers.esc,
    termsTitleSuffix: LAMPOKATSASTUS_WORK_REPORT_TERMS_TITLE_SUFFIX,
    termsBody: LAMPOKATSASTUS_WORK_REPORT_TERMS_BODY,
  });
}
