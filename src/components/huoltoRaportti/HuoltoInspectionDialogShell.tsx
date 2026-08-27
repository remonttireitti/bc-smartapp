import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  titleId?: string;
  dialogClassName?: string;
  onClose: () => void;
  children: ReactNode;
}

export function HuoltoInspectionDialogShell({
  open,
  title,
  titleId = 'huolto-inspection-dialog-title',
  dialogClassName,
  onClose,
  children,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="leave-draft-overlay konvektori-dialog-overlay" role="presentation" onClick={onClose}>
      <div
        className={['leave-draft-dialog', 'panel', 'konvektori-tarkastus-dialog', dialogClassName]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
        <div className="leave-draft-actions konvektori-dialog-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Sulje
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function useHuoltoInspectionDialog<T>({
  data,
  onChange,
  canSave,
}: {
  data: T;
  onChange: (data: T) => void;
  canSave?: (draft: T) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(data);

  const closeDialog = useCallback(() => {
    const saveOk = canSave ? canSave(draft) : true;
    if (saveOk) onChange(draft);
    setOpen(false);
  }, [canSave, draft, onChange]);

  const openDialog = useCallback(() => {
    setDraft(data);
    setOpen(true);
  }, [data]);

  return {
    open,
    setOpen,
    openDialog,
    closeDialog,
    draft,
    setDraft,
  };
}
