import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import IconButton from '../components/IconButton';
import ToggleSwitch from '../components/ToggleSwitch';
import { IconTrash } from '../components/icons';
import { useGlobalAdminMode } from '../hooks/useGlobalAdminMode';
import {
  deleteCompanyUser,
  fetchCompanyUserDeletionImpact,
  type CompanyUserDeletionImpact,
} from '../lib/deleteCompanyUser';
import { inviteCompanyUser } from '../lib/inviteUser';
import { supabase } from '../lib/supabase';
import type { Company } from '../types';
import { companyBillingModuleEnabled, parseCompanySettings, ROLE_LABELS } from '../lib/management';
import type { ManagementOutletContext } from '../lib/managementOutletContext';

const STAFF_ROLES = ['admin', 'technician', 'manager'] as const;
const STAFF_INVITE_ROLES = [
  { value: 'admin', label: 'Ylläpitäjä (kaikki oikeudet)' },
  { value: 'technician', label: 'Asentaja' },
  { value: 'manager', label: 'Esimies' },
] as const;

type CompanyUser = {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string;
  company_id: string | null;
  bill_hours_enabled: boolean;
  bill_expenses_enabled: boolean;
  companies: { name: string } | null;
};

type DeleteMode = 'keep_name' | 'transfer';
type UserDraft = { display_name: string; company_id: string };

function userLabel(user: Pick<CompanyUser, 'display_name' | 'email' | 'id'>) {
  return user.display_name?.trim() || user.email?.trim() || user.id;
}

