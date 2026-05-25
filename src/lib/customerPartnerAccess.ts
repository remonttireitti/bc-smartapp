import type { SupabaseClient } from '@supabase/supabase-js';
import type { Customer } from '../types';

export type CustomerSharingState = {
  restricted: boolean;
  sharedCustomerIds: string[];
  reportLinkedCustomerIds: string[];
};

export async function loadOwnCustomers(
  supabase: SupabaseClient,
  ownerCompanyId: string,
): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, address, city, owner_company_id')
    .eq('owner_company_id', ownerCompanyId)
    .order('name');

  if (error) throw error;
  return (data as Customer[]) ?? [];
}

export async function loadReportLinkedCustomersByPartnership(
  supabase: SupabaseClient,
  ownerCompanyId: string,
  partnerships: { id: string; partnerCompanyId: string }[],
): Promise<Record<string, string[]>> {
  if (partnerships.length === 0) return {};

  const partnerCompanyIds = [...new Set(partnerships.map((entry) => entry.partnerCompanyId))];
  const partnerByCompanyId = new Map(
    partnerships.map((entry) => [entry.partnerCompanyId, entry.id] as const),
  );
  const result: Record<string, string[]> = Object.fromEntries(
    partnerships.map((entry) => [entry.id, [] as string[]]),
  );

  const [{ data: workRows, error: workError }, { data: maintenanceRows, error: maintenanceError }] =
    await Promise.all([
      supabase
        .from('work_reports')
        .select('customer_id, created_by_company_id')
        .eq('owner_company_id', ownerCompanyId)
        .in('created_by_company_id', partnerCompanyIds)
        .not('customer_id', 'is', null),
      supabase
        .from('maintenance_reports')
        .select('customer_id, created_by_company_id')
        .eq('owner_company_id', ownerCompanyId)
        .in('created_by_company_id', partnerCompanyIds)
        .not('customer_id', 'is', null),
    ]);

  if (workError) throw workError;
  if (maintenanceError) throw maintenanceError;

  const addCustomer = (partnershipId: string, customerId: string | null) => {
    if (!customerId) return;
    const bucket = result[partnershipId];
    if (!bucket.includes(customerId)) bucket.push(customerId);
  };

  for (const row of workRows ?? []) {
    const partnershipId = partnerByCompanyId.get(row.created_by_company_id as string);
    if (!partnershipId) continue;
    addCustomer(partnershipId, row.customer_id as string);
  }

  for (const row of maintenanceRows ?? []) {
    const partnershipId = partnerByCompanyId.get(row.created_by_company_id as string);
    if (!partnershipId) continue;
    addCustomer(partnershipId, row.customer_id as string);
  }

  return result;
}

export async function loadCustomerSharingForPartnership(
  supabase: SupabaseClient,
  partnershipId: string,
  ownerCompanyId: string,
  partnerCompanyId: string,
): Promise<CustomerSharingState> {
  const [{ data: partnership, error: partnershipError }, { data: rows, error: rowsError }, reportLinkedByPartnership] =
    await Promise.all([
      supabase
        .from('company_partnerships')
        .select('customer_access_restricted')
        .eq('id', partnershipId)
        .single(),
      supabase
        .from('customer_partner_access')
        .select('customer_id, can_view')
        .eq('partnership_id', partnershipId),
      loadReportLinkedCustomersByPartnership(supabase, ownerCompanyId, [
        { id: partnershipId, partnerCompanyId },
      ]),
    ]);

  if (partnershipError) throw partnershipError;
  if (rowsError) throw rowsError;

  const sharedCustomerIds = (rows ?? [])
    .filter((row) => row.can_view)
    .map((row) => row.customer_id as string);

  return {
    restricted: Boolean(partnership?.customer_access_restricted ?? true),
    sharedCustomerIds,
    reportLinkedCustomerIds: reportLinkedByPartnership[partnershipId] ?? [],
  };
}

export function customerSharingSummary(
  restricted: boolean,
  sharedCount: number,
  reportLinkedCount: number,
  totalCount: number,
): string {
  if (totalCount === 0) return 'Ei asiakkaita rekisterissä';
  if (!restricted) return `Kaikki asiakkaat (${totalCount})`;

  const parts: string[] = [];
  if (sharedCount > 0) parts.push(`${sharedCount} jaettu`);
  if (reportLinkedCount > 0) parts.push(`${reportLinkedCount} raportin kautta`);

  if (parts.length === 0) return 'Ei jaettuja asiakkaita';
  return `${parts.join(' · ')} / ${totalCount}`;
}

