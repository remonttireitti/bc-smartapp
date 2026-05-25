import { FormEvent, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Company, Profile } from '../types';

type Context = { profile: Profile; session: Session };

type EntityType = 'work_reports' | 'maintenance_reports' | 'customers' | 'quote_requests';

const ENTITY_LABELS: Record<EntityType, string> = {
  work_reports: 'Työraportit',
  maintenance_reports: 'Huoltoraportit',
  customers: 'Asiakkaat',
  quote_requests: 'Tarjouspyynnöt',
};

const ENTITY_SELECT: Record<EntityType, string> = {
  work_reports: 'id, title, customers(name)',
  maintenance_reports: 'id, customers(name), equipment(name, tag)',
  customers: 'id, name',
  quote_requests: 'id, title, customers(name)',
};

const DETAIL_HEADERS: Record<EntityType, string | null> = {
  work_reports: 'Tehtävä',
  maintenance_reports: 'Laite',
  customers: null,
  quote_requests: 'Otsikko',
};

type EntityPreviewRow = {
  id: string;
  customerLabel: string;
  detailLabel: string;
};

function formatEquipmentLabel(equipment: { name?: string | null; tag?: string | null } | null | undefined) {
  if (!equipment) return '—';
  return [equipment.tag, equipment.name].filter(Boolean).join(' · ') || '—';
}

function formatEntityRow(entityType: EntityType, row: Record<string, unknown>): EntityPreviewRow {
  const id = String(row.id);

  switch (entityType) {
    case 'work_reports':
      return {
        id,
        customerLabel: (row.customers as { name?: string } | null)?.name ?? '—',
        detailLabel: (row.title as string | null) ?? '—',
      };
    case 'maintenance_reports':
      return {
        id,
        customerLabel: (row.customers as { name?: string } | null)?.name ?? '—',
        detailLabel: formatEquipmentLabel(row.equipment as { name?: string | null; tag?: string | null } | null),
      };
    case 'customers':
      return {
        id,
        customerLabel: (row.name as string | null) ?? '—',
        detailLabel: '—',
      };
    case 'quote_requests':
      return {
        id,
        customerLabel: (row.customers as { name?: string } | null)?.name ?? '—',
        detailLabel: (row.title as string | null) ?? '—',
      };
  }
}

function parseIds(text: string) {
  return [...new Set(
    text
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  )];
}

