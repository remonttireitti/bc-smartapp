import { useOutletContext } from 'react-router-dom';
import { HubTileGrid } from '../components/HubTile';
import { useGlobalAdminMode } from '../hooks/useGlobalAdminMode';
import { buildHallintaGroups } from '../lib/hallintaNav';
import type { ManagementOutletContext } from '../lib/managementOutletContext';

/** /hallinta: ruudut ryhmittäin (Oma käyttäjä, Yritys, Globaali admin). */
export default function HallintaHubPage() {
  const { profile, billingModuleEnabled, partnershipsEnabled } = useOutletContext<ManagementOutletContext>();
  const { globalAdminMode } = useGlobalAdminMode();
  const groups = buildHallintaGroups({
    role: profile.role,
    isGlobalAdmin: !!profile.is_global_admin,
    globalAdminMode,
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
