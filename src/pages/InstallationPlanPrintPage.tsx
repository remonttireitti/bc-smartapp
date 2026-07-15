import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { resolveCompanyLogoUrl } from '../lib/companyLogo';
import { parseCompanySettings } from '../lib/management';
import { normalizeInstallationPlanData, resolveInstallationPlanDisplayTitle } from '../lib/installationPlan/defaults';
import { generateInstallationPlanPrintHtml } from '../lib/installationPlan/printHtml';
import type { InstallationPlanAttachment, InstallationPlanData } from '../lib/installationPlan/types';
import { loadInstallationPlanAttachments } from '../lib/installationPlanAttachments';
import { openPrintWindow } from '../lib/quoteRequest/printWindowUtils';
import { supabase } from '../lib/supabase';

interface Props {
  session: Session;
}

export default function InstallationPlanPrintPage({ session }: Props) {
  const { id } = useParams();
  const [form, setForm] = useState<InstallationPlanData | null>(null);
  const [customer, setCustomer] = useState<{ name: string; address?: string | null; city?: string | null } | null>(
    null,
  );
  const [companyName, setCompanyName] = useState('—');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companySettings, setCompanySettings] = useState<ReturnType<typeof parseCompanySettings> | null>(null);
  const [documentDate, setDocumentDate] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<InstallationPlanAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void loadPrintData(id);
  }, [id]);

  async function loadPrintData(planId: string) {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('installation_plans')
      .select(`
        data, updated_at,
        customers(name, address, city),
        branding_company:companies!installation_plans_branding_company_id_fkey(name, logo_url, settings)
      `)
      .eq('id', planId)
      .single();

    if (loadError || !data) {
      setError(loadError?.message ?? 'Suunnitelmaa ei löytynyt.');
      setLoading(false);
      return;
    }

    const row = data as {
      data: InstallationPlanData;
      updated_at: string;
      customers?: { name?: string | null; address?: string | null; city?: string | null } | null;
      branding_company?: { name?: string | null; logo_url?: string | null; settings?: unknown } | null;
    };

    const normalized = normalizeInstallationPlanData(row.data);
    setForm(normalized);
    setCustomer(
      row.customers?.name
        ? {
            name: row.customers.name,
            address: row.customers.address,
            city: row.customers.city,
          }
        : null,
    );
    setCompanyName(row.branding_company?.name ?? '—');
    setCompanySettings(parseCompanySettings(row.branding_company?.settings));
    setDocumentDate(row.updated_at);
    setLogoUrl(await resolveCompanyLogoUrl(row.branding_company?.logo_url ?? null));
    setAttachments(await loadInstallationPlanAttachments(planId));
    setLoading(false);
  }

  function buildPrintHtml() {
    if (!form || !customer) return '';
    return generateInstallationPlanPrintHtml({
      data: form,
      customer,
      meta: {
        companyName,
        logoUrl,
        settings: companySettings,
        documentDate,
      },
      attachments,
    });
  }

  async function handlePrint() {
    const html = buildPrintHtml();
    if (!html) return;
    await openPrintWindow(html);
  }

  if (loading) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  if (error || !form || !customer) {
    return (
      <AppLayout session={session}>
        <p className="error">{error ?? 'Suunnitelmaa tai asiakasta ei löytynyt.'}</p>
      </AppLayout>
    );
  }

  const title = resolveInstallationPlanDisplayTitle(form, customer.name);
  const printHtml = buildPrintHtml();

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/tarjouspyynnot">Tarjouspyyntö</Link> /{' '}
            <Link to="/asennus-suunnittelu">Asennus suunnittelu</Link> /{' '}
            <Link to={`/asennus-suunnittelu/${id}`}>Muokkaa</Link> / Tuloste
          </p>
          <h1>{title}</h1>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn btn-primary" onClick={() => void handlePrint()}>
            Tulosta / PDF
          </button>
        </div>
      </div>

      <iframe
        title="Asennus suunnittelu tuloste"
        className="print-preview-frame"
        srcDoc={printHtml}
      />
    </AppLayout>
  );
}
