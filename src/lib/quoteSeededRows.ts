/**
 * Tarjouksen tarvike- ja kulurivit valmiiksi työraporttiin (kuten laite):
 * jokainen kohdistetun tarjouksen Tarvike/Kulu-rivi → työraportin kulurivi (nimi, määrä, tyyppi),
 * hinta 0 €, laskutustapa "kuuluu urakkaan". Käyttäjä syöttää toteutuneen hinnan tai poistaa rivin.
 * Työtunnit, huoltoautokorvaus/ajot ja laite eivät kuulu tähän (kirjataan päivittäin / LAITE-ruudulla).
 *
 * Kirjanpito billing_quote.quote_seeded_rows (ei migraatiota): mitkä tarjouksen rivit on jo luotu,
 * jotta luonti on idempotentti eikä käyttäjän poistamia rivejä luoda uudelleen.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkReportDailyLog } from '../types';
import { quoteLinesByCategory } from './quoteLineEntries';
import {
  parseBillingQuoteSettings,
  saveBillingQuoteSettings,
  type BillingQuoteSettings,
  type QuoteSeededRow,
  type QuoteSeededRows,
} from './workReportBillingQuote';
import { expenseTypeCategory } from './workReportEntryCategories';
import { latestDailyLog } from './workReportDeviceEntries';
import { fetchWorkReportDetailLogs } from './workReportDailyLogSelect';
import { expenseLinePriceMissing } from './expensePriceMissing';

type ExpenseLineLike = {
  id?: string;
  expense_type: string;
  description: string;
  qty: number | string;
  unit_price: number | string;
  customer_unit_price?: number | string | null;
  bill_to_partner?: boolean | null;
  bill_to_customer?: boolean | null;
};

type LogLike = {
  id: string;
  log_date: string;
  created_at?: string | null;
  expense_lines?: ExpenseLineLike[] | null;
};

export { expenseLinePriceMissing };

/** Työraportin kulurivit ilman hintaa (Tarjous ja kate: "N riviä ilman hintaa"). */
export function countUnpricedExpenseLines(logs: Array<Pick<LogLike, 'expense_lines'>> | null | undefined): number {
  let count = 0;
  for (const log of logs ?? []) {
    for (const line of log.expense_lines ?? []) {
      if (expenseLinePriceMissing(line)) count += 1;
    }
  }
  return count;
}

/** Ilman hintaa olevat rivit eivät kuulu asiakkaan tulosteisiin / laskulle. */
export function expenseLinesForCustomerPrint<T extends ExpenseLineLike>(lines: T[] | null | undefined): T[] {
  return (lines ?? []).filter((line) => !expenseLinePriceMissing(line));
}

export function unpricedRowsLabel(count: number): string {
  return count === 1 ? '1 rivi ilman hintaa' : `${count} riviä ilman hintaa`;
}

function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Tarjouksen Tarvike/Kulu-rivit, jotka luodaan työraporttiin (ei työ, ajot, huoltoauto, laite). */
export function quoteRowCandidates(quoteData: unknown): QuoteSeededRow[] {
  const rows: QuoteSeededRow[] = [];
  for (const group of quoteLinesByCategory(quoteData)) {
    if (group.category !== 'supplies' && group.category !== 'expenses') continue;
    for (const line of group.lines) {
      if (line.action !== 'expense') continue;
      const description = line.label.trim();
      if (!description) continue;
      const qty = line.qty != null && Number(line.qty) > 0 ? roundQty(Number(line.qty)) : 1;
      rows.push({
        id: line.id,
        description,
        expense_type: line.expenseType ?? (group.category === 'supplies' ? 'material' : 'other'),
        qty,
      });
    }
  }
  return rows;
}

