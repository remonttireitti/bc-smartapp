import { createContext, useContext, type ReactNode } from 'react';

export type HuoltoModulePresentation = 'accordion' | 'flat';

const HuoltoModulePresentationContext = createContext<HuoltoModulePresentation>('accordion');

export function HuoltoModulePresentationProvider({
  value,
  children,
}: {
  value: HuoltoModulePresentation;
  children: ReactNode;
}) {
  return (
    <HuoltoModulePresentationContext.Provider value={value}>
      {children}
    </HuoltoModulePresentationContext.Provider>
  );
}

export function useHuoltoModulePresentation(): HuoltoModulePresentation {
  return useContext(HuoltoModulePresentationContext);
}
