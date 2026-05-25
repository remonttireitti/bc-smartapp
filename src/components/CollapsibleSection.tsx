import { useId, useState, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  variant?: 'form' | 'plain';
  className?: string;
}

export default function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  variant = 'form',
  className = '',
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section
      className={`collapsible-section collapsible-${variant} ${open ? 'collapsible-open' : 'collapsible-collapsed'} ${className}`.trim()}
    >
      <button
        type="button"
        className="collapsible-header"
        onClick={() => setOpen((value) => !value)}
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
