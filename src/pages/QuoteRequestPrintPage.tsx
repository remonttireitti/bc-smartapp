import { useEffect, useMemo, useState } from 'react';

import { Link, useParams } from 'react-router-dom';

import type { Session } from '@supabase/supabase-js';

import AppLayout from '../components/AppLayout';
import IconButton from '../components/IconButton';
import { IconBack } from '../components/icons';
import NavigationBreadcrumb from '../components/NavigationBreadcrumb';

import { resolveCompanyLogoUrl } from '../lib/companyLogo';
import { openPrintWindow } from '../lib/quoteRequest/printWindowUtils';
import { embedUrlAsDataUrl } from '../lib/quoteRequest/termatekAssets';

import { quoteListTrail, withNavTrail } from '../lib/navigationTrail';

import { isPumpQuoteType, isRepairQuoteType, QUOTE_TYPE_LABELS } from '../lib/quoteRequest/constants';

import { deliveryFeesFromCompanySettings, syncMainDeviceBrandPricing } from '../lib/quoteRequest/deviceCatalog';
import { setActiveDeviceRegistry, snapshotFromCompanySettings } from '../lib/quoteRequest/deviceRegistryState';

import { normalizePumpDeviceSelection, resolveQuoteDisplayTitle } from '../lib/quoteRequest/defaults';

import {
  generateQuoteHeatCalcPrintHtml,
  generateQuoteOfferPrintHtml,
  generateQuoteServicePrintHtml,
  parseCompanySettingsFromRow,
  type QuotePrintMode,
} from '../lib/quoteRequest/printHtml';
import {
  generateLampokatsastusServicePrintHtml,
  prepareLampokatsastusServicePrintHtml,
} from '../lib/quoteRequest/lampokatsastusPrintHtml';
import {
  generateTermatekVilpPrintHtml,
  isTermatekCompany,
  prepareTermatekVilpPrintHtml,
} from '../lib/quoteRequest/termatekPrintHtml';

import type { QuoteRequestData } from '../lib/quoteRequest/types';

import { localQuoteDraftKey, readLocalQuoteDraft, pickQuoteFormSource } from '../lib/quoteRequestDraftStorage';

import { supabase } from '../lib/supabase';



interface Props {

  session: Session;

}



type PrintDocument = 'offer' | 'heatcalc';



