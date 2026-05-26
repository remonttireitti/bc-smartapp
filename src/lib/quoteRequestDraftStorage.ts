const PREFIX = 'bc-smartapp:tarjous:';

type StoredDraft<T> = {
  savedAt: number;
  payload: T;
};

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
