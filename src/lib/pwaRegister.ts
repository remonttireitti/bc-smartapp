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
        // iOS-kotinäyttösovellus palaa taustalta ilman uudelleenlatausta → tarkista päivitys aina kun sovellus avataan.
        let last = 0;
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return;
          const now = Date.now();
          if (now - last < 60 * 1000) return;
          last = now;
          void registration.update();
        });
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
