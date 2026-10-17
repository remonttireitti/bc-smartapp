import { Navigate, useLocation, useOutletContext } from 'react-router-dom';
import { HubTileGrid } from '../components/HubTile';
import { buildHallintaGroups, buildServiceTiles, legacyServicePath } from '../lib/hallintaNav';
import type { ManagementOutletContext } from '../lib/managementOutletContext';

/** /hallinta: oman yrityksen ruudut (Oma käyttäjä, Yritys). */
export default function HallintaHubPage() {
  const { profile, billingModuleEnabled, partnershipsEnabled } = useOutletContext<ManagementOutletContext>();
  const groups = buildHallintaGroups({
    role: profile.role,
    isGlobalAdmin: !!profile.is_global_admin,
    billingModuleEnabled,
    partnershipsEnabled,
  });
  return (
    <div className="hallinta-hub">
      {groups.map((g) => (
        <section key={g.key} className="hallinta-hub-group">
          <h2 className="hallinta-hub-title">{g.title}</h2>
          <HubTileGrid tiles={g.tiles} />
        </section>
      ))}
    </div>
  );
}

/** /palvelu: koko palvelun (globaali admin) ruudut. */
export function ServiceAdminHubPage() {
  const { profile } = useOutletContext<ManagementOutletContext>();
  return (
    <div className="hallinta-hub">
      <HubTileGrid tiles={buildServiceTiles({ isGlobalAdmin: !!profile.is_global_admin })} />
    </div>
  );
}

/** /global-admin (vanha) → /palvelu. */
export function LegacyServiceRedirect() {
  const location = useLocation();
  return <Navigate to={legacyServicePath(location.pathname, location.search) ?? '/palvelu'} replace />;
}
