import { createContext, useContext, useEffect, useRef } from 'react';

/**
 * Näkymien tuoreus: keep-alive pitää listasivut muistissa, joten raportin luonti/tallennus/poisto
 * merkitsee datan muuttuneeksi ja listat hakevat hiljaa uudelleen kun ne näkyvät taas.
 */
const EVENT = 'bc-smartapp:data-changed';
let version = 0;

export function emitDataChanged(): void {
  version += 1;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT));
}

/** Onko tämä keep-alive-paneeli näkyvissä (ei-välimuistitetut reitit: aina). */
export const KeepAliveActiveContext = createContext(true);

const HIDDEN_REFETCH_MS = 30_000;

/** Hae hiljaa uudelleen kun data muuttui muualla ja näkymä palaa esiin, tai sovellus palaa taustalta. */
export function useRefetchOnDataChange(refetch: () => void, enabled = true): void {
  const active = useContext(KeepAliveActiveContext);
  const seen = useRef(version);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const activeRef = useRef(active);
  activeRef.current = active;

  const run = () => {
    seen.current = version;
    refetchRef.current();
  };

  useEffect(() => {
    if (enabled && active && seen.current !== version) run();
  }, [active, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onChange = () => {
      if (activeRef.current && document.visibilityState === 'visible') run();
    };
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (!activeRef.current) return;
      if (seen.current !== version || (hiddenAt && Date.now() - hiddenAt >= HIDDEN_REFETCH_MS)) run();
    };
    window.addEventListener(EVENT, onChange);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener(EVENT, onChange);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);
}
