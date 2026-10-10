import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type DailyLogSectionContextValue = {
  openKey: string | null;
  setOpenKey: (key: string | null) => void;
  /** Kohdistettu muokkaus: vain nämä osiot näytetään suoraan auki (ei ruutuja). */
  focusKeys: string[] | null;
};

const DailyLogSectionContext = createContext<DailyLogSectionContextValue | null>(null);

export function DailyLogSectionProvider({
  dialogOpen,
  initialOpenKey = null,
  focusKeys = null,
  children,
}: {
  focusKeys?: string[] | null;
  dialogOpen: boolean;
  /** Avaa tämä osio heti (esim. "Kirjaa toteutunut" tarjouspyynnön riviltä). */
  initialOpenKey?: string | null;
  children: ReactNode;
}) {
  const [openKey, setOpenKey] = useState<string | null>(initialOpenKey);

  useEffect(() => {
    if (!dialogOpen) setOpenKey(null);
  }, [dialogOpen]);

  return (
    <DailyLogSectionContext.Provider value={{ openKey, setOpenKey, focusKeys }}>
      {children}
    </DailyLogSectionContext.Provider>
  );
}

export function useDailyLogSection() {
  const context = useContext(DailyLogSectionContext);
  if (!context) {
    throw new Error('useDailyLogSection must be used within DailyLogSectionProvider');
  }
  return context;
}

export function useDailyLogSectionOpen() {
  const context = useContext(DailyLogSectionContext);
  return context?.openKey != null;
}
