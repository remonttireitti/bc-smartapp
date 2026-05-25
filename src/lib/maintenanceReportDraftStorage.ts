const PREFIX = 'bc-smartapp:huoltoraportti:';

type StoredDraft<T> = {
  savedAt: number;
  payload: T;
};

export function localDraftKey(reportId: string | null, userId: string) {
  return `${userId}:${reportId ?? 'uusi'}`;
}

export function writeLocalMaintenanceDraft<T>(key: string, payload: T) {
  try {
    const stored: StoredDraft<T> = { savedAt: Date.now(), payload };
    localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(stored));
  } catch {
    // ignore quota / private mode
  }
}

export function readLocalMaintenanceDraft<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredDraft<T>;
  } catch {
    return null;
  }
}

export function clearLocalMaintenanceDraft(key: string) {
  try {
    localStorage.removeItem(`${PREFIX}${key}`);
  } catch {
    // ignore
  }
}
