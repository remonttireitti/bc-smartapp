import type { Session } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '../../types';
import { buildMaintenanceReportTitleFromData, normalizeHuoltoReportData } from './defaults';
import { cloneHuoltoReportForSiblingEquipment } from './cloneReportForSiblingEquipment';
import {
  buildHuoltoEquipmentTechnicalSnapshot,
  saveEquipmentFromReport,
} from './equipmentSnapshot';
import { huoltoPerformerFields } from './performerFromProfile';
import type { HuoltoReportData } from './types';
import type { SubscriberPortalVisibility } from '../subscriberPortalVisibility';

export type SiblingEquipmentCopyInput = {
  tunnus: string;
  sarjanumero: string;
  sameModel: boolean;
  malli?: string;
  valmistaja?: string;
};

export function applySiblingEquipmentCopyFields(
  source: HuoltoReportData,
  input: SiblingEquipmentCopyInput,
): HuoltoReportData {
  const cloned = cloneHuoltoReportForSiblingEquipment(source, { keepModel: input.sameModel });
  cloned.laiteTunnus = input.tunnus.trim();
  cloned.laiteSarjanumero = input.sarjanumero.trim();
  if (!input.sameModel) {
    cloned.laiteMalli = input.malli?.trim() ?? '';
    cloned.laiteValmistaja = input.valmistaja?.trim() ?? '';
  }
  return cloned;
}

export type CreateSiblingMaintenanceReportParams = {
  sourceForm: HuoltoReportData;
  input: SiblingEquipmentCopyInput;
  customerId: string;
  ownerCompanyId: string;
  createdByCompanyId: string;
  assignedUserId: string;
  customerName?: string | null;
  subscriberId?: string | null;
  subscriberPortalVisibility?: SubscriberPortalVisibility;
  partnershipId?: string | null;
  brandingCompanyId?: string | null;
  profile: Profile | null;
  session: Session;
  supabase: SupabaseClient;
};

export async function createSiblingMaintenanceReport(
  params: CreateSiblingMaintenanceReportParams,
): Promise<{ reportId: string; equipmentId: string }> {
  const form = applySiblingEquipmentCopyFields(params.sourceForm, params.input);
  if (!form.laiteTunnus.trim()) {
    throw new Error('Anna uuden laitteen tunnus.');
  }
  if (!form.laiteTyyppi) {
    throw new Error('Laitetyyppi puuttuu.');
  }

  const equipmentId = await saveEquipmentFromReport(
    form,
    params.customerId,
    params.ownerCompanyId,
    null,
    params.supabase,
  );

  const dataPayload = normalizeHuoltoReportData({
    ...form,
    ...huoltoPerformerFields(params.profile, params.session),
    customerId: params.customerId,
    equipmentSnapshot: buildHuoltoEquipmentTechnicalSnapshot(form) as unknown as HuoltoReportData['equipmentSnapshot'],
  });

  const title = buildMaintenanceReportTitleFromData(params.customerName ?? null, dataPayload);

  const { data, error } = await params.supabase
    .from('maintenance_reports')
    .insert({
      owner_company_id: params.ownerCompanyId,
      created_by_company_id: params.createdByCompanyId,
      branding_company_id: params.brandingCompanyId ?? params.ownerCompanyId,
      partnership_id: params.partnershipId ?? null,
      customer_id: params.customerId,
      subscriber_id: params.subscriberId ?? null,
      subscriber_portal_visibility: params.subscriberPortalVisibility ?? 'when_ready',
      equipment_id: equipmentId,
      assigned_user_id: params.assignedUserId,
      title,
      data: dataPayload,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Huoltopöytäkirjan luonti epäonnistui.');
  }

  return {
    reportId: (data as { id: string }).id,
    equipmentId,
  };
}
