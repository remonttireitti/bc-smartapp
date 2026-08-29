import type { SupabaseClient } from '@supabase/supabase-js';

import type { PartnerPurchaseLineDraft } from './partnerPurchaseLines';
import type { WorkReportPartnerPurchaseLine } from '../types/partnerPurchase';

export type PartnerPurchaseInventoryKind = 'tool' | 'material';

export function parsePartnerPurchaseInventoryKind(
  value: string | null | undefined,
): PartnerPurchaseInventoryKind | null {
  if (value === 'tool' || value === 'material') return value;
  return null;
}

export function targetToolCount(qty: number): number {
  const n = Math.floor(Number(qty) || 0);
  return n > 0 ? n : 0;
}

export function materialQtyDelta(
  previousQty: number | null | undefined,
  nextQty: number,
): number {
  const prev = Number(previousQty) || 0;
  const next = Number(nextQty) || 0;
  return Math.round((next - prev) * 1000) / 1000;
}

export async function syncPartnerPurchaseInventory(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    draft: PartnerPurchaseLineDraft;
    previousLine?: WorkReportPartnerPurchaseLine | null;
    purchaseLineId: string;
  },
): Promise<{
  inventory_item_id: string | null;
  inventory_tool_ids: string[];
}> {
  const kind = parsePartnerPurchaseInventoryKind(input.draft.inventory_kind);
  if (!kind) {
    return {
      inventory_item_id: input.previousLine?.inventory_item_id ?? null,
      inventory_tool_ids: input.previousLine?.inventory_tool_ids ?? [],
    };
  }

  const description = input.draft.description.trim() || 'Osto';
  const qty = Number(input.draft.qty) || 0;
  const previous = input.previousLine;
  const previousKind = parsePartnerPurchaseInventoryKind(previous?.inventory_kind ?? null);

  if (kind === 'material') {
    return syncMaterialInventory(supabase, {
      companyId: input.companyId,
      purchaseLineId: input.purchaseLineId,
      description,
      qty,
      draftItemId: input.draft.inventory_item_id?.trim() || null,
      previousLine: previousKind === 'material' ? previous ?? null : null,
    });
  }

  return syncToolInventory(supabase, {
    companyId: input.companyId,
    description,
    qty,
    previousLine: previousKind === 'tool' ? previous ?? null : null,
  });
}

async function syncMaterialInventory(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    purchaseLineId: string;
    description: string;
    qty: number;
    draftItemId: string | null;
    previousLine: WorkReportPartnerPurchaseLine | null;
  },
): Promise<{ inventory_item_id: string | null; inventory_tool_ids: string[] }> {
  const delta = materialQtyDelta(input.previousLine?.qty, input.qty);
  const existingItemId =
    input.previousLine?.inventory_item_id
    ?? input.draftItemId
    ?? null;

  if (existingItemId) {
    if (Math.abs(delta) > 0.0005) {
      const { data: item, error: fetchError } = await supabase
        .from('inventory_items')
        .select('id, qty_on_hand')
        .eq('id', existingItemId)
        .eq('company_id', input.companyId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!item) throw new Error('Valittua varaosaa ei löydy varastosta.');

      const nextQty = Math.max(0, (Number(item.qty_on_hand) || 0) + delta);
      const { error: updateError } = await supabase
        .from('inventory_items')
        .update({ qty_on_hand: nextQty })
        .eq('id', existingItemId);
      if (updateError) throw updateError;
    }

    return { inventory_item_id: existingItemId, inventory_tool_ids: [] };
  }

  if (!(input.qty > 0)) {
    return { inventory_item_id: null, inventory_tool_ids: [] };
  }

  const { data: created, error: insertError } = await supabase
    .from('inventory_items')
    .insert({
      company_id: input.companyId,
      name: input.description,
      unit: 'kpl',
      qty_on_hand: input.qty,
      item_type: 'material',
    })
    .select('id')
    .single();
  if (insertError) throw insertError;

  return { inventory_item_id: created.id as string, inventory_tool_ids: [] };
}

async function syncToolInventory(
  supabase: SupabaseClient,
  input: {
    companyId: string;
    description: string;
    qty: number;
    previousLine: WorkReportPartnerPurchaseLine | null;
  },
): Promise<{ inventory_item_id: string | null; inventory_tool_ids: string[] }> {
  const targetCount = targetToolCount(input.qty);
  const existingIds = [...(input.previousLine?.inventory_tool_ids ?? [])];
  const missing = Math.max(0, targetCount - existingIds.length);

  for (let index = 0; index < missing; index += 1) {
    const suffix = targetCount > 1 ? ` (${existingIds.length + index + 1}/${targetCount})` : '';
    const { data: created, error: insertError } = await supabase
      .from('tools')
      .insert({
        company_id: input.companyId,
        name: `${input.description}${suffix}`,
        status: 'available',
      })
      .select('id')
      .single();
    if (insertError) throw insertError;
    existingIds.push(created.id as string);
  }

  return { inventory_item_id: null, inventory_tool_ids: existingIds };
}
