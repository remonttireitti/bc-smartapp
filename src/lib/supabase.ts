import { createClient, type Session } from '@supabase/supabase-js';
import { createOfflineFetch } from './offline/offlineFetch';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function isForbiddenBrowserKey(value: string | undefined): boolean {
  if (!value) return false;
  if (value.startsWith('sb_secret_')) return true;
  if (value.split('.').length !== 3) return false;
  try {
    const payload = value.split('.')[1] ?? '';
    const pad = '='.repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/') + pad)) as {
      role?: string;
    };
    return json.role === 'service_role';
  } catch {
    return false;
  }
}

if (!url || !key) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — copy .env.example to .env');
} else if (isForbiddenBrowserKey(key)) {
  console.error(
    'VITE_SUPABASE_ANON_KEY on secret/service_role-avain. Käytä anon/public (sb_publishable_…) -avainta.',
  );
}

const OFFLINE_FLAG = 'bc-offline-enabled';

/**
 * sessionStorage: istunto päättyy kun selain suljetaan. Poikkeus: kun asiakkaan offline-käyttö on päällä,
 * istunto peilataan localStorageen, jotta asennettu sovellus aukeaa ilman verkkoa (poistuu uloskirjautuessa).
 */
const authStorage = {
  getItem(key: string): string | null {
    try {
      const v = window.sessionStorage.getItem(key);
      if (v != null) return v;
      return window.localStorage.getItem(OFFLINE_FLAG) ? window.localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      window.sessionStorage.setItem(key, value);
      if (window.localStorage.getItem(OFFLINE_FLAG)) window.localStorage.setItem(key, value);
    } catch { /* ignore */ }
  },
  removeItem(key: string) {
    try {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    } catch { /* ignore */ }
  },
};

/** Peilaa tai poista istunto localStoragesta offline-käytön kytkimen mukaan. */
export function mirrorAuthSession(enabled: boolean) {
  try {
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (!k || !k.startsWith('sb-')) continue;
      if (enabled) window.localStorage.setItem(k, window.sessionStorage.getItem(k) ?? '');
      else window.localStorage.removeItem(k);
    }
    if (!enabled) {
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) window.localStorage.removeItem(k);
      }
    }
  } catch { /* ignore */ }
}

/** Offline-käynnistys: tallennettu istunto vaikka access token olisi vanhentunut (päivittyy kun verkko palaa). */
export function readStoredSession(): Session | null {
  try {
    for (const store of [window.sessionStorage, window.localStorage]) {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (!k || !k.startsWith('sb-') || !k.endsWith('-auth-token')) continue;
        const parsed = JSON.parse(store.getItem(k) ?? 'null') as Session | null;
        if (parsed?.user && parsed.access_token) return parsed;
      }
    }
  } catch { /* ignore */ }
  return null;
}

async function offlineAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return { apikey: key ?? '', Authorization: `Bearer ${data.session?.access_token ?? key ?? ''}` };
}

export const supabase = createClient(url ?? '', key ?? '', {
  auth: {
    storage: typeof window !== 'undefined' ? authStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
  global: { fetch: typeof window !== 'undefined' ? createOfflineFetch(url ?? '', offlineAuthHeaders) : undefined },
});
