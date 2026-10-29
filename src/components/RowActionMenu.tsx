import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type RowActionMenuItem = {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

/** "⋯"-valikko taulukkorivin toissijaisille toiminnoille. Paneeli renderöidään body:yn, jotta vieritysalue ei leikkaa sitä. */
export default function RowActionMenu({ items, label = 'Lisää toimintoja' }: { items: RowActionMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // Skrollaus sulkee valikon (myös sivu); viive ohittaa avaavan klikkauksen aiheuttaman näkymään vieritys-tapahtuman.
    const t = window.setTimeout(() => window.addEventListener('scroll', close, true), 150);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="icon-action-btn row-action-menu-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={panelRef}
              className="row-action-menu-panel"
              role="menu"
              style={{ top: pos.top, right: pos.right }}
              onClick={(e) => e.stopPropagation()}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={`row-action-menu-item${item.danger ? ' is-danger' : ''}`}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
