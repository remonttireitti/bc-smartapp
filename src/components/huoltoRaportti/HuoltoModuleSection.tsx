import { useId, useState, type ReactNode } from 'react';
import type { ModuleThemeKey } from '../../lib/huoltoRaportti/moduleThemes';
import { useHuoltoEditUi } from './HuoltoEditUiContext';

interface Props {
  moduleKey: ModuleThemeKey;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function HuoltoModuleSection({
  moduleKey,
  title,
  children,
  defaultOpen,
}: Props) {
  const { sectionsDefaultOpen } = useHuoltoEditUi();
  const initialOpen = defaultOpen ?? sectionsDefaultOpen;
  const [open, setOpen] = useState(initialOpen);
  const contentId = useId();

  return (
    <section
      data-module={moduleKey}
      className={`huolto-module-section ${open ? 'huolto-module-open' : 'huolto-module-collapsed'}`}
    >
      <button
        type="button"
        className="huolto-module-header"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="huolto-module-title">{title}</span>
        <span className="huolto-module-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div id={contentId} className="huolto-module-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}
