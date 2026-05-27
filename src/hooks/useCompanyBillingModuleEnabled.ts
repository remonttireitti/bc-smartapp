import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { loadCompanyBillingModuleEnabled } from '../lib/management';
import { supabase } from '../lib/supabase';

/** Globaalin adminin kytkemä: näkyykö yritykselle Laskutus-moduuli. */
export function useCompanyBillingModuleEnabled(
  companyId: string | null | undefined,
  session: Session | null,
) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId || !session) {
      setEnabled(null);
      return;
    }
    const value = await loadCompanyBillingModuleEnabled(supabase, companyId);
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
