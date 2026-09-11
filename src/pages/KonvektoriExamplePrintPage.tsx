import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import NavigationBreadcrumb from '../components/NavigationBreadcrumb';
import { useProfile } from '../hooks/useProfile';
import { resolveCompanyLogoUrl } from '../lib/companyLogo';
import { supabase } from '../lib/supabase';
import {
  buildKonvektoriExampleReportData,
  buildRandomKonvektoriExampleDate,
} from '../lib/huoltoRaportti/konvektoriExamplePrint';
import { buildKonvektoriExamplePrintDocument } from '../lib/huoltoRaportti/konvektoriExamplePrintDocument';
import { filterFaultyKonvektoriRows } from '../lib/huoltoRaportti/konvektoriTarkastus';
import {
  applyPrintDocumentTitle,
  extractPrintableHtmlFragment,
  formatPrintSaveFileName,
  printCurrentDocument,
} from '../lib/printDocumentShell';

interface Props {
  session: Session;
}

export default function KonvektoriExamplePrintPage({ session }: Props) {
  const { profile } = useProfile(session);
  const [searchParams, setSearchParams] = useSearchParams();
  const faultyOnly = searchParams.get('vialliset') === '1';
  const autoPrint = searchParams.get('print') === '1';
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [exampleDate] = useState(() => buildRandomKonvektoriExampleDate());
  const autoPrintTriggeredRef = useRef(false);
  const printCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!profile?.company_id) {
      setLogoUrl(undefined);
      return;
    }
    let cancelled = false;
    void supabase
      .from('companies')
      .select('logo_url')
      .eq('id', profile.company_id)
      .single()
      .then(async ({ data }) => {
        if (cancelled) return;
        const logoPath = (data as { logo_url: string | null } | null)?.logo_url;
        if (!logoPath) {
          setLogoUrl(undefined);
          return;
        }
        try {
          setLogoUrl((await resolveCompanyLogoUrl(logoPath)) ?? undefined);
        } catch {
          setLogoUrl(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.company_id]);

  const bundle = useMemo(
    () =>
      buildKonvektoriExamplePrintDocument(
        {
          companyName: profile?.companies?.name ?? 'Esimerkki yritys Oy',
          logoUrl,
        },
        { faultyOnly, huoltoPaivamaara: exampleDate },
      ),
    [profile?.companies?.name, logoUrl, faultyOnly, exampleDate],
  );

  const html = useMemo(() => extractPrintableHtmlFragment(bundle.html), [bundle.html]);
  const printTitle = useMemo(
    () => formatPrintSaveFileName(bundle.documentTitle),
    [bundle.documentTitle],
  );

  useEffect(() => {
    if (!printTitle) return undefined;
    const previousTitle = document.title;
    document.title = printTitle;
    const onBeforePrint = () => {
      applyPrintDocumentTitle(document, printTitle);
    };
    window.addEventListener('beforeprint', onBeforePrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      document.title = previousTitle;
    };
  }, [printTitle]);

  useEffect(() => {
    if (!autoPrint || autoPrintTriggeredRef.current) return;
    autoPrintTriggeredRef.current = true;
    printCleanupRef.current?.();
    printCleanupRef.current = printCurrentDocument(printTitle);
  }, [autoPrint, printTitle]);

  useEffect(
    () => () => {
      printCleanupRef.current?.();
      printCleanupRef.current = null;
    },
    [],
  );

  function triggerPrint() {
    printCleanupRef.current?.();
    printCleanupRef.current = printCurrentDocument(printTitle);
  }

  function setFaultyOnly(next: boolean) {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('vialliset', '1');
    else params.delete('vialliset');
    setSearchParams(params, { replace: true });
  }

  const exampleCounts = useMemo(() => {
    const full = buildKonvektoriExampleReportData({ huoltoPaivamaara: exampleDate });
    const faulty = filterFaultyKonvektoriRows(full.konvektoriRows).length;
    return { total: full.konvektoriRows.length, faulty };
  }, [exampleDate]);

  return (
    <div className="maintenance-print-page maintenance-print-page--standalone">
      <div className="page-header no-print maintenance-print-toolbar">
        <div>
          <NavigationBreadcrumb
            items={[
              { label: 'Etusivu', to: '/' },
              { label: 'Huoltoraportit', to: '/huoltoraportit' },
              { label: 'Esimerkkituloste' },
            ]}
          />
          <h1>{faultyOnly ? 'Esimerkki: vialliset konvektorit' : 'Esimerkki: konvektorihuoltopöytäkirja'}</h1>
          {printTitle ? (
            <p className="muted maintenance-print-filename-hint">
              PDF-tiedostonimi: <strong>{printTitle}</strong>
            </p>
          ) : null}
          <p className="muted maintenance-print-help">
            Tämä on <strong>esimerkkituloste</strong> — asiakas, tekijä ja mittaukset ovat keksittyjä.
            Päivämäärä arvotaan satunnaisesti avattaessa sivun. Valitse tulostimena{' '}
            <strong>Tallenna PDF-muodossa</strong> ja poista <strong>Ylätunnisteet ja alatunnisteet</strong>.
          </p>
          <p className="muted maintenance-print-help">
            Oikeassa raportissa voit tulostaa vain vialliset konvektorit painikkeella{' '}
            <strong>Tulosta vialliset</strong> konvektorilistan yläreunassa. Tässä esimerkissä voit kokeilla
            samaa alla olevalla painikkeella — esimerkissä on {exampleCounts.faulty} viallista /{' '}
            {exampleCounts.total} konvektoria.
          </p>
        </div>
        <div className="btn-group">
          <button type="button" className="btn btn-primary" onClick={triggerPrint}>
            Tulosta / PDF
          </button>
          {faultyOnly ? (
            <button type="button" className="btn btn-secondary" onClick={() => setFaultyOnly(false)}>
              Näytä kaikki konvektorit
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setFaultyOnly(true)}>
              Näytä vain vialliset
            </button>
          )}
          <Link to="/huoltoraportit" className="btn btn-secondary">
            Huoltoraportit
          </Link>
        </div>
      </div>

      <div className="maintenance-print-host" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
