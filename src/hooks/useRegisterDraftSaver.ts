import { useEffect, useRef } from 'react';
import { useAuthSession } from '../contexts/AuthSessionContext';

/** Rekisteröi sivun luonnoksen tallennuksen ennen automaattista uloskirjautumista. */
export function useRegisterDraftSaver(saver: () => void | Promise<void>) {
  const { registerDraftSaver } = useAuthSession();
  const saverRef = useRef(saver);
  saverRef.current = saver;

  useEffect(() => {
    return registerDraftSaver(() => saverRef.current());
  }, [registerDraftSaver]);
}
