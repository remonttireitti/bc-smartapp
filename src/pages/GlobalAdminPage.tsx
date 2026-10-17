import { Navigate, useOutletContext } from 'react-router-dom';
import type { ManagementOutletContext } from '../lib/managementOutletContext';
import type { GbaSectionId } from '../lib/hallintaNav';
import GlobalAdminRegistrySection from './globalAdmin/GlobalAdminRegistrySection';
import GlobalAdminOperationsSection from './globalAdmin/GlobalAdminOperationsSection';
import { useGlobalAdminMeta } from './globalAdmin/useGlobalAdminMeta';

/** /palvelu/rekisteri ja /palvelu/loki. Vanhat ?osio=-osoitteet ohjataan hallintaNav.legacyServicePath-funktiolla. */
export default function GlobalAdminPage({ osio }: { osio: GbaSectionId }) {
  const { profile } = useOutletContext<ManagementOutletContext>();
  const needsMeta = osio === 'rekisteri' || osio === 'loki';
  const { companies, users, loading, refresh } = useGlobalAdminMeta(!!profile?.is_global_admin && needsMeta);

  if (!profile?.is_global_admin) return <Navigate to="/hallinta" replace />;
  if (loading) return <p className="muted">Ladataan…</p>;
  return (
    <div className="global-admin-section">
      {osio === 'rekisteri' && <GlobalAdminRegistrySection companies={companies} users={users} onRefresh={refresh} />}
      {osio === 'loki' && <GlobalAdminOperationsSection companies={companies} />}
    </div>
  );
}
