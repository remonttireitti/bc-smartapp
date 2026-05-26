const PREFIX = 'bc-smartapp:tilaaja-uusi:';

export type SubscriberFormDraft = {
  name: string;
  business_id: string;
  email: string;
  phone: string;
  notes: string;
};

type StoredDraft = {
  savedAt: number;
  payload: SubscriberFormDraft;
};

export function subscriberNewFormDraftKey(companyId: string, userId: string) {
  return `${companyId}:${userId}`;
}

export function subscriberFormDraftHasContent(form: SubscriberFormDraft) {
  return Boolean(
    form.name.trim()
    || form.business_id.trim()
    || form.email.trim()
    || form.phone.trim()
    || form.notes.trim(),
  );
}

export function readSubscriberNewFormDraft(key: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredDraft;
  } catch {
    return null;
  }
}

export function writeSubscriberNewFormDraft(key: string, payload: SubscriberFormDraft) {
  try {
    const stored: StoredDraft = { savedAt: Date.now(), payload };
    localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(stored));
  } catch {
    // ignore quota / private mode
  }
}

export function clearSubscriberNewFormDraft(key: string) {
  try {
    localStorage.removeItem(`${PREFIX}${key}`);
  } catch {
    // ignore
  }
}
