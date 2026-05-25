import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { IconHelp } from './icons';

interface Props {
  label: string;
  children: ReactNode;
  className?: string;
  side?: 'top' | 'bottom';
  /** Show ? toggle on touch devices. Disable for icon buttons that already have aria-label. */
  touchHelp?: boolean;
}

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(hover: none), (pointer: coarse)');
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return coarse;
}

export default function Tooltip({
  label,
  children,
  className = '',
  side = 'top',
  touchHelp = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const coarsePointer = useCoarsePointer();
  const rootRef = useRef<HTMLSpanElement>(null);
  const bubbleId = useId();
  const showHelp = touchHelp && coarsePointer;

  useEffect(() => {
    if (!open) return;

    function onDocumentClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [open]);

  return (
    <span
      ref={rootRef}
      className={[
        'ui-tooltip',
        `ui-tooltip-${side}`,
        open ? 'ui-tooltip-open' : '',
        showHelp ? 'ui-tooltip-has-help' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
      {showHelp && (
        <button
          type="button"
          className="ui-tooltip-help"
          aria-label={`Selitys: ${label}`}
          aria-expanded={open}
          aria-controls={bubbleId}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen((value) => !value);
          }}
        >
          <IconHelp className="ui-icon ui-tooltip-help-icon" />
        </button>
      )}
      <span id={bubbleId} className="ui-tooltip-bubble" role="tooltip">
        {label}
      </span>
    </span>
  );
}
