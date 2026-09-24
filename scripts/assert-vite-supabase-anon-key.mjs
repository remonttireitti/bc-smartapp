#!/usr/bin/env node
/**
 * Fails the build if VITE_SUPABASE_ANON_KEY is a secret/service_role key.
 * Prevents "Forbidden use of secret API key in browser" deploys.
 */
import { Buffer } from 'node:buffer';

const key = process.env.VITE_SUPABASE_ANON_KEY ?? '';
if (!key) {
  console.error('Missing VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}
if (key.startsWith('sb_secret_')) {
  console.error('VITE_SUPABASE_ANON_KEY is sb_secret_… — use sb_publishable_… (anon/public) instead.');
  process.exit(1);
}
if (key.startsWith('sb_publishable_')) {
  console.log('VITE_SUPABASE_ANON_KEY: ok (sb_publishable_)');
  process.exit(0);
}
if (key.split('.').length === 3) {
  try {
    const payload = key.split('.')[1];
    const pad = '='.repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(Buffer.from(payload + pad, 'base64url').toString('utf8'));
    if (json.role === 'service_role') {
      console.error('VITE_SUPABASE_ANON_KEY has JWT role service_role — use anon key.');
      process.exit(1);
    }
    if (json.role === 'anon' || json.role === 'authenticated') {
      console.log(`VITE_SUPABASE_ANON_KEY: ok (jwt role=${json.role})`);
      process.exit(0);
    }
    console.error(`Unexpected JWT role: ${json.role}`);
    process.exit(1);
  } catch (err) {
    console.error('Could not decode JWT anon key:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
console.error('VITE_SUPABASE_ANON_KEY format not recognized (need sb_publishable_… or anon JWT).');
process.exit(1);
