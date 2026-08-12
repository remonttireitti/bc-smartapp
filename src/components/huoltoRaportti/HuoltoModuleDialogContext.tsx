import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

type ModuleDialogOpener = () => void;

type HuoltoModuleDialogContextValue = {
  register: (key: string, open: ModuleDialogOpener) => void;
  unregister: (key: string) => void;
  open: (key: string) => void;
  has: (key: string) => boolean;
};

const HuoltoModuleDialogContext = createContext<HuoltoModuleDialogContextValue | null>(null);

export function HuoltoModuleDialogProvider({ children }: { children: ReactNode }) {
  const openersRef = useRef(new Map<string, ModuleDialogOpener>());

  const register = useCallback((key: string, open: ModuleDialogOpener) => {
    openersRef.current.set(key, open);
  }, []);

  const unregister = useCallback((key: string) => {
    openersRef.current.delete(key);
  }, []);

  const open = useCallback((key: string) => {
    openersRef.current.get(key)?.();
  }, []);

  const has = useCallback((key: string) => openersRef.current.has(key), []);

  const value = useMemo(
    () => ({ register, unregister, open, has }),
    [register, unregister, open, has],
  );

  return <HuoltoModuleDialogContext.Provider value={value}>{children}</HuoltoModuleDialogContext.Provider>;
}

export function useHuoltoModuleDialog() {
  return useContext(HuoltoModuleDialogContext);
}

export function useRegisterHuoltoModuleDialog(key: string | undefined, openDialog: () => void) {
  const dialog = useHuoltoModuleDialog();

  useEffect(() => {
    if (!dialog || !key) return;
    dialog.register(key, openDialog);
    return () => dialog.unregister(key);
  }, [dialog, key, openDialog]);
}
