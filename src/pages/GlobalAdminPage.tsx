import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ManagementOutletContext } from '../lib/managementOutletContext';
import GlobalAdminCompaniesSection from './globalAdmin/GlobalAdminCompaniesSection';
import GlobalAdminLicensesSection from './globalAdmin/GlobalAdminLicensesSection';
import GlobalAdminRegistrySection from './globalAdmin/GlobalAdminRegistrySection';
import GlobalAdminOperationsSection from './globalAdmin/GlobalAdminOperationsSection';
import { GLOBAL_ADMIN_SECTIONS, type GlobalAdminSectionId } from './globalAdmin/types';
import { useGlobalAdminMeta } from './globalAdmin/useGlobalAdminMeta';

export default function GlobalAdminPage() {
  const { profile } = useOutletContext<ManagementOutletContext>();
  const [section, setSection] = useState<GlobalAdminSectionId>('companies');
  const {
    companies,
    setCompanies,
    users,
    counts,
    loading,
    loadMeta,
    refresh,
  } = useGlobalAdminMeta(!!profile?.is_global_admin);

  if (!profile) {
    return <p className="muted">Ladataan…</p>;
  }

  const activeMeta = GLOBAL_ADMIN_SECTIONS.find((item) => item.id === section);

  return (
    <div className="global-admin-page">
      <header className="global-admin-page-head">
        <p className="muted" style={{ margin: 0 }}>
          Globaali hallinta — valitse osio
        </p>
      </header>

      <nav className="global-admin-nav" role="tablist" aria-label="Globaali admin -osiot">
        {GLOBAL_ADMIN_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            className={section === item.id ? 'global-admin-nav-btn active' : 'global-admin-nav-btn'}
            onClick={() => setSection(item.id)}
          >
            <span className="global-admin-nav-label">{item.label}</span>
            <span className="global-admin-nav-desc">{item.description}</span>
          </button>
        ))}
      </nav>

      {activeMeta && (
        <p className="muted global-admin-section-intro">{activeMeta.description}</p>
      )}

      {loading ? (
        <p className="muted">Ladataan yrityslistaa…</p>
      ) : (
        <div className="global-admin-section" role="tabpanel">
          {section === 'companies' && (
            <GlobalAdminCompaniesSection
              companies={companies}
              counts={counts}
              onRefresh={loadMeta}
            />
          )}
          {section === 'licenses' && (
            <GlobalAdminLicensesSection
              companies={companies}
              onCompaniesChange={setCompanies}
              onRefresh={refresh}
            />
          )}
          {section === 'registry' && (
            <GlobalAdminRegistrySection
              companies={companies}
              users={users}
              onRefresh={refresh}
            />
          )}
          {section === 'operations' && <GlobalAdminOperationsSection companies={companies} />}
        </div>
      )}
    </div>
  );
}
