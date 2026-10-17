import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { CustomerDocumentTable } from '../components/CustomerDocumentTile';
import { useProfile } from '../hooks/useProfile';
import { loadCustomerLinkedDocuments, type CustomerLinkedDocument } from '../lib/customerDocuments';
import { loadPortalOrderCustomers } from '../lib/portalWorkOrder';
import { isPortalView } from '../lib/portalPreview';
import { supabase } from '../lib/supabase';

/** Portaali: omien kohteiden tiedostot. */
export default function PortalFilesPage({ session }: { session: Session }) {
  const { profile, loading } = useProfile(session);
  const [files, setFiles] = useState<CustomerLinkedDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const portal = isPortalView(profile);

  useEffect(() => {
    if (loading || !profile || !portal) return;
    void (async () => {
      try {
        const customers = await loadPortalOrderCustomers(supabase, profile);
        const docs = await Promise.all(
          customers.map((c) => loadCustomerLinkedDocuments(supabase, c.id, { portalReadOnly: true })),
        );
        setFiles(docs.flat().filter((d) => d.kind === 'file'));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Tiedostojen lataus epäonnistui.');
        setFiles([]);
      }
    })();
  }, [loading, profile?.id, portal]);

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb breadcrumb-home-only"><Link to="/">Etusivu</Link> / Tiedostot</p>
          <h1>Tiedostot</h1>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {files === null ? (
        <p className="muted">Ladataan…</p>
      ) : files.length === 0 ? (
        <section className="panel"><p className="muted">Ei tiedostoja.</p></section>
      ) : (
        <section className="panel customer-collapsible"><CustomerDocumentTable documents={files} hideKind /></section>
      )}
    </AppLayout>
  );
}
