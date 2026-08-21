import { useId, type ReactNode } from 'react';
import { useHuoltoCollapse } from './huoltoRaportti/HuoltoEditUiContext';

interface Props {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Kun asetettu ja HuoltoEditUiProvider on käytössä, tila muistetaan istunnossa. */
  collapseKey?: string;
  variant?: 'form' | 'plain';
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  collapseKey,
  variant = 'form',
  className = '',
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const key = collapseKey ?? `page:${title}`;
  const collapse = useHuoltoCollapse(key, defaultOpen);
  const open = controlledOpen ?? collapse.open;
  const setOpen = onOpenChange ?? collapse.setOpen;
  const toggle = () => setOpen(!open);
  const contentId = useId();

  return (
    <section
      className={`collapsible-section collapsible-${variant} ${open ? 'collapsible-open' : 'collapsible-collapsed'} ${className}`.trim()}
    >
      <button
        type="button"
        className="collapsible-header"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="collapsible-title">{title}</span>
        <span className="collapsible-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div id={contentId} className="collapsible-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}
