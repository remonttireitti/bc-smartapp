import { useEffect } from 'react';

/**
 * /esittely/* ovat staattisia HTML-sivuja. Jos vanha service worker tarjoili SPA:n,
 * päivitetään SW ja ladataan sivu kerran palvelimelta.
 */
export default function StaticPageReload() {
  useEffect(() => {
    const key = `static-reload:${window.location.pathname}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    const reload = () => window.location.reload();
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).finally(reload);
    } else reload();
  }, []);
  return <p className="muted" style={{ padding: '2rem' }}>Ladataan…</p>;
}