export function normalizeRowName(value: string): string {
  return String(value ?? '')
    .toLocaleLowerCase('fi-FI')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Tarjouksen rivi ja työraportin kulurivi ovat "sama": sama kategoria ja nimi (tai toinen sisältää toisen). */
export function quoteRowMatchesLine(row: Pick<QuoteSeededRow, 'description' | 'expense_type'>, line: ExpenseLineLike): boolean {
  const rowCategory = expenseTypeCategory(row.expense_type);
  const lineCategory = expenseTypeCategory(line.expense_type);
  if (!rowCategory || rowCategory !== lineCategory) return false;
  const a = normalizeRowName(row.description);
  const b = normalizeRowName(line.description);
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.includes(short);
}

/** Luotu rivi, jota käyttäjä ei ole muuttanut: 0 €, kuuluu urakkaan, sama tyyppi, nimi ja määrä. */
export function isUntouchedSeededLine(line: ExpenseLineLike, seeded: QuoteSeededRow): boolean {
  if (!expenseLinePriceMissing(line)) return false;
  if (line.bill_to_partner !== false || line.bill_to_customer !== false) return false;
  if (String(line.expense_type) !== seeded.expense_type) return false;
  if (normalizeRowName(line.description) !== normalizeRowName(seeded.description)) return false;
  return Math.abs(Number(line.qty) - Number(seeded.qty)) < 0.0005;
}

export type QuoteRowSyncPlan = {
  /** Poistettavat kulurivit (vanhan tarjouksen koskemattomat 0 €-rivit). */
  deleteLineIds: string[];
  /** Lisättävät rivit työkirjaukseen targetLogId. */
  insertRows: QuoteSeededRow[];
  /** Viimeisin työkirjaus; null = ei kirjauksia (rivit odottavat ensimmäistä kirjausta). */
  targetLogId: string | null;
  /** Rivit, jotka lisätään ensimmäiseen työkirjaukseen (kun kirjauksia ei vielä ole). */
  pendingRows: QuoteSeededRow[];
  nextSeeded: QuoteSeededRows;
  changed: boolean;
};

function seededEqual(a: QuoteSeededRows | null | undefined, b: QuoteSeededRows): boolean {
  if (!a) return false;
  if (a.quote_request_id !== b.quote_request_id || a.lines.length !== b.lines.length) return false;
  const ids = new Set(a.lines.map((line) => line.id));
  return b.lines.every((line) => ids.has(line.id));
}

export function planQuoteRowSync(input: {
  quoteId: string;
  quoteData: unknown;
  seeded: QuoteSeededRows | null | undefined;
  logs: LogLike[];
}): QuoteRowSyncPlan {
  const candidates = quoteRowCandidates(input.quoteData);
  const sameQuote = input.seeded?.quote_request_id === input.quoteId;
  const previouslySeeded = sameQuote ? (input.seeded?.lines ?? []) : [];
  const seededIds = new Set(previouslySeeded.map((line) => line.id));

  const allLines: ExpenseLineLike[] = input.logs.flatMap((log) => log.expense_lines ?? []);
  const claimed = new Set<ExpenseLineLike>();
  const deleteLineIds: string[] = [];
  const preMatched = new Map<string, ExpenseLineLike>();

  // Uudelleenkohdistus toiseen tarjoukseen: vanhan tarjouksen koskemattomat 0 €-rivit pois.
  // Jos uudessa tarjouksessa on täsmälleen sama rivi, rivi säilyy ja lasketaan jo luoduksi.
  if (input.seeded && !sameQuote) {
    const oldRows = [...input.seeded.lines];
    for (const line of allLines) {
      const oldIndex = oldRows.findIndex((row) => isUntouchedSeededLine(line, row));
      if (oldIndex < 0) continue;
      oldRows.splice(oldIndex, 1);
      const same = candidates.find(
        (candidate) => !preMatched.has(candidate.id) && isUntouchedSeededLine(line, candidate),
      );
      if (same) {
        preMatched.set(same.id, line);
        claimed.add(line);
        continue;
      }
      claimed.add(line);
      if (line.id) deleteLineIds.push(line.id);
    }
  }

  const deleted = new Set(deleteLineIds);
  const remaining = allLines.filter((line) => !line.id || !deleted.has(line.id));
  const matchedIds = new Set<string>(preMatched.keys());
  const unmatched: QuoteSeededRow[] = [];
  for (const candidate of candidates) {
    if (seededIds.has(candidate.id) || matchedIds.has(candidate.id)) continue;
    const line = remaining.find((entry) => !claimed.has(entry) && quoteRowMatchesLine(candidate, entry));
    if (line) {
      claimed.add(line);
      matchedIds.add(candidate.id);
      continue;
    }
    unmatched.push(candidate);
  }

  const target = latestDailyLog(input.logs);
  const targetLogId = target?.id ?? null;
  const insertRows = targetLogId ? unmatched : [];
  const pendingRows = targetLogId ? [] : unmatched;

  const nextLines: QuoteSeededRow[] = [...previouslySeeded];
  for (const candidate of candidates) {
    if (seededIds.has(candidate.id)) continue;
    if (matchedIds.has(candidate.id) || insertRows.includes(candidate)) nextLines.push(candidate);
  }
  const nextSeeded: QuoteSeededRows = { quote_request_id: input.quoteId, lines: nextLines };
  const changed =
    deleteLineIds.length > 0 || insertRows.length > 0 || !seededEqual(input.seeded, nextSeeded);
  return { deleteLineIds, insertRows, targetLogId, pendingRows, nextSeeded, changed };
}

/** Työraportin kulurivin tallennusmuoto luodulle riville (0 €, kuuluu urakkaan). */
export function seededRowInsertPayload(row: QuoteSeededRow, dailyLogId: string, sortOrder: number) {
  return {
    daily_log_id: dailyLogId,
    expense_type: row.expense_type,
    description: row.description,
    qty: row.qty,
    unit_price: 0,
    customer_unit_price: null,
    bill_to_partner: false,
    bill_to_customer: false,
    sort_order: sortOrder,
  };
}

/** Lisää rivit kirjanpitoon (esim. ensimmäinen työkirjaus tallennettu esitäytetyillä riveillä). */
export function mergeSeededRows(
  settings: BillingQuoteSettings,
  quoteId: string,
  rows: QuoteSeededRow[],
): BillingQuoteSettings {
  const current = settings.quote_seeded_rows?.quote_request_id === quoteId ? settings.quote_seeded_rows.lines : [];
  const ids = new Set(current.map((line) => line.id));
  return {
    ...settings,
    quote_seeded_rows: {
      quote_request_id: quoteId,
      lines: [...current, ...rows.filter((row) => !ids.has(row.id))],
    },
  };
}

async function loadBillingQuoteRow(supabase: SupabaseClient, reportId: string): Promise<BillingQuoteSettings> {
  const { data, error } = await supabase
    .from('work_report_billable')
    .select('billing_quote')
    .eq('work_report_id', reportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseBillingQuoteSettings((data as { billing_quote?: unknown } | null)?.billing_quote ?? {});
}

export type QuoteRowSyncResult = { changed: boolean; pendingRows: QuoteSeededRow[]; quoteId: string | null };

/**
 * Luo kohdistetun tarjouksen tarvike-/kulurivit työraporttiin (idempotentti). Kutsutaan kohdistuksessa
 * ja työraportin avauksessa (vanhat kohdistetut raportit). Ei koske käyttäjän muokkaamiin riveihin.
 */
export async function syncQuoteRowsToWorkReport(
  supabase: SupabaseClient,
  reportId: string,
): Promise<QuoteRowSyncResult> {
  const settings = await loadBillingQuoteRow(supabase, reportId);
  const quoteId = settings.quote_request_id?.trim() || null;
  if (!quoteId) return { changed: false, pendingRows: [], quoteId: null };

  const [{ data: quoteRow, error: quoteError }, logsResult] = await Promise.all([
    supabase.from('quote_requests').select('data').eq('id', quoteId).maybeSingle(),
    fetchWorkReportDetailLogs(supabase, reportId),
  ]);
  if (quoteError) throw new Error(quoteError.message);
  if (logsResult.error) throw new Error(logsResult.error.message);
  if (!quoteRow) return { changed: false, pendingRows: [], quoteId };

  const logs = logsResult.logs as WorkReportDailyLog[];
  const plan = planQuoteRowSync({
    quoteId,
    quoteData: (quoteRow as { data: unknown }).data,
    seeded: settings.quote_seeded_rows,
    logs: logs as unknown as LogLike[],
  });
  if (!plan.changed) return { changed: false, pendingRows: plan.pendingRows, quoteId };

  if (plan.deleteLineIds.length > 0) {
    const { error } = await supabase.from('work_report_daily_expense_lines').delete().in('id', plan.deleteLineIds);
    if (error) throw new Error(error.message);
  }
  if (plan.insertRows.length > 0 && plan.targetLogId) {
    const target = logs.find((log) => log.id === plan.targetLogId);
    const offset = (target?.expense_lines ?? []).length;
    const { error } = await supabase
      .from('work_report_daily_expense_lines')
      .insert(plan.insertRows.map((row, index) => seededRowInsertPayload(row, plan.targetLogId as string, offset + index)));
    if (error) throw new Error(error.message);
  }
  try {
    await saveBillingQuoteSettings(supabase, reportId, { ...settings, quote_seeded_rows: plan.nextSeeded });
  } catch (error) {
    // Rivit on jo luotu; ilman kirjanpitoa seuraava ajo tunnistaa ne nimestä (ei tuplausta).
    console.error('Tarjouksen rivien kirjanpidon tallennus epäonnistui:', error);
  }
  return {
    changed: plan.deleteLineIds.length > 0 || plan.insertRows.length > 0,
    pendingRows: plan.pendingRows,
    quoteId,
  };
}

/** Merkitsee rivit luoduiksi (ensimmäinen työkirjaus tallennettiin tarjouksen riveillä esitäytettynä). */
export async function markQuoteRowsSeeded(
  supabase: SupabaseClient,
  reportId: string,
  quoteId: string,
  rows: QuoteSeededRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const settings = await loadBillingQuoteRow(supabase, reportId);
  if (settings.quote_request_id?.trim() !== quoteId) return;
  await saveBillingQuoteSettings(supabase, reportId, mergeSeededRows(settings, quoteId, rows));
}