export default function UsersPage() {
  const { profile, billingModuleEnabled } = useOutletContext<ManagementOutletContext>();
  const { globalAdminMode } = useGlobalAdminMode();
  const isGlobalAdmin = !!profile.is_global_admin;
  const gbaActive = isGlobalAdmin && globalAdminMode;
  const canDeleteUsers = gbaActive;
  const canEditAllCompanies = gbaActive;
  const canEditNames = profile.role === 'admin' || gbaActive;

  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [saveBusyId, setSaveBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState({
    email: '',
    password: 'test123456',
    display_name: '',
    role: 'technician',
    company_id: '',
  });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompanyUser | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<CompanyUserDeletionImpact | null>(null);
  const [deleteMode, setDeleteMode] = useState<DeleteMode>('keep_name');
  const [transferToUserId, setTransferToUserId] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [impactBusy, setImpactBusy] = useState(false);

  useEffect(() => {
    if (profile.company_id) void loadUsers();
  }, [profile.company_id, gbaActive]);

  useEffect(() => {
    if (!gbaActive) return;
    void loadCompanies();
  }, [gbaActive]);

  useEffect(() => {
    if (profile.company_id && !invite.company_id) {
      setInvite((current) => ({ ...current, company_id: profile.company_id ?? '' }));
    }
  }, [profile.company_id, invite.company_id]);

  async function loadCompanies() {
    const { data } = await supabase.from('companies').select('id, name, slug, settings').order('name');
    setCompanies((data as Company[]) ?? []);
  }

  function userBillingSettingsVisible(user: CompanyUser): boolean {
    const companyId = user.company_id ?? profile.company_id;
    if (!companyId) return false;
    if (!gbaActive) return billingModuleEnabled !== false;
    const company = companies.find((row) => row.id === companyId);
    return companyBillingModuleEnabled(parseCompanySettings(company?.settings));
  }

  async function loadUsers() {
    let query = supabase
      .from('profiles')
      .select(
        'id, display_name, email, role, company_id, bill_hours_enabled, bill_expenses_enabled, companies(name)',
      )
      .in('role', [...STAFF_ROLES]);

    if (!gbaActive) {
      query = query.eq('company_id', profile.company_id!);
    }

    const { data, error: loadError } = await query.order('display_name');
    if (loadError) {
      setError(loadError.message);
      return;
    }

    const rows = ((data ?? []) as unknown as Array<Omit<CompanyUser, 'companies'> & { companies: { name: string } | { name: string }[] | null }>)
      .map((row) => ({
        ...row,
        companies: Array.isArray(row.companies) ? row.companies[0] ?? null : row.companies,
      }))
      .slice()
      .sort((a, b) => {
      const companyA = a.companies?.name ?? '';
      const companyB = b.companies?.name ?? '';
      if (companyA !== companyB) return companyA.localeCompare(companyB, 'fi');
      return userLabel(a).localeCompare(userLabel(b), 'fi');
    });

    setUsers(rows);
    setDrafts(
      Object.fromEntries(
        rows.map((user) => [
          user.id,
          {
            display_name: user.display_name ?? '',
            company_id: user.company_id ?? '',
          },
        ]),
      ),
    );
  }

  const visibleUsers = useMemo(() => {
    if (!companyFilter) return users;
    return users.filter((user) => user.company_id === companyFilter);
  }, [users, companyFilter]);

  function updateDraft(userId: string, patch: Partial<UserDraft>) {
    setDrafts((current) => ({
      ...current,
      [userId]: { ...current[userId], ...patch },
    }));
  }

  function draftDirty(user: CompanyUser) {
    const draft = drafts[user.id];
    if (!draft) return false;
    return (
      draft.display_name.trim() !== (user.display_name ?? '').trim()
      || (canEditAllCompanies && draft.company_id !== (user.company_id ?? ''))
    );
  }

  async function saveUserProfile(user: CompanyUser) {
    const draft = drafts[user.id];
    if (!draft || !draftDirty(user)) return;

    setSaveBusyId(user.id);
    setError(null);
    setMessage(null);

    const patch: Record<string, unknown> = {
      display_name: draft.display_name.trim() || null,
    };

    if (canEditAllCompanies && draft.company_id) {
      patch.company_id = draft.company_id;
    }

    const { error: updateError } = await supabase.from('profiles').update(patch).eq('id', user.id);
    setSaveBusyId(null);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage(`Tiedot päivitetty: ${draft.display_name.trim() || user.email || user.id}`);
    await loadUsers();
  }

  async function updateRole(userId: string, role: string) {
    setError(null);
    setMessage(null);

    const { error: updateError } = await supabase.from('profiles').update({ role }).eq('id', userId);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage('Rooli päivitetty.');
    await loadUsers();
  }

  async function updateBillingFlag(
    userId: string,
    field: 'bill_hours_enabled' | 'bill_expenses_enabled',
    value: boolean,
  ) {
    setError(null);
    setMessage(null);

    const { error: updateError } = await supabase.from('profiles').update({ [field]: value }).eq('id', userId);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage('Laskutusasetus päivitetty.');
    await loadUsers();
  }

  async function inviteUser(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      await inviteCompanyUser({
        email: invite.email.trim(),
        password: invite.password,
        display_name: invite.display_name.trim() || invite.email.split('@')[0],
        role: invite.role,
        company_id: gbaActive ? invite.company_id || profile.company_id : profile.company_id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Käyttäjän luonti epäonnistui');
      return;
    } finally {
      setBusy(false);
    }

    setMessage(
      `Käyttäjä ${invite.email} luotu. Kirjautuminen: ${invite.email} / ${invite.password}. Käyttäjän täytyy vaihtaa salasana ensimmäisellä kerralla.`,
    );
    setInvite({
      email: '',
      password: 'test123456',
      display_name: '',
      role: 'technician',
      company_id: gbaActive ? invite.company_id : profile.company_id ?? '',
    });
    await loadUsers();
  }

  async function openDeleteDialog(user: CompanyUser) {
    setDeleteTarget(user);
    setDeleteMode('keep_name');
    setTransferToUserId('');
    setDeleteImpact(null);
    setError(null);
    setImpactBusy(true);

    try {
      const impact = await fetchCompanyUserDeletionImpact(user.id);
      setDeleteImpact(impact);
      const fallbackTransfer = users.find(
        (candidate) => candidate.id !== user.id && candidate.company_id === user.company_id,
      );
      setTransferToUserId(fallbackTransfer?.id ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Käyttäjän tarkistus epäonnistui');
      setDeleteTarget(null);
    } finally {
      setImpactBusy(false);
    }
  }

  function closeDeleteDialog() {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeleteImpact(null);
  }

  async function confirmDeleteUser() {
    if (!deleteTarget) return;
    if (deleteMode === 'transfer' && !transferToUserId) {
      setError('Valitse käyttäjä, jolle raportit siirretään.');
      return;
    }

    const label = userLabel(deleteTarget);
    const transferLabel = userLabel(
      users.find((user) => user.id === transferToUserId) ?? { display_name: null, email: null, id: '' },
    );
    const confirmText =
      deleteMode === 'transfer'
        ? `Poistetaanko käyttäjä ${label} ja siirretäänkö hänen raporttinsa käyttäjälle ${transferLabel}?`
        : `Poistetaanko käyttäjä ${label}? Raporttien nimet säilyvät merkinnällä poistettu käyttäjä (*).`;

    if (!window.confirm(confirmText)) return;

    setDeleteBusy(true);
    setError(null);
    setMessage(null);

    try {
      await deleteCompanyUser({
        user_id: deleteTarget.id,
        company_id: deleteTarget.company_id ?? profile.company_id,
        transfer_to_user_id: deleteMode === 'transfer' ? transferToUserId : null,
      });
      setMessage(`Käyttäjä ${label} poistettu.`);
      closeDeleteDialog();
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Käyttäjän poisto epäonnistui');
    } finally {
      setDeleteBusy(false);
    }
  }

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const transferCandidates = users.filter(
    (user) => user.id !== deleteTarget?.id && user.company_id === deleteTarget?.company_id,
  );

  return (
    <>
      <section className="panel">
        <h2>Käyttäjät</h2>
        <p className="muted">
          Yrityksen sisäiset käyttäjät (asentajat, ylläpitäjät). Asiakas- ja tilaajaportaalit hallitaan{' '}
          <Link to="/asiakkaat">asiakaskorteilta</Link> ja <Link to="/hallinta/tilaajat">tilaajarekisteristä</Link>.
        </p>
        {isGlobalAdmin && !globalAdminMode && (
          <p className="muted global-admin-hint">
            GBA-toiminnot (kaikki yritykset, nimen ja yrityksen muokkaus, poisto): ota yllä oleva{' '}
            <strong>Globaali admin (GBA)</strong> -kytkin päälle.
          </p>
        )}
        {gbaActive && (
          <p className="muted global-admin-hint">
            GBA päällä — näet kaikki yritykset. Voit korjata käyttäjän nimen ja yrityksen suoraan listasta.
          </p>
        )}

        {gbaActive && companies.length > 0 && (
          <label className="user-company-filter">
            Rajaa yrityksellä
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
              <option value="">Kaikki yritykset</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {visibleUsers.length === 0 ? (
          <p className="muted">Ei käyttäjiä.</p>
        ) : (
          <ul className="user-card-list">
            {visibleUsers.map((u) => {
              const draft = drafts[u.id];
              const dirty = draftDirty(u);
              return (
                <li key={u.id} className="user-card">
                  <div className="user-card-main">
                    <div className="user-field-row">
                      <span className="user-field-label">Yritys</span>
                      {canEditAllCompanies ? (
                        <select
                          className="user-field-input"
                          value={draft?.company_id ?? u.company_id ?? ''}
                          onChange={(e) => updateDraft(u.id, { company_id: e.target.value })}
                        >
                          {companies.map((company) => (
                            <option key={company.id} value={company.id}>
                              {company.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <strong>{u.companies?.name ?? '—'}</strong>
                      )}
                    </div>
                    <div className="user-field-row">
                      <span className="user-field-label">Nimi</span>
                      {canEditNames ? (
                        <input
                          className="user-field-input"
                          value={draft?.display_name ?? u.display_name ?? ''}
                          placeholder={u.email?.split('@')[0] ?? 'Nimi'}
                          onChange={(e) => updateDraft(u.id, { display_name: e.target.value })}
                        />
                      ) : (
                        <strong>{userLabel(u)}</strong>
                      )}
                    </div>
                    <div className="user-field-row">
                      <span className="user-field-label">Sähköposti</span>
                      <span className="muted user-field-value">{u.email ?? '—'}</span>
                    </div>
                    {canEditNames && dirty && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm user-save-btn"
                        disabled={saveBusyId === u.id}
                        onClick={() => void saveUserProfile(u)}
                      >
                        {saveBusyId === u.id ? 'Tallennetaan…' : 'Tallenna nimi / yritys'}
                      </button>
                    )}
                  </div>

                  {userBillingSettingsVisible(u) && (
                    <div className="user-card-toggles">
                      <ToggleSwitch
                        label="Tunnit laskutukseen"
                        checked={u.bill_hours_enabled}
                        onChange={(value) => void updateBillingFlag(u.id, 'bill_hours_enabled', value)}
                      />
                      <ToggleSwitch
                        label="Kulut laskutukseen"
                        checked={u.bill_expenses_enabled}
                        onChange={(value) => void updateBillingFlag(u.id, 'bill_expenses_enabled', value)}
                      />
                    </div>
                  )}

                  <select
                    className="user-role-select"
                    value={u.role}
                    onChange={(e) => void updateRole(u.id, e.target.value)}
                    disabled={u.id === profile.id && u.role === 'admin' && adminCount <= 1}
                  >
                    {STAFF_ROLES.map((value) => (
                      <option key={value} value={value}>
                        {ROLE_LABELS[value]}
                      </option>
                    ))}
                  </select>

                  {canDeleteUsers && u.id !== profile.id && (
                    <div className="user-card-actions">
                      <IconButton
                        label="Poista käyttäjä"
                        variant="danger"
                        disabled={u.role === 'admin' && adminCount <= 1}
                        onClick={() => void openDeleteDialog(u)}
                      >
                        <IconTrash />
                      </IconButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {deleteTarget && (
        <section className="panel user-delete-panel">
          <h2>Poista käyttäjä</h2>
          <p className="muted">
            <strong>{userLabel(deleteTarget)}</strong>
            {deleteTarget.companies?.name ? ` · ${deleteTarget.companies.name}` : ''}
            {impactBusy ? ' — tarkistetaan raportteja…' : ''}
          </p>

          {deleteImpact && (
            <>
              <ul className="muted">
                <li>Raportteja laatijana: {deleteImpact.as_creator}</li>
                <li>Raportteja tekijänä: {deleteImpact.as_assignee}</li>
                <li>Työkirjauksia: {deleteImpact.daily_logs}</li>
              </ul>

              <div className="line-form-grid">
                <label className="compact-option">
                  <input
                    type="radio"
                    name="delete-mode"
                    checked={deleteMode === 'keep_name'}
                    onChange={() => setDeleteMode('keep_name')}
                  />
                  Säilytä nimi merkinnällä poistettu käyttäjä (*)
                </label>
                <label className="compact-option">
                  <input
                    type="radio"
                    name="delete-mode"
                    checked={deleteMode === 'transfer'}
                    onChange={() => setDeleteMode('transfer')}
                  />
                  Siirrä toiselle käyttäjälle
                </label>
              </div>

              {deleteMode === 'transfer' && (
                <label>
                  Siirrä raportit käyttäjälle
                  <select value={transferToUserId} onChange={(e) => setTransferToUserId(e.target.value)}>
                    {transferCandidates.map((user) => (
                      <option key={user.id} value={user.id}>
                        {userLabel(user)} · {user.companies?.name ?? '—'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          <div className="user-delete-actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={deleteBusy || impactBusy || !deleteImpact || (deleteMode === 'transfer' && !transferToUserId)}
              onClick={() => void confirmDeleteUser()}
            >
              {deleteBusy ? 'Poistetaan…' : 'Poista käyttäjä'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={deleteBusy} onClick={closeDeleteDialog}>
              Peruuta
            </button>
          </div>
        </section>
      )}

      <section className="panel form-grid">
        <h2>Lisää käyttäjä</h2>
        <p className="muted">
          Väliaikainen salasana pakottaa käyttäjän vaihtamaan sen heti ensimmäisellä kirjautumisella.
        </p>
        <form onSubmit={inviteUser}>
          <div className="line-form-grid">
            {gbaActive && companies.length > 0 && (
              <label>
                Yritys
                <select
                  value={invite.company_id}
                  onChange={(e) => setInvite((i) => ({ ...i, company_id: e.target.value }))}
                  required
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Sähköposti
              <input
                type="email"
                value={invite.email}
                onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
                required
              />
            </label>
            <label>
              Nimi
              <input
                value={invite.display_name}
                onChange={(e) => setInvite((i) => ({ ...i, display_name: e.target.value }))}
              />
            </label>
            <label>
              Salasana (väliaikainen)
              <input
                type="text"
                value={invite.password}
                onChange={(e) => setInvite((i) => ({ ...i, password: e.target.value }))}
                required
              />
            </label>
            <label>
              Rooli
              <select
                value={invite.role}
                onChange={(e) => setInvite((i) => ({ ...i, role: e.target.value }))}
              >
                {STAFF_INVITE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && <p className="error">{error}</p>}
          {message && <p className="muted">{message}</p>}

          <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: '1rem' }}>
            {busy ? 'Luodaan…' : 'Luo käyttäjä'}
          </button>
        </form>
      </section>
    </>
  );
}
