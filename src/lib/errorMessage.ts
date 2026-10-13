/** Virheviesti myös Supabasen/PostgRESTin tavallisista virheolioista ({ message }), ei vain Error-instansseista. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = String((err as { message?: unknown }).message ?? '').trim();
    if (message) return message;
  }
  return fallback;
}
