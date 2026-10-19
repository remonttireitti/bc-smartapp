import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useProfile } from '../hooks/useProfile';
import { setPortalPreview } from '../lib/portalPreview';
import { supabase } from '../lib/supabase';

type Props = {
  session: Session;
  kind: 'subscriber' | 'customer';
};

export function SubscriberPortalPreviewPage({ session }: Props) {
  const { subscriberId } = useParams<{ subscriberId: string }>();
  return <PortalPreviewBootstrap session={session} kind="subscriber" entityId={subscriberId} />;
}

export function CustomerPortalPreviewPage({ session }: Props) {
  const { customerId } = useParams<{ customerId: string }>();
  return <PortalPreviewBootstrap session={session} kind="customer" entityId={customerId} />;
}

function PortalPreviewBootstrap({
  session,
  kind,
  entityId,
}: {
  session: Session;
  kind: 'subscriber' | 'customer';
  entityId: string | undefined;
}) {
  const navigate = useNavigate();
  const { profile, loading } = useProfile(session);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const onPreviewRoute = location.pathname.startsWith('/esikatselu/');
  // Keep-alive pitää sivun muistissa: käynnistä vain kerran per kohde ja vain esikatselureitillä,
  // muuten jokainen portaalin linkki palautuisi etusivulle.
  const startedFor = useRef<string | null>(null);
  const onPreviewRouteRef = useRef(onPreviewRoute);
  onPreviewRouteRef.current = onPreviewRoute;

  useEffect(() => {
    if (!onPreviewRoute) {
      startedFor.current = null;
    }
  }, [onPreviewRoute]);

  useEffect(() => {
    if (loading || !entityId || !onPreviewRoute) return;
    const runKey = `${kind}:${entityId}`;
    if (startedFor.current === runKey) return;
    startedFor.current = runKey;
    // Esikatselu pitää pystyä avaamaan myös "yrityksenä" (esim. asentaja/esimies),
    // mutta ei tilaaja/asiakas-rooleilla.
    if (!profile || profile.role === 'subscriber' || profile.role === 'customer') {
      setError('Portaalin esikatselun voi avata vain yrityksen tunnuksilla.');
      return;
    }

    /** Oma yritys, globaali admin tai kumppanuuden kautta asiakashallinnan oikeus. */
    const canPreviewOwner = async (ownerId: string) => {
      if (ownerId === profile.company_id || profile.is_global_admin === true) return true;
      const { data: ok } = await supabase.rpc('can_write_module', { target_owner: ownerId, module_key: 'customers' });
      return ok === true;
    };

    void (async () => {
      if (kind === 'subscriber') {
        const { data, error: loadError } = await supabase
          .from('subscribers')
          .select('id, name, owner_company_id')
          .eq('id', entityId)
          .maybeSingle();

        if (loadError || !data) {
          setError('Tilaajaa ei löytynyt.');
          return;
        }
        if (!(await canPreviewOwner(data.owner_company_id))) {
          setError('Tilaaja ei kuulu yrityksellesi.');
          return;
        }

        setPortalPreview({
          kind: 'subscriber',
          subscriberId: data.id,
          subscriberName: data.name,
          companyId: data.owner_company_id,
        });
        // Täysi lataus: henkilöstönäkymien välimuistisivut eivät jää esikatseluun (istunto säilyy).
        if (onPreviewRouteRef.current) window.location.replace('/');
        return;
      }

      const { data, error: loadError } = await supabase
        .from('customers')
        .select('id, name, owner_company_id, subscriber_id')
        .eq('id', entityId)
        .maybeSingle();

      if (loadError || !data) {
        setError('Asiakaskohdetta ei löytynyt.');
        return;
      }
      if (!(await canPreviewOwner(data.owner_company_id))) {
        setError('Kohde ei kuulu yrityksellesi.');
        return;
      }

      setPortalPreview({
        kind: 'customer',
        customerId: data.id,
        customerName: data.name,
        companyId: data.owner_company_id,
      });
      // Täysi lataus: henkilöstönäkymien välimuistisivut eivät jää esikatseluun (istunto säilyy).
        if (onPreviewRouteRef.current) window.location.replace('/');
    })();
  }, [loading, profile, entityId, kind, navigate, onPreviewRoute]);

  return (
    <AppLayout session={session}>
      {error ? (
        <>
          <p className="error">{error}</p>
          <Link to="/" className="btn btn-secondary">
            Takaisin
          </Link>
        </>
      ) : (
        <p className="muted">Avataan portaalin esikatselua…</p>
      )}
    </AppLayout>
  );
}