export default function QuoteRequestPrintPage({ session }: Props) {

  const { id } = useParams();

  const [quoteData, setQuoteData] = useState<QuoteRequestData | null>(null);

  const [customer, setCustomer] = useState<{ name: string; address?: string | null; city?: string | null } | null>(

    null,

  );

  const [meta, setMeta] = useState<{

    companyName: string;

    logoUrl?: string;

    settings: ReturnType<typeof parseCompanySettingsFromRow>;

    quoteNumber?: string;

    quoteDate?: string;

  } | null>(null);

  const [title, setTitle] = useState('Tarjous');

  const [printMode, setPrintMode] = useState<QuotePrintMode>('creator');

  const [printDocument, setPrintDocument] = useState<PrintDocument>('offer');

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [termatekHtml, setTermatekHtml] = useState('');

  const [termatekHtmlLoading, setTermatekHtmlLoading] = useState(false);

  const [lampokatsastusHtml, setLampokatsastusHtml] = useState('');

  const [lampokatsastusHtmlLoading, setLampokatsastusHtmlLoading] = useState(false);



  useEffect(() => {

    if (!id) {

      setError('Tarjouksen tunniste puuttuu.');

      setLoading(false);

      return;

    }

    void loadQuote(id);

  }, [id, session.user.id]);



  const feeMap = useMemo(() => deliveryFeesFromCompanySettings(meta?.settings), [meta?.settings]);

  const printData = useMemo(
    () =>
      quoteData
        ? syncMainDeviceBrandPricing(normalizePumpDeviceSelection(quoteData))
        : null,
    [quoteData],
  );

  useEffect(() => {
    setActiveDeviceRegistry(snapshotFromCompanySettings(meta?.settings ?? null));
  }, [meta?.settings]);

  const useTermatekTemplate =
    printDocument === 'offer'
    && (quoteData?.type === 'vesi-ilma' || quoteData?.type === 'ilma-ilma')
    && printMode === 'enduser'
    && !!meta
    && isTermatekCompany(meta);

  // Huolto/korjaus: sama pohja sisäiselle ja asiakastulosteelle (ei erillistä brändipohjaa).
  const useLampokatsastusTemplate = false;

  useEffect(() => {
    if (!useTermatekTemplate || !printData || !customer || !meta) {
      setTermatekHtml('');
      setTermatekHtmlLoading(false);
      return;
    }
    let cancelled = false;
    setTermatekHtmlLoading(true);
    void prepareTermatekVilpPrintHtml({ data: printData, customer, meta, feeMap })
      .then((nextHtml) => {
        if (!cancelled) setTermatekHtml(nextHtml);
      })
      .catch(() => {
        if (!cancelled) {
          setTermatekHtml(
            generateTermatekVilpPrintHtml({ data: printData, customer, meta, feeMap }),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTermatekHtmlLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [useTermatekTemplate, printData, customer, meta, feeMap]);

  useEffect(() => {
    if (!useLampokatsastusTemplate || !quoteData || !customer || !meta) {
      setLampokatsastusHtml('');
      setLampokatsastusHtmlLoading(false);
      return;
    }
    let cancelled = false;
    setLampokatsastusHtmlLoading(true);
    void prepareLampokatsastusServicePrintHtml({ data: quoteData, customer, meta, feeMap })
      .then((nextHtml) => {
        if (!cancelled) setLampokatsastusHtml(nextHtml);
      })
      .catch(() => {
        if (!cancelled) {
          setLampokatsastusHtml(
            generateLampokatsastusServicePrintHtml({ data: quoteData, customer, meta, feeMap }),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLampokatsastusHtmlLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [useLampokatsastusTemplate, quoteData, customer, meta, feeMap]);

  const html = useMemo(() => {
    if (!quoteData || !customer || !meta) return '';

    if (printDocument === 'heatcalc' && isPumpQuoteType(quoteData.type)) {
      return generateQuoteHeatCalcPrintHtml({ data: quoteData, customer, meta });
    }

    if (printDocument === 'offer' && isRepairQuoteType(quoteData.type)) {
      if (useLampokatsastusTemplate) {
        return lampokatsastusHtml || generateLampokatsastusServicePrintHtml({ data: quoteData, customer, meta, feeMap });
      }
      return generateQuoteServicePrintHtml({
        data: quoteData,
        customer,
        meta,
        mode: printMode,
        feeMap,
      });
    }

    if (useTermatekTemplate) {
      return termatekHtml;
    }

    return generateQuoteOfferPrintHtml({
      data: printData ?? quoteData,
      customer,
      meta,
      mode: printMode,
      feeMap,
    });
  }, [
    quoteData,
    printData,
    customer,
    meta,
    printMode,
    printDocument,
    feeMap,
    useTermatekTemplate,
    termatekHtml,
    useLampokatsastusTemplate,
    lampokatsastusHtml,
  ]);



  async function loadQuote(quoteId: string) {

    setLoading(true);

    setError(null);



    const { data, error: loadError } = await supabase

      .from('quote_requests')

      .select(`

        id, title, status, data, created_at, updated_at, branding_company_id, owner_company_id, customer_id,

        customers(name, address, city)

      `)

      .eq('id', quoteId)

      .single();



    if (loadError || !data) {

      setError(loadError?.message ?? 'Tarjouspyyntöä ei löytynyt.');

      setLoading(false);

      return;

    }



    const row = data as unknown as {

      id: string;

      title: string;

      status: 'draft' | 'sent';

      data: QuoteRequestData;

      created_at: string;

      updated_at: string;

      branding_company_id: string | null;

      owner_company_id: string;

      customers: { name: string; address: string | null; city: string | null } | null;

    };



    const companyId = row.branding_company_id ?? row.owner_company_id;

    const { data: companyRow } = await supabase

      .from('companies')

      .select('name, logo_url, settings')

      .eq('id', companyId)

      .single();



    let logoUrl: string | undefined;

    try {

      const resolved = await resolveCompanyLogoUrl(

        (companyRow as { logo_url: string | null } | null)?.logo_url,

      );

      if (resolved) logoUrl = resolved;

      if (logoUrl && !logoUrl.startsWith('data:')) {
        try {
          logoUrl = await embedUrlAsDataUrl(logoUrl);
        } catch {
          /* keep signed url */
        }
      }

    } catch {

      /* optional logo */

    }



    const settings = parseCompanySettingsFromRow((companyRow as { settings: unknown } | null)?.settings);
    setActiveDeviceRegistry(snapshotFromCompanySettings(settings));

    const draftKey = localQuoteDraftKey(row.id, session.user.id);
    const draft = readLocalQuoteDraft<{ form: QuoteRequestData }>(draftKey);
    const { form: resolvedForm } = pickQuoteFormSource({
      status: row.status,
      dbData: row.data,
      dbUpdatedAt: row.updated_at,
      dbCreatedAt: row.created_at,
      draft,
    });
    const formToUse = syncMainDeviceBrandPricing(normalizePumpDeviceSelection(resolvedForm));

    setTitle(
      resolveQuoteDisplayTitle({
        customerName: row.customers?.name,
        quoteTypeLabel: QUOTE_TYPE_LABELS[formToUse.type],
        storedTitle: row.title,
      }) || 'Tarjous',
    );

    setQuoteData(formToUse);

    setCustomer({

      name: row.customers?.name ?? '—',

      address: row.customers?.address,

      city: row.customers?.city,

    });

    setMeta({

      companyName: (companyRow as { name: string } | null)?.name ?? 'BC Smartapp',

      logoUrl,

      settings,

      quoteNumber: row.id.slice(0, 8).toUpperCase(),

      quoteDate: row.created_at,

    });

    setLoading(false);

  }



  async function handlePrint() {
    let printHtml = html;
    if (useTermatekTemplate && printData && customer && meta) {
      try {
        printHtml = await prepareTermatekVilpPrintHtml({ data: printData, customer, meta, feeMap });
      } catch {
        if (!printHtml) {
          setError('Tulosteen valmistelu epäonnistui. Yritä uudelleen.');
          return;
        }
      }
    }
    if (!printHtml) {
      setError('Tuloste ei ole vielä valmis. Odota hetki ja yritä uudelleen.');
      return;
    }
    const opened = await openPrintWindow(printHtml);
    if (!opened) {
      setError('Tulostusikkunan avaus estettiin. Salli ponnahdusikkunat tai käytä selaimen tulostusta.');
    }
  }



  if (loading) {

    return (

      <AppLayout session={session}>

        <p className="muted">Ladataan tulostetta…</p>

      </AppLayout>

    );

  }



  if (error || !quoteData || !customer || !meta) {

    return (

      <AppLayout session={session}>

        <section className="panel">

          <p className="error">{error ?? 'Tulostetta ei voitu muodostaa.'}</p>

          <Link to={quoteListTrail().backTo} className="btn btn-secondary">

            Takaisin listaan

          </Link>

        </section>

      </AppLayout>

    );

  }



  const showHeatCalc = isPumpQuoteType(quoteData.type);



  const listTrail = quoteListTrail();

  return (

    <AppLayout session={session}>

      <div className="quote-print-page">

      <nav className="quote-print-sticky-nav no-print" aria-label="Tulostenäkymän navigointi">
        {id ? (
          <Link to={`/tarjouspyynnot/${id}`} className="btn btn-secondary quote-print-sticky-nav-back">
            ← Takaisin
          </Link>
        ) : null}
        <Link
          to={listTrail.backTo}
          className="btn btn-secondary quote-print-sticky-nav-list"
          {...withNavTrail(listTrail)}
        >
          Lista
        </Link>
        <button type="button" className="btn btn-primary quote-print-sticky-nav-print" onClick={() => void handlePrint()}>
          Tulosta
        </button>
      </nav>

      <div className="quote-print-breadcrumb">
        <NavigationBreadcrumb
          items={[
            ...listTrail.breadcrumb,
            { label: title, to: `/tarjouspyynnot/${id}` },
            { label: 'Tuloste' },
          ]}
        />
      </div>



      <div className="page-header">

        <div>

          <h1>Tuloste: {title}</h1>

          <p className="muted">Valitse tulosteen tyyppi ja näkymä (kuten vanhassa sovelluksessa)</p>

        </div>

        <div className="page-header-actions action-toolbar">
          {id ? (
            <IconButton
              label="Takaisin muokkaukseen"
              href={`/tarjouspyynnot/${id}`}
              tooltipSide="bottom"
            >
              <IconBack />
            </IconButton>
          ) : null}
          <Link
            to={listTrail.backTo}
            className="btn btn-secondary"
            {...withNavTrail(listTrail)}
          >
            Tarjouspyyntöihin
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => void handlePrint()}>
            Tulosta / PDF
          </button>
        </div>

      </div>



      <section className="panel quote-print-toolbar">

        <div className="billing-filter-pills">

          <button

            type="button"

            className={printDocument === 'offer' ? 'billing-pill active' : 'billing-pill'}

            onClick={() => setPrintDocument('offer')}

          >

            Tarjous

          </button>

          {showHeatCalc && (

            <button

              type="button"

              className={printDocument === 'heatcalc' ? 'billing-pill active' : 'billing-pill'}

              onClick={() => setPrintDocument('heatcalc')}

            >

              Lämmityslaskelma

            </button>

          )}

        </div>

        {printDocument === 'offer' && (

          <div className="billing-filter-pills">

            <button

              type="button"

              className={printMode === 'enduser' ? 'billing-pill active' : 'billing-pill'}

              onClick={() => setPrintMode('enduser')}

            >

              Asiakastuloste

            </button>

            <button

              type="button"

              className={printMode === 'creator' ? 'billing-pill active' : 'billing-pill'}

              onClick={() => setPrintMode('creator')}

            >

              Sisäinen laskenta

            </button>

          </div>

        )}

      </section>



      <section className="panel print-preview-shell">
        {(termatekHtmlLoading && useTermatekTemplate) || (lampokatsastusHtmlLoading && useLampokatsastusTemplate) ? (
          <p className="muted" style={{ padding: '0.75rem 1rem' }}>Valmistellaan tulostetta…</p>
        ) : null}
        <iframe title="Tarjouksen esikatselu" srcDoc={html} className="print-preview-frame" />
      </section>

      </div>

    </AppLayout>

  );

}


