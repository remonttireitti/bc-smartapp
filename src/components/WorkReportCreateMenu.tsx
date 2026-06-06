import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconPlus } from './icons';
import Tooltip from './Tooltip';

interface Props {
  partnershipsEnabled?: boolean;
}

export default function WorkReportCreateMenu({ partnershipsEnabled = true }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="toolbar-popover-anchor" ref={rootRef}>
      <Tooltip label="Luo uusi" side="bottom" touchHelp={false}>
        <button
          type="button"
          className="icon-btn icon-btn-primary"
          aria-label="Luo uusi"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <IconPlus />
        </button>
      </Tooltip>
      {open && (
        <div className="toolbar-popover-panel toolbar-action-menu" role="menu">
          <Link
            to="/tyoraportit/uusi"
            role="menuitem"
            className="toolbar-action-menu-primary"
            onClick={() => setOpen(false)}
          >
            Uusi työraportti
          </Link>
          {partnershipsEnabled && (
            <Link
              to="/tyoraportit/toimeksianto/uusi"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Toimeksianto kumppanille
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
