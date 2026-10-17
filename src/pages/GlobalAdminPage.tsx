import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom';
import type { ManagementOutletContext } from '../lib/managementOutletContext';
import { isGbaSectionId } from '../lib/hallintaNav';
import GlobalAdminPricingSection from './globalAdmin/GlobalAdminPricingSection';
import GlobalAdminRegistrySection from './globalAdmin/GlobalAdminRegistrySection';
import GlobalAdminOperationsSection from './globalAdmin/GlobalAdminOperationsSection';
import { useGlobalAdminMeta } from './globalAdmin/useGlobalAdminMeta';

/** /hallinta/global-admin?osio=hinnoittelu|rekisteri|loki (valinta Hallinnan etusivulta). */
export default function GlobalAdminPage() {
  const { profile } = useOutletContext<ManagementOutletContext>();
  const [params] = useSearchParams();
  const osio = params.get('osio');
  const needsMeta = osio === 'rekisteri' || osio === 'loki';
  const { companies, users, loading, refresh } = useGlobalAdminMeta(!!profile?.is_global_admin && needsMeta);

  // Vanhat osiot: yritykset ja tilaukset ovat nyt yrityskohtaisella sivulla.
  if (osio === 'companies' || osio === 'yritykset' || osio === 'licenses') return <Navigate to="/hallinta/yritykset" replace />;
  if (!isGbaSectionId(osio)) return <Navigate to="/hallinta" replace />;
  if (osio === 'hinnoittelu') return <GlobalAdminPricingSection />;
  if (loading) return <p className="muted">Ladataan…</p>;
  return (
    <div className="global-admin-section">
      {osio === 'rekisteri' && <GlobalAdminRegistrySection companies={companies} users={users} onRefresh={refresh} />}
      {osio === 'loki' && <GlobalAdminOperationsSection companies={companies} />}
    </div>
  );
}
