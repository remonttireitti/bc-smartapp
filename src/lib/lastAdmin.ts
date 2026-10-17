/** Jokaisella yrityksellä vähintään yksi ylläpitäjä (tietokannan profiles_last_admin_guard). */
export const LAST_ADMIN_MESSAGE = 'Yrityksellä pitää olla vähintään yksi ylläpitäjä. Lisää ensin toinen ylläpitäjä.';
export const LAST_ADMIN_TITLE = 'Yrityksen ainoa ylläpitäjä';

type UserLike = { id: string; role: string | null; company_id: string | null };

export function companyAdminCount(users: UserLike[], companyId: string | null): number {
  if (!companyId) return 0;
  return users.filter((u) => u.company_id === companyId && u.role === 'admin').length;
}

/** Onko käyttäjä yrityksensä ainoa ylläpitäjä (ladatun listan perusteella). */
export function isLastCompanyAdmin(user: UserLike, users: UserLike[]): boolean {
  return user.role === 'admin' && companyAdminCount(users, user.company_id) <= 1;
}

/** Tunnistaa tietokannan / edge functionin viimeisen ylläpitäjän virheen. */
export function isLastAdminError(err: unknown): boolean {
  const e = (err ?? {}) as { message?: unknown; details?: unknown; detail?: unknown };
  const text = [e.message, e.details, e.detail, typeof err === 'string' ? err : '']
    .map((v) => (typeof v === 'string' ? v : ''))
    .join(' ');
  return /last_company_admin|vähintään yksi ylläpitäjä/i.test(text);
}

/** Selkeä viesti käyttäjälle: viimeisen ylläpitäjän virhe tai alkuperäinen viesti. */
export function profileErrorMessage(err: unknown, fallback: string): string {
  if (isLastAdminError(err)) return LAST_ADMIN_MESSAGE;
  const m = (err as { message?: unknown } | null)?.message;
  return typeof m === 'string' && m ? m : fallback;
}
