import type { SupabaseClient } from '@supabase/supabase-js';
import { CUSTOMER_SELECT } from './customers';
import { partnershipPermsActingOnOwner, partnershipModuleAccess } from './management';
import type { PartnershipModuleKey } from './management';
import type { Customer, Partnership } from '../types';

export type ReportContext = {
  contextMode: 'own' | 'partner';
  partnerId: string;
  ownerCompanyId: string;
};

export function accessibleRegistryCompanyIds(
  myCompanyId: string,
  partnerships: Partnership[],
): string[] {
  const ids = new Set<string>([myCompanyId]);
  for (const partnership of partnerships) {
    const partnerCompanyId =
      partnership.company_a_id === myCompanyId
        ? partnership.company_b_id
        : partnership.company_a_id;
    ids.add(partnerCompanyId);
  }
  return [...ids];
}

export function resolveReportContextFromOwner(
  ownerCompanyId: string,
  myCompanyId: string,
  partnerships: Partnership[],
): ReportContext {
  if (ownerCompanyId === myCompanyId) {
    return { contextMode: 'own', partnerId: '', ownerCompanyId: myCompanyId };
  }

  const partnership = partnerships.find((entry) => {
    const partnerCompanyId =
      entry.company_a_id === myCompanyId ? entry.company_b_id : entry.company_a_id;
    return partnerCompanyId === ownerCompanyId;
  });

  return {
    contextMode: 'partner',
    partnerId: partnership?.id ?? '',
    ownerCompanyId,
  };
}

export function resolveReportContextFromCustomer(
  customer: Pick<Customer, 'owner_company_id'>,
  myCompanyId: string,
  partnerships: Partnership[],
): ReportContext {
  if (customer.owner_company_id === myCompanyId) {
    return { contextMode: 'own', partnerId: '', ownerCompanyId: myCompanyId };
  }

  const partnership = partnerships.find((entry) => {
    const partnerCompanyId =
      entry.company_a_id === myCompanyId ? entry.company_b_id : entry.company_a_id;
    return partnerCompanyId === customer.owner_company_id;
  });

  return {
    contextMode: 'partner',
    partnerId: partnership?.id ?? '',
    ownerCompanyId: customer.owner_company_id,
  };
}

export type ReportOwnerTarget = {
  companyId: string;
  label: string;
};

export type CustomerCreateTarget = ReportOwnerTarget;

export function reportOwnerTargets(
  myCompanyId: string,
  myCompanyName: string,
  partnerships: Partnership[],
  module: PartnershipModuleKey,
): ReportOwnerTarget[] {
  const targets: ReportOwnerTarget[] = [{ companyId: myCompanyId, label: myCompanyName }];
  const seen = new Set<string>([myCompanyId]);

  for (const partnership of partnerships) {
    const partnerCompanyId =
      partnership.company_a_id === myCompanyId
        ? partnership.company_b_id
        : partnership.company_a_id;
    if (seen.has(partnerCompanyId)) continue;

    const permissions = partnershipPermsActingOnOwner(partnership, myCompanyId, partnerCompanyId);
    if (!partnershipModuleAccess(permissions, module, 'write')) continue;

    seen.add(partnerCompanyId);
    targets.push({
      companyId: partnerCompanyId,
      label: partnership.partner_company.name,
    });
  }

  return targets;
}

export function customerCreateTargets(
  myCompanyId: string,
  myCompanyName: string,
  partnerships: Partnership[],
): CustomerCreateTarget[] {
  return reportOwnerTargets(myCompanyId, myCompanyName, partnerships, 'work_reports');
}

export function maintenanceReportOwnerTargets(
  myCompanyId: string,
  myCompanyName: string,
  partnerships: Partnership[],
): ReportOwnerTarget[] {
  return reportOwnerTargets(myCompanyId, myCompanyName, partnerships, 'maintenance_reports');
}

export type WarehouseTarget = {
  companyId: string;
  label: string;
  access: 'read' | 'write';
};