export async function saveCustomerSharingForPartnership(
  supabase: SupabaseClient,
  partnershipId: string,
  sharedCustomerIds: string[],
): Promise<void> {
  const { error: updateError } = await supabase
    .from('company_partnerships')
    .update({ customer_access_restricted: true })
    .eq('id', partnershipId);

  if (updateError) throw updateError;

  const { error: deleteError } = await supabase
    .from('customer_partner_access')
    .delete()
    .eq('partnership_id', partnershipId);

  if (deleteError) throw deleteError;

  if (sharedCustomerIds.length === 0) return;

  const { error: insertError } = await supabase.from('customer_partner_access').insert(
    sharedCustomerIds.map((customerId) => ({
      partnership_id: partnershipId,
      customer_id: customerId,
      can_view: true,
      can_create_reports: true,
    })),
  );

  if (insertError) throw insertError;
}

export function isCustomerExplicitlySharedWithPartner(
  sharing: CustomerSharingState,
  customerId: string,
): boolean {
  if (!sharing.restricted) return true;
  return sharing.sharedCustomerIds.includes(customerId);
}

export function isCustomerReportLinkedWithPartner(
  sharing: CustomerSharingState,
  customerId: string,
): boolean {
  return sharing.reportLinkedCustomerIds.includes(customerId);
}

export function isCustomerVisibleToPartner(
  sharing: CustomerSharingState,
  customerId: string,
): boolean {
  if (!sharing.restricted) return true;
  return (
    isCustomerExplicitlySharedWithPartner(sharing, customerId)
    || isCustomerReportLinkedWithPartner(sharing, customerId)
  );
}

/** @deprecated Use isCustomerVisibleToPartner or isCustomerExplicitlySharedWithPartner */
export function isCustomerSharedWithPartner(
  sharing: CustomerSharingState,
  customerId: string,
): boolean {
  return isCustomerVisibleToPartner(sharing, customerId);
}

export async function loadCustomerSharingByPartnerships(
  supabase: SupabaseClient,
  ownerCompanyId: string,
  partnerships: { id: string; partnerCompanyId: string }[],
): Promise<Record<string, CustomerSharingState>> {
  if (partnerships.length === 0) return {};

  const partnershipIds = partnerships.map((entry) => entry.id);
  const [{ data: partnershipRows, error: partnershipError }, { data: rows, error: rowsError }, reportLinkedByPartnership] =
    await Promise.all([
      supabase
        .from('company_partnerships')
        .select('id, customer_access_restricted')
        .in('id', partnershipIds),
      supabase
        .from('customer_partner_access')
        .select('partnership_id, customer_id, can_view')
        .in('partnership_id', partnershipIds),
      loadReportLinkedCustomersByPartnership(supabase, ownerCompanyId, partnerships),
    ]);

  if (partnershipError) throw partnershipError;
  if (rowsError) throw rowsError;

  const result: Record<string, CustomerSharingState> = {};
  for (const partnership of partnershipRows ?? []) {
    result[partnership.id] = {
      restricted: Boolean(partnership.customer_access_restricted ?? true),
      sharedCustomerIds: [],
      reportLinkedCustomerIds: reportLinkedByPartnership[partnership.id] ?? [],
    };
  }

  for (const row of rows ?? []) {
    if (!row.can_view) continue;
    const entry = result[row.partnership_id];
    if (!entry) continue;
    entry.sharedCustomerIds.push(row.customer_id as string);
  }

  return result;
}

export async function setCustomerSharedWithPartner(
  supabase: SupabaseClient,
  partnershipId: string,
  customerId: string,
  shared: boolean,
  currentSharing: CustomerSharingState,
): Promise<void> {
  if (isCustomerReportLinkedWithPartner(currentSharing, customerId)) return;

  const currentlyShared = isCustomerExplicitlySharedWithPartner(currentSharing, customerId);
  if (currentlyShared === shared) return;

  const nextSharedIds = shared
    ? [...new Set([...currentSharing.sharedCustomerIds, customerId])]
    : currentSharing.sharedCustomerIds.filter((id) => id !== customerId);

  await saveCustomerSharingForPartnership(supabase, partnershipId, nextSharedIds);
}
