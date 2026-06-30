import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  parseCompanyLicenseSnapshot,
  type CompanyLicenseSnapshot,
  type LicenseModuleKey,
} from '../lib/companyLicense';
import { supabase } from '../lib/supabase';

const licenseCache = new Map<string, CompanyLicenseSnapshot>();
const trialStartedUserIds = new Set<string>();

export function invalidateCompanyLicenseCache(companyId?: string) {
  if (companyId) licenseCache.delete(companyId);
  else licenseCache.clear();
}

async function fetchLicenseSnapshot(
  companyId: string,
  session: Session,
  isGlobalAdmin: boolean,
): Promise<CompanyLicenseSnapshot | null> {
  if (isGlobalAdmin) {
    const { data } = await supabase.rpc('company_license_snapshot', { p_company_id: companyId });
    return parseCompanyLicenseSnapshot(data);
  }

  const userId = session.user.id;
  if (!trialStartedUserIds.has(userId)) {
    const { data, error } = await supabase.rpc('start_company_trial_on_login');
    trialStartedUserIds.add(userId);
    if (!error) {
      return parseCompanyLicenseSnapshot(data);
    }
  }

  const { data } = await supabase.rpc('company_license_snapshot', { p_company_id: companyId });
  return parseCompanyLicenseSnapshot(data);
}

export function useCompanyLicense(
  companyId: string | null | undefined,
  session: Session | null,
  isGlobalAdmin = false,
) {
  const [license, setLicense] = useState<CompanyLicenseSnapshot | null>(() =>
    companyId ? (licenseCache.get(companyId) ?? null) : null,
  );
  const [loading, setLoading] = useState(() => (companyId ? !licenseCache.has(companyId) : false));

  const refresh = useCallback(async () => {
    if (!companyId || !session) {
      setLicense(null);
      setLoading(false);
      return;
    }

    const cached = licenseCache.get(companyId);
    if (cached) {
      setLicense(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const next = await fetchLicenseSnapshot(companyId, session, isGlobalAdmin);
    if (next) {
      licenseCache.set(companyId, next);
    } else {
      licenseCache.delete(companyId);
    }
    setLicense(next);
    setLoading(false);
  }, [companyId, session, isGlobalAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const recordAccess = useCallback(
    async (moduleKey: LicenseModuleKey) => {
      if (!companyId || isGlobalAdmin) return;
      await supabase.rpc('record_company_module_access', { p_module_key: moduleKey });
    },
    [companyId, isGlobalAdmin],
  );

  return { license, loading, refresh, recordAccess };
}
