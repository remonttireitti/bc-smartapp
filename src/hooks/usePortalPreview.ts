import { useEffect, useState } from 'react';
import { getPortalPreview, PORTAL_PREVIEW_EVENT, type PortalPreviewState } from '../lib/portalPreview';

export function usePortalPreview() {
  const [preview, setPreview] = useState<PortalPreviewState | null>(() =>
    typeof window !== 'undefined' ? getPortalPreview() : null,
  );

  useEffect(() => {
    const sync = () => setPreview(getPortalPreview());
    window.addEventListener(PORTAL_PREVIEW_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PORTAL_PREVIEW_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return preview;
}
