import { useSyncExternalStore } from 'react';
import { isIosDevice, isMobileDevice, isStandaloneDisplayMode } from '../hooks/useNetworkStatus';

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'bc-smartapp-pwa-install-dismissed-at';
const OLD_DISMISS_KEY = 'bc-smartapp-pwa-install-dismissed';
const DISMISS_DAYS = 7;

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let helpOpen = false;
const listeners = new Set<() => void>();
let snapshot = { canPrompt: false, helpOpen: false, installed: false };

function emit() {
  snapshot = { canPrompt: deferred !== null, helpOpen, installed };
  listeners.forEach((l) => l());
}

/** Kuuntelija heti sovelluksen käynnistyessä: beforeinstallprompt laukeaa vain kerran ja aikaisin. */
export function initPwaInstall() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(OLD_DISMISS_KEY); // vanha pysyvä piilotus esti kehotteen ikuisesti
  } catch { /* ignore */ }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? '0');
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function dismissInstallHint() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch { /* ignore */ }
  helpOpen = false;
  emit();
}

/** Pysyvä 'Asenna sovellus' -painike: asentaa suoraan (Android/Chrome) tai avaa lyhyen ohjeen (iOS ym.). */
export async function requestInstall() {
  if (deferred) {
    const ev = deferred;
    try {
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      if (outcome === 'accepted') installed = true;
    } finally {
      deferred = null;
      emit();
    }
    return;
  }
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch { /* ignore */ }
  helpOpen = true;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function usePwaInstall() {
  const s = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const standalone = isStandaloneDisplayMode();
  const available = !standalone && !s.installed && (s.canPrompt || isMobileDevice());
  return {
    available,
    canPrompt: s.canPrompt,
    ios: isIosDevice(),
    /** Banneri: aina kun asennus mahdollinen ja ei äskettäin suljettu, tai kun painikkeella pyydetty. */
    showBanner: available && (s.helpOpen || !dismissedRecently()),
  };
}
