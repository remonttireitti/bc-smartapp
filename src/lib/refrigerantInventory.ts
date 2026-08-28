import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  RefrigerantCylinder,
  RefrigerantCylinderDisposition,
  RefrigerantSource,
  RefrigerantSupplierPaidBy,
  WorkReportRefrigerantLine,
} from '../types/inventory';
import {
  REFRIGERANT_PARTNER_BILLING_REMINDER,
  REFRIGERANT_SUPPLIER_PARTNER_REMINDER,
} from '../types/inventory';
import {
  bottleSize,
  formatBottleLabel,
  formatBottleSizeLabel,
} from './refrigerantBottle';
import {
  isRefrigerantStockPassThrough,
  refrigerantSaleToOwnerUnitPrice,
  refrigerantWarehouseCostUnitPrice,
  shouldBillRefrigerantSaleToReportOwner,
} from './refrigerantPassThrough';
import {
  redactRefrigerantPartnerWarehouseName,
  redactRefrigerantSupplierName,
  type RefrigerantReportContext,
  shouldHideRefrigerantSourceFromViewer,
} from './refrigerantVisibility';

function formatRefrigerantEuro(amount: number): string {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

export type RefrigerantLineDraft = {
  key: string;
  source: RefrigerantSource;
  cylinder_id: string;
  warehouse_company_id: string;
  owner_user_id: string;
  supplier_name: string;
  supplier_paid_by: RefrigerantSupplierPaidBy | '';
  unit_price: string;
  customer_unit_price: string;
  refrigerant_type: string;
  qty_kg: string;
  notes: string;
  cylinder_disposition: RefrigerantCylinderDisposition | '';
};

export type RefrigerantCylinderListRow = {
  id: string;
  company_id: string;
  company_name: string | null;
  serial_number: string | null;
  refrigerant_type: string;
  purchased_kg: number;
  remaining_kg: number;
  capacity_kg?: number | null;
  bottle_size?: string | null;
  non_recyclable?: boolean | null;
  notes?: string | null;
  owner_user_id: string | null;
  ownership_type?: string | null;
  status: string;
  owner_display_name: string | null;
  owner_email: string | null;
};

export function emptyRefrigerantDraft(): RefrigerantLineDraft {
  return {
    key: crypto.randomUUID(),
    source: 'warehouse',
    cylinder_id: '',
    warehouse_company_id: '',
    owner_user_id: '',
    supplier_name: '',
    supplier_paid_by: '',
    unit_price: '',
    customer_unit_price: '',
    refrigerant_type: 'R-410A',
    qty_kg: '',
    notes: '',
    cylinder_disposition: 'partial_in_stock',
  };
}

export function refrigerantLinesToDrafts(lines: WorkReportRefrigerantLine[]): RefrigerantLineDraft[] {
  return lines.map((line) => ({
    key: line.id,
    source: line.source,
    cylinder_id: line.cylinder_id ?? '',
    warehouse_company_id: line.warehouse_company_id ?? '',
    owner_user_id: line.owner_user_id ?? '',
    supplier_name: line.supplier_name ?? '',
    supplier_paid_by: line.supplier_paid_by ?? '',
    unit_price: Number(line.unit_price) > 0 ? String(line.unit_price) : '',
    customer_unit_price:
      line.customer_unit_price != null && Number(line.customer_unit_price) > 0
        ? String(line.customer_unit_price)
        : '',
    refrigerant_type: line.refrigerant_type,
    qty_kg: Number(line.qty_kg) > 0 ? String(line.qty_kg) : '',
    notes: line.notes ?? '',
    cylinder_disposition: line.cylinder_disposition ?? 'partial_in_stock',
  }));
}

export function mapRpcCylinders(rows: RefrigerantCylinderListRow[]): RefrigerantCylinder[] {
  return rows.map((row) => ({
    id: row.id,
    company_id: row.company_id,
    company_name: row.company_name,
    serial_number: row.serial_number,
    bottle_size:
      row.bottle_size === 'small' || row.bottle_size === 'large' ? row.bottle_size : 'medium',
    non_recyclable: Boolean(row.non_recyclable),
    refrigerant_type: row.refrigerant_type,
    purchased_kg: Number(row.purchased_kg),
    remaining_kg: Number(row.remaining_kg),
    capacity_kg: Number(row.capacity_kg ?? row.purchased_kg) || Number(row.purchased_kg),
    notes: row.notes ?? null,
    owner_user_id: row.owner_user_id,
    ownership_type: row.ownership_type === 'rental' ? 'rental' : 'owned',
    stock_source: 'purchase',
    customer_id: null,
    location: null,
    status: row.status,
    purchase_date: null,
    returned_at: null,
    image_path: null,
    created_at: '',
    updated_at: '',
    owner_user:
      row.owner_display_name || row.owner_email
        ? { display_name: row.owner_display_name, email: row.owner_email }
        : null,
  }));
}

export async function loadRefrigerantCylindersForReport(
  supabase: SupabaseClient,
  workReportId: string,
  includeCylinderIds: string[] = [],
) {
  const { data, error } = await supabase.rpc('list_refrigerant_cylinders_for_work_report', {
    p_work_report_id: workReportId,
    p_include_cylinder_ids: includeCylinderIds,
  });

  if (error) throw error;
  return mapRpcCylinders((data as RefrigerantCylinderListRow[]) ?? []);
}

function isWarehouseSource(source: RefrigerantSource) {
  return source === 'warehouse' || source === 'partner_warehouse';
}

export function refrigerantIncludedInCustomerBilling(
  line: Pick<WorkReportRefrigerantLine, 'source' | 'supplier_paid_by' | 'bill_to_customer'>,
): boolean {
  if (line.bill_to_customer) return true;
  if (line.source === 'partner_warehouse') return true;
  if (line.source === 'supplier' && line.supplier_paid_by === 'partner') return true;
  return false;
}

export function shouldShowRefrigerantCustomerPriceFields(input: {
  source: RefrigerantSource;
  supplier_paid_by?: RefrigerantSupplierPaidBy | '' | null;
}): boolean {
  const supplierPaidBy =
    input.supplier_paid_by === 'own' || input.supplier_paid_by === 'partner'
      ? input.supplier_paid_by
      : null;
  return refrigerantIncludedInCustomerBilling({
    source: input.source,
    supplier_paid_by: supplierPaidBy,
    bill_to_customer: resolveRefrigerantBilling(input).billToCustomer,
  });
}

export function resolveRefrigerantBilling(input: {
  source: RefrigerantSource;
  supplier_paid_by?: RefrigerantSupplierPaidBy | '' | null;
}): { billToCustomer: boolean; reminder: string | null } {
  if (input.source === 'warehouse') {
    return { billToCustomer: true, reminder: null };
  }
  if (input.source === 'partner_warehouse') {
    return { billToCustomer: false, reminder: REFRIGERANT_PARTNER_BILLING_REMINDER };
  }
  if (input.supplier_paid_by === 'own') {
    return { billToCustomer: true, reminder: null };
  }
  if (input.supplier_paid_by === 'partner') {
    return { billToCustomer: false, reminder: REFRIGERANT_SUPPLIER_PARTNER_REMINDER };
  }
  return { billToCustomer: false, reminder: null };
}

export function refrigerantBillingReminder(
  line: WorkReportRefrigerantLine,
  report?: { owner_company_id: string; created_by_company_id: string } | null,
): string | null {
  if (report && shouldBillRefrigerantSaleToReportOwner(line, report)) return null;
  return resolveRefrigerantBilling({
    source: line.source,
    supplier_paid_by: line.supplier_paid_by,
  }).reminder;
}

export function refrigerantCustomerUnitPrice(line: WorkReportRefrigerantLine): number {
  const customerPrice = line.customer_unit_price != null ? Number(line.customer_unit_price) : null;
  if (customerPrice != null && customerPrice > 0) return customerPrice;
  return Number(line.unit_price || 0);
}

export function refrigerantLineTotal(line: WorkReportRefrigerantLine): number {
  return Math.round(Number(line.qty_kg) * refrigerantCustomerUnitPrice(line) * 100) / 100;
}

export function validateRefrigerantDrafts(
  drafts: RefrigerantLineDraft[],
  options?: { requirePrices?: boolean; partnerOwnedReport?: boolean },
): string | null {
  for (const row of drafts) {
    const qty = Number(row.qty_kg);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (row.source === 'supplier' && !row.supplier_paid_by) {
      return 'Valitse tukkurihankinnalle, kenen piikki kylmäaine hankittiin.';
    }
    if (isWarehouseSource(row.source) && !row.cylinder_disposition) {
      return 'Valitse mitä pulloon jää työkäytön jälkeen.';
    }
    if (options?.partnerOwnedReport && isWarehouseSource(row.source)) {
      if (!Number(row.unit_price)) {
        return 'Anna varastohinta (€/kg) — vähennetään seuraavasta laskutuksesta.';
      }
      if (!Number(row.customer_unit_price)) {
        return 'Anna myyntihinta raportin omistajalle (€/kg).';
      }
    }
    if (!options?.requirePrices) continue;
    const billing = resolveRefrigerantBilling({
      source: row.source,
      supplier_paid_by: row.supplier_paid_by,
    });
    if (billing.billToCustomer && !Number(row.unit_price) && !Number(row.customer_unit_price)) {
      return 'Anna kylmäaineen hinta (€/kg) laskutusta varten.';
    }
  }
  return null;
}

export async function restoreCylinderQuantities(
  supabase: SupabaseClient,
  lines: Pick<
    WorkReportRefrigerantLine,
    'source' | 'cylinder_id' | 'qty_kg' | 'cylinder_disposition'
  >[],
  workReportId: string,
) {
  for (const line of lines) {
    if (!isWarehouseSource(line.source) || !line.cylinder_id) continue;
    const qty = Number(line.qty_kg);
    if (qty <= 0) continue;

    const { error } = await supabase.rpc('apply_refrigerant_cylinder_delta', {
      p_cylinder_id: line.cylinder_id,
      p_delta_kg: qty,
      p_work_report_id: workReportId,
      p_disposition: null,
    });
    if (error) throw error;
  }
}

export async function deductCylinderQuantity(
  supabase: SupabaseClient,
  cylinderId: string,
  qtyKg: number,
  workReportId: string,
  disposition: RefrigerantCylinderDisposition | null,
) {
  const { error } = await supabase.rpc('apply_refrigerant_cylinder_delta', {
    p_cylinder_id: cylinderId,
    p_delta_kg: -qtyKg,
    p_work_report_id: workReportId,
    p_disposition: disposition,
  });
  if (error) throw error;
}

function isDraftRowFilled(row: RefrigerantLineDraft): boolean {
  const qty = Number(row.qty_kg);
  if (Number.isFinite(qty) && qty > 0) return true;
  if (isWarehouseSource(row.source) && row.cylinder_id) return true;
  if (row.source === 'supplier' && (row.supplier_name.trim() || row.supplier_paid_by)) return true;
  return false;
}

function isDraftRowValid(row: RefrigerantLineDraft): boolean {
  const qty = Number(row.qty_kg);
  if (!Number.isFinite(qty) || qty <= 0) return false;
  if (isWarehouseSource(row.source)) {
    return !!row.cylinder_id && !!row.cylinder_disposition;
  }
  if (row.source === 'supplier') return !!row.refrigerant_type.trim() && !!row.supplier_paid_by;
  return !!row.refrigerant_type.trim();
}

async function reinsertRefrigerantLines(
  supabase: SupabaseClient,
  lines: WorkReportRefrigerantLine[],
  dailyLogId: string,
  workReportId: string,
  userId: string,
) {
  for (const line of lines) {
    const { error } = await supabase.from('work_report_refrigerant_lines').insert({
      daily_log_id: dailyLogId,
      work_report_id: workReportId,
      source: line.source,
      cylinder_id: line.cylinder_id,
      warehouse_company_id: line.warehouse_company_id,
      owner_user_id: line.owner_user_id,
      supplier_name: line.supplier_name,
      supplier_paid_by: line.supplier_paid_by,
      unit_price: line.unit_price,
      customer_unit_price: line.customer_unit_price,
      bill_to_customer: line.bill_to_customer,
      warehouse_cost_deducted: line.warehouse_cost_deducted ?? false,
      refrigerant_type: line.refrigerant_type,
      qty_kg: line.qty_kg,
      notes: line.notes,
      cylinder_disposition: line.cylinder_disposition,
      created_by: userId,
    });
    if (error) throw error;
  }
}

export async function saveRefrigerantLines(
  supabase: SupabaseClient,
  input: {
    dailyLogId: string;
    workReportId: string;
    userId: string;
    drafts: RefrigerantLineDraft[];
    previousLines?: WorkReportRefrigerantLine[];
    requirePrices?: boolean;
    partnerOwnedReport?: boolean;
  },
) {
  const attempted = input.drafts.filter(isDraftRowFilled);
  const valid = input.drafts.filter(isDraftRowValid);

  const validationError = validateRefrigerantDrafts(input.drafts, {
    requirePrices: input.requirePrices,
    partnerOwnedReport: input.partnerOwnedReport,
  });
  if (validationError) throw new Error(validationError);

  if (attempted.length > 0 && valid.length === 0) {
    throw new Error(
      'Kylmäainerivit eivät kelpaa. Valitse pullo, määrä (kg) ja mitä pulloon jää työkäytön jälkeen.',
    );
  }

  const previousLines = input.previousLines ?? [];
  const previousById = new Map(previousLines.map((line) => [line.id, line]));
  const deducted: { cylinderId: string; qty: number }[] = [];

  try {
    if (previousLines.length) {
      await restoreCylinderQuantities(supabase, previousLines, input.workReportId);
    }

    const { error: deleteError } = await supabase
      .from('work_report_refrigerant_lines')
      .delete()
      .eq('daily_log_id', input.dailyLogId);
    if (deleteError) throw deleteError;

    for (const row of valid) {
      const qty = Number(row.qty_kg);
      let cylinderId: string | null = null;
      let warehouseCompanyId: string | null = null;
      let ownerUserId: string | null = null;
      let refrigerantType = row.refrigerant_type.trim();
      let supplierName: string | null = null;

      if (isWarehouseSource(row.source)) {
        cylinderId = row.cylinder_id;
        const { data: cylinder, error: cylinderError } = await supabase
          .from('refrigerant_cylinders')
          .select('refrigerant_type, owner_user_id, company_id')
          .eq('id', cylinderId)
          .single();

        if (cylinderError || !cylinder) {
          throw new Error(cylinderError?.message ?? 'Valittua kylmäainepulloa ei löytynyt.');
        }
        refrigerantType = (cylinder.refrigerant_type || row.refrigerant_type || '').trim();
        if (!refrigerantType) {
          throw new Error('Pullossa ei ole merkittyä kylmäainetta — täytä pullo varastossa ensin.');
        }
        ownerUserId = row.owner_user_id || cylinder.owner_user_id || null;
        warehouseCompanyId = row.warehouse_company_id || cylinder.company_id || null;

        await deductCylinderQuantity(
          supabase,
          cylinderId,
          qty,
          input.workReportId,
          row.cylinder_disposition || 'partial_in_stock',
        );
        deducted.push({ cylinderId, qty });
      } else {
        supplierName = row.supplier_name.trim() || 'Tukkuri';
      }

      const billing = resolveRefrigerantBilling({
        source: row.source,
        supplier_paid_by: row.supplier_paid_by,
      });
      const unitPrice = Number(row.unit_price || 0);
      const customerUnitPriceRaw = Number(row.customer_unit_price);
      const customerUnitPrice =
        Number.isFinite(customerUnitPriceRaw) && customerUnitPriceRaw > 0 ? customerUnitPriceRaw : null;

      const { error: insertError } = await supabase.from('work_report_refrigerant_lines').insert({
        daily_log_id: input.dailyLogId,
        work_report_id: input.workReportId,
        source: row.source,
        cylinder_id: cylinderId,
        warehouse_company_id: warehouseCompanyId,
        owner_user_id: ownerUserId,
        supplier_name: supplierName,
        supplier_paid_by: row.source === 'supplier' ? row.supplier_paid_by : null,
        unit_price: unitPrice,
        customer_unit_price: customerUnitPrice,
        bill_to_customer: billing.billToCustomer,
        warehouse_cost_deducted: previousById.get(row.key)?.warehouse_cost_deducted ?? false,
        refrigerant_type: refrigerantType,
        qty_kg: qty,
        notes: row.notes.trim() || null,
        cylinder_disposition: isWarehouseSource(row.source) ? row.cylinder_disposition || null : null,
        created_by: input.userId,
      });

      if (insertError) throw insertError;
    }
  } catch (err) {
    for (const { cylinderId, qty } of [...deducted].reverse()) {
      try {
        await supabase.rpc('apply_refrigerant_cylinder_delta', {
          p_cylinder_id: cylinderId,
          p_delta_kg: qty,
          p_work_report_id: input.workReportId,
          p_disposition: null,
        });
      } catch {
        /* best-effort rollback */
      }
    }

    if (previousLines.length) {
      try {
        await restoreCylinderQuantities(supabase, previousLines, input.workReportId);
        await reinsertRefrigerantLines(
          supabase,
          previousLines,
          input.dailyLogId,
          input.workReportId,
          input.userId,
        );
      } catch {
        /* leave deleted if rollback fails — surface original error */
      }
    }

    const message = err instanceof Error ? err.message : 'Kylmäaineen tallennus epäonnistui.';
    if (/Pullo ei kuulu|ei ole käytettävissä|ei oikeutta/i.test(message)) {
      throw new Error(
        `${message} Kumppanin varastosta käyttäessä varmista, että kumppanuudella on varasto-oikeus.`,
      );
    }
    throw err instanceof Error ? err : new Error(message);
  }
}

export function formatRefrigerantLineLabel(
  line: WorkReportRefrigerantLine,
  view?: RefrigerantReportContext | null,
  report?: { owner_company_id: string; created_by_company_id: string } | null,
): string {
  const hideSource = view ? shouldHideRefrigerantSourceFromViewer(view) : false;
  const qty = Number(line.qty_kg).toFixed(3);
  const reportParties = report ?? (view
    ? { owner_company_id: view.ownerCompanyId, created_by_company_id: view.createdByCompanyId }
    : null);

  if (
    hideSource
    && reportParties
    && isRefrigerantStockPassThrough(line, reportParties)
  ) {
    const seller = view?.sellerLabel?.trim() || 'Raportin laatija';
    const unit = refrigerantSaleToOwnerUnitPrice(line);
    const pricePart = unit > 0 ? ` · ${formatRefrigerantEuro(unit)}/kg` : '';
    return `${line.refrigerant_type} ${qty} kg · Ostettu: ${seller}${pricePart}`;
  }

  if (line.source === 'warehouse' || line.source === 'partner_warehouse') {
    const bottleLabel = line.cylinder?.serial_number?.trim() || line.cylinder?.notes?.trim() || '—';
    const size =
      line.cylinder?.bottle_size === 'small' ||
      line.cylinder?.bottle_size === 'medium' ||
      line.cylinder?.bottle_size === 'large'
        ? formatBottleSizeLabel(line.cylinder.bottle_size)
        : '';
    const partner =
      line.source === 'partner_warehouse'
        ? redactRefrigerantPartnerWarehouseName(line.warehouse_company?.name ?? 'Kumppani', hideSource) ??
          (hideSource ? 'Kumppanin varastosta' : 'Kumppani')
        : null;
    const owner = line.owner_user?.display_name ?? 'Yhteinen varasto';
    const parts = [
      `${line.refrigerant_type} ${qty} kg`,
      partner,
      bottleLabel
        ? size
          ? `${size} pullo ${bottleLabel}`
          : `pullo ${bottleLabel}`
        : null,
      owner,
    ].filter(Boolean);
    return parts.join(' · ');
  }
  return `${line.refrigerant_type} ${qty} kg · ${redactRefrigerantSupplierName(line.supplier_name, hideSource)}`;
}

export function formatRefrigerantWarehouseCostLabel(
  line: WorkReportRefrigerantLine,
  deducted: boolean,
): string {
  const qty = Number(line.qty_kg).toFixed(3);
  const unit = refrigerantWarehouseCostUnitPrice(line);
  const total = Math.round(Number(line.qty_kg) * unit * 100) / 100;
  const serial = line.cylinder?.serial_number?.trim();
  const bottle = serial ? ` · pullo ${serial}` : '';
  const status = deducted ? ' · vähennetty' : ' · ei vielä vähennetty';
  return `Varastosta ${line.refrigerant_type} ${qty} kg${bottle} · ${formatRefrigerantEuro(unit)}/kg = ${formatRefrigerantEuro(total)}${status}`;
}

export function formatRefrigerantLineLabelForReport(
  line: WorkReportRefrigerantLine,
  report: Pick<{ owner_company_id: string; created_by_company_id: string }, 'owner_company_id' | 'created_by_company_id'>,
  viewerCompanyId?: string | null,
  sellerLabel?: string | null,
): string {
  const view =
    viewerCompanyId != null
      ? {
          viewerCompanyId,
          ownerCompanyId: report.owner_company_id,
          createdByCompanyId: report.created_by_company_id,
          sellerLabel,
        }
      : null;
  return formatRefrigerantLineLabel(line, view, report);
}

export function formatCylinderPickerLabel(c: RefrigerantCylinder): string {
  const label = formatBottleLabel(c);
  const size = formatBottleSizeLabel(bottleSize(c));
  const content = Number(c.remaining_kg) > 0.005
    ? `${c.refrigerant_type ?? '—'} · ${Number(c.remaining_kg).toFixed(1)} kg`
    : 'tyhjä';
  return `${label} · ${size} · ${content}`;
}

export function cylindersForSource(
  cylinders: RefrigerantCylinder[],
  source: RefrigerantSource,
  ownCompanyId: string | null,
) {
  if (!ownCompanyId) return cylinders;
  if (source === 'warehouse') {
    return cylinders.filter((c) => c.company_id === ownCompanyId);
  }
  if (source === 'partner_warehouse') {
    return cylinders.filter((c) => c.company_id !== ownCompanyId);
  }
  return [];
}
