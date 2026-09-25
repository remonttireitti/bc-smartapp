import { useCallback, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  buildQuoteCandidates,
  buildWorkReportCandidates,
  planQuoteLink,
  quoteCandidateMeta,
  quoteLinkConfirmMessage,
  workReportCandidateMeta,
  type QuoteLinkRow,
  type QuoteReportLinkIndex,
  type WorkReportLinkRow,
} from '../lib/quoteWorkReportLinkLogic';
import {
  linkQuoteToWorkReport,
  loadCustomerAlreadyBilled,
  loadQuoteLinkRows,
  loadQuoteReportLinkIndex,
  loadWorkReportLinkRows,
  unlinkQuoteFromWorkReport,
} from '../lib/quoteWorkReportLink';
import QuoteLinkPickerDialog, { type QuoteLinkPickerItem } from './QuoteLinkPickerDialog';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fi-FI');
}

type Catalog = {
  quotes: QuoteLinkRow[];
  reports: WorkReportLinkRow[];
  index: QuoteReportLinkIndex;
};

async function loadCatalog(needReports: boolean): Promise<Catalog> {
  const [quotes, reports] = await Promise.all([
    loadQuoteLinkRows(supabase),
    needReports ? loadWorkReportLinkRows(supabase) : Promise.resolve([] as WorkReportLinkRow[]),
  ]);
  const index = await loadQuoteReportLinkIndex(supabase, quotes);
  return { quotes, reports, index };
}

