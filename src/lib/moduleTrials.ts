/**
 * Moduulikokeilut (SQL public.module_trials, module_trials.sql).
 * Globaali admin antaa yritykselle kokeilun lisämoduuleille ja huoltolajeille; kokeilun ajan moduuli
 * on auki eikä laskutu. Päättynyt kokeilu, jonka yritys tilasi jatkoon (keep_after), toimii kuten tilattu.
 */
export type ModuleTrialKey =
  | 'quotes'
  | 'billing'
  | 'remote_monitoring'
  | 'inventory'
  | 'tools'
  | 'partners'
  | 'kylma'
  | 'lvi'
  | 'iv'
  | 'sahko';

export type ModuleTrial = {
  module_key: ModuleTrialKey;
  starts_at: string;
  ends_at: string;
  active: boolean;
  keep_after: boolean;
};

export const MODULE_TRIAL_KEYS: { key: ModuleTrialKey; label: string; group: 'module' | 'huolto' }[] = [
  { key: 'quotes', label: 'Tarjoukset', group: 'module' },
  { key: 'billing', label: 'Laskutus', group: 'module' },
  { key: 'remote_monitoring', label: 'Etäseuranta', group: 'module' },
  { key: 'inventory', label: 'Varasto', group: 'module' },
  { key: 'tools', label: 'Työkalut', group: 'module' },
  { key: 'partners', label: 'Kumppanuudet', group: 'module' },
  { key: 'kylma', label: 'Kylmälaitehuolto', group: 'huolto' },
  { key: 'lvi', label: 'LVI-huolto', group: 'huolto' },
  { key: 'iv', label: 'IV-huolto', group: 'huolto' },
  { key: 'sahko', label: 'Sähköhuolto', group: 'huolto' },
];

export function moduleTrialLabel(key: string) {
  return MODULE_TRIAL_KEYS.find((k) => k.key === key)?.label ?? key;
}

export function parseModuleTrials(raw: unknown): ModuleTrial[] {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  return raw
    .map((entry) => {
      const o = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
      const key = String(o.module_key ?? '') as ModuleTrialKey;
      if (!MODULE_TRIAL_KEYS.some((k) => k.key === key)) return null;
      const starts = String(o.starts_at ?? '');
      const ends = String(o.ends_at ?? '');
      const active =
        typeof o.active === 'boolean'
          ? o.active
          : new Date(starts).getTime() <= now && new Date(ends).getTime() > now;
      return { module_key: key, starts_at: starts, ends_at: ends, active, keep_after: o.keep_after === true };
    })
    .filter((t): t is ModuleTrial => t !== null);
}

/** Kokeilu tai jatkoon tilattu päättynyt kokeilu avaa moduulin. */
export function moduleTrialUnlocks(t: ModuleTrial) {
  return t.active || (t.keep_after && new Date(t.ends_at).getTime() <= Date.now());
}

/** pp.kk.vvvv (Suomen aika). */
export function formatTrialEnd(iso: string, withYear = true) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fi-FI', {
    timeZone: 'Europe/Helsinki',
    day: '2-digit',
    month: '2-digit',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/* Oman yrityksen avatut avaimet (asetetaan lisenssin latauksessa; huolto- ja kumppanuusnäkyvyys käyttää). */
export const MODULE_TRIALS_CHANGED_EVENT = 'module-trials-changed';
let unlockedKeys = new Set<string>();

export function setOwnCompanyModuleTrials(trials: ModuleTrial[]) {
  const next = new Set(trials.filter(moduleTrialUnlocks).map((t) => t.module_key as string));
  const same = next.size === unlockedKeys.size && [...next].every((k) => unlockedKeys.has(k));
  if (same) return;
  unlockedKeys = next;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(MODULE_TRIALS_CHANGED_EVENT));
}

export function ownCompanyTrialUnlockedKeys(): ReadonlySet<string> {
  return unlockedKeys;
}
