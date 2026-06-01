import { useId, type ReactNode } from 'react';
import { useHuoltoCollapse } from './HuoltoEditUiContext';

interface Props {
  title: string;
  children: ReactNode;
  /** Uniikki avain osion muistille (esim. evap-0, comp-2). */
  partKey?: string;
  defaultOpen?: boolean;
  className?: string;
}

export function HuoltoPartSection({
  title,
  children,
  partKey,
  defaultOpen = false,
  className = '',
}: Props) {
  const key = partKey ?? `part:${title}`;
  const { open, toggle } = useHuoltoCollapse(key, defaultOpen);
  const contentId = useId();

  return (
    <div
      className={`huolto-part-section ${open ? 'huolto-part-open' : 'huolto-part-collapsed'} ${className}`.trim()}
    >
      <button
        type="button"
        className="huolto-part-header"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <span className="huolto-part-title">{title}</span>
        <span className="huolto-part-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div id={contentId} className="huolto-part-body">
          {children}
        </div>
      ) : null}
    </div>
  );
}
