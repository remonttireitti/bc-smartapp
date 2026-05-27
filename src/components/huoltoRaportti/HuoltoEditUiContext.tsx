import { createContext, useContext, type ReactNode } from 'react';

type HuoltoEditUiContextValue = {
  /** Avaa moduuliosiot oletuksena (tuodut / täytetyt raportit). */
  sectionsDefaultOpen: boolean;
};

const HuoltoEditUiContext = createContext<HuoltoEditUiContextValue>({
  sectionsDefaultOpen: false,
});

export function HuoltoEditUiProvider({
  sectionsDefaultOpen,
  children,
}: {
  sectionsDefaultOpen: boolean;
  children: ReactNode;
}) {
  return (
    <HuoltoEditUiContext.Provider value={{ sectionsDefaultOpen }}>
      {children}
    </HuoltoEditUiContext.Provider>
  );
}

export function useHuoltoEditUi() {
  return useContext(HuoltoEditUiContext);
}