export function warehouseOwnerTargets(
  myCompanyId: string,
  myCompanyName: string,
  partnerships: Partnership[],
): WarehouseTarget[] {
  const ownLabel = myCompanyName ? `${myCompanyName} (oma varasto)` : 'Oma varasto';
  const targets: WarehouseTarget[] = [{ companyId: myCompanyId, label: ownLabel, access: 'write' }];
  const seen = new Set<string>([myCompanyId]);

  for (const partnership of partnerships) {
    const partnerCompanyId =
      partnership.company_a_id === myCompanyId
        ? partnership.company_b_id
        : partnership.company_a_id;
    if (seen.has(partnerCompanyId)) continue;

    const permissions = partnershipPermsActingOnOwner(partnership, myCompanyId, partnerCompanyId);
    const access = partnershipModuleAccess(permissions, 'inventory', 'write')
      ? 'write'
      : partnershipModuleAccess(permissions, 'inventory', 'read')
        ? 'read'
        : null;
    if (!access) continue;

    seen.add(partnerCompanyId);
    targets.push({
      companyId: partnerCompanyId,
      label: partnership.partner_company.name,
      access,
    });
  }

  return targets;
}

export function warehouseAccessForCompany(
  myCompanyId: string,
  warehouseCompanyId: string,
  partnerships: Partnership[],
): 'read' | 'write' {
  if (warehouseCompanyId === myCompanyId) return 'write';
  const partnership = partnerships.find((entry) => {
    const partnerCompanyId =
      entry.company_a_id === myCompanyId ? entry.company_b_id : entry.company_a_id;
    return partnerCompanyId === warehouseCompanyId;
  });
  if (!partnership) return 'read';
  const partnerCompanyId =
    partnership.company_a_id === myCompanyId ? partnership.company_b_id : partnership.company_a_id;
  const permissions = partnershipPermsActingOnOwner(partnership, myCompanyId, partnerCompanyId);
  if (partnershipModuleAccess(permissions, 'inventory', 'write')) return 'write';
  if (partnershipModuleAccess(permissions, 'inventory', 'read')) return 'read';
  return 'read';
}

export function defaultReportContext(myCompanyId: string): ReportContext {
  return { contextMode: 'own', partnerId: '', ownerCompanyId: myCompanyId };
}

export function customerRegistryLabel(
  customer: Pick<Customer, 'owner_company_id'> & { owner_company?: { name: string } | null },
  myCompanyId: string,
): string {
  if (customer.owner_company_id === myCompanyId) return 'Oma rekisteri';
  return customer.owner_company?.name ?? 'Kumppanin rekisteri';
}

export async function loadAccessibleReportCustomers(
  supabase: SupabaseClient,
  myCompanyId: string,
  partnerships: Partnership[],
): Promise<Customer[]> {
  const companyIds = accessibleRegistryCompanyIds(myCompanyId, partnerships);
  const { data, error } = await supabase
    .from('customers')
    .select(CUSTOMER_SELECT)
    .in('owner_company_id', companyIds)
    .order('name');

  if (error) throw error;
  return (data as unknown as Customer[]) ?? [];
}

/** Kumppanuudet joilla on vähintään lukuoikeus varastoon. */
export async function loadInventoryPartnerships(
  supabase: SupabaseClient,
  myCompanyId: string,
): Promise<Partnership[]> {
  return loadReportPartnerships(supabase, myCompanyId, 'inventory', 'read');
}

export async function loadReportPartnerships(
  supabase: SupabaseClient,
  myCompanyId: string,
  module: PartnershipModuleKey,
  minAccess: 'read' | 'write' = 'write',
): Promise<Partnership[]> {
  const { data } = await supabase
    .from('company_partnerships')
    .select('id, company_a_id, company_b_id, permissions_a_to_b, permissions_b_to_a')
    .eq('status', 'active');

  const rows = (data ?? []) as Omit<Partnership, 'partner_company'>[];
  const mine = rows.filter(
    (partnership) =>
      partnership.company_a_id === myCompanyId || partnership.company_b_id === myCompanyId,
  );

  const enriched: Partnership[] = [];
  for (const partnership of mine) {
    const partnerCompanyId =
      partnership.company_a_id === myCompanyId
        ? partnership.company_b_id
        : partnership.company_a_id;
    const permissions = partnershipPermsActingOnOwner(
      partnership,
      myCompanyId,
      partnerCompanyId,
    );
    const hasAccess =
      minAccess === 'write'
        ? partnershipModuleAccess(permissions, module, 'write')
        : partnershipModuleAccess(permissions, module, 'read');
    if (!hasAccess) continue;

    const { data: company } = await supabase
      .from('companies')
      .select('id, name, slug')
      .eq('id', partnerCompanyId)
      .single();

    if (company) enriched.push({ ...partnership, partner_company: company });
  }

  return enriched;
}
