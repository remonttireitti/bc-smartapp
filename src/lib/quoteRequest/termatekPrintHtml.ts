import type { BrandDeliveryFeeByCategoryMap } from '../../data/devicePricingShared';
import type { HeatPumpDevice } from '../../data/pumpDeviceCatalog';
import { computeKotitalousDeduction, computeIilpCoolingEnergyEstimate, computeQuoteTotals, computePumpSizingNeedKw, computeTravelNet, effectiveIilpPurpose, resolveIilpLaborPricingMode, travelCostLabel } from './calculations';
import { DEFAULT_IILP_ENERGY_SAVINGS_TEXT, DEFAULT_IILP_PAYMENT_TERMS } from './constants';
import {
  DEFAULT_TERMATEK_IILP_QUOTE_TERMS,
  defaultQuoteTermsTextForType,
  filterQuoteTermsTextForPrint,
  quoteTermsPlainTextToHtml,
  quoteTermsPrintHasAnyEnabled,
  resolveQuoteTermsPrintFlags,
} from './termatekDefaultTerms';
import type { QuoteTermsPrintFlags } from './types';
import { calculateDeviceSellNet, findDeviceById, resolveQuoteMainDeviceForTotals } from './deviceCatalog';
import type { QuotePrintCustomer, QuotePrintMeta } from './printHtml';
import {
  buildTermatekAssetMap,
  embedTermatekAssets,
  embedTermatekProductImages,
  embedUrlAsDataUrl,
  getTermatekAssetBase,
  resolveTermatekProductImages,
  type TermatekAssetMap,
  type TermatekProductImage,
} from './termatekAssets';
import type { QuoteRequestData } from './types';
import { vilpIndoorConfigLabel } from './vilpCompatibility';

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDateFi(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fi-FI');
}

