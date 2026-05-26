/** Toimettomuus ennen automaattista uloskirjautumista. */
export const IDLE_LOGOUT_MS = 5 * 60 * 1000;

/** Tarkistetaan kaikissa välilehdissä (localStorage). */
export const ACTIVITY_STORAGE_KEY = 'bc-smartapp:last-activity';

export const IDLE_CHECK_INTERVAL_MS = 30_000;

export type SignOutReason = 'manual' | 'idle' | 'remote' | 'expired';

export const SIGN_OUT_REASON_MESSAGES: Record<SignOutReason, string> = {
  manual: '',
  idle: 'Istuntosi päättyi 5 minuutin toimettomuuden jälkeen. Keskeneräiset luonnokset on tallennettu.',
  remote: 'Kirjauduit sisään toisella laitteella — tämä istunto on suljettu.',
  expired: 'Istunto vanhentui. Kirjaudu uudelleen.',
};
