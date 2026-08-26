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

type QuoteModuleDialogContextValue = {
  register: (key: string, open: ModuleDialogOpener) => void;
  unregister: (key: string) => void;
  open: (key: string) => void;
};

const QuoteModuleDialogContext = createContext<QuoteModuleDialogContextValue | null>(null);

export function QuoteModuleDialogProvider({ children }: { children: ReactNode }) {
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

  const value = useMemo(() => ({ register, unregister, open }), [register, unregister, open]);

  return (
    <QuoteModuleDialogContext.Provider value={value}>{children}</QuoteModuleDialogContext.Provider>
  );
}

export function useQuoteModuleDialog() {
  return useContext(QuoteModuleDialogContext);
}

export function useRegisterQuoteModuleDialog(key: string | undefined, openDialog: () => void) {
  const dialog = useQuoteModuleDialog();

  useEffect(() => {
    if (!dialog || !key) return;
    dialog.register(key, openDialog);
    return () => dialog.unregister(key);
  }, [dialog, key, openDialog]);
}