function titleOr(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

/**
 * Tarjouspyynnön näkymä: "Kohdista työraporttiin" / "Vaihda työraportti" / "Poista kohdistus".
 */
export function useQuoteToReportLinker(input: {
  quote: Pick<QuoteLinkRow, 'id' | 'title' | 'status' | 'customer_id' | 'owner_company_id' | 'work_report_id'> | null;
  linkedReportId: string | null;
  viewerCompanyId?: string | null;
  onChanged: (reportId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  const openPicker = useCallback(async () => {
    setOpen(true);
    setError(null);
    setQuery('');
    setLoading(true);
    try {
      setCatalog(await loadCatalog(true));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Työraporttien lataus epäonnistui.');
    } finally {
      setLoading(false);
    }
  }, []);

  const candidates = useMemo(() => {
    if (!catalog || !input.quote) return [];
    return buildWorkReportCandidates({ reports: catalog.reports, quote: input.quote, index: catalog.index, query });
  }, [catalog, input.quote, query]);

  const items: QuoteLinkPickerItem[] = useMemo(() => {
    const quoteTitles = new Map((catalog?.quotes ?? []).map((q) => [q.id, titleOr(q.title, 'Tarjous')]));
    return candidates.slice(0, 200).map((candidate) => ({
      id: candidate.id,
      title: titleOr(candidate.title, 'Työraportti'),
      meta: workReportCandidateMeta(candidate, formatDate),
      badges: [
        ...(candidate.isCurrent ? [{ label: 'Nykyinen kohdistus', tone: 'info' as const }] : []),
        ...(candidate.sameCustomer ? [{ label: 'Sama asiakas', tone: 'good' as const }] : []),
        ...(candidate.linkedQuoteId
          ? [{ label: `Tarjous: ${quoteTitles.get(candidate.linkedQuoteId) ?? 'toinen tarjous'}`, tone: 'warn' as const }]
          : [{ label: 'Ei tarjousta', tone: 'info' as const }]),
      ],
    }));
  }, [candidates, catalog]);

  const pick = useCallback(
    async (reportId: string) => {
      if (!catalog || !input.quote) return;
      const plan = planQuoteLink({ quote: input.quote, reportId, index: catalog.index });
      if (plan.alreadyLinked) {
        setOpen(false);
        return;
      }
      const reportTitles = new Map(catalog.reports.map((r) => [r.id, titleOr(r.title, 'Työraportti')]));
      const quoteTitles = new Map(catalog.quotes.map((q) => [q.id, titleOr(q.title, 'Tarjous')]));
      setBusy(true);
      setError(null);
      try {
        const customerAlreadyBilled = await loadCustomerAlreadyBilled(supabase, reportId);
        const target = reportTitles.get(reportId) ?? 'Työraportti';
        const extra = quoteLinkConfirmMessage(plan, {
          reportTitle: (id) => reportTitles.get(id) ?? 'toinen työraportti',
          quoteTitle: (id) => quoteTitles.get(id) ?? 'toinen tarjous',
          customerAlreadyBilled,
        });
        const message = `Kohdistetaanko tarjous työraporttiin "${target}"?\nRaportin Tarjous ja kate sekä kumppanilaskelma lasketaan tarjouksen mukaan.${extra ? `\n\n${extra}` : ''}`;
        if (!window.confirm(message)) return;
        await linkQuoteToWorkReport(supabase, {
          quote: { ...input.quote, title: input.quote.title },
          reportId,
          plan,
          viewerCompanyId: input.viewerCompanyId,
        });
        setOpen(false);
        input.onChanged(reportId);
      } catch (linkError) {
        setError(linkError instanceof Error ? linkError.message : 'Kohdistus epäonnistui.');
      } finally {
        setBusy(false);
      }
    },
    [catalog, input],
  );

  const unlink = useCallback(async () => {
    if (!input.quote || !input.linkedReportId) return;
    if (
      !window.confirm(
        'Poistetaanko kohdistus työraporttiin? Raportin Tarjous ja kate -laskenta poistuu ja kumppanilaskelma lasketaan päiväkirjan mukaan. Laskutettuja summia ei muuteta. Tarjous jää tilatuksi.',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await unlinkQuoteFromWorkReport(supabase, {
        quoteId: input.quote.id,
        reportId: input.linkedReportId,
        viewerCompanyId: input.viewerCompanyId,
      });
      input.onChanged(null);
    } catch (unlinkError) {
      setError(unlinkError instanceof Error ? unlinkError.message : 'Kohdistuksen poisto epäonnistui.');
    } finally {
      setBusy(false);
    }
  }, [input]);

  const dialog = (
    <QuoteLinkPickerDialog
      open={open}
      title={input.linkedReportId ? 'Vaihda työraportti' : 'Kohdista työraporttiin'}
      intro="Valitse työraportti, johon tämä tarjous kuuluu. Saman asiakkaan ja tarjouksettomat raportit ensin."
      searchPlaceholder="Hae otsikolla tai asiakkaalla…"
      query={query}
      onQueryChange={setQuery}
      items={items}
      loading={loading}
      busy={busy}
      error={error}
      emptyText="Ei työraportteja haulla."
      onPick={(id) => void pick(id)}
      onClose={() => setOpen(false)}
    />
  );

  return { openPicker, unlink, dialog, busy, error: open ? null : error };
}

/**
 * Työraportin näkymä: "Liitä tarjous" / "Vaihda tarjous" / "Poista kohdistus".
 */
export function useReportQuoteLinker(input: {
  report: Pick<WorkReportLinkRow, 'id' | 'title' | 'customer_id' | 'owner_company_id'> | null;
  linkedQuoteId: string | null;
  viewerCompanyId?: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  const openPicker = useCallback(async () => {
    setOpen(true);
    setError(null);
    setQuery('');
    setLoading(true);
    try {
      setCatalog(await loadCatalog(true));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Tarjousten lataus epäonnistui.');
    } finally {
      setLoading(false);
    }
  }, []);

  const candidates = useMemo(() => {
    if (!catalog || !input.report) return [];
    return buildQuoteCandidates({ quotes: catalog.quotes, report: input.report, index: catalog.index, query });
  }, [catalog, input.report, query]);

  const items: QuoteLinkPickerItem[] = useMemo(() => {
    const reportTitles = new Map((catalog?.reports ?? []).map((r) => [r.id, titleOr(r.title, 'Työraportti')]));
    return candidates.slice(0, 200).map((candidate) => ({
      id: candidate.id,
      title: titleOr(candidate.title, 'Tarjous'),
      meta: quoteCandidateMeta(candidate, formatDate),
      badges: [
        ...(candidate.isCurrent ? [{ label: 'Nykyinen tarjous', tone: 'info' as const }] : []),
        ...(candidate.sameCustomer ? [{ label: 'Sama asiakas', tone: 'good' as const }] : []),
        ...(candidate.linkedReportId
          ? [{ label: `Raportti: ${reportTitles.get(candidate.linkedReportId) ?? 'toinen raportti'}`, tone: 'warn' as const }]
          : candidate.status === 'ordered'
            ? [{ label: 'Tilattu, ei työraporttia', tone: 'info' as const }]
            : []),
      ],
    }));
  }, [candidates, catalog]);

  const pick = useCallback(
    async (quoteId: string) => {
      if (!catalog || !input.report) return;
      const quote = catalog.quotes.find((q) => q.id === quoteId);
      if (!quote) return;
      const plan = planQuoteLink({ quote, reportId: input.report.id, index: catalog.index });
      if (plan.alreadyLinked) {
        setOpen(false);
        return;
      }
      const reportTitles = new Map(catalog.reports.map((r) => [r.id, titleOr(r.title, 'Työraportti')]));
      const quoteTitles = new Map(catalog.quotes.map((q) => [q.id, titleOr(q.title, 'Tarjous')]));
      setBusy(true);
      setError(null);
      try {
        const customerAlreadyBilled = await loadCustomerAlreadyBilled(supabase, input.report.id);
        const extra = quoteLinkConfirmMessage(plan, {
          reportTitle: (id) => reportTitles.get(id) ?? 'toinen työraportti',
          quoteTitle: (id) => quoteTitles.get(id) ?? 'toinen tarjous',
          customerAlreadyBilled,
        });
        const message = `Liitetäänkö tarjous "${titleOr(quote.title, 'Tarjous')}" tähän työraporttiin?\nTarjous ja kate sekä kumppanilaskelma lasketaan tarjouksen mukaan.${extra ? `\n\n${extra}` : ''}`;
        if (!window.confirm(message)) return;
        await linkQuoteToWorkReport(supabase, {
          quote,
          reportId: input.report.id,
          plan,
          viewerCompanyId: input.viewerCompanyId,
        });
        setOpen(false);
        input.onChanged();
      } catch (linkError) {
        setError(linkError instanceof Error ? linkError.message : 'Tarjouksen liittäminen epäonnistui.');
      } finally {
        setBusy(false);
      }
    },
    [catalog, input],
  );

  const unlink = useCallback(async () => {
    if (!input.report || !input.linkedQuoteId) return;
    if (
      !window.confirm(
        'Poistetaanko tarjouksen kohdistus tästä työraportista? Tarjous ja kate -laskenta poistuu ja kumppanilaskelma lasketaan päiväkirjan mukaan. Laskutettuja summia ei muuteta. Tarjous jää tilatuksi.',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await unlinkQuoteFromWorkReport(supabase, {
        quoteId: input.linkedQuoteId,
        reportId: input.report.id,
        viewerCompanyId: input.viewerCompanyId,
      });
      input.onChanged();
    } catch (unlinkError) {
      setError(unlinkError instanceof Error ? unlinkError.message : 'Kohdistuksen poisto epäonnistui.');
    } finally {
      setBusy(false);
    }
  }, [input]);

  const dialog = (
    <QuoteLinkPickerDialog
      open={open}
      title={input.linkedQuoteId ? 'Vaihda tarjous' : 'Liitä tarjous'}
      intro="Valitse tarjouspyyntö, jonka mukaan tämä työ tehtiin. Saman asiakkaan ja raportittomat tarjoukset ensin."
      searchPlaceholder="Hae otsikolla tai asiakkaalla…"
      query={query}
      onQueryChange={setQuery}
      items={items}
      loading={loading}
      busy={busy}
      error={error}
      emptyText="Ei tilattuja tai lähetettyjä tarjouksia haulla."
      onPick={(id) => void pick(id)}
      onClose={() => setOpen(false)}
    />
  );

  return { openPicker, unlink, dialog, busy, error: open ? null : error };
}
