import { useEffect, useMemo, useState } from 'react';

import { Link, useParams } from 'react-router-dom';

import type { Session } from '@supabase/supabase-js';

import AppLayout from '../components/AppLayout';

import NavigationBreadcrumb from '../components/NavigationBreadcrumb';

import { resolveCompanyLogoUrl } from '../lib/companyLogo';
import { embedUrlAsDataUrl } from '../lib/quoteRequest/termatekAssets';

import { quoteListTrail } from '../lib/navigationTrail';

import { isPumpQuoteType, isRepairQuoteType, QUOTE_TYPE_LABELS } from '../lib/quoteRequest/constants';

import { deliveryFeesFromCompanySettings } from '../lib/quoteRequest/deviceCatalog';
import { setActiveDeviceRegistry, snapshotFromCompanySettings } from '../lib/quoteRequest/deviceRegistryState';

import { normalizeQuoteRequestData, resolveQuoteDisplayTitle } from '../lib/quoteRequest/defaults';

import {
  generateQuoteHeatCalcPrintHtml,
  generateQuoteOfferPrintHtml,
  generateQuoteServicePrintHtml,
  parseCompanySettingsFromRow,
  type QuotePrintMode,
} from '../lib/quoteRequest/printHtml';
import {
  generateLampokatsastusServicePrintHtml,
  isLampokatsastusCompany,
  prepareLampokatsastusServicePrintHtml,
} from '../lib/quoteRequest/lampokatsastusPrintHtml';
import {
  generateTermatekVilpPrintHtml,
  isTermatekCompany,
  prepareTermatekVilpPrintHtml,
} from '../lib/quoteRequest/termatekPrintHtml';

import type { QuoteRequestData } from '../lib/quoteRequest/types';

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

  }, [id]);



  const feeMap = useMemo(() => deliveryFeesFromCompanySettings(meta?.settings), [meta?.settings]);

  useEffect(() => {
    setActiveDeviceRegistry(snapshotFromCompanySettings(meta?.settings ?? null));
  }, [meta?.settings]);

  const useTermatekTemplate =
    printDocument === 'offer'
    && quoteData?.type === 'vesi-ilma'
    && printMode === 'enduser'
    && !!meta
    && isTermatekCompany(meta);

  const useLampokatsastusTemplate =
    printDocument === 'offer'
    && !!quoteData
    && isRepairQuoteType(quoteData.type)
    && printMode === 'enduser'
    && !!meta
    && isLampokatsastusCompany(meta);

  useEffect(() => {
    if (!useTermatekTemplate || !quoteData || !customer || !meta) {
      setTermatekHtml('');
      setTermatekHtmlLoading(false);
      return;
    }
    let cancelled = false;
    setTermatekHtmlLoading(true);
    void prepareTermatekVilpPrintHtml({ data: quoteData, customer, meta, feeMap })
      .then((nextHtml) => {
        if (!cancelled) setTermatekHtml(nextHtml);
      })
      .catch(() => {
        if (!cancelled) {
          setTermatekHtml(
            generateTermatekVilpPrintHtml({ data: quoteData, customer, meta, feeMap }),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTermatekHtmlLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [useTermatekTemplate, quoteData, customer, meta, feeMap]);

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
      return termatekHtml || generateTermatekVilpPrintHtml({ data: quoteData, customer, meta, feeMap });
    }

    return generateQuoteOfferPrintHtml({
      data: quoteData,
      customer,
      meta,
      mode: printMode,
      feeMap,
    });
  }, [
    quoteData,
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

        id, title, data, created_at, branding_company_id, owner_company_id, customer_id,

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

      data: QuoteRequestData;

      created_at: string;

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



    const normalized = normalizeQuoteRequestData(row.data);

    setTitle(
      resolveQuoteDisplayTitle({
        customerName: row.customers?.name,
        quoteTypeLabel: QUOTE_TYPE_LABELS[normalized.type],
        storedTitle: row.title,
      }) || 'Tarjous',
    );

    setQuoteData(normalized);

    setCustomer({

      name: row.customers?.name ?? '—',

      address: row.customers?.address,

      city: row.customers?.city,

    });

    setMeta({

      companyName: (companyRow as { name: string } | null)?.name ?? 'BC Smartapp',

      logoUrl,

      settings: parseCompanySettingsFromRow((companyRow as { settings: unknown } | null)?.settings),

      quoteNumber: row.id.slice(0, 8).toUpperCase(),

      quoteDate: row.created_at,

    });

    setLoading(false);

  }



  async function handlePrint() {
    let printHtml = html;
    if (useTermatekTemplate && quoteData && customer && meta) {
      try {
        printHtml = await prepareTermatekVilpPrintHtml({ data: quoteData, customer, meta, feeMap });
      } catch {
        printHtml = html;
      }
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
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



  return (

    <AppLayout session={session}>

      <NavigationBreadcrumb

        items={[

          ...quoteListTrail().breadcrumb,

          { label: title, to: `/tarjouspyynnot/${id}` },

          { label: 'Tuloste' },

        ]}

      />



      <div className="page-header">

        <div>

          <h1>Tuloste: {title}</h1>

          <p className="muted">Valitse tulosteen tyyppi ja näkymä (kuten vanhassa sovelluksessa)</p>

        </div>

        <div className="page-header-actions">

          <button type="button" className="btn btn-primary" onClick={handlePrint}>

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

    </AppLayout>

  );

}


