import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { loadCompanyPartnershipsEnabled } from '../lib/management';
import { supabase } from '../lib/supabase';

/** Yrityksen ylläpitäjän kytkemä: näkyvätkö kumppanuus- ja moniyritystoiminnot. */
export function useCompanyPartnershipsEnabled(
  companyId: string | null | undefined,
  session: Session | null,
) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId || !session) {
      setEnabled(null);
      return;
    }
    const value = await loadCompanyPartnershipsEnabled(supabase, companyId);
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
