import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { CustomerEquipmentTable } from '../components/CustomerEquipmentTile';
import { useProfile } from '../hooks/useProfile';
import { loadPortalOrderCustomers, loadPortalOrderEquipment } from '../lib/portalWorkOrder';
import { isPortalView } from '../lib/portalPreview';
import { supabase } from '../lib/supabase';
import type { Customer, Equipment } from '../types';

/** Portaali: kaikki omien kohteiden laitteet kohteittain. */
export default function PortalEquipmentPage({ session }: { session: Session }) {
  const { profile, loading } = useProfile(session);
  const [groups, setGroups] = useState<Array<{ customer: Customer; equipment: Equipment[] }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const portal = isPortalView(profile);

  useEffect(() => {
    if (loading || !profile || !portal) return;
    void (async () => {
      try {
        const customers = await loadPortalOrderCustomers(supabase, profile);
        const rows = await Promise.all(
          customers.map(async (customer) => ({ customer, equipment: await loadPortalOrderEquipment(supabase, customer.id) })),
        );
        setGroups(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Laitteiden lataus epäonnistui.');
        setGroups([]);
      }
    })();
  }, [loading, profile?.id, portal]);

  const empty = new Set<string>();
  // Yksi kohde: avaa suoraan sen laitteet (tulostus ja valinnat siellä).
  if (groups && groups.length === 1) return <Navigate to={`/asiakkaat/${groups[0].customer.id}`} replace />;
  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <h1>Laitteet</h1>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {!portal ? (
        <p className="muted">Näkymä on asiakasportaalia varten.</p>
      ) : groups === null ? (
        <p className="muted">Ladataan…</p>
      ) : groups.every((g) => g.equipment.length === 0) ? (
        <section className="panel"><p className="muted">Ei laitteita.</p></section>
      ) : (
        groups.filter((g) => g.equipment.length > 0).map(({ customer, equipment }) => (
          <section key={customer.id} className="panel customer-collapsible">
            <h2><Link to={`/asiakkaat/${customer.id}`}>{customer.name}</Link></h2>
            <CustomerEquipmentTable
              equipment={equipment}
              customerId={customer.id}
              latestMaintenance={() => null}
              selectedIds={empty}
              canWrite={false}
              canDelete={false}
              selectable={false}
              hrefFor={(eq) => `/laitteet/${eq.id}`}
              busy={false}
              printBusyId={null}
              onToggleSelected={() => undefined}
              onDelete={() => undefined}
            />
          </section>
        ))
      )}
    </AppLayout>
  );
}
