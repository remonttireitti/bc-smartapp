import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteQuoteRequestById } from './deleteQuoteRequest';
import { canDeleteMaintenanceReport, canDeleteQuoteRequest, canDeleteWorkReport } from './deletePermissions';
import type { CustomerLinkedDocument } from './customerDocuments';

export const DOCUMENT_DELETE_DENIED_MESSAGE = 'Poisto epäonnistui — tarkista oikeudet.';

type Viewer = { userId: string; companyId: string | null | undefined; role: string | null | undefined; isGlobalAdmin?: boolean };

/** Näytetäänkö Poista: sama sääntö kuin dokumentin omassa listassa (vastaa RLS-poistopolitiikkaa). */
export function canDeleteLinkedDocument(doc: CustomerLinkedDocument, v: Viewer): boolean {
  const o = doc.owner;
  if (!o) return false;
  if (doc.kind === 'work_report') {
    return canDeleteWorkReport({ created_by_user_id: o.createdByUserId }, v.userId, v.isGlobalAdmin, v.role);
  }
  if (doc.kind === 'maintenance_report') {
    if (!o.ownerCompanyId) return false;
    return canDeleteMaintenanceReport(
      {
        status: doc.status ?? '',
        owner_company_id: o.ownerCompanyId,
        created_by_company_id: o.createdByCompanyId,
        assigned_user_id: o.assignedUserId,
      },
      v.userId,
      v.companyId,
      v.role,
      v.isGlobalAdmin,
    );
  }
  if (doc.kind === 'quote_request') {
    if (!o.ownerCompanyId) return false;
    return canDeleteQuoteRequest(
      { status: doc.status ?? '', owner_company_id: o.ownerCompanyId, created_by_company_id: o.createdByCompanyId },
      v.companyId,
      v.role,
      v.isGlobalAdmin,
    );
  }
  return false;
}

/** Kova poisto (soft-delete-saraketta ei ole). Varmistaa että rivi oikeasti poistui (RLS voi hiljaa estää). */
export async function deleteLinkedDocument(
  supabase: SupabaseClient,
  doc: CustomerLinkedDocument,
): Promise<{ error: { message: string } | null }> {
  if (doc.kind === 'quote_request') {
    const { error } = await deleteQuoteRequestById(supabase, doc.id);
    return { error };
  }
  const table = doc.kind === 'work_report' ? 'work_reports' : doc.kind === 'maintenance_report' ? 'maintenance_reports' : null;
  if (!table) return { error: { message: DOCUMENT_DELETE_DENIED_MESSAGE } };
  const { data, error } = await supabase.from(table).delete().eq('id', doc.id).select('id');
  if (error) return { error };
  if (!data || data.length === 0) return { error: { message: DOCUMENT_DELETE_DENIED_MESSAGE } };
  return { error: null };
}
