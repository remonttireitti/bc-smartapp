/** Varaston materiaalin valinta työraportin tarvike-/varaosariville. Saldon muutos tehdään DB-triggerissä. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { inferPartnerExpenseMarginPercent } from './workReportExpenseBilling';

export type InventoryPickItem = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  qty_on_hand: number;
  purchase_price: number | null;
  sale_price: number | null;
};

let linkSupported: boolean | null = null;
let probe: Promise<boolean> | null = null;

/** true kun varasto_link.sql on ajettu (inventory_item_id + hinnat olemassa). */
export function isInventoryLinkSupported(): boolean {
  return linkSupported === true;
}

export function setInventoryLinkSupported(value: boolean) {
  linkSupported = value;
}

export function probeInventoryLink(supabase: SupabaseClient): Promise<boolean> {
  if (linkSupported != null) return Promise.resolve(linkSupported);
  if (!probe) {
    probe = (async () => {
      const [a, b] = await Promise.all([
        supabase.from('work_report_daily_expense_lines').select('inventory_item_id, unit').limit(0),
        supabase.from('inventory_items').select('purchase_price, sale_price').limit(0),
      ]);
      linkSupported = !a.error && !b.error;
      return linkSupported;
    })();
  }
  return probe;
}

export async function loadInventoryPickItems(
  supabase: SupabaseClient,
  companyId: string,
): Promise<InventoryPickItem[]> {
  if (!(await probeInventoryLink(supabase))) return [];
  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, name, sku, unit, qty_on_hand, purchase_price, sale_price, item_type')
    .eq('company_id', companyId)
    .order('name');
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>)
    .filter((r) => r.item_type == null || r.item_type === 'material')
    .map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ''),
      sku: (r.sku as string | null) ?? null,
      unit: String(r.unit ?? 'kpl'),
      qty_on_hand: Number(r.qty_on_hand) || 0,
      purchase_price: r.purchase_price == null ? null : Number(r.purchase_price),
      sale_price: r.sale_price == null ? null : Number(r.sale_price),
    }));
}

export function searchInventoryItems(items: InventoryPickItem[], query: string, limit = 8): InventoryPickItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);
  const words = q.split(/\s+/);
  return items
    .filter((i) => {
      const hay = `${i.name} ${i.sku ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit);
}

/** Myyntihinnasta johdettu kate-% (hankinnan päälle), 2 desimaalia. */
export function marginPercentFromPrices(purchase: number | null, sale: number | null): number | null {
  if (purchase == null || sale == null || !(purchase > 0) || !(sale > 0)) return null;
  return Math.round(((sale / purchase) - 1) * 10000) / 100;
}

type PickTarget = {
  expense_type: string;
  description: string;
  unit_price: string;
  customer_unit_price: string;
  customer_margin_percent: string;
  inventory_item_id?: string | null;
  unit?: string | null;
  partner_expense_margin_percent?: string;
};

/** Täyttää rivin varastotuotteesta (hinnat alv 0 %). Määrä jätetään käyttäjälle. */
export function applyInventoryPick<T extends PickTarget>(row: T, item: InventoryPickItem): T {
  const margin = marginPercentFromPrices(item.purchase_price, item.sale_price);
  return {
    ...row,
    expense_type: row.expense_type === 'part' ? 'part' : 'material',
    description: item.sku ? `${item.name} (${item.sku})` : item.name,
    unit: item.unit,
    inventory_item_id: item.id,
    unit_price: item.purchase_price != null ? String(item.purchase_price) : row.unit_price,
    customer_unit_price: item.sale_price != null ? String(item.sale_price) : row.customer_unit_price,
    customer_margin_percent: margin != null ? String(margin) : row.customer_margin_percent,
    // Kumppanin kautta asiakashinta lasketaan kumppanin katteesta (kate myyntihinnasta) — myyntihinta säilyy.
    ...(margin != null && 'partner_expense_margin_percent' in row ? { partner_expense_margin_percent: String(inferPartnerExpenseMarginPercent(item.purchase_price as number, item.sale_price as number)) } : {}),
  };
}

/** Saldon ennuste ennen tallennusta (vanha linkitetty määrä palautuu). */
export function projectedStock(item: InventoryPickItem, newQty: number, savedQtySameItem = 0): number {
  return Math.round((item.qty_on_hand + savedQtySameItem - newQty) * 1000) / 1000;
}
