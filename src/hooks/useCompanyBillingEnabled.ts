import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { companyHasBillableBilling } from '../lib/workReportBillingCopy';

export function useCompanyBillingEnabled(
  companyId: string | null | undefined,
  session: Session | null,
) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId || !session) {
      setEnabled(null);
      return;
    }

    const value = await companyHasBillableBilling(supabase, companyId);
    setEnabled(value);
  }, [companyId, session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onFocus() {
      void refresh();
    }

    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return enabled;
}
