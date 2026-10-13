import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && /(^|\\/)supabase(\\.ts)?$/.test(spec) && ctx.parentURL && ctx.parentURL.includes('/src/')) {
    return { url: 'data:text/javascript,export const supabase = {};', shortCircuit: true };
  }
  return next(spec, ctx);
}`));
const { loadRefrigerantInventoryHistory } = await import('../src/lib/refrigerantInventoryHistory.ts');
const { errorMessage } = await import('../src/lib/errorMessage.ts');
let queried = false;
const db = { from: () => { queried = true; throw new Error('should not query'); } };
await assert.rejects(() => loadRefrigerantInventoryHistory(db, 'c', '', '2026-10-13'), /aikaväli/);
assert.equal(queried, false, 'empty from-date must not hit the API');
assert.equal(errorMessage({ message: 'invalid input syntax for type timestamp' }, 'x'), 'invalid input syntax for type timestamp');
assert.equal(errorMessage(new Error('boom'), 'x'), 'boom');
assert.equal(errorMessage(null, 'fallback'), 'fallback');
console.log('ok refrigerant history dates');
