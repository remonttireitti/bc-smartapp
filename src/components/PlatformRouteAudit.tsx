import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthSession } from '../contexts/AuthSessionContext';
import { recordPlatformRouteView } from '../lib/platformAudit';

/** Kirjaa kirjautuneen käyttäjän sivunavaukset audit-lokiin. */
export default function PlatformRouteAudit() {
  const { session } = useAuthSession();
  const location = useLocation();

  useEffect(() => {
    if (!session) return;
    recordPlatformRouteView(`${location.pathname}${location.search}`);
  }, [session, location.pathname, location.search]);

  return null;
}
