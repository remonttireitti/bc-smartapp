import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  parseCompanyLicenseSnapshot,
  type CompanyLicenseSnapshot,
  type LicenseModuleKey,
} from '../lib/companyLicense';
import { supabase } from '../lib/supabase';

export function useCompanyLicense(
  companyId: string | null | undefined,
  session: Session | null,
  isGlobalAdmin = false,
) {
  const [license, setLicense] = useState<CompanyLicenseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!companyId || !session) {
      setLicense(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = isGlobalAdmin
      ? await supabase.rpc('company_license_snapshot', { p_company_id: companyId })
      : await supabase.rpc('start_company_trial_on_login');

    if (error && !isGlobalAdmin) {
      const fallback = await supabase.rpc('company_license_snapshot', { p_company_id: companyId });
      setLicense(parseCompanyLicenseSnapshot(fallback.data));
    } else {
      setLicense(parseCompanyLicenseSnapshot(data));
    }

    setLoading(false);
  }, [companyId, session, isGlobalAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const recordAccess = useCallback(async (moduleKey: LicenseModuleKey) => {
    if (!companyId || isGlobalAdmin) return;
    await supabase.rpc('record_company_module_access', { p_module_key: moduleKey });
  }, [companyId, isGlobalAdmin]);

  return { license, loading, refresh, recordAccess };
}
