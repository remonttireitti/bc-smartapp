import { useCallback, useState } from 'react';
import { useBeforeUnload, useNavigate } from 'react-router-dom';

interface Options {
  enabled: boolean;
  isDirty: boolean;
  onSave: () => Promise<boolean>;
}

/** Poistumisvaroitus ilman useBlocker: ei jumita React Routeria. */
export function useDraftLeaveGuard({ enabled, isDirty, onSave }: Options) {
  const navigate = useNavigate();
  const [saveAndLeaveBusy, setSaveAndLeaveBusy] = useState(false);
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!enabled || !isDirty) return;
        event.preventDefault();
        event.returnValue = '';
      },
      [enabled, isDirty],
    ),
  );

  function requestLeave(to: string) {
    if (!enabled || !isDirty) {
      navigate(to);
      return;
    }
    setPendingTo(to);
  }

  async function confirmSaveAndLeave() {
    if (saveAndLeaveBusy || !pendingTo) return;
    setSaveAndLeaveBusy(true);
    try {
      const ok = await onSave();
      if (!ok) return;
      const destination = pendingTo;
      setPendingTo(null);
      navigate(destination);
    } finally {
      setSaveAndLeaveBusy(false);
    }
  }

  function confirmLeaveWithoutSaving() {
    if (!pendingTo) return;
    const destination = pendingTo;
    setPendingTo(null);
    setSaveAndLeaveBusy(false);
    navigate(destination);
  }

  function cancelLeave() {
    setPendingTo(null);
    setSaveAndLeaveBusy(false);
  }

  return {
    showDialog: pendingTo !== null,
    saveAndLeaveBusy,
    confirmSaveAndLeave,
    confirmLeaveWithoutSaving,
    cancelLeave,
    requestLeave,
  };
}
