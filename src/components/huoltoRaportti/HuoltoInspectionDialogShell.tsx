import { useCallback, useEffect, useRef, useState } from 'react';
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

/** Palauttaa luonnoksen muuttuneet kentät verrattuna avaushetkeen. */
export function diffInspectionDraftPatch<T extends object>(base: T, draft: T): Partial<T> {
  const patch = {} as Partial<T>;
  for (const key of Object.keys(draft) as (keyof T)[]) {
    if (!Object.is(draft[key], base[key])) {
      patch[key] = draft[key];
    }
  }
  return patch;
}

export function useHuoltoInspectionDialog<T extends object>({
  data,
  onChange,
  onPatch,
  canSave,
}: {
  data: T;
  onChange?: (data: T) => void;
  /** Kun annettu, sulku ja patchDraft synkronoivat vain muuttuneet kentät. */
  onPatch?: (patch: Partial<T>) => void;
  canSave?: (draft: T) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(data);
  const baseRef = useRef(data);

  const closeDialog = useCallback(() => {
    const saveOk = canSave ? canSave(draft) : true;
    if (saveOk) {
      if (onPatch) {
        const patch = diffInspectionDraftPatch(baseRef.current, draft);
        if (Object.keys(patch).length > 0) onPatch(patch);
      } else {
        onChange?.(draft);
      }
    }
    setOpen(false);
  }, [canSave, draft, onChange, onPatch]);

  const openDialog = useCallback(() => {
    baseRef.current = data;
    setDraft(data);
    setOpen(true);
  }, [data]);

  const patchDraft = useCallback((patch: Partial<T>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    onPatch?.(patch);
  }, [onPatch]);

  return {
    open,
    setOpen,
    openDialog,
    closeDialog,
    draft,
    setDraft,
    patchDraft,
  };
}
