import { Navigate, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { useProfile } from '../hooks/useProfile';

const ALLOWED_PATHS = ['/vaihda-salasana'];

type Props = {
  session: Session;
  children: React.ReactNode;
};

export default function RequirePasswordChange({ session, children }: Props) {
  const location = useLocation();
  const { profile, loading } = useProfile(session);

  if (loading) {
    return <div className="app-loading">Ladataan…</div>;
  }

  if (profile?.must_change_password && !ALLOWED_PATHS.includes(location.pathname)) {
    return <Navigate to="/vaihda-salasana" replace />;
  }

  return <>{children}</>;
}
