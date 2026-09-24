import { createClient } from '@supabase/supabase-js';

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

/** sessionStorage: istunto päättyy kun selain suljetaan (kaikki välilehdet). */
export const supabase = createClient(url ?? '', key ?? '', {
  auth: {
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});
