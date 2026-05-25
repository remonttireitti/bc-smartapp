const PREFIX = 'bc-smartapp:tyoraportti:';

type StoredDraft<T> = {
  savedAt: number;
  payload: T;
};

export function localWorkDraftKey(reportId: string | null, userId: string) {
  return `${userId}:${reportId ?? 'uusi'}`;
}

export function writeLocalWorkDraft<T>(key: string, payload: T) {
  try {
    const stored: StoredDraft<T> = { savedAt: Date.now(), payload };
    localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(stored));
  } catch {
    // ignore quota / private mode
  }
}

export function readLocalWorkDraft<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredDraft<T>;
  } catch {
    return null;
  }
}

export function clearLocalWorkDraft(key: string) {
  try {
    localStorage.removeItem(`${PREFIX}${key}`);
  } catch {
    // ignore
  }
}
