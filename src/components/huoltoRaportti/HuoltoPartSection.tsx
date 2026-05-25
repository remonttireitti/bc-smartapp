import { useId, useState, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function HuoltoPartSection({
  title,
  children,
  defaultOpen = false,
  className = '',
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div
      className={`huolto-part-section ${open ? 'huolto-part-open' : 'huolto-part-collapsed'} ${className}`.trim()}
    >
      <button
        type="button"
        className="huolto-part-header"
        onClick={() => setOpen((value) => !value)}
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
