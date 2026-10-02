import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillableCalculation } from './workReportBilling';
import { contractorInvoiceCalculation, type BillingListRow } from './workReportBillingCopy';

/**
 * Laitemyyjä-ketju, urakoitsijan näkymä: urakoitsijan oma lähtevä lasku tilaajalle.
 * Tiedot tulevat RPC:stä contractor_chain_invoice_reports (SECURITY DEFINER), joka palauttaa
 * vain otsikon, tilan, päivät, tilaajan nimen ja laskun summan/tilan — ei raporttia eikä
 * asentajan kuluja. Jos funktiota ei vielä ole kannassa, lista on tyhjä.
 */
export type ContractorChainInvoiceRpcRow = {
  work_report_id: string;
  title: string | null;
  status: string | null;
  completed_at: string | null;
  scheduled_start: string | null;
  created_at: string | null;
  owner_company_id: string;
  owner_company_name: string | null;
  amount: number | string | null;
  invoice_status: string | null;
  billed_amount: number | string | null;
  billed_at: string | null;
};

const CONTRACTOR_INVOICE_DESCRIPTION = 'Asennusurakka (tarjous − laite)';

const EMPTY_CALCULATION_BASE: Pick<BillableCalculation, 'version' | 'ratesUsed' | 'ratesSource'> = {
  version: 6,
  ratesUsed: { hourly_regular: 0, hourly_overtime: 0, hourly_on_call: 0 },
  ratesSource: 'company_default',
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function contractorChainInvoiceRowToBillingRow(
  rpc: ContractorChainInvoiceRpcRow,
  viewerCompanyId: string,
  viewerCompanyName?: string | null,
): BillingListRow | null {
  const amount = toNumber(rpc.amount);
  if (!rpc.work_report_id || !rpc.owner_company_id || amount == null) return null;
  const roundedAmount = roundMoney(amount);
  const paid = rpc.invoice_status === 'paid';
  const ownerName = rpc.owner_company_name ?? '—';
  const calculation = contractorInvoiceCalculation(
    EMPTY_CALCULATION_BASE,
    {
      fromCompanyId: viewerCompanyId,
      fromCompanyName: viewerCompanyName ?? null,
      toCompanyId: rpc.owner_company_id,
      toCompanyName: ownerName,
      amount: roundedAmount,
      description: CONTRACTOR_INVOICE_DESCRIPTION,
    },
    (rpc.completed_at ?? rpc.scheduled_start ?? rpc.created_at ?? '').slice(0, 10),
  );
  return {
    id: rpc.work_report_id,
    title: rpc.title ?? '—',
    status: rpc.status ?? 'in_progress',
    completed_at: rpc.completed_at,
    scheduled_start: rpc.scheduled_start,
    created_at: rpc.created_at ?? new Date(0).toISOString(),
    owner_company_id: rpc.owner_company_id,
    created_by_company_id: viewerCompanyId,
    delegate_company_id: null,
    customers: null,
    owner_company: { name: ownerName },
    delegate_company: null,
    creator_company: viewerCompanyName ? { name: viewerCompanyName } : null,
    billing: {
      partner_invoice_status: paid ? 'paid' : 'none',
      partner_invoice_amount: roundedAmount,
      partner_billed_amount: paid ? (toNumber(rpc.billed_amount) ?? roundedAmount) : null,
      partner_billed_at: paid ? rpc.billed_at : null,
      customer_invoice_status: 'none',
      customer_invoice_amount: null,
      customer_billed_at: null,
    },
    billable: {
      partner_total: roundedAmount,
      calculation,
      calculated_at: null,
      partner_recalc_needed: false,
    },
    customer_id: null,
    contractorOutgoingLeg: true,
  };
}

/** Urakoitsijan lähtevät ketjulaskut. Virheessä (esim. funktiota ei vielä ole) palauttaa []. */
export async function loadContractorChainInvoiceRows(
  supabase: SupabaseClient,
  viewerCompanyId: string,
  viewerCompanyName?: string | null,
): Promise<BillingListRow[]> {
  try {
    const { data, error } = await supabase.rpc('contractor_chain_invoice_reports');
    if (error || !Array.isArray(data)) return [];
    return (data as ContractorChainInvoiceRpcRow[])
      .map((row) => contractorChainInvoiceRowToBillingRow(row, viewerCompanyId, viewerCompanyName))
      .filter((row): row is BillingListRow => row != null);
  } catch {
    return [];
  }
}

/** Lisää urakoitsijan ketjulaskut listaan (ei kahdennuksia, jos raportti on jo näkyvissä). */
export function mergeContractorChainInvoiceRows(
  rows: BillingListRow[],
  chainRows: BillingListRow[],
): BillingListRow[] {
  if (chainRows.length === 0) return rows;
  const ids = new Set(rows.map((row) => row.id));
  return [...rows, ...chainRows.filter((row) => !ids.has(row.id))];
}

export async function setContractorChainInvoiceBilled(
  supabase: SupabaseClient,
  workReportId: string,
  billed: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('set_contractor_chain_invoice_billed', {
    p_work_report_id: workReportId,
    p_billed: billed,
  });
  if (error) throw new Error(error.message);
}
