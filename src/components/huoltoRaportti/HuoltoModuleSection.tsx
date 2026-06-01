import { useId, type ReactNode } from 'react';
import type { ModuleThemeKey } from '../../lib/huoltoRaportti/moduleThemes';
import { useHuoltoCollapse } from './HuoltoEditUiContext';

interface Props {
  moduleKey: ModuleThemeKey;
  title: string;
  children: ReactNode;
  /** @deprecated Käytä vain ilman HuoltoEditUiProvideria. Oletus: kiinni. */
  defaultOpen?: boolean;
}

export function HuoltoModuleSection({
  moduleKey,
  title,
  children,
  defaultOpen = false,
}: Props) {
  const { open, toggle } = useHuoltoCollapse(`module:${moduleKey}`, defaultOpen);
  const contentId = useId();

  return (
    <section
      data-module={moduleKey}
      className={`huolto-module-section ${open ? 'huolto-module-open' : 'huolto-module-collapsed'}`}
    >
      <button
        type="button"
        className="huolto-module-header"
        onClick={toggle}
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
