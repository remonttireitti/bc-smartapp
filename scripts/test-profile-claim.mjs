import assert from 'node:assert/strict';
import { claimInvitedProfile, isMissingRpcError } from '../src/lib/profileClaim.ts';

assert.equal(isMissingRpcError({ code: 'PGRST202', message: 'Could not find the function public.claim_invited_profile' }), true);
assert.equal(isMissingRpcError({ code: '42883', message: 'function does not exist' }), true);
assert.equal(isMissingRpcError({ code: '42501', message: 'permission denied' }), false);
assert.equal(isMissingRpcError(null), false);

const fake = (result) => ({ rpc: async (name) => { assert.equal(name, 'claim_invited_profile'); return result; } });
assert.equal(await claimInvitedProfile(fake({ data: { status: 'claimed' }, error: null })), 'claimed');
assert.equal(await claimInvitedProfile(fake({ data: { status: 'no_invite' }, error: null })), 'no_invite');
assert.equal(await claimInvitedProfile(fake({ data: { status: 'invalid_role' }, error: null })), 'rejected');
// Ennen SQL-ajoa → vanha polku
assert.equal(await claimInvitedProfile(fake({ data: null, error: { code: 'PGRST202', message: 'x' } })), 'unavailable');
// Muu virhe → ei vanhaa (itse-asettavaa) polkua
assert.equal(await claimInvitedProfile(fake({ data: null, error: { code: '42501', message: 'denied' } })), 'rejected');

// Koodissa ei saa olla is_global_admin-itsepäivitystä eikä user_metadata-pohjaista globaalia adminia.
import { readFileSync } from 'node:fs';
const ctx = readFileSync(new URL('../src/contexts/ProfileContext.tsx', import.meta.url), 'utf8');
assert.ok(!/update\(\{\s*is_global_admin/.test(ctx), 'ProfileContext ei saa päivittää is_global_admin');
assert.ok(!/meta\.is_global_admin/.test(ctx), 'globaali admin ei user_metadatasta');
for (const f of ['../supabase/functions/_shared/platformAdminAuth.ts', '../supabase/functions/company-signup/index.ts']) {
  const src = readFileSync(new URL(f, import.meta.url), 'utf8');
  assert.ok(!/user_metadata\)?\??\.?is_global_admin|user_metadata as Record<string, unknown> \| undefined\)\?\.is_global_admin|user_metadata\?\.is_global_admin/.test(src), `${f}: user_metadata is_global_admin`);
}
console.log('test-profile-claim OK');
