import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { resolveCompanyLogoUrl } from '../lib/companyLogo';
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
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('—');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
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
        data,
        customers(name),
        branding_company:companies!installation_plans_branding_company_id_fkey(name, logo_url)
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
      customers?: { name?: string | null } | null;
      branding_company?: { name?: string | null; logo_url?: string | null } | null;
    };

    const normalized = normalizeInstallationPlanData(row.data);
    setForm(normalized);
    setCustomerName(row.customers?.name ?? null);
    setCompanyName(row.branding_company?.name ?? '—');
    setLogoUrl(await resolveCompanyLogoUrl(row.branding_company?.logo_url ?? null));
    setAttachments(await loadInstallationPlanAttachments(planId));
    setLoading(false);
  }

  async function handlePrint() {
    if (!form) return;
    const html = generateInstallationPlanPrintHtml({
      data: form,
      companyName,
      logoUrl,
      customerName,
      attachments,
    });
    await openPrintWindow(html);
  }

  if (loading) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }

  if (error || !form) {
    return (
      <AppLayout session={session}>
        <p className="error">{error ?? 'Suunnitelmaa ei löytynyt.'}</p>
      </AppLayout>
    );
  }

  const title = resolveInstallationPlanDisplayTitle(form, customerName);

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
        srcDoc={generateInstallationPlanPrintHtml({
          data: form,
          companyName,
          logoUrl,
          customerName,
          attachments,
        })}
      />
    </AppLayout>
  );
}
