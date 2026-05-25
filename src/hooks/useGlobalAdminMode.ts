import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'bc-smartapp-global-admin-mode';
const CHANGE_EVENT = 'bc-global-admin-mode';

export function readGlobalAdminMode(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeGlobalAdminMode(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useGlobalAdminMode() {
  const [globalAdminMode, setGlobalAdminModeState] = useState(readGlobalAdminMode);

  useEffect(() => {
    const sync = () => setGlobalAdminModeState(readGlobalAdminMode());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setGlobalAdminMode = useCallback((enabled: boolean) => {
    writeGlobalAdminMode(enabled);
    setGlobalAdminModeState(enabled);
  }, []);

  return { globalAdminMode, setGlobalAdminMode };
}
