import { useId, type ReactNode } from 'react';
import type { ModuleThemeKey } from '../../lib/huoltoRaportti/moduleThemes';
import { useHuoltoCollapse } from './HuoltoEditUiContext';
import { useHuoltoModulePresentation } from './HuoltoModulePresentationContext';
import { PrintInnerBox } from './print/MaintenancePrintLayout';

interface Props {
  moduleKey: ModuleThemeKey;
  title: string;
  children: ReactNode;
  /** @deprecated Käytä vain ilman HuoltoEditUiProvideria. Oletus: kiinni. */
  defaultOpen?: boolean;
  /** Tulosteen laatikko flat-tilassa (WYSIWYG). */
  printBox?: { title: string; accent: string };
}

export function HuoltoModuleSection({
  moduleKey,
  title,
  children,
  defaultOpen = false,
  printBox,
}: Props) {
  const presentation = useHuoltoModulePresentation();
  const { open, toggle } = useHuoltoCollapse(`module:${moduleKey}`, defaultOpen);
  const contentId = useId();

  if (presentation === 'flat') {
    const body = <div className="huolto-module-body">{children}</div>;
    if (printBox) {
      return (
        <section data-module={moduleKey} className="huolto-module-section huolto-module-flat huolto-module-print-box">
          <PrintInnerBox title={printBox.title} accent={printBox.accent}>
            {body}
          </PrintInnerBox>
        </section>
      );
    }
    return (
      <section data-module={moduleKey} className="huolto-module-section huolto-module-flat">
        {body}
      </section>
    );
  }

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
