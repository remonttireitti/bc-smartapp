import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Company, Profile } from '../../types';

export function useGlobalAdminMeta(enabled: boolean) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const loadMeta = useCallback(async () => {
    const [{ data: companyRows }, { data: userRows }] = await Promise.all([
      supabase.from('companies').select('id, name, slug, settings').order('name'),
      supabase.from('profiles').select('id, display_name, email, role, company_id').order('email'),
    ]);
    const nextCompanies = (companyRows as Company[]) ?? [];
    setCompanies(nextCompanies);
    setUsers((userRows as Profile[]) ?? []);

    const countEntries = await Promise.all(
      (companyRows ?? []).map(async (company) => {
        const id = company.id as string;
        const [wr, mr, cu, qr] = await Promise.all([
          supabase.from('work_reports').select('id', { count: 'exact', head: true }).eq('owner_company_id', id),
          supabase.from('maintenance_reports').select('id', { count: 'exact', head: true }).eq('owner_company_id', id),
          supabase.from('customers').select('id', { count: 'exact', head: true }).eq('owner_company_id', id),
          supabase.from('quote_requests').select('id', { count: 'exact', head: true }).eq('owner_company_id', id),
        ]);
        return [id, (wr.count ?? 0) + (mr.count ?? 0) + (cu.count ?? 0) + (qr.count ?? 0)] as const;
      }),
    );
    setCounts(Object.fromEntries(countEntries));
    return nextCompanies;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await loadMeta();
    setLoading(false);
  }, [loadMeta]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  return { companies, setCompanies, users, counts, loading, loadMeta, refresh };
}
