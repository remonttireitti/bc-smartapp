import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { companyTracksCustomerInvoicing, parseCompanySettings } from '../lib/management';
import { supabase } from '../lib/supabase';

export function useCompanyCustomerBillingEnabled(
  companyId: string | null | undefined,
  session: Session | null,
) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId || !session) {
      setEnabled(null);
      return;
    }

    const { data } = await supabase.from('companies').select('settings').eq('id', companyId).single();
    setEnabled(companyTracksCustomerInvoicing(parseCompanySettings((data as { settings: unknown } | null)?.settings)));
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
