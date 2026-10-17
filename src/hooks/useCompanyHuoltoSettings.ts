import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  HUOLTO_ACCESS_ALL,
  huoltoAccess,
  parseHuoltoSettings,
  type HuoltoAccess,
  type HuoltoSettings,
} from '../lib/huoltoCategories';
import { MODULE_TRIALS_CHANGED_EVENT, ownCompanyTrialUnlockedKeys } from '../lib/moduleTrials';
import { supabase } from '../lib/supabase';

export const HUOLTO_SETTINGS_CHANGED_EVENT = 'huolto-settings-changed';

const cache = new Map<string, HuoltoSettings>();

export async function loadCompanyHuoltoSettings(companyId: string): Promise<HuoltoSettings | null> {
  const { data, error } = await supabase.from('companies').select('settings').eq('id', companyId).maybeSingle();
  if (error || !data) return null;
  const parsed = parseHuoltoSettings((data as { settings: unknown }).settings);
  cache.set(companyId, parsed);
  return parsed;
}

export function notifyHuoltoSettingsChanged(companyId: string, settings: HuoltoSettings) {
  cache.set(companyId, settings);
  window.dispatchEvent(new CustomEvent(HUOLTO_SETTINGS_CHANGED_EVENT, { detail: { companyId } }));
}

/** Oman yrityksen huoltoraporttilajit ja hinnasto (companies.settings.huolto). */
export function useCompanyHuoltoSettings(companyId: string | null | undefined, session: Session | null) {
  const [settings, setSettings] = useState<HuoltoSettings | null>(() => (companyId ? cache.get(companyId) ?? null : null));

  const refresh = useCallback(async () => {
    if (!companyId || !session) {
      setSettings(null);
      return;
    }
    const value = await loadCompanyHuoltoSettings(companyId);
    if (value) setSettings(value);
  }, [companyId, session]);

  useEffect(() => {
    if (companyId && cache.has(companyId)) setSettings(cache.get(companyId)!);
    void refresh();
  }, [refresh, companyId]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const id = (event as CustomEvent<{ companyId: string }>).detail?.companyId;
      if (id && id === companyId && cache.has(id)) setSettings(cache.get(id)!);
    };
    const onFocus = () => void refresh();
    window.addEventListener(HUOLTO_SETTINGS_CHANGED_EVENT, onChange);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener(HUOLTO_SETTINGS_CHANGED_EVENT, onChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [companyId, refresh]);

  const [trialKeys, setTrialKeys] = useState<ReadonlySet<string>>(() => ownCompanyTrialUnlockedKeys());
  useEffect(() => {
    const onTrials = () => setTrialKeys(ownCompanyTrialUnlockedKeys());
    window.addEventListener(MODULE_TRIALS_CHANGED_EVENT, onTrials);
    return () => window.removeEventListener(MODULE_TRIALS_CHANGED_EVENT, onTrials);
  }, []);

  const access: HuoltoAccess = useMemo(
    () => (settings ? huoltoAccess(settings, trialKeys) : HUOLTO_ACCESS_ALL),
    [settings, trialKeys],
  );
  return { settings, access, loaded: settings != null };
}
