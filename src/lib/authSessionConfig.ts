/** Toimettomuus ennen automaattista uloskirjautumista. */
export const IDLE_LOGOUT_MINUTES = 30;
export const IDLE_LOGOUT_MS = IDLE_LOGOUT_MINUTES * 60 * 1000;

/** Tarkistetaan kaikissa välilehdissä (localStorage). */
export const ACTIVITY_STORAGE_KEY = 'bc-smartapp:last-activity';

export const IDLE_CHECK_INTERVAL_MS = 30_000;

export type SignOutReason = 'manual' | 'idle' | 'remote' | 'expired';

export const SIGN_OUT_REASON_MESSAGES: Record<SignOutReason, string> = {
  manual: '',
  idle: `Istuntosi päättyi ${IDLE_LOGOUT_MINUTES} minuutin toimettomuuden jälkeen. Keskeneräiset luonnokset on tallennettu.`,
  remote: 'Kirjautumisesi on päättynyt. Kirjaudu uudelleen.',
  expired: 'Istunto vanhentui. Kirjaudu uudelleen.',
};
