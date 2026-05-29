import { registerSW } from 'virtual:pwa-register';

let refreshing = false;

/** Rekisteröi service worker (vain tuotantobuildissa). */
export function registerPwa() {
  if (!import.meta.env.PROD) return;

  const updateSW = registerSW({
    immediate: true,
    onOfflineReady() {
      document.dispatchEvent(new CustomEvent('bc-smartapp:offline-ready'));
    },
    onNeedRefresh() {
      document.dispatchEvent(
        new CustomEvent('bc-smartapp:update-available', {
          detail: { applyUpdate: () => void updateSW(true) },
        }),
      );
    },
    onRegisteredSW(_url, registration) {
      if (registration) {
        window.setInterval(() => void registration.update(), 60 * 60 * 1000);
      }
    },
  });

  window.addEventListener('beforeunload', () => {
    refreshing = true;
  });

  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (refreshing) return;
    window.location.reload();
  });
}
