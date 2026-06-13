import { normalizeQuoteRequestData } from './quoteRequest/defaults';
import type { QuoteRequestData } from './quoteRequest/types';

const PREFIX = 'bc-smartapp:tarjous:';

export type StoredDraft<T> = {
  savedAt: number;
  payload: T;
};

/** Tyhjä oletuslomake (vesi-ilma) ennen loadQuotea — ei saa voittaa tietokantaa. */
function isCorruptedQuoteDraftShell(draft: QuoteRequestData, db: QuoteRequestData): boolean {
  if (draft.type === db.type) return false;
  return draft.type === 'vesi-ilma' && db.type !== 'vesi-ilma';
}

export function pickQuoteFormSource(input: {
  status: 'draft' | 'sent';
  dbData: unknown;
  dbUpdatedAt: string;
  dbCreatedAt: string;
  draft: StoredDraft<{ form: QuoteRequestData }> | null;
}): { form: QuoteRequestData; usedDraft: boolean } {
  const normalized = normalizeQuoteRequestData(input.dbData);
  if (input.status !== 'draft' || !input.draft?.payload?.form) {
    return { form: normalized, usedDraft: false };
  }

  const dbTime = new Date(input.dbUpdatedAt || input.dbCreatedAt).getTime();
  if (input.draft.savedAt <= dbTime + 1000) {
    return { form: normalized, usedDraft: false };
  }

  const draftForm = normalizeQuoteRequestData(input.draft.payload.form);
  if (isCorruptedQuoteDraftShell(draftForm, normalized)) {
    return { form: normalized, usedDraft: false };
  }

  return { form: draftForm, usedDraft: true };
}

export function localQuoteDraftKey(quoteId: string | null, userId: string) {
  return `${userId}:${quoteId ?? 'uusi'}`;
}

export function writeLocalQuoteDraft<T>(key: string, payload: T) {
  try {
    const stored: StoredDraft<T> = { savedAt: Date.now(), payload };
    localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(stored));
  } catch {
    // ignore
  }
}

export function readLocalQuoteDraft<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredDraft<T>;
  } catch {
    return null;
  }
}

export function clearLocalQuoteDraft(key: string) {
  try {
    localStorage.removeItem(`${PREFIX}${key}`);
  } catch {
    // ignore
  }
}
