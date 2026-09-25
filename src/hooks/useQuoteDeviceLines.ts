import { useEffect, useMemo, useState } from 'react';

import { supabase } from '../lib/supabase';
import { mergeActualPurchaseFromWorkReportLogs } from '../lib/quoteRequestActualPurchaseSync';
import {
  parseBillingQuoteSettings,
  type BillingQuotePurchaseLine,
  type BillingQuoteSettings,
} from '../lib/workReportBillingQuote';

/**
 * Tarjouspyynnön laiterivit toteutuneen hinnan kanssa (esitäytetty tai tallennettu oikaisu),
 * ilman työraportin laitekirjausten korvausta — LAITE-ruudun esitäyttöön.
 */
export function useQuoteDeviceLines(
  billingQuoteSettings: BillingQuoteSettings | null | undefined,
  enabled: boolean,
): BillingQuotePurchaseLine[] {
  const settings = useMemo(
    () => parseBillingQuoteSettings(billingQuoteSettings ?? {}),
    [billingQuoteSettings],
  );
  const quoteId = settings.quote_request_id?.trim() || null;
  const [quoteData, setQuoteData] = useState<unknown>(null);

  useEffect(() => {
    if (!quoteId || !enabled) {
      setQuoteData(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from('quote_requests')
      .select('data')
      .eq('id', quoteId)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setQuoteData(data.data);
      });
    return () => {
      cancelled = true;
    };
  }, [quoteId, enabled]);

  return useMemo(() => {
    if (!quoteId || !enabled) return [];
    return (mergeActualPurchaseFromWorkReportLogs(settings, [], quoteData).purchase_lines ?? []).filter(
      (line) => line.source === 'device',
    );
  }, [quoteId, enabled, settings, quoteData]);
}
