/**
 * Tarjouspyynnön ↔ työraportin kohdistus (puhdas logiikka, ei tietokantaa).
 *
 * Linkki on kannassa kahdessa paikassa:
 * - quote_requests.work_report_id → työraportti (tarjous → raportti)
 * - work_report_billable.billing_quote.quote_request_id → tarjous (raportti → tarjous, snapshot
 *   tarjouksen hinnoista ja hankintariveistä "Tarjous ja kate" -laskentaan)
 *
 * Sovellus pitää linkin 1:1: yksi tarjous kuuluu yhteen raporttiin ja raportilla on yksi tarjous
 * (billing_quote on yksi JSON). Vanhat puolikkaat linkit (vain toinen puoli asetettu) lasketaan
 * silti linkiksi, ja kohdistus korjaa aina molemmat puolet.
 */
import { getWorkStatusLabel } from '../types';
import { QUOTE_STATUS_LABELS } from './quoteRequest/defaults';
import {
  billingQuoteFromQuoteRow,
  parseBillingQuoteSettings,
  type BillingQuoteSettings,
} from './workReportBillingQuote';

export type QuoteLinkRow = {
  id: string;
  title: string | null;
  status: string;
  customer_id: string | null;
  customer_name?: string | null;
  owner_company_id?: string | null;
  work_report_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type WorkReportLinkRow = {
  id: string;
  title: string | null;
  status: string;
  customer_id: string | null;
  customer_name?: string | null;
  owner_company_id?: string | null;
  scheduled_start?: string | null;
  created_at?: string | null;
};

/** raportti-id → tarjous-id, kerättynä molemmilta puolilta. */
export type QuoteReportLinkIndex = {
  quoteToReport: Map<string, string>;
  reportToQuotes: Map<string, string[]>;
};

function addToIndex(index: QuoteReportLinkIndex, quoteId: string, reportId: string) {
  if (!index.quoteToReport.has(quoteId)) index.quoteToReport.set(quoteId, reportId);
  const list = index.reportToQuotes.get(reportId) ?? [];
  if (!list.includes(quoteId)) list.push(quoteId);
  index.reportToQuotes.set(reportId, list);
}

/**
 * Yhdistää linkit: quote_requests.work_report_id ensin (ensisijainen), sitten
 * billing_quote.quote_request_id (vanhat raportin puolen linkit).
 */
export function buildQuoteReportLinkIndex(input: {
  quotes: Array<Pick<QuoteLinkRow, 'id' | 'work_report_id'>>;
  billingLinks: Array<{ work_report_id: string; quote_request_id: string | null | undefined }>;
}): QuoteReportLinkIndex {
  const index: QuoteReportLinkIndex = { quoteToReport: new Map(), reportToQuotes: new Map() };
  for (const quote of input.quotes) {
    if (quote.work_report_id) addToIndex(index, quote.id, quote.work_report_id);
  }
  for (const link of input.billingLinks) {
    const quoteId = link.quote_request_id?.trim();
    if (quoteId) addToIndex(index, quoteId, link.work_report_id);
  }
  return index;
}

/** "Tilattu, ei työraporttia": tilattu tarjous, jota mikään raportti ei kohdista. */
export function isOrderedQuoteWithoutReport(
  quote: Pick<QuoteLinkRow, 'id' | 'status' | 'work_report_id'>,
  index?: QuoteReportLinkIndex | null,
): boolean {
  if (quote.status !== 'ordered') return false;
  if (quote.work_report_id) return false;
  return !index?.quoteToReport.has(quote.id);
}

function norm(value: string | null | undefined): string {
  return String(value ?? '').toLowerCase();
}

function timeOf(value: string | null | undefined): number {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function matchesQuery(parts: Array<string | null | undefined>, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = parts.map(norm).join(' ');
  return words.every((word) => haystack.includes(word));
}

export type WorkReportCandidate = WorkReportLinkRow & {
  /** Tarjous, johon raportti on jo kohdistettu (muu kuin valittu tarjous). */
  linkedQuoteId: string | null;
  sameCustomer: boolean;
  /** Tämä tarjous on jo kohdistettu tähän raporttiin. */
  isCurrent: boolean;
};

/**
 * Työraporttiehdokkaat tarjoukselle: sama asiakas ensin, sitten vapaat (ei tarjousta),
 * sitten uusimmat. Nykyinen kohdistus näytetään ensimmäisenä.
 */
export function buildWorkReportCandidates(input: {
  reports: WorkReportLinkRow[];
  quote: Pick<QuoteLinkRow, 'id' | 'customer_id' | 'owner_company_id'>;
  index: QuoteReportLinkIndex;
  query?: string;
}): WorkReportCandidate[] {
  const { quote, index } = input;
  return input.reports
    .filter((report) => !quote.owner_company_id || !report.owner_company_id || report.owner_company_id === quote.owner_company_id)
    .filter((report) =>
      matchesQuery([report.title, report.customer_name, getWorkStatusLabel(report.status)], input.query ?? ''),
    )
    .map((report) => {
      const linked = index.reportToQuotes.get(report.id) ?? [];
      const isCurrent = linked.includes(quote.id);
      const other = linked.find((id) => id !== quote.id) ?? null;
      return {
        ...report,
        linkedQuoteId: other,
        sameCustomer: !!quote.customer_id && report.customer_id === quote.customer_id,
        isCurrent,
      };
    })
    .sort(
      (a, b) =>
        Number(b.isCurrent) - Number(a.isCurrent)
        || Number(b.sameCustomer) - Number(a.sameCustomer)
        || Number(!b.linkedQuoteId) - Number(!a.linkedQuoteId)
        || timeOf(b.scheduled_start ?? b.created_at) - timeOf(a.scheduled_start ?? a.created_at),
    );
}

export type QuoteCandidate = QuoteLinkRow & {
  /** Raportti, johon tarjous on jo kohdistettu (muu kuin valittu raportti). */
  linkedReportId: string | null;
  sameCustomer: boolean;
  isCurrent: boolean;
};

/** Tarjoukset, jotka voi liittää raporttiin: tilatut ja lähetetyt (ei luonnoksia). */
export const LINKABLE_QUOTE_STATUSES = ['ordered', 'sent'] as const;

/**
 * Tarjousehdokkaat työraportille: sama asiakas ensin, sitten vapaat (ei raporttia),
 * tilatut ennen lähetettyjä, uusimmat ensin.
 */
export function buildQuoteCandidates(input: {
  quotes: QuoteLinkRow[];
  report: Pick<WorkReportLinkRow, 'id' | 'customer_id' | 'owner_company_id'>;
  index: QuoteReportLinkIndex;
  query?: string;
}): QuoteCandidate[] {
  const { report, index } = input;
  return input.quotes
    .filter((quote) => (LINKABLE_QUOTE_STATUSES as readonly string[]).includes(quote.status))
    .filter((quote) => !report.owner_company_id || !quote.owner_company_id || quote.owner_company_id === report.owner_company_id)
    .filter((quote) =>
      matchesQuery([quote.title, quote.customer_name, QUOTE_STATUS_LABELS[quote.status]], input.query ?? ''),
    )
    .map((quote) => {
      const linkedReport = index.quoteToReport.get(quote.id) ?? quote.work_report_id ?? null;
      return {
        ...quote,
        linkedReportId: linkedReport && linkedReport !== report.id ? linkedReport : null,
        sameCustomer: !!report.customer_id && quote.customer_id === report.customer_id,
        isCurrent: linkedReport === report.id,
      };
    })
    .sort(
      (a, b) =>
        Number(b.isCurrent) - Number(a.isCurrent)
        || Number(b.sameCustomer) - Number(a.sameCustomer)
        || Number(!b.linkedReportId) - Number(!a.linkedReportId)
        || Number(b.status === 'ordered') - Number(a.status === 'ordered')
        || timeOf(b.updated_at ?? b.created_at) - timeOf(a.updated_at ?? a.created_at),
    );
}

export type QuoteLinkPlan = {
  quoteId: string;
  reportId: string;
  /** Jo valmiiksi kohdistettu näin → ei muutoksia. */
  alreadyLinked: boolean;
  /** Raportit, joilta tämä tarjous irrotetaan (tarjous oli toisessa raportissa). */
  detachQuoteFromReportIds: string[];
  /** Muut tarjoukset, jotka irrotetaan tästä raportista (raportilla oli toinen tarjous). */
  detachOtherQuoteIds: string[];
  /** Tarjous merkitään tilatuksi (oli lähetetty). */
  marksOrdered: boolean;
};

/** Mitä kohdistus muuttaa — estää saman tarjouksen kahteen raporttiin ja kaksi tarjousta raportille. */
export function planQuoteLink(input: {
  quote: Pick<QuoteLinkRow, 'id' | 'status' | 'work_report_id'>;
  reportId: string;
  index: QuoteReportLinkIndex;
}): QuoteLinkPlan {
  const { quote, reportId, index } = input;
  const reportsOfQuote = new Set<string>();
  if (quote.work_report_id) reportsOfQuote.add(quote.work_report_id);
  for (const [rid, quoteIds] of index.reportToQuotes) {
    if (quoteIds.includes(quote.id)) reportsOfQuote.add(rid);
  }
  const detachQuoteFromReportIds = [...reportsOfQuote].filter((rid) => rid !== reportId);
  const detachOtherQuoteIds = (index.reportToQuotes.get(reportId) ?? []).filter((id) => id !== quote.id);
  const alreadyLinked =
    quote.work_report_id === reportId
    && detachQuoteFromReportIds.length === 0
    && detachOtherQuoteIds.length === 0
    && (index.reportToQuotes.get(reportId) ?? []).includes(quote.id);
  return {
    quoteId: quote.id,
    reportId,
    alreadyLinked,
    detachQuoteFromReportIds,
    detachOtherQuoteIds,
    marksOrdered: quote.status !== 'ordered',
  };
}

/** Vahvistusteksti kohdistukselle (null = ei tarvita vahvistusta). */
export function quoteLinkConfirmMessage(
  plan: QuoteLinkPlan,
  labels: {
    reportTitle: (id: string) => string;
    quoteTitle: (id: string) => string;
    customerAlreadyBilled?: boolean;
  },
): string | null {
  const lines: string[] = [];
  for (const rid of plan.detachQuoteFromReportIds) {
    lines.push(`Tarjous on nyt kohdistettu työraporttiin "${labels.reportTitle(rid)}" – kohdistus siirretään.`);
  }
  for (const qid of plan.detachOtherQuoteIds) {
    lines.push(`Työraportilla on nyt tarjous "${labels.quoteTitle(qid)}" – se irrotetaan ja korvataan.`);
  }
  if (plan.marksOrdered) lines.push('Tarjous merkitään tilatuksi.');
  if (labels.customerAlreadyBilled) {
    lines.push('Asiakas on jo laskutettu: asiakaslaskutus jätetään päiväkirjan mukaiseksi.');
  }
  if (lines.length === 0) return null;
  return `${lines.join('\n')}\n\nLaskutettuja summia ei muuteta. Jatketaanko?`;
}

/** Onko asiakas jo laskutettu (silloin asiakaslaskutustapaa ei vaihdeta kiinteään tarjoushintaan). */
export function isCustomerAlreadyBilled(input: {
  reportStatus?: string | null;
  customerInvoiceStatus?: string | null;
  customerBilledAt?: string | null;
}): boolean {
  if (input.reportStatus === 'billed_customer') return true;
  if (input.customerBilledAt) return true;
  return input.customerInvoiceStatus === 'paid' || input.customerInvoiceStatus === 'partial';
}

/**
 * Uusi billing_quote kohdistetulle tarjoukselle — sama kuin tarjouksesta luodulla raportilla
 * (kiinteä tarjoushinta, hankintarivit, oletusprovisio 50 %). Jos raportilla oli jo sama tarjous,
 * säilytetään korjatut hankintarivit, provisio, huomio ja lisätyöt. Toisen tarjouksen tiedoista
 * säilytetään vain provisio ja huomio.
 */
export function billingQuoteForLinkedQuote(input: {
  quote: { id: string; title: string | null; data: unknown };
  previous: BillingQuoteSettings | null | undefined;
  customerAlreadyBilled: boolean;
}): BillingQuoteSettings {
  const previous = parseBillingQuoteSettings(input.previous ?? {});
  const sameQuote = previous.quote_request_id?.trim() === input.quote.id;
  const carried: BillingQuoteSettings = sameQuote
    ? previous
    : {
        partner_commission_percent: previous.partner_commission_percent,
        partner_commission_amount: previous.partner_commission_amount,
        notes: previous.notes ?? null,
        ...(previous.quote_seeded_rows ? { quote_seeded_rows: previous.quote_seeded_rows } : {}),
      };
  const next = billingQuoteFromQuoteRow(input.quote.id, input.quote.title ?? 'Tarjous', input.quote.data, {
    fixedCustomerBilling: !input.customerAlreadyBilled,
    previous: carried,
  });
  if (sameQuote && previous.extra_customer_work?.length) {
    return { ...next, extra_customer_work: previous.extra_customer_work };
  }
  return next;
}

/** Irrotuksen jälkeen raportin billing_quote tyhjennetään vain, jos se viittaa irrotettavaan tarjoukseen. */
export function billingQuoteAfterUnlink(
  current: BillingQuoteSettings | null | undefined,
  quoteId: string,
): BillingQuoteSettings | null {
  const parsed = parseBillingQuoteSettings(current ?? {});
  if (parsed.quote_request_id?.trim() !== quoteId) return null;
  // Luotujen rivien kirjanpito säilyy, jotta myöhempi kohdistus voi siivota koskemattomat 0 €-rivit.
  return parsed.quote_seeded_rows ? { quote_seeded_rows: parsed.quote_seeded_rows } : {};
}

export function workReportCandidateMeta(candidate: WorkReportCandidate, formatDate: (iso: string) => string): string {
  const date = candidate.scheduled_start ?? candidate.created_at;
  return [candidate.customer_name, date ? formatDate(date) : null, getWorkStatusLabel(candidate.status)]
    .filter(Boolean)
    .join(' · ');
}

export function quoteCandidateMeta(candidate: QuoteCandidate, formatDate: (iso: string) => string): string {
  const date = candidate.updated_at ?? candidate.created_at;
  return [candidate.customer_name, date ? formatDate(date) : null, QUOTE_STATUS_LABELS[candidate.status] ?? candidate.status]
    .filter(Boolean)
    .join(' · ');
}
