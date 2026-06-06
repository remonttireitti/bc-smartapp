import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  persistMaintenanceReportOpenKeys,
  readMaintenanceReportViewState,
  type MaintenanceReportViewState,
} from '../../lib/maintenanceReportViewState';

type HuoltoEditUiContextValue = {
  isOpen: (key: string) => boolean;
  setOpen: (key: string, open: boolean) => void;
  toggle: (key: string) => void;
};

const HuoltoEditUiContext = createContext<HuoltoEditUiContextValue | null>(null);

function openKeysFromState(saved: MaintenanceReportViewState | null): Set<string> {
  if (!saved?.openKeys?.length) return new Set();
  return new Set(saved.openKeys);
}

export function HuoltoEditUiProvider({
  viewKey,
  children,
}: {
  viewKey: string;
  children: ReactNode;
}) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(() =>
    openKeysFromState(readMaintenanceReportViewState(viewKey)),
  );
  const openKeysRef = useRef(openKeys);
  openKeysRef.current = openKeys;

  const persistOpenKeys = useCallback(() => {
    persistMaintenanceReportOpenKeys(viewKey, [...openKeysRef.current]);
  }, [viewKey]);

  const setOpen = useCallback((key: string, open: boolean) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const toggle = useCallback((key: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const isOpen = useCallback((key: string) => openKeys.has(key), [openKeys]);

  useEffect(() => {
    const timer = window.setTimeout(persistOpenKeys, 120);
    return () => window.clearTimeout(timer);
  }, [openKeys, persistOpenKeys]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') persistOpenKeys();
    };
    window.addEventListener('pagehide', persistOpenKeys);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      persistOpenKeys();
      window.removeEventListener('pagehide', persistOpenKeys);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [persistOpenKeys]);

  const value = useMemo(
    () => ({
      isOpen,
      setOpen,
      toggle,
    }),
    [isOpen, setOpen, toggle],
  );

  return <HuoltoEditUiContext.Provider value={value}>{children}</HuoltoEditUiContext.Provider>;
}

export function useHuoltoEditUi(): HuoltoEditUiContextValue | null {
  return useContext(HuoltoEditUiContext);
}

/** Yhteinen taittologiikka page/module/part -osioille. */
export function useHuoltoCollapse(key: string, defaultOpen = false) {
  const ui = useHuoltoEditUi();
  const [localOpen, setLocalOpen] = useState(defaultOpen);

  if (!ui) {
    return {
      open: localOpen,
      setOpen: setLocalOpen,
      toggle: () => setLocalOpen((v) => !v),
    };
  }

  return {
    open: ui.isOpen(key),
    setOpen: (open: boolean) => ui.setOpen(key, open),
    toggle: () => ui.toggle(key),
  };
}