function formatOfferNumber(meta: QuotePrintMeta): string {
  if (meta.quoteNumber) return meta.quoteNumber;
  const d = meta.quoteDate ? new Date(meta.quoteDate) : new Date();
  if (Number.isNaN(d.getTime())) return '—';
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}01`;
}

export function isTermatekCompany(meta: QuotePrintMeta): boolean {
  return (meta.companyName || '').toLowerCase().includes('termatek');
}

function isIilpQuote(data: QuoteRequestData): boolean {
  return data.type === 'ilma-ilma';
}

function defaultProductTitle(data: QuoteRequestData, device: HeatPumpDevice | null): string {
  return device?.name ?? (isIilpQuote(data) ? 'Ilmalämpöpumppu' : 'Vesi-ilmalämpöpumppu');
}

function formatRoundedHourlyRate(gross: number, vatRate: number): string {
  const rounded = Math.round(Number(gross) || 0);
  return `${rounded} €/h (sis. ALV ${vatRate} %)`;
}

function buildInstallScopeBullets(data: QuoteRequestData): string[] {
  const bullets: string[] = [];
  if (data.iilpIndoorPlacement.trim()) {
    bullets.push(`Sisäyksikkö sijoitetaan ${data.iilpIndoorPlacement.trim()}`);
  }
  if (data.iilpOutdoorPlacement.trim()) {
    bullets.push(`Ulkoyksikkö ${data.iilpOutdoorPlacement.trim()}`);
  }
  if (Number(data.iilpPipeLengthM) > 0) {
    bullets.push(`Putkitus noin ${data.iilpPipeLengthM} m`);
  }
  if (data.iilpElectricalNotes.trim()) {
    bullets.push(data.iilpElectricalNotes.trim());
  }
  if (data.iilpCondensateNotes.trim()) {
    bullets.push(data.iilpCondensateNotes.trim());
  }
  return bullets;
}

function resolveDevicePrintFeatures(device: HeatPumpDevice | null): string[] {
  if (!device) return [];
  const fromCatalog = device.printFeatures?.filter(Boolean) ?? [];
  if (fromCatalog.length) return fromCatalog;
  const brand = (device.brand || '').toLowerCase();
  if (brand.includes('daikin')) {
    return [
      'Erittäin hiljainen käyttö',
      'Wifi-ohjaus puhelimella (Daikin Onecta)',
      'Tehokas jäähdytys suuriin tiloihin',
      'Korkea energiatehokkuus',
      'Tunnettu Daikin-laatu',
    ];
  }
  if (brand.includes('inventor')) {
    return [
      'Wifi-ohjaus puhelimella',
      'Tehokas jäähdytys ja lämmitys',
      'Hiljainen käynti',
      'Energiatehokas invertteritekniikka',
    ];
  }
  if (brand.includes('samsung')) {
    return [
      'Wifi-ohjaus puhelimella',
      'Tehokas jäähdytys ja lämmitys',
      'Hiljainen käynti',
      'Luotettava Samsung-laatu',
    ];
  }
  return [];
}

function buildProductBenefitsHtml(device: HeatPumpDevice | null): string {
  const features = resolveDevicePrintFeatures(device);
  if (!features.length) return '';
  return `
    <div class="product-card">
      <div class="section-title" style="margin-top:0;">Laitteen edut</div>
      <ul class="compact-list">${features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
    </div>`;
}

function formatKwh(value: number): string {
  return value.toLocaleString('fi-FI', { maximumFractionDigits: 1 });
}

function buildEnergySavingsHtml(data: QuoteRequestData, device: HeatPumpDevice | null): string {
  if (!isIilpQuote(data)) return '';
  const purpose = effectiveIilpPurpose(data);
  const isCoolingOnly = purpose === 'cooling';

  if (data.iilpEnergySavingsText.trim()) {
    const title = isCoolingOnly ? 'Arvioitu jäähdytyskulutus' : 'Arvioitu sähkönsäästö';
    return `
    <div class="savings-box">
      <div class="section-title" style="margin-top:0;">${title}</div>
      <p class="savings-text">${esc(data.iilpEnergySavingsText.trim())}</p>
    </div>`;
  }

  if (isCoolingOnly) {
    const est = computeIilpCoolingEnergyEstimate(data, device);
    if (!est) return '';
    const text =
      `Arvioitu energiankulutus jäähdytyksessä noin ${formatKwh(est.kwhPerDayMin)}–${formatKwh(est.kwhPerDayMax)} kWh/päivä ` +
      `(noin ${formatEuro(est.eurPerDayMin)}–${formatEuro(est.eurPerDayMax)}/päivä) tyypillisellä ${est.hoursPerDay} h käytöllä. ` +
      `Arvio perustuu kohteen mitoitukseen (${formatKwh(est.peakCoolingKw)} kW huippujäähdytys, SCOP ~${est.cop.toLocaleString('fi-FI')}).`;
    return `
    <div class="savings-box">
      <div class="section-title" style="margin-top:0;">Arvioitu jäähdytyskulutus</div>
      <p class="savings-text">${esc(text)}</p>
    </div>`;
  }

  return `
    <div class="savings-box">
      <div class="section-title" style="margin-top:0;">Arvioitu sähkönsäästö</div>
      <p class="savings-text">${esc(DEFAULT_IILP_ENERGY_SAVINGS_TEXT)}</p>
    </div>`;
}

function buildKotitalousExtrasHtml(
  kotitalous: ReturnType<typeof computeKotitalousDeduction>,
  vatRate: number,
): string {
  if (kotitalous.laborOnlyGross <= 0) return '';
  const pct = (kotitalous.percent * 100).toFixed(0);
  const spouseNote =
    kotitalous.withSpouse > kotitalous.onePerson
      ? ` (kahdella yhteensä enintään ${formatEuro(kotitalous.withSpouse)})`
      : '';
  return `
    <span class="k">Asennustyön osuus</span><span>${formatEuro(kotitalous.laborOnlyGross)} (sis. ALV ${vatRate} %)</span>
    <span class="k">Kotitalousvähennykseen oikeuttava työn osuus</span><span>${formatEuro(kotitalous.laborOnlyGross)} (sis. ALV ${vatRate} %)</span>
    <span class="k">Arvioitu kotitalousvähennys</span><span>${formatEuro(kotitalous.onePerson)}${spouseNote} — ${pct} %, enintään ${formatEuro(kotitalous.maxPerPerson)} / hlö</span>`;
}

function companyInfoLines(input: {
  meta: QuotePrintMeta;
  billing: { business_id?: string; vat_id?: string };
  settings: {
    phone?: string;
    email?: string;
    tukes_number?: string;
  };
  companyAddress: string;
  websiteDisplay: string;
}): string {
  const { meta, billing, settings, companyAddress, websiteDisplay } = input;
  const lines: string[] = [`<div class="tmk-line"><strong>${esc(meta.companyName)}</strong></div>`];
  if (billing.business_id) lines.push(`<div class="tmk-line">Y-tunnus: ${esc(billing.business_id)}</div>`);
  if (billing.vat_id) lines.push(`<div class="tmk-line">ALV-tunnus: ${esc(billing.vat_id)}</div>`);
  if (companyAddress) lines.push(`<div class="tmk-line">${esc(companyAddress)}</div>`);
  if (settings.tukes_number) {
    lines.push(`<div class="tmk-line">Tukes-pätevyys: ${esc(settings.tukes_number)}</div>`);
  }
  if (settings.phone) lines.push(`<div class="tmk-line">Puh: ${esc(settings.phone)}</div>`);
  if (settings.email) lines.push(`<div class="tmk-line">${esc(settings.email)}</div>`);
  if (websiteDisplay) lines.push(`<div class="tmk-line">${esc(websiteDisplay)}</div>`);
  return lines.join('');
}

function buildAcceptanceSectionHtml(customer: QuotePrintCustomer): string {
  return `
      <div class="acceptance-section">
        <div class="summary-title">Tarjouksen hyväksyntä</div>
        <p class="acceptance-lead">Hyväksyn tarjouksen ja tilaan työn toteutettavaksi alla olevan mukaisesti.</p>
        <div class="acceptance-grid">
          <div class="acceptance-field">
            <div class="acceptance-label">Asiakkaan nimi</div>
            <div class="acceptance-line">${esc(customer.name)}</div>
          </div>
          <div class="acceptance-field">
            <div class="acceptance-label">Päivämäärä</div>
            <div class="acceptance-line"></div>
          </div>
          <div class="acceptance-field acceptance-field--wide">
            <div class="acceptance-label">Allekirjoitus</div>
            <div class="acceptance-line acceptance-line--sign"></div>
          </div>
        </div>
      </div>`;
}
function deviceIntroBullets(data: QuoteRequestData, device: HeatPumpDevice | null): string[] {
  const name = defaultProductTitle(data, device);
  if (isIilpQuote(data)) {
    return [`Ilmalämpöpumpun asennus: ${name}`, ...buildInstallScopeBullets(data)];
  }
  const indoorLabel = vilpIndoorConfigLabel(data.vilpIndoorConfig);
  const indoor =
    data.vilpIndoorConfig === 'integroitu'
      ? ' (Integroitu varaaja)'
      : indoorLabel && indoorLabel !== 'Ilman varaajaa / monoblock'
        ? ` (${indoorLabel})`
        : '';
  return [`Vesi-ilmalämpöpumpun asennus: ${name}${indoor}`.trim()];
}

function introBulletsHtml(bullets: string[]): string {
  return bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join('');
}

function formatPowerRange(min: number | undefined, max: number | undefined): string {
  if (min == null || max == null) return '—';
  return `${min} – ${max} kW`;
}

function buildProductFactsHtml(data: QuoteRequestData, device: HeatPumpDevice | null): string {
  if (isIilpQuote(data)) {
    return `
    <div class="fact-grid">
      <div class="fact-card"><div class="fact-k">Laitetyyppi</div><div class="fact-v">Ilmalämpöpumppu</div></div>
      <div class="fact-card"><div class="fact-k">Merkki</div><div class="fact-v">${esc(device?.brand ?? '—')}</div></div>
      <div class="fact-card"><div class="fact-k">Malli</div><div class="fact-v">${esc(device?.model ?? '—')}</div></div>
      <div class="fact-card"><div class="fact-k">Jäähdytysteho</div><div class="fact-v">${formatPowerRange(device?.coolingPowerMin, device?.coolingPowerMax)}</div></div>
      <div class="fact-card"><div class="fact-k">Lämmitysteho</div><div class="fact-v">${formatPowerRange(device?.heatingPowerMin, device?.heatingPowerMax)}</div></div>
      <div class="fact-card"><div class="fact-k">Toimitussisältö</div><div class="fact-v">Sisä- ja ulkoyksikkö</div></div>
    </div>`;
  }
  return `
    <div class="fact-grid">
      <div class="fact-card"><div class="fact-k">Laitetyyppi</div><div class="fact-v">Vesi-ilmalämpöpumppu</div></div>
      <div class="fact-card"><div class="fact-k">Merkki</div><div class="fact-v">${esc(device?.brand ?? '—')}</div></div>
      <div class="fact-card"><div class="fact-k">Malli</div><div class="fact-v">${esc(device?.model ?? '—')}</div></div>
      <div class="fact-card"><div class="fact-k">Lämmitysteho</div><div class="fact-v">${formatPowerRange(device?.heatingPowerMin, device?.heatingPowerMax)}</div></div>
      <div class="fact-card"><div class="fact-k">Toimitussisältö</div><div class="fact-v">Ulkoyksikkö + sisäyksikkö</div></div>
    </div>`;
}

function buildVilpFallbackTermsHtml(flags: QuoteTermsPrintFlags): string {
  const parts: string[] = [
    `<div class="terms-title">Termatek – Takuut, huolto ja asennusehdot</div>`,
    `<div class="terms-lead">Tämä asiakirja toimii Termatekin vesi–ilmalämpöpumppujen (VILP) myyntiä ja asennusta koskevana ehtopohjana. Ehdot koskevat sekä kuluttaja- että yritysasiakkaita, ellei toisin mainita.</div>`,
  ];
  if (flags.warranty) {
    parts.push(
      `<h3>1. Takuut</h3>`,
      `<p><strong>1.1 Asennustyön takuu</strong> — Termatek myöntää suorittamalleen asennustyölle kahden (2) vuoden takuun.</p>`,
      `<p><strong>1.2 Laitetakuu</strong> — Laitteiden ja tarvikkeiden osalta noudatetaan kunkin valmistajan voimassa olevia takuuehtoja.</p>`,
    );
  }
  if (flags.commissioning) {
    parts.push(
      `<h3>2. Käyttöönotto ja dokumentaatio</h3>`,
      `<p>Asennuksen valmistuttua Termatek luovuttaa tilaajalle käyttö- ja huolto-ohjeet, käyttöönotto-dokumentit sekä käyttöönotto-pöytäkirjan.</p>`,
    );
  }
  if (flags.operationMaintenance) {
    parts.push(
      `<h3>3. Järjestelmän käyttö ja vastuut</h3>`,
      `<p>Vesi–ilmalämpöpumpun asianmukainen toiminta edellyttää oikein mitoitettua lämmönjakojärjestelmää, määräysten mukaista sähköliitäntää sekä ohjeiden noudattamista.</p>`,
      `<h3>4. Huolto</h3>`,
      `<p>Laitteen takuun voimassaolo edellyttää huoltoa valmistajan ohjeiden mukaisesti. Termatek tarjoaa erikseen sovittaessa huoltoja ja huoltosopimuksia.</p>`,
    );
  }
  if (flags.extraWork) {
    parts.push(
      `<h3>5. Lisätyöt</h3>`,
      `<p>Mahdolliset lisätyöt suoritetaan vain tilaajan hyväksynnällä ja laskutetaan erikseen.</p>`,
    );
  }
  if (flags.general) {
    parts.push(
      `<h3>6. Sovellettava laki</h3>`,
      `<p>Sopimukseen sovelletaan Suomen lakia. Kuluttaja-asiakkaiden osalta noudatetaan kuluttajansuojalainsäädäntöä.</p>`,
    );
  }
  return parts.join('\n');
}

function buildIilpFallbackTermsHtml(flags: QuoteTermsPrintFlags): string {
  const parts: string[] = [
    `<div class="terms-title">Termatek – Takuut, huolto ja asennusehdot</div>`,
    `<div class="terms-lead">Tämä asiakirja toimii Termatekin ilma–ilmalämpöpumppujen (IILP) myyntiä ja asennusta koskevana ehtopohjana. Ehdot koskevat sekä kuluttaja- että yritysasiakkaita, ellei toisin mainita.</div>`,
  ];
  if (flags.warranty) {
    parts.push(
      `<h3>1. Takuut</h3>`,
      `<p><strong>1.1 Asennustyön takuu</strong> — Termatek myöntää suorittamalleen asennustyölle kahden (2) vuoden takuun. Takuu kattaa asennusvirheistä johtuvat viat, jotka ilmenevät takuuaikana. Takuu ei kata normaalia kulumista, käyttövirheitä, puutteellisesta huollosta johtuvia vikoja eikä kolmansien osapuolien tekemiä muutoksia tai korjauksia.</p>`,
      `<p><strong>1.2 Laitetakuu</strong> — Laitteiden ja tarvikkeiden osalta noudatetaan kunkin valmistajan voimassa olevia takuuehtoja. Valmistajan takuu kattaa materiaali- ja valmistusvirheet, mutta ei virheellisestä käytöstä tai asennusympäristöstä johtuvia vaurioita. Mahdollisista laajennetuista takuista sovitaan erikseen ja ne kirjataan tilausvahvistukseen.</p>`,
    );
  }
  if (flags.commissioning) {
    parts.push(
      `<h3>2. Käyttöönotto ja dokumentaatio</h3>`,
      `<p>Asennuksen valmistuttua Termatek luovuttaa tilaajalle käyttö- ja huolto-ohjeet, käyttöönotto-dokumentit sekä käyttöönotto-pöytäkirjan, joka toimii laitteen takuuainestona. Tilaajan vastuulla on säilyttää dokumentaatio takuuajan ja mahdollista huoltoa varten.</p>`,
    );
  }
  if (flags.operationMaintenance) {
    parts.push(
      `<h3>3. Järjestelmän käyttö ja vastuut</h3>`,
      `<p>Ilma–ilmalämpöpumpun asianmukainen toiminta edellyttää oikein mitoitettua ja toimivaa lämmönjakojärjestelmää, määräysten mukaista sähköliitäntää sekä käyttö- ja huolto-ohjeiden noudattamista. Termatek ei vastaa järjestelmän toimintahäiriöistä tai energiatehokkuudesta, mikäli ne johtuvat rakennuksen rakenteista tai eristyksestä, olemassa olevan lämmönjakojärjestelmän puutteista tai tilaajan tekemistä muutoksista järjestelmään.</p>`,
      `<h3>4. Huolto</h3>`,
      `<p>Laitteen takuun voimassaolo edellyttää huoltoa valmistajan ohjeiden mukaisesti. Termatek tarjoaa erikseen sovittaessa määräaikaishuoltoja, huoltosopimuksia sekä järjestelmän tarkastuksia myös takuuajan jälkeen.</p>`,
    );
  }
  if (flags.extraWork) {
    parts.push(
      `<h3>5. Lisätyöt</h3>`,
      `<p>Mahdolliset lisätyöt suoritetaan vain tilaajan hyväksynnällä ja laskutetaan erikseen. Termatek pidättää oikeuden tehdä vähäisiä teknisiä muutoksia asennustapaan, mikäli ne parantavat järjestelmän toimivuutta tai turvallisuutta.</p>`,
    );
  }
  if (flags.general) {
    parts.push(
      `<h3>6. Sovellettava laki</h3>`,
      `<p>Sopimukseen sovelletaan Suomen lakia. Kuluttaja-asiakkaiden osalta noudatetaan kuluttajansuojalainsäädäntöä. Mahdolliset erimielisyydet pyritään ensisijaisesti ratkaisemaan neuvotteluteitse.</p>`,
    );
  }
  return parts.join('\n');
}

function buildTermsHtml(data: QuoteRequestData): string {
  const flags = resolveQuoteTermsPrintFlags(data);
  if (!quoteTermsPrintHasAnyEnabled(flags)) return '';

  const sourceText =
    data.quoteTermsText?.trim() ||
    (isIilpQuote(data) ? DEFAULT_TERMATEK_IILP_QUOTE_TERMS : defaultQuoteTermsTextForType(data.type));

  if (sourceText) {
    const filtered = filterQuoteTermsTextForPrint(sourceText, flags);
    if (!filtered.trim()) return '';
    return `
      <div class="terms-title">Termatek – Takuut, huolto ja asennusehdot</div>
      ${quoteTermsPlainTextToHtml(filtered)}`;
  }

  if (isIilpQuote(data)) {
    const html = buildIilpFallbackTermsHtml(flags);
    return html.includes('<h3>') ? html : '';
  }

  const html = buildVilpFallbackTermsHtml(flags);
  return html.includes('<h3>') ? html : '';
}

function buildContactSectionHtml(input: {
  meta: QuotePrintMeta;
  billing: { business_id?: string; vat_id?: string };
  companyAddress: string;
  coverLocationLine: string;
  settings: { phone?: string; email?: string; website?: string; tukes_number?: string };
  websiteDisplay: string;
  customer: QuotePrintCustomer;
}): string {
  const { meta, billing, companyAddress, coverLocationLine, settings, websiteDisplay, customer } = input;
  return `
      <div class="summary-title terms-contact-title">Yritystiedot ja yhteystiedot</div>
      <div class="tuu-info-grid">
        <div class="tuu-info-block">
          <div class="tuu-info-title">Yritystiedot</div>
          <div class="tuu-line"><strong>${esc(meta.companyName)}</strong></div>
          ${billing.business_id ? `<div class="tuu-line">Y-tunnus: ${esc(billing.business_id)}</div>` : ''}
          ${billing.vat_id ? `<div class="tuu-line">ALV-tunnus: ${esc(billing.vat_id)}</div>` : ''}
          ${companyAddress ? `<div class="tuu-line">${esc(companyAddress)}</div>` : ''}
          ${coverLocationLine ? `<div class="tuu-line">${esc(coverLocationLine)}</div>` : ''}
          ${settings.tukes_number ? `<div class="tuu-line">Tukes-pätevyys: ${esc(settings.tukes_number)}</div>` : ''}
        </div>
        <div class="tuu-info-block">
          <div class="tuu-info-title">Yhteystiedot</div>
          ${settings.phone ? `<div class="tuu-line">Puh: ${esc(settings.phone)}</div>` : ''}
          ${settings.email ? `<div class="tuu-line">${esc(settings.email)}</div>` : ''}
          ${websiteDisplay ? `<div class="tuu-line">${esc(websiteDisplay)}</div>` : ''}
        </div>
      </div>
      <div class="tuu-muted">Asennus- ja takuuehdot on kuvattu tarjouksen ehtosivulla.</div>
      ${buildAcceptanceSectionHtml(customer)}`;
}

function buildCoverPageHtml(input: {
  offerNo: string;
  customer: QuotePrintCustomer;
  meta: QuotePrintMeta;
  productLabel: string;
  coverImageSrc: string;
}): string {
  const { offerNo, customer, meta, productLabel, coverImageSrc } = input;
  const benefits = [
    'Mitoitus kohteen mukaan',
    'Tukes-pätevä asennus',
    'Käyttöönotto ja opastus',
    '2 vuoden asennustakuu',
  ];
  return `
      <div class="cover-hero">
        <img src="${esc(coverImageSrc)}" alt="${esc(meta.companyName)}" />
      </div>
      <div class="cover-title">${esc(productLabel)}</div>
      <div class="cover-lead">Tarjous asiakkaalle <strong>${esc(customer.name)}</strong>. Alla esitetty hinta, toimitussisältö ja ehdot.</div>
      <div class="cover-benefits">
        ${benefits
          .map(
            (benefit) =>
              `<div class="cover-benefit"><span class="cover-benefit-mark">✓</span><span>${esc(benefit)}</span></div>`,
          )
          .join('')}
      </div>
      <div class="tmk-hero-badgebar cover-badgebar">
        <div class="row"><div class="l">Tarjous # ${esc(offerNo)}</div><div class="r">${formatDateFi(meta.quoteDate)}</div></div>
      </div>`;
}

function hourlyWorkGrossRows(
  data: QuoteRequestData,
  vatMult: number,
): Array<{ desc: string; hours: number; gross: number }> {
  const rows: Array<{ desc: string; hours: number; gross: number }> = [];
  for (const item of data.workItems) {
    const hours = Number(item.hours) || 0;
    if (hours <= 0) continue;
    const net = hours * Number(item.pricePerHour || 0);
    rows.push({
      desc: item.description.trim() || 'Työ',
      hours,
      gross: net * vatMult,
    });
  }
  if (!rows.length && Number(data.laborHours) > 0) {
    rows.push({
      desc: 'Asennustyö',
      hours: Number(data.laborHours),
      gross: Number(data.laborHours) * Number(data.laborRate || 0) * vatMult,
    });
  }
  return rows;
}

type PricingLine = { label: string; gross: number };

function buildTermatekPricingLines(input: {
  data: QuoteRequestData;
  totals: ReturnType<typeof computeQuoteTotals>;
  vatMult: number;
  productTitle: string;
  deviceGross: number;
}): PricingLine[] {
  const { data, totals, vatMult, productTitle, deviceGross } = input;
  const lines: PricingLine[] = [];
  const isUrakka = data.type === 'ilma-ilma' && resolveIilpLaborPricingMode(data) === 'urakka';

  if (isUrakka) {
    if (totals.iilpBaseInstall.laborGross > 0) {
      lines.push({ label: 'Asennustyö (urakka)', gross: totals.iilpBaseInstall.laborGross });
    }
  } else {
    for (const row of hourlyWorkGrossRows(data, vatMult)) {
      if (row.gross <= 0) continue;
      lines.push({
        label: `${row.desc} (${row.hours.toLocaleString('fi-FI', { maximumFractionDigits: 1 })} h)`,
        gross: row.gross,
      });
    }
  }

  const travelNet = computeTravelNet(data);
  if (travelNet > 0) {
    lines.push({ label: travelCostLabel(data), gross: travelNet * vatMult });
  }

  const materialItems = data.materials.filter((m) => m.name.trim());
  let listedMaterialsGross = 0;
  if (materialItems.length > 0) {
    for (const item of materialItems) {
      const qty = Number(item.quantity) || 0;
      const rowGross = qty * Number(item.sellPrice) * vatMult;
      listedMaterialsGross += rowGross;
      if (rowGross <= 0 && qty <= 0) continue;
      lines.push({
        label: qty > 0 ? `${item.name.trim()} (${qty} kpl)` : item.name.trim(),
        gross: rowGross,
      });
    }
  } else if (totals.iilpBaseInstall.materialsGross > 0) {
    listedMaterialsGross = totals.iilpBaseInstall.materialsGross;
    lines.push({ label: 'Asennustarvikkeet', gross: totals.iilpBaseInstall.materialsGross });
  }

  const targetMaterialsGross = totals.materialsNet * vatMult;
  const materialsGap = Math.max(0, targetMaterialsGross - listedMaterialsGross);
  if (materialsGap > 0.005) {
    lines.push({ label: 'Tarvikkeet', gross: materialsGap });
  } else if (!materialItems.length && !totals.iilpBaseInstall.enabled && targetMaterialsGross > 0) {
    lines.push({ label: 'Tarvikkeet', gross: targetMaterialsGross });
  }

  const resolvedDeviceGross = totals.deviceNet * vatMult;
  const displayDeviceGross = deviceGross > 0 ? deviceGross : resolvedDeviceGross;
  if (displayDeviceGross > 0) {
    lines.push({ label: `Laite: ${productTitle}`, gross: displayDeviceGross });
  }

  return lines;
}

function buildPricingSectionHtml(input: {
  lines: PricingLine[];
  vatRate: number;
  discountPct: number;
  discountGross: number;
  finalGross: number;
  kotitalousHtml: string;
  deliveryLine: string;
  paymentLine: string;
  extraWorkRateLabel: string;
  optionalNotesHtml: string;
}): string {
  const {
    lines,
    vatRate,
    discountPct,
    discountGross,
    finalGross,
    kotitalousHtml,
    deliveryLine,
    paymentLine,
    extraWorkRateLabel,
    optionalNotesHtml,
  } = input;

  const lineRows = lines
    .map(
      (line) => `<tr><td>${esc(line.label)}</td><td class="num">${formatEuro(line.gross)}</td></tr>`,
    )
    .join('');

  return `
      <div class="summary-title">Hinnan muodostuminen</div>
      <div class="summary-note-box">Hinnat ovat verollisia (sis. ALV ${vatRate}%).</div>
      <table class="price-table price-table--summary">
        <thead><tr><th>Kuvaus</th><th class="num">Yhteensä (sis. ALV ${vatRate}%)</th></tr></thead>
        <tbody>
          ${lineRows || '<tr><td colspan="2">—</td></tr>'}
          ${discountPct > 0 ? `<tr><td>Kokonaisalennus ${discountPct}%</td><td class="num">- ${formatEuro(discountGross)}</td></tr>` : ''}
          <tr class="total final"><td>Lopullinen tarjoushinta</td><td class="num">${formatEuro(finalGross)}</td></tr>
        </tbody>
      </table>
      <div class="section-title">Lisätiedot</div>
      <div class="extras-grid">
        ${kotitalousHtml}
        <span class="k">Toimitusehto ja aika</span><span>${esc(deliveryLine)}</span>
        <span class="k">Maksuehto</span><span>${esc(paymentLine)}</span>
        <span class="k">Lisätyöt</span><span>${esc(extraWorkRateLabel)}</span>
      </div>
      ${optionalNotesHtml ? `<div class="section-title">Tuotteet ja palvelut tarjouksen mukaisesti</div>${optionalNotesHtml}` : ''}`;
}

function termatekStyles(): string {
  return `
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, sans-serif; color: #111; }
    .a4 { width: 210mm; position: relative; box-sizing: border-box; }
    .page { page-break-after: always; break-after: page; box-sizing: border-box; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .page--terms-flow {
      page-break-before: always;
      break-before: page;
      page-break-after: auto;
      break-after: auto;
    }
    .page--contact {
      page-break-before: always;
      break-before: page;
    }
    .page--cover {
      min-height: 297mm;
      display: flex;
      flex-direction: column;
    }
    .page--cover .content { flex: 1 0 auto; padding: 8mm 15mm 6mm 15mm; }
    .page--cover .footer { margin-top: auto; }
    .page--sheet .content { padding: 6mm 15mm 5mm 15mm; }
    table { page-break-inside: auto; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    .section-title, .summary-title, .product-title { break-after: avoid; page-break-after: avoid; }
    .header {
      height: 18mm;
      background: transparent;
      padding: 2mm 8mm;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      border-bottom: 0.3mm solid #d0d7de;
      overflow: hidden;
    }
    .header.header--termatek {
      justify-content: center;
      padding: 2mm 3mm;
      height: 22mm;
      overflow: hidden;
      background: #072855;
      border-bottom: 0;
    }
    .header.header--termatek .brand-banner {
      height: 18mm; width: 100%; max-width: none; object-fit: contain; display: block; margin: 0;
    }
    .footer.footer--bar {
      height: 12mm;
      margin: 0 3mm 3mm 3mm;
      background: #072855;
      padding: 0;
    }
    .content {
      box-sizing: border-box;
      font-size: 10.1pt;
      line-height: 1.32;
    }
    .tmk-kicker { font-size: 10pt; font-weight: 800; letter-spacing: .6px; color: #072855; text-transform: uppercase; }
    .tmk-hero-grid { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 10mm; margin-top: 4mm; }
    .tmk-hero-grid--cover { grid-template-columns: 1fr; }
    .cover-hero { margin-top: 3mm; border-radius: 4mm; overflow: hidden; border: 0.4mm solid #dbeafe; break-inside: avoid; page-break-inside: avoid; }
    .cover-hero img { width: 100%; height: 58mm; object-fit: cover; object-position: center 42%; display: block; }
    .cover-title { margin-top: 5mm; font-size: 20pt; font-weight: 900; line-height: 1.15; color: #072855; }
    .cover-lead { margin-top: 4mm; font-size: 11pt; line-height: 1.42; color: #111; max-width: 92%; }
    .cover-benefits { margin-top: 10mm; display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm; }
    .cover-benefit { display: flex; align-items: center; gap: 2.5mm; padding: 3.5mm 4mm; border: 0.4mm solid #c7d2fe; border-radius: 3mm; background: #eff6ff; font-size: 10pt; font-weight: 700; color: #072855; line-height: 1.25; }
    .cover-benefit-mark { flex: 0 0 auto; color: #1f4e79; font-weight: 900; }
    .cover-badgebar { margin-top: 14mm; }
    .tmk-hero-title { margin-top: 2mm; font-size: 22pt; font-weight: 900; line-height: 1.08; color: #072855; }
    .tmk-hero-lead { margin-top: 4mm; font-size: 11.5pt; line-height: 1.45; color: #111; }
    .tmk-hero-cards { margin-top: 8mm; display: grid; grid-template-columns: 1fr; gap: 4.5mm; }
    .tmk-hero-card { border: 0.5mm solid rgba(0,0,0,0.12); border-radius: 4mm; padding: 5mm 5.5mm; background: #fff; }
    .tmk-hero-card .t { font-weight: 900; color: #072855; margin-bottom: 1.5mm; }
    .tmk-hero-card .p { font-size: 10.2pt; color: #111; line-height: 1.35; }
    .tmk-hero-badgebar { margin-top: 10mm; border-radius: 5mm; background: #eff6ff; border: 1px solid #c7d2fe; padding: 5mm 5.5mm; }
    .tmk-hero-badgebar .row { display: flex; justify-content: space-between; gap: 8mm; align-items: center; }
    .tmk-hero-badgebar .l, .tmk-hero-badgebar .r { font-weight: 900; color: #1f4e79; font-size: 11pt; }
    .tmk-hero-badgebar .r { white-space: nowrap; }
    .hero-img-grid { display: grid; gap: 4mm; margin-top: 3mm; }
    .hero-img-grid.one { grid-template-columns: 1fr; }
    .hero-img-grid.two { grid-template-columns: 1fr 1fr; }
    .hero-img-grid.three { grid-template-columns: 1fr 1fr; }
    .hero-img-box { border: 0.5mm solid rgba(0,0,0,0.10); border-radius: 4mm; padding: 3mm; background: #fff; }
    .hero-img-box img { width: 100%; height: 52mm; object-fit: contain; display: block; }
    .hero-img-caption { margin-top: 1.5mm; font-size: 9pt; font-weight: 700; color: #072855; text-align: center; }
    .product-card { border: 0.5mm solid rgba(0,0,0,0.10); border-radius: 4mm; padding: 3mm 3.5mm; background: #fff; break-inside: avoid; page-break-inside: avoid; }
    .tmk-intro-title-row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 1mm; }
    .tmk-intro-title { font-size: 15pt; font-weight: 800; }
    .tmk-intro-no { font-size: 11pt; font-weight: 800; color: #072855; }
    .tmk-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: 4mm; align-items: start; }
    .tmk-info-block { border: 0.5mm solid rgba(0,0,0,0.14); border-radius: 3mm; padding: 3.8mm 4.2mm; background: #fff; }
    .tmk-info-title { font-weight: 800; color: #072855; margin: 0 0 2mm 0; }
    .tmk-info-block .tmk-line { margin: 0; padding: 1.1mm 0; font-size: 9.85pt; line-height: 1.45; }
    .tmk-intro-copy { margin-top: 5mm; border: 1px solid #e5e7eb; border-radius: 12px; padding: 4.5mm 5mm 5mm 5mm; background: #fff; break-inside: avoid; page-break-inside: avoid; }
    .tmk-meta { font-size: 9.75pt; line-height: 1.4; break-inside: avoid; page-break-inside: avoid; }
    .tmk-meta .row { display: flex; align-items: baseline; gap: 3mm; margin: 1.15mm 0; min-height: 1.35em; }
    .tmk-meta .label { min-width: 40mm; font-weight: 700; color: #072855; flex: 0 0 40mm; }
    .tmk-meta .value { flex: 1 1 auto; font-size: 9.75pt; margin: 0; line-height: 1.4; }
    .tmk-lead { margin-top: 3.5mm; font-size: 10.2pt; line-height: 1.42; padding-left: 5.5mm; padding-right: 1mm; }
    .tmk-bullets { margin: 2mm 0 0 0; padding-left: 9.5mm; font-size: 9.85pt; line-height: 1.42; }
    .tmk-bullets li { margin: 1mm 0; padding-left: 0.3mm; }
    .sitrep-wrap { margin-top: 5mm; padding: 4mm 4.5mm; border: 0.4mm solid #d4a574; border-radius: 3mm; background: #fffbf5; break-inside: avoid; page-break-inside: avoid; }
    .sitrep-title { font-weight: 800; color: #92400e; font-size: 11pt; margin-bottom: 2mm; }
    .sitrep-body { font-size: 9.6pt; line-height: 1.45; color: #111; white-space: pre-wrap; }
    .product-title { font-size: 14.5pt; font-weight: 700; margin-bottom: 3.5mm; }
    .product-subtitle { font-size: 10pt; color: #333; margin-top: -2mm; margin-bottom: 3.5mm; }
    .product-layout { display: grid; grid-template-columns: 1.08fr 0.92fr; gap: 6mm; align-items: start; }
    .tmk-quote-product { margin-top: 0; padding-top: 0; border-top: 0; }
    .tmk-quote-product .product-title { font-size: 12pt; margin-bottom: 2mm; }
    .tmk-quote-product .img-card img { height: 38mm; }
    .tmk-quote-product .fact-k { font-size: 8.2pt; }
    .tmk-quote-product .fact-v { font-size: 9.2pt; }
    .tmk-quote-product .product-card { padding: 2.5mm 3mm; }
    .tmk-quote-product .compact-list { font-size: 9.2pt; }
    .tmk-quote-pricing { margin-top: 4mm; padding-top: 3mm; border-top: 0.5mm solid #e5e7eb; }
    .tmk-quote-pricing .summary-title { font-size: 12pt; margin-bottom: 3mm; }
    .tmk-quote-pricing .price-table { font-size: 9.2pt; }
    .product-side { display: grid; gap: 3mm; }
    .img-grid { display: grid; gap: 4mm; margin: 2mm 0 4mm 0; }
    .img-grid.two { grid-template-columns: 1fr 1fr; }
    .img-grid.three { grid-template-columns: 1fr 1fr 1fr; }
    .img-card { border: 0.5mm solid rgba(0,0,0,0.12); border-radius: 3mm; padding: 4mm; background: #fff; }
    .img-label { font-weight: 600; font-size: 10.5pt; margin-bottom: 2mm; }
    .img-card img { width: 100%; height: 42mm; object-fit: contain; display: block; }
    .fact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; }
    .fact-card { border: 0.5mm solid rgba(0,0,0,0.10); border-radius: 3mm; padding: 2.2mm 2.8mm; background: #fff; }
    .fact-k { font-size: 8.8pt; text-transform: uppercase; letter-spacing: .4px; color: #6b7280; font-weight: 700; }
    .fact-v { margin-top: 0.6mm; font-size: 9.9pt; font-weight: 700; color: #111; line-height: 1.2; }
    .section-title { font-weight: 700; margin-top: 2.5mm; margin-bottom: 1.8mm; }
    .compact-list { margin: 0.6mm 0 0 4.5mm; break-inside: avoid; page-break-inside: avoid; }
    .compact-list li { margin: 0.35mm 0; line-height: 1.2; break-inside: avoid; page-break-inside: avoid; }
    .summary-title { font-size: 13pt; font-weight: 700; margin-bottom: 5mm; }
    .summary-note-box { padding: 4mm 4.5mm; border: 0.5mm solid #c7d2fe; border-radius: 4mm; background: #eff6ff; font-size: 10pt; line-height: 1.4; color: #1f2937; margin-bottom: 4mm; }
    .price-table { width: 100%; border-collapse: collapse; margin-top: 2.5mm; font-size: 9.8pt; }
    .price-table th, .price-table td { border: 1px solid #e6e6e6; padding: 6px 8px; vertical-align: top; }
    .price-table th { background: #f7f7f7; font-weight: 600; text-align: left; }
    .price-table .num { text-align: right; white-space: nowrap; }
    .price-table tr.total td { font-weight: 700; }
    .price-table tr.final td { font-size: 11pt; border-top: 0.6mm solid #072855; padding-top: 8px; }
    .price-table--summary { margin-bottom: 4mm; }
    .extras-grid { display: grid; grid-template-columns: 34mm 1fr; gap: 2mm 4mm; font-size: 9.5pt; margin-top: 4mm; }
    .extras-grid .k { font-weight: 600; color: #374151; }
    .terms-title { font-size: 12pt; font-weight: 600; margin-bottom: 2.5mm; color: #072855; }
    .terms-lead { font-size: 10pt; color: #111; margin-bottom: 4mm; }
    .terms h3 { font-size: 10.5pt; margin: 3mm 0 1.5mm 0; color: #072855; break-after: avoid; page-break-after: avoid; }
    .terms p { font-size: 10pt; margin: 0 0 2mm 0; break-inside: auto; page-break-inside: auto; }
    .terms ul { break-inside: auto; page-break-inside: auto; }
    .terms-compact { font-size: 8.8pt; line-height: 1.28; }
    .terms-compact .terms-title { font-size: 10.5pt; margin-bottom: 2mm; }
    .terms-compact .terms-lead { font-size: 8.8pt; margin-bottom: 2.5mm; line-height: 1.3; }
    .terms-compact h3 { font-size: 9pt; margin: 2mm 0 1mm; }
    .terms-compact p { font-size: 8.8pt; margin: 0 0 1.5mm; line-height: 1.28; }
    .terms-compact ul { margin: 0 0 2mm 3mm; padding-left: 4mm; }
    .terms-compact li { font-size: 8.5pt; margin: 0.4mm 0; line-height: 1.26; }
    .terms-contact-title { font-size: 12pt; margin-bottom: 3mm; }
    .page--contact .content { padding: 8mm 15mm 10mm 15mm; }
    .page--contact .tuu-info-grid { margin-top: 2mm; }
    .tuu-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 6mm; }
    .tuu-info-block { border: 1px solid #e5e7eb; border-radius: 12px; padding: 4mm 4.5mm; background: #fff; }
    .tuu-info-title { font-weight: 800; color: #072855; margin-bottom: 2.5mm; }
    .tuu-line { margin: 0.45mm 0; font-size: 9.7pt; line-height: 1.25; }
    .tuu-muted { margin-top: 4mm; font-size: 9.7pt; color: #111; line-height: 1.4; }
    .savings-box { margin-top: 4mm; padding: 4mm 4.5mm; border: 0.5mm solid #c7d2fe; border-radius: 4mm; background: #eff6ff; break-inside: avoid; page-break-inside: avoid; }
    .savings-text { margin: 0; font-size: 9.5pt; line-height: 1.4; color: #1f2937; }
    .acceptance-section { margin-top: 8mm; padding-top: 5mm; border-top: 0.5mm solid #e5e7eb; break-inside: avoid; page-break-inside: avoid; }
    .acceptance-lead { font-size: 9.8pt; margin: 0 0 4mm 0; line-height: 1.4; }
    .acceptance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm 8mm; }
    .acceptance-field--wide { grid-column: 1 / -1; }
    .acceptance-label { font-size: 8.8pt; font-weight: 700; color: #072855; margin-bottom: 1.5mm; }
    .acceptance-line { min-height: 8mm; border-bottom: 0.4mm solid #111; font-size: 10pt; padding-top: 1mm; }
    .acceptance-line--sign { min-height: 14mm; }
  `;
}

function productImagesHtml(productImages: TermatekProductImage[]): string {
  if (!productImages.length) return '';
  const gridClass = productImages.length === 3 ? 'three' : 'two';
  return `
    <div class="img-grid ${gridClass}">
      ${productImages
        .map(
          (img) => `
        <div class="img-card">
          <div class="img-label">${esc(img.label)}</div>
          <img src="${esc(img.src)}" alt="${esc(img.alt)}" />
        </div>`,
        )
        .join('')}
    </div>`;
}

export function generateTermatekVilpPrintHtml(input: {
  data: QuoteRequestData;
  customer: QuotePrintCustomer;
  meta: QuotePrintMeta;
  feeMap?: BrandDeliveryFeeByCategoryMap | null;
  assets?: TermatekAssetMap;
  productImages?: TermatekProductImage[];
}) {
  const { data, customer, meta, feeMap = null } = input;
  const assetBase = getTermatekAssetBase();
  const assets = input.assets ?? buildTermatekAssetMap(assetBase);
  const settings = meta.settings ?? {};
  const billing = settings.billing ?? {};
  const totals = computeQuoteTotals(data, feeMap);
  const kotitalous = computeKotitalousDeduction(data);
  const device = resolveQuoteMainDeviceForTotals(data, computePumpSizingNeedKw(data));
  const vatRate = Number(data.vatRate) || 0;
  const vatMult = 1 + vatRate / 100;
  const offerNo = formatOfferNumber(meta);
  const productTitle = defaultProductTitle(data, device);
  const introBullets = deviceIntroBullets(data, device);
  const iilp = isIilpQuote(data);
  const productImages =
    input.productImages
    ?? resolveTermatekProductImages({
      quoteType: data.type,
      data,
      device,
      assets,
      productTitle,
    });
  const deviceGross = device
    ? calculateDeviceSellNet(data, device, feeMap) * vatMult
    : totals.deviceNet * vatMult;
  const subtotalGross = totals.subtotalNet * vatMult;
  const discountPct = Math.max(0, Math.min(100, Number(data.overallDiscountPercent || 0)));
  const discountGross = subtotalGross * (discountPct / 100);
  const finalGross = subtotalGross - discountGross;
  const extraWorkGross = Number(data.laborRate || 0) * vatMult;
  const extraWorkRateLabel = formatRoundedHourlyRate(extraWorkGross, vatRate);
  const deliveryLine = data.deliveryTermsText.trim() || 'Työt sovitaan erikseen asiakkaan kanssa.';
  const paymentLine =
    data.paymentTermsText.trim()
    || billing.payment_terms
    || (iilp ? DEFAULT_IILP_PAYMENT_TERMS : '14 pv netto');
  const customerAddress = [customer.address, customer.city].filter(Boolean).join(', ');
  const companyAddress = [settings.address, [settings.postal_code, settings.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const websiteDisplay = (settings.website || 'www.termatek.fi').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const coverLocationLine = [settings.postal_code, settings.city].filter(Boolean).join(' ') || 'Vantaa, 01350';

  const situationHtml =
    data.situationReportEnabled && data.situationReportText.trim()
      ? `<div class="sitrep-wrap">
          <div class="sitrep-title">${esc(data.situationReportTitle.trim() || 'Tilanneraportti')}</div>
          <div class="sitrep-body">${esc(data.situationReportText).replace(/\n/g, '<br />')}</div>
        </div>`
      : '';

  const headerHtml = `<div class="header header--termatek"><img class="brand-banner" src="${esc(assets.header)}" alt="${esc(meta.companyName)}" /></div>`;
  const footerHtml = `<div class="footer footer--bar"></div>`;
  const productFactsHtml = buildProductFactsHtml(data, device);
  const coverProductLabel = iilp ? 'Ilmalämpöpumpun tarjous' : 'Vesi-ilmalämpöpumpun tarjous';
  const coverPageHtml = buildCoverPageHtml({
    offerNo,
    customer,
    meta,
    productLabel: coverProductLabel,
    coverImageSrc: assets.coverBg,
  });
  const optionalNotesHtml = data.notes.trim()
    ? data.notes
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => `<div class="tuu-line">${esc(line)}</div>`)
        .join('')
    : '';

  const productBenefitsHtml = buildProductBenefitsHtml(device);
  const energySavingsHtml = buildEnergySavingsHtml(data, device);
  const kotitalousHtml = buildKotitalousExtrasHtml(kotitalous, vatRate);
  const termsHtml = buildTermsHtml(data);

  const productSubtitleHtml = iilp
    ? ''
    : `<div class="product-subtitle">Sisäyksikkö: ${esc(vilpIndoorConfigLabel(data.vilpIndoorConfig))}</div>`;

  const pricingSectionHtml = buildPricingSectionHtml({
    lines: buildTermatekPricingLines({ data, totals, vatMult, productTitle, deviceGross }),
    vatRate,
    discountPct,
    discountGross,
    finalGross,
    kotitalousHtml,
    deliveryLine,
    paymentLine,
    extraWorkRateLabel,
    optionalNotesHtml,
  });

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>Tarjous # ${esc(offerNo)} – ${esc(customer.name)}</title>
  <style>${termatekStyles()}</style>
</head>
<body>
  <div class="a4 page page--cover">
    ${headerHtml}
    <div class="content">
      ${coverPageHtml}
    </div>
    ${footerHtml}
  </div>

  <div class="a4 page page--sheet">
    ${headerHtml}
    <div class="content">
      <div class="tmk-intro-title-row">
        <div class="tmk-intro-title">Tarjous</div>
        <div class="tmk-intro-no">Tarjous # ${esc(offerNo)}</div>
      </div>
      <div class="tmk-info-grid">
        <div class="tmk-info-block">
          <div class="tmk-info-title">Yritystiedot</div>
          ${companyInfoLines({ meta, billing, settings, companyAddress, websiteDisplay })}
        </div>
        <div class="tmk-info-block">
          <div class="tmk-info-title">Asiakastiedot</div>
          <div class="tmk-line"><strong>${esc(customer.name)}</strong></div>
          ${customerAddress ? `<div class="tmk-line">${esc(customerAddress)}</div>` : ''}
          ${data.customerEmail ? `<div class="tmk-line">${esc(data.customerEmail)}</div>` : ''}
          ${data.customerPhone ? `<div class="tmk-line">${esc(data.customerPhone)}</div>` : ''}
        </div>
      </div>
      <div class="tmk-intro-copy">
        <div class="tmk-meta">
          <div class="row"><span class="label">Antopäivä:</span><span class="value">${formatDateFi(meta.quoteDate)}</span></div>
          <div class="row"><span class="label">Tarjous voimassa:</span><span class="value">${formatDateFi(data.validUntil)}</span></div>
          <div class="row"><span class="label">Toimitusehto ja aika:</span><span class="value">${esc(deliveryLine)}</span></div>
          <div class="row"><span class="label">Maksuehto:</span><span class="value">${esc(paymentLine)}</span></div>
          <div class="row"><span class="label">Lisätyöt:</span><span class="value">${esc(extraWorkRateLabel)}</span></div>
          <div class="row"><span class="label">Huom.:</span><span class="value">Mikäli työn aikana havaitaan aiheutuvia lisä- ja/tai muutostöitä, veloitetaan ne erikseen tilaajan hyväksynnällä.</span></div>
        </div>
        <div class="tmk-lead"><strong>Tarjouksen sisältö</strong></div>
        <ul class="tmk-bullets">${introBulletsHtml(introBullets)}</ul>
      </div>
      ${situationHtml}
    </div>
  </div>

  <div class="a4 page page--sheet">
    ${headerHtml}
    <div class="content">
      <div class="tmk-quote-product">
        <div class="product-title">${esc(productTitle)}</div>
        ${productSubtitleHtml}
        <div class="product-layout">
          <div>${productImagesHtml(productImages)}</div>
          <div class="product-side">
            ${productFactsHtml}
            ${productBenefitsHtml}
          </div>
        </div>
      </div>
      ${energySavingsHtml}
      <div class="tmk-quote-pricing">
        ${pricingSectionHtml}
      </div>
    </div>
  </div>

  ${termsHtml ? `
  <div class="a4 page--terms-flow page--sheet">
    ${headerHtml}
    <div class="content terms terms-compact">
      ${termsHtml}
    </div>
  </div>` : ''}

  <div class="a4 page page--sheet page--contact">
    ${headerHtml}
    <div class="content">
      ${buildContactSectionHtml({
        meta,
        billing,
        companyAddress,
        coverLocationLine,
        settings,
        websiteDisplay,
        customer,
      })}
    </div>
  </div>
</body>
</html>`;
}

export async function prepareTermatekVilpPrintHtml(input: {
  data: QuoteRequestData;
  customer: QuotePrintCustomer;
  meta: QuotePrintMeta;
  feeMap?: BrandDeliveryFeeByCategoryMap | null;
}): Promise<string> {
  const assetBase = getTermatekAssetBase();
  const assets = await embedTermatekAssets(buildTermatekAssetMap(assetBase));
  if (input.meta.logoUrl) {
    assets.logo = await embedUrlAsDataUrl(input.meta.logoUrl);
  }
  const device = findDeviceById(input.data.selectedDeviceId);
  const productTitle = defaultProductTitle(input.data, device);
  let productImages = resolveTermatekProductImages({
    quoteType: input.data.type,
    data: input.data,
    device,
    assets,
    productTitle,
  });
  productImages = await embedTermatekProductImages(productImages);
  return generateTermatekVilpPrintHtml({ ...input, assets, productImages });
}
