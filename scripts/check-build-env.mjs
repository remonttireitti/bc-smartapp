const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error('\n[build] Puuttuvat ympäristömuuttujat:', missing.join(', '));
  console.error('[build] Cloudflare: Settings → Variables and secrets → Production');
  console.error('[build] Lisää VITE_SUPABASE_URL ja VITE_SUPABASE_ANON_KEY (.env.production), sitten Retry deployment.\n');
  process.exit(1);
}

if (!process.env.VITE_SUPABASE_URL.includes('supabase.co')) {
  console.error('\n[build] VITE_SUPABASE_URL ei näytä tuotanto-URL:lta.\n');
  process.exit(1);
}