export default function GlobalAdminPage() {
  const { profile } = useOutletContext<Context>();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [entityType, setEntityType] = useState<EntityType>('work_reports');
  const [filterOwnerId, setFilterOwnerId] = useState('');
  const [ownerCompanyId, setOwnerCompanyId] = useState('');
  const [createdByCompanyId, setCreatedByCompanyId] = useState('');
  const [brandingCompanyId, setBrandingCompanyId] = useState('');
  const [createdByUserId, setCreatedByUserId] = useState('');
  const [idsText, setIdsText] = useState('');
  const [entityRows, setEntityRows] = useState<EntityPreviewRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const selectAllRef = useRef<HTMLInputElement>(null);

  const selectedCount = selectedIds.size;
  const allSelected = entityRows.length > 0 && selectedCount === entityRows.length;
  const someSelected = selectedCount > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected, entityRows.length]);

  useEffect(() => {
    if (!profile?.is_global_admin) return;
    void loadMeta();
  }, [profile?.is_global_admin]);

  async function loadMeta() {
    const [{ data: companyRows }, { data: userRows }] = await Promise.all([
      supabase.from('companies').select('id, name, slug').order('name'),
      supabase.from('profiles').select('id, display_name, email, role, company_id').order('email'),
    ]);
    setCompanies((companyRows as Company[]) ?? []);
    setUsers((userRows as Profile[]) ?? []);

    const countEntries = await Promise.all(
      (companyRows ?? []).map(async (company) => {
        const id = company.id as string;
        const [wr, mr, cu, qr] = await Promise.all([
          supabase.from('work_reports').select('id', { count: 'exact', head: true }).eq('owner_company_id', id),
          supabase.from('maintenance_reports').select('id', { count: 'exact', head: true }).eq('owner_company_id', id),
          supabase.from('customers').select('id', { count: 'exact', head: true }).eq('owner_company_id', id),
          supabase.from('quote_requests').select('id', { count: 'exact', head: true }).eq('owner_company_id', id),
        ]);
        return [id, (wr.count ?? 0) + (mr.count ?? 0) + (cu.count ?? 0) + (qr.count ?? 0)] as const;
      }),
    );
    setCounts(Object.fromEntries(countEntries));
  }

  async function loadEntityRows(ids?: string[]) {
    const select = ENTITY_SELECT[entityType];
    let query = supabase.from(entityType).select(select).limit(500);

    if (ids?.length) {
      query = query.in('id', ids);
    } else if (filterOwnerId) {
      query = query.eq('owner_company_id', filterOwnerId);
    } else {
      setError('Valitse omistaja tai liitä UUID:t.');
      return 0;
    }

    const { data, error: loadError } = await query;
    if (loadError) {
      setError(loadError.message);
      return 0;
    }

    const rows = (data ?? []).map((row) => formatEntityRow(entityType, row as unknown as Record<string, unknown>));
    setEntityRows(rows);
    setSelectedIds(new Set(rows.map((row) => row.id)));
    setIdsText(rows.map((row) => row.id).join('\n'));
    return rows.length;
  }

  function setAllSelected(checked: boolean) {
    setSelectedIds(checked ? new Set(entityRows.map((row) => row.id)) : new Set());
  }

  function toggleRowSelected(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const ids = entityRows.length > 0
      ? entityRows.filter((row) => selectedIds.has(row.id)).map((row) => row.id)
      : parseIds(idsText);

    if (ids.length === 0) {
      setError(entityRows.length > 0 ? 'Valitse vähintään yksi rivi.' : 'Anna vähintään yksi UUID.');
      setBusy(false);
      return;
    }

    const { data, error: rpcError } = await supabase.rpc('global_admin_reassign_entities', {
      p_entity_type: entityType,
      p_ids: ids,
      p_owner_company_id: ownerCompanyId || null,
      p_created_by_company_id: createdByCompanyId || null,
      p_branding_company_id: brandingCompanyId || null,
      p_created_by_user_id: createdByUserId || null,
      p_assigned_user_id: null,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setMessage(`Päivitetty ${data ?? 0} rivi(ä).`);
      setIdsText('');
      setEntityRows([]);
      setSelectedIds(new Set());
      await loadMeta();
    }
    setBusy(false);
  }

  async function loadIdsForFilter() {
    if (!filterOwnerId) return;
    setBusy(true);
    setError(null);
    const count = await loadEntityRows();
    if (count > 0) {
      setMessage(`Haettu ${count} rivi(ä).`);
    }
    setBusy(false);
  }

  async function loadRowsFromText() {
    const ids = parseIds(idsText);
    if (ids.length === 0) {
      setError('Anna vähintään yksi UUID.');
      return;
    }
    setBusy(true);
    setError(null);
    const count = await loadEntityRows(ids);
    if (count > 0) {
      setMessage(`Haettu ${count} / ${ids.length} rivi(ä).`);
    }
    setBusy(false);
  }

  if (!profile) {
    return <p className="muted">Ladataan…</p>;
  }

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Omistajuuden ja raportointitahon massamuokkaus
      </p>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Yrityskohtaiset rivimäärät</h2>
        <ul>
          {companies.map((company) => (
            <li key={company.id}>
              {company.name}: {counts[company.id] ?? 0} riviä yhteensä
            </li>
          ))}
        </ul>
        <p className="muted">
          Tuontikorjaus Firestore-raportointitiedon mukaan: <code>node scripts/fix-import-ownership.mjs --apply --production</code>
        </p>
      </section>

      <form className="card line-form-grid" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Kohdetyyppi
          <select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value as EntityType);
              setEntityRows([]);
              setSelectedIds(new Set());
              setIdsText('');
            }}
          >
            {(Object.keys(ENTITY_LABELS) as EntityType[]).map((key) => (
              <option key={key} value={key}>{ENTITY_LABELS[key]}</option>
            ))}
          </select>
        </label>

        <label>
          Suodata nykyinen omistaja
          <select value={filterOwnerId} onChange={(e) => setFilterOwnerId(e.target.value)}>
            <option value="">—</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </label>

        <div>
          <button type="button" className="btn btn-secondary" disabled={busy || !filterOwnerId} onClick={() => void loadIdsForFilter()}>
            Hae rivit
          </button>
        </div>

        <label style={{ gridColumn: '1 / -1' }}>
          UUID:t (yksi per rivi, valinnainen)
          <textarea
            rows={4}
            value={idsText}
            onChange={(e) => {
              setIdsText(e.target.value);
              setEntityRows([]);
              setSelectedIds(new Set());
            }}
            placeholder="Liitä UUID:t tai hae omistajan mukaan yllä"
          />
        </label>

        <div style={{ gridColumn: '1 / -1' }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !idsText.trim()}
            onClick={() => void loadRowsFromText()}
          >
            Näytä rivitiedot
          </button>
        </div>

        {entityRows.length > 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="global-admin-selection-bar">
              <span className="muted">Valittu {selectedCount} / {entityRows.length}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAllSelected(true)}>
                Valitse kaikki
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAllSelected(false)}>
                Tyhjennä valinnat
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table global-admin-entity-table">
                <thead>
                  <tr>
                    <th className="select-col">
                      <label className="global-admin-select-all">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => setAllSelected(e.target.checked)}
                          aria-label="Valitse kaikki"
                        />
                      </label>
                    </th>
                    <th>Asiakas</th>
                    {DETAIL_HEADERS[entityType] && <th>{DETAIL_HEADERS[entityType]}</th>}
                    <th>UUID</th>
                  </tr>
                </thead>
                <tbody>
                  {entityRows.map((row) => {
                    const checked = selectedIds.has(row.id);
                    return (
                      <tr key={row.id} className={checked ? undefined : 'global-admin-row-unselected'}>
                        <td className="select-col">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleRowSelected(row.id, e.target.checked)}
                            aria-label={`Valitse ${row.customerLabel}`}
                          />
                        </td>
                        <td>{row.customerLabel}</td>
                        {DETAIL_HEADERS[entityType] && <td>{row.detailLabel}</td>}
                        <td className="uuid-cell">{row.id}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <label>
          Omistava yritys
          <select value={ownerCompanyId} onChange={(e) => setOwnerCompanyId(e.target.value)}>
            <option value="">Ei muutosta</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </label>

        <label>
          Laatinut yritys
          <select value={createdByCompanyId} onChange={(e) => setCreatedByCompanyId(e.target.value)}>
            <option value="">Ei muutosta</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </label>

        <label>
          Raportointitaho / logo
          <select value={brandingCompanyId} onChange={(e) => setBrandingCompanyId(e.target.value)}>
            <option value="">Ei muutosta</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </label>

        <label>
          Laatija (käyttäjä)
          <select value={createdByUserId} onChange={(e) => setCreatedByUserId(e.target.value)}>
            <option value="">Ei muutosta</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.email ?? user.display_name}</option>
            ))}
          </select>
        </label>

        <div style={{ gridColumn: '1 / -1' }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || (entityRows.length > 0 && selectedCount === 0)}
          >
            {busy ? 'Tallennetaan…' : `Päivitä valitut${entityRows.length > 0 ? ` (${selectedCount})` : ''}`}
          </button>
        </div>
      </form>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
    </>
  );
}
