import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { supabase } from '../lib/supabase';
import {
  INSTALLATION_PLAN_STATUS_LABELS,
  normalizeInstallationPlanData,
  resolveInstallationPlanDisplayTitle,
} from '../lib/installationPlan/defaults';
import type { InstallationPlanRow } from '../lib/installationPlan/types';
import { useProfile } from '../hooks/useProfile';

interface Props {
  session: Session;
}

function planSearchText(row: InstallationPlanRow): string {
  const data = normalizeInstallationPlanData(row.data);
  return [
    row.title,
    row.customers?.name,
    data.propertyName,
    data.units,
    data.installationType,
    data.notes,
    ...data.sections.map((section) => `${section.title} ${section.body}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export default function InstallationPlansPage({ session }: Props) {
  const { profile } = useProfile(session);
  const [rows, setRows] = useState<InstallationPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void loadRows();
  }, [session.user.id]);

  async function loadRows() {
    setLoading(true);
    const { data, error } = await supabase
      .from('installation_plans')
      .select(`
        id, title, status, data, updated_at, created_at,
        customer_id, equipment_id, owner_company_id, branding_company_id, created_by_company_id,
        customers(name, address, city),
        equipment(name, tag),
        owner_company:companies!installation_plans_owner_company_id_fkey(name),
        branding_company:companies!installation_plans_branding_company_id_fkey(name),
        created_by_company:companies!installation_plans_created_by_company_id_fkey(name)
      `)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error(error);
      setRows([]);
    } else {
      setRows((data as unknown as InstallationPlanRow[]) ?? []);
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => planSearchText(row).includes(query));
  }, [rows, search]);

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/tarjouspyynnot">Tarjouspyyntö</Link> /{' '}
            <Link to="/asennus-suunnittelu">Asennus suunnittelu</Link> / Lista
          </p>
          <h1>Tallennetut asennus suunnitelmat</h1>
          <p className="muted">{profile?.companies?.name ?? '—'} • taloyhtiöselosteet</p>
        </div>
        <div className="page-header-actions">
          <Link to="/asennus-suunnittelu/uusi" className="btn btn-primary">
            + Uusi suunnitelma
          </Link>
        </div>
      </div>

      <div className="toolbar">
        <label className="search-field-grow">
          Hae suunnitelmia
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Taloyhtiö, huoneisto, asiakas, sisältö…"
          />
        </label>
      </div>

      {loading ? (
        <p className="muted">Ladataan…</p>
      ) : filtered.length === 0 ? (
        <p className="muted">Ei suunnitelmia.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Otsikko</th>
                <th>Asiakas</th>
                <th>Tila</th>
                <th>Päivitetty</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const data = normalizeInstallationPlanData(row.data);
                return (
                  <tr key={row.id}>
                    <td>
                      <strong>{resolveInstallationPlanDisplayTitle(data, row.customers?.name)}</strong>
                      {data.units.trim() ? <div className="muted">{data.units}</div> : null}
                    </td>
                    <td>{row.customers?.name ?? '—'}</td>
                    <td>{INSTALLATION_PLAN_STATUS_LABELS[row.status] ?? row.status}</td>
                    <td>{new Date(row.updated_at).toLocaleString('fi-FI')}</td>
                    <td className="table-actions">
                      <Link to={`/asennus-suunnittelu/${row.id}`} className="btn btn-secondary btn-sm">
                        Avaa
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
