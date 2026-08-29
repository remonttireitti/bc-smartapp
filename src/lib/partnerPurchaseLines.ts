import type { SupabaseClient } from '@supabase/supabase-js';

import { DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT } from './workReportExpenseBilling';
import type { WorkReportPartnerPurchaseLine } from '../types/partnerPurchase';

export type PartnerPurchaseLineDraft = {
  key: string;
  partner_company_id: string;
  supplier_name: string;
  description: string;
  qty: string;
  unit_price: string;
  partner_margin_percent: string;
  cost_deducted?: boolean;
};

export function emptyPartnerPurchaseRow(): PartnerPurchaseLineDraft {
  return {
    key: crypto.randomUUID(),
    partner_company_id: '',
    supplier_name: '',
    description: '',
    qty: '1',
    unit_price: '',
    partner_margin_percent: String(DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT),
  };
}

export function partnerPurchasesToDrafts(
  lines: WorkReportPartnerPurchaseLine[] | undefined,
): PartnerPurchaseLineDraft[] {
  return (lines ?? []).map((line) => ({
    key: line.id,
    partner_company_id: line.partner_company_id,
    supplier_name: line.supplier_name ?? '',
    description: line.description,
    qty: String(line.qty),
    unit_price: String(line.unit_price),
    partner_margin_percent: String(line.partner_margin_percent ?? DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT),
    cost_deducted: line.cost_deducted,
  }));
}

function isDraftRowFilled(row: PartnerPurchaseLineDraft): boolean {
  return !!row.description.trim() || !!row.unit_price.trim() || !!row.partner_company_id;
}

function isDraftRowValid(row: PartnerPurchaseLineDraft): boolean {
  if (!row.description.trim()) return false;
  if (!row.partner_company_id) return false;
  if (!(Number(row.qty) > 0)) return false;
  if (!(Number(row.unit_price) > 0)) return false;
  return true;
}

export async function savePartnerPurchaseLines(
  supabase: SupabaseClient,
  input: {
    dailyLogId: string;
    workReportId: string;
    userId: string;
    drafts: PartnerPurchaseLineDraft[];
    previousLines?: WorkReportPartnerPurchaseLine[];
  },
) {
  const attempted = input.drafts.filter(isDraftRowFilled);
  const valid = input.drafts.filter(isDraftRowValid);

  if (attempted.length > 0 && valid.length === 0) {
    throw new Error('Täytä työkalu/varaosa-oston kuvaus, kumppani ja veroton hinta.');
  }

  const previousById = new Map((input.previousLines ?? []).map((line) => [line.id, line]));

  await supabase
    .from('work_report_partner_purchase_lines')
    .delete()
    .eq('daily_log_id', input.dailyLogId);

  for (const [index, row] of valid.entries()) {
    const marginRaw = String(row.partner_margin_percent ?? '').trim();
    const margin = marginRaw && Number.isFinite(Number(marginRaw))
      ? Number(marginRaw)
      : DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT;
    const { error } = await supabase.from('work_report_partner_purchase_lines').insert({
      daily_log_id: input.dailyLogId,
      work_report_id: input.workReportId,
      partner_company_id: row.partner_company_id,
      supplier_name: row.supplier_name.trim() || null,
      description: row.description.trim(),
      qty: Number(row.qty),
      unit_price: Number(row.unit_price),
      partner_margin_percent: margin,
      cost_deducted: previousById.get(row.key)?.cost_deducted ?? row.cost_deducted ?? false,
      sort_order: index,
      created_by: input.userId,
    });
    if (error) throw error;
  }
}
