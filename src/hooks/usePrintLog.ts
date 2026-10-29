import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadPrintLog, type PortalDocKind, type PrintLog } from '../lib/portalDocumentPdf';

/** Lataa dokumenttien tulostusloki (null = ei käytössä) ja päivittää sen tulostuksen jälkeen. */
export function usePrintLog(items: Array<{ kind: PortalDocKind; id: string }>) {
  const [log, setLog] = useState<PrintLog | null>(null);
  const signature = useMemo(() => items.map((i) => `${i.kind}:${i.id}`).sort().join(','), [items]);
  const reload = useCallback(() => {
    void loadPrintLog(supabase, items).then(setLog, () => setLog(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { log, reload };
}
