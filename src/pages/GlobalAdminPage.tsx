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

function normalizeCustomerName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

type DuplicateCustomerRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  created_at: string;
  equipmentCount: number;
  workReportCount: number;
  maintenanceReportCount: number;
};

type DuplicateCustomerGroup = {
  key: string;
  normalizedName: string;
  ownerCompanyId: string;
  ownerCompanyName: string;
  customers: DuplicateCustomerRow[];
};

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
  const [duplicateOwnerId, setDuplicateOwnerId] = useState('');
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateCustomerGroup[]>([]);
  const [duplicateTargets, setDuplicateTargets] = useState<Record<string, string>>({});
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
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

  function pickDefaultDuplicateTarget(customers: DuplicateCustomerRow[]) {
    return [...customers].sort((a, b) => {
      const scoreA = a.equipmentCount + a.workReportCount + a.maintenanceReportCount;
      const scoreB = b.equipmentCount + b.workReportCount + b.maintenanceReportCount;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.created_at.localeCompare(b.created_at);
    })[0]?.id ?? customers[0]?.id ?? '';
  }

  async function loadDuplicateCustomers() {
    if (!duplicateOwnerId) {
      setDuplicateError('Valitse yritys.');
      return;
    }

    setDuplicateBusy(true);
    setDuplicateError(null);
    setDuplicateMessage(null);

    const { data: customerRows, error: customerError } = await supabase
      .from('customers')
      .select('id, name, address, city, owner_company_id, created_at')
      .eq('owner_company_id', duplicateOwnerId)
      .order('name');

    if (customerError) {
      setDuplicateError(customerError.message);
      setDuplicateGroups([]);
      setDuplicateBusy(false);
      return;
    }

    const customers = (customerRows ?? []) as Array<{
      id: string;
      name: string;
      address: string | null;
      city: string | null;
      owner_company_id: string;
      created_at: string;
    }>;

    const customerIds = customers.map((row) => row.id);
    const countsByCustomer = new Map<string, { equipment: number; work: number; maintenance: number }>();
    for (const id of customerIds) {
      countsByCustomer.set(id, { equipment: 0, work: 0, maintenance: 0 });
    }

    if (customerIds.length > 0) {
      const [equipmentCounts, workCounts, maintenanceCounts] = await Promise.all([
        supabase.from('equipment').select('customer_id').in('customer_id', customerIds),
        supabase.from('work_reports').select('customer_id').in('customer_id', customerIds),
        supabase.from('maintenance_reports').select('customer_id').in('customer_id', customerIds),
      ]);

      for (const row of equipmentCounts.data ?? []) {
        const customerId = (row as { customer_id: string }).customer_id;
        const entry = countsByCustomer.get(customerId);
        if (entry) entry.equipment += 1;
      }
      for (const row of workCounts.data ?? []) {
        const customerId = (row as { customer_id: string | null }).customer_id;
        if (!customerId) continue;
        const entry = countsByCustomer.get(customerId);
        if (entry) entry.work += 1;
      }
      for (const row of maintenanceCounts.data ?? []) {
        const customerId = (row as { customer_id: string | null }).customer_id;
        if (!customerId) continue;
        const entry = countsByCustomer.get(customerId);
        if (entry) entry.maintenance += 1;
      }
    }

    const grouped = new Map<string, DuplicateCustomerGroup>();
    const ownerCompanyName = companies.find((company) => company.id === duplicateOwnerId)?.name ?? '—';

    for (const row of customers) {
      const normalizedName = normalizeCustomerName(row.name);
      const key = `${row.owner_company_id}:${normalizedName}`;
      const countsForCustomer = countsByCustomer.get(row.id) ?? { equipment: 0, work: 0, maintenance: 0 };
      const duplicateRow: DuplicateCustomerRow = {
        id: row.id,
        name: row.name,
        address: row.address,
        city: row.city,
        created_at: row.created_at,
        equipmentCount: countsForCustomer.equipment,
        workReportCount: countsForCustomer.work,
        maintenanceReportCount: countsForCustomer.maintenance,
      };

      const existing = grouped.get(key);
      if (existing) {
        existing.customers.push(duplicateRow);
      } else {
        grouped.set(key, {
          key,
          normalizedName,
          ownerCompanyId: row.owner_company_id,
          ownerCompanyName,
          customers: [duplicateRow],
        });
      }
    }

    const duplicates = [...grouped.values()]
      .filter((group) => group.customers.length > 1)
      .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName, 'fi'));

    const defaultTargets: Record<string, string> = {};
    for (const group of duplicates) {
      defaultTargets[group.key] = pickDefaultDuplicateTarget(group.customers);
    }

    setDuplicateGroups(duplicates);
    setDuplicateTargets(defaultTargets);
    setDuplicateMessage(duplicates.length > 0
      ? `Löytyi ${duplicates.length} saman nimistä ryhmää.`
      : 'Ei saman nimisiä duplikaatteja valitulla yrityksellä.');
    setDuplicateBusy(false);
  }

  async function mergeDuplicateGroup(group: DuplicateCustomerGroup) {
    const targetId = duplicateTargets[group.key];
    if (!targetId) {
      setDuplicateError('Valitse säilytettävä asiakas.');
      return;
    }

    const sourceIds = group.customers.map((customer) => customer.id).filter((id) => id !== targetId);
    if (sourceIds.length === 0) {
      setDuplicateError('Valitse vähintään kaksi eri asiakasta yhdistettäväksi.');
      return;
    }

    const targetName = group.customers.find((customer) => customer.id === targetId)?.name ?? 'asiakas';
    if (!window.confirm(
      `Yhdistetään ${sourceIds.length} asiakasta kohteeseen "${targetName}"? `
      + 'Laitteet, raportit ja dokumentit siirretään. Tätä ei voi perua.',
    )) {
      return;
    }

    setDuplicateBusy(true);
    setDuplicateError(null);
    setDuplicateMessage(null);

    const { data, error: mergeError } = await supabase.rpc('global_admin_merge_customers', {
      p_target_customer_id: targetId,
      p_source_customer_ids: sourceIds,
    });

    if (mergeError) {
      setDuplicateError(mergeError.message);
      setDuplicateBusy(false);
      return;
    }

    const result = data as {
      merged_count?: number;
      equipment_moved?: number;
      work_reports_moved?: number;
      maintenance_reports_moved?: number;
    } | null;

    setDuplicateMessage(
      `Yhdistetty ${result?.merged_count ?? sourceIds.length} asiakasta. `
      + `Siirretty: ${result?.equipment_moved ?? 0} laitetta, `
      + `${result?.work_reports_moved ?? 0} työraporttia, `
      + `${result?.maintenance_reports_moved ?? 0} huoltoraporttia.`,
    );
    await Promise.all([loadMeta(), loadDuplicateCustomers()]);
  }

  async function deleteDuplicateCustomer(customer: DuplicateCustomerRow, groupName: string) {
    const warning = customer.equipmentCount > 0
      ? `Asiakkaalla on ${customer.equipmentCount} laitetta, jotka poistetaan samalla. `
      : '';
    if (!window.confirm(`${warning}Poistetaanko asiakas "${groupName}" pysyvästi? Tätä toimintoa ei voi perua.`)) {
      return;
    }

    setDuplicateBusy(true);
    setDuplicateError(null);
    setDuplicateMessage(null);

    const { error: deleteError } = await supabase.from('customers').delete().eq('id', customer.id);
    if (deleteError) {
      setDuplicateError(deleteError.message);
      setDuplicateBusy(false);
      return;
    }

    setDuplicateMessage(`Asiakas "${customer.name}" poistettu.`);
    await Promise.all([loadMeta(), loadDuplicateCustomers()]);
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

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Asiakkaiden duplikaatit</h2>
        <p className="muted global-admin-hint">
          Etsi saman nimiset asiakkaat yrityksen rekisteristä. Voit yhdistää ne yhdeksi tai poistaa turhat rivit.
          Poisto ja yhdistäminen on saatavilla myös asiakkaan tiedoissa.
        </p>

        <div className="line-form-grid">
          <label>
            Yritys
            <select value={duplicateOwnerId} onChange={(e) => setDuplicateOwnerId(e.target.value)}>
              <option value="">—</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </label>
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={duplicateBusy || !duplicateOwnerId}
              onClick={() => void loadDuplicateCustomers()}
            >
              {duplicateBusy ? 'Haetaan…' : 'Etsi duplikaatit'}
            </button>
          </div>
        </div>

        {duplicateMessage && <p className="success">{duplicateMessage}</p>}
        {duplicateError && <p className="error">{duplicateError}</p>}

        {duplicateGroups.length > 0 && (
          <div className="global-admin-duplicate-groups">
            {duplicateGroups.map((group) => (
              <article key={group.key} className="panel global-admin-duplicate-group">
                <div className="global-admin-duplicate-group-head">
                  <div>
                    <h3>{group.customers[0]?.name ?? group.normalizedName}</h3>
                    <p className="muted">
                      {group.ownerCompanyName} • {group.customers.length} kpl
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={duplicateBusy}
                    onClick={() => void mergeDuplicateGroup(group)}
                  >
                    Yhdistä valitut
                  </button>
                </div>

                <div className="table-wrap">
                  <table className="data-table global-admin-entity-table">
                    <thead>
                      <tr>
                        <th>Säilytä</th>
                        <th>Nimi</th>
                        <th>Osoite</th>
                        <th>Laitteet</th>
                        <th>Raportit</th>
                        <th>UUID</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {group.customers.map((customer) => (
                        <tr key={customer.id}>
                          <td className="select-col">
                            <input
                              type="radio"
                              name={`duplicate-target-${group.key}`}
                              checked={duplicateTargets[group.key] === customer.id}
                              onChange={() => setDuplicateTargets((current) => ({
                                ...current,
                                [group.key]: customer.id,
                              }))}
                              aria-label={`Säilytä ${customer.name}`}
                            />
                          </td>
                          <td>{customer.name}</td>
                          <td>{[customer.address, customer.city].filter(Boolean).join(', ') || '—'}</td>
                          <td>{customer.equipmentCount}</td>
                          <td>{customer.workReportCount + customer.maintenanceReportCount}</td>
                          <td className="uuid-cell">{customer.id}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              disabled={duplicateBusy}
                              onClick={() => void deleteDuplicateCustomer(customer, customer.name)}
                            >
                              Poista
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
