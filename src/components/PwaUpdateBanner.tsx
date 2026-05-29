import { useEffect, useState } from 'react';

export default function PwaUpdateBanner() {
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ applyUpdate: () => void }>).detail;
      setApplyUpdate(() => detail.applyUpdate);
    };
    document.addEventListener('bc-smartapp:update-available', handler);
    return () => document.removeEventListener('bc-smartapp:update-available', handler);
  }, []);

  if (!applyUpdate) return null;

  return (
    <div className="pwa-update-banner" role="status">
      <span>Uusi versio saatavilla.</span>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => applyUpdate()}>
        Päivitä
      </button>
    </div>
  );
}
