import { supabase } from './supabase';

export type PlatformAuditRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_company_id: string | null;
  actor_company_name: string | null;
  action: string;
  summary: string;
  entity_type: string | null;
  entity_id: string | null;
  route: string | null;
  metadata: Record<string, unknown>;
};

let lastRouteLogged = '';

export async function recordPlatformAudit(
  action: string,
  summary: string,
  options?: {
    entityType?: string;
    entityId?: string;
    route?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.rpc('record_platform_audit_event', {
    p_action: action,
    p_summary: summary,
    p_entity_type: options?.entityType ?? null,
    p_entity_id: options?.entityId ?? null,
    p_route: options?.route ?? null,
    p_metadata: options?.metadata ?? {},
  });

  if (error) {
    console.warn('Audit log failed:', error.message);
  }
}

export function recordPlatformRouteView(pathname: string) {
  if (!pathname || pathname === lastRouteLogged) return;
  lastRouteLogged = pathname;
  void recordPlatformAudit('navigation.view', `Avattiin ${pathname}`, { route: pathname });
}

export async function fetchPlatformAuditEvents(input: {
  limit?: number;
  offset?: number;
  companyId?: string;
  actorId?: string;
  actionContains?: string;
}) {
  const { data, error } = await supabase.rpc('global_admin_list_audit_events', {
    p_limit: input.limit ?? 100,
    p_offset: input.offset ?? 0,
    p_company_id: input.companyId ?? undefined,
    p_actor_id: input.actorId ?? undefined,
    p_action_contains: input.actionContains ?? undefined,
  });

  if (error) throw new Error(error.message);

  const payload = data as { total: number; rows: PlatformAuditRow[] };
  return {
    total: Number(payload.total ?? 0),
    rows: (payload.rows ?? []) as PlatformAuditRow[],
  };
}
