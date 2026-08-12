import { useEffect, useState } from 'react';

const MOBILE_MAX_WIDTH = '(max-width: 900px)';

export function useMaintenanceDocumentLayout(): boolean {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_MAX_WIDTH).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(MOBILE_MAX_WIDTH);
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return mobile;
}
