import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Company } from '../../types';
import GlobalAdminCompanyDeleteDialog from './GlobalAdminCompanyDeleteDialog';
import { suggestCompanySlug } from './utils';

type Props = {
  companies: Company[];
  counts: Record<string, number>;
  onRefresh: () => Promise<Company[] | void>;
};

export default function GlobalAdminCompaniesSection({ companies, counts, onRefresh }: Props) {
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanySlug, setNewCompanySlug] = useState('');
  const [newCompanySlugTouched, setNewCompanySlugTouched] = useState(false);
  const [createCompanyBusy, setCreateCompanyBusy] = useState(false);
  const [createCompanyMessage, setCreateCompanyMessage] = useState<string | null>(null);
  const [createCompanyError, setCreateCompanyError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  async function createCompany(e: FormEvent) {
    e.preventDefault();
    const name = newCompanyName.trim();
    if (!name) {
      setCreateCompanyError('Yrityksen nimi on pakollinen.');
      return;
    }

    setCreateCompanyBusy(true);
    setCreateCompanyMessage(null);
    setCreateCompanyError(null);

    const slug = (newCompanySlugTouched ? newCompanySlug : suggestCompanySlug(name)).trim();
    const { error: createError } = await supabase.rpc('global_admin_create_company', {
      p_name: name,
      p_slug: slug || null,
    });

    setCreateCompanyBusy(false);

    if (createError) {
      setCreateCompanyError(createError.message);
      return;
    }

    setCreateCompanyMessage(`Yritys "${name}" luotu. Kutsu käyttäjät alla olevasta linkistä.`);
    setNewCompanyName('');
    setNewCompanySlug('');
    setNewCompanySlugTouched(false);
    await onRefresh();
  }

  async function confirmDeleteCompany(confirmSlug: string) {
    if (!deleteTarget) return;

    setDeleteBusy(true);
    setDeleteError(null);

    const { data, error: deleteRpcError } = await supabase.rpc('global_admin_delete_company', {
      p_company_id: deleteTarget.id,
      p_confirm_slug: confirmSlug,
    });

    setDeleteBusy(false);

    if (deleteRpcError) {
      setDeleteError(deleteRpcError.message);
      return;
    }

    const result = data as { name?: string } | null;
    setDeleteMessage(`Yritys "${result?.name ?? deleteTarget.name}" poistettu.`);
    setDeleteTarget(null);
    await onRefresh();
  }

  return (
    <>
      <section className="card global-admin-block">
        <h2>Uusi yritys</h2>
        <p className="muted global-admin-hint">
          Luo uusi tenant rekisteriin. Käyttäjät kutsutaan erikseen — valitse luodulle yritykselle oikea yritys
          käyttäjähallinnassa (GBA-tila päällä).
        </p>
        <form className="line-form-grid" onSubmit={(e) => void createCompany(e)}>
          <label>
            Yrityksen nimi *
            <input
              value={newCompanyName}
              onChange={(e) => {
                const nextName = e.target.value;
                setNewCompanyName(nextName);
                if (!newCompanySlugTouched) {
                  setNewCompanySlug(suggestCompanySlug(nextName));
                }
              }}
              required
              placeholder="Esim. Lämpökatsastus Oy"
            />
          </label>
          <label>
            Tunniste (slug)
            <input
              value={newCompanySlug}
              onChange={(e) => {
                setNewCompanySlugTouched(true);
                setNewCompanySlug(e.target.value);
              }}
              placeholder="lampokatsastus-oy"
            />
          </label>
          <div className="form-actions global-admin-form-actions">
            <button type="submit" className="btn btn-primary" disabled={createCompanyBusy}>
              {createCompanyBusy ? 'Luodaan…' : 'Luo yritys'}
            </button>
          </div>
        </form>
        {createCompanyMessage && <p className="success">{createCompanyMessage}</p>}
        {createCompanyError && <p className="error">{createCompanyError}</p>}
      </section>

      <section className="card global-admin-block">
        <h2>Käyttäjät</h2>
        <p className="muted">
          Kutsu, roolit ja yrityskohtaiset käyttäjät hallitaan erillisellä sivulla. Ota GBA-tila käyttöön yllä olevasta
          kytkimestä, jotta voit valita minkä tahansa yrityksen.
        </p>
        <div className="form-actions global-admin-form-actions">
          <Link to="/hallinta/kayttajat" className="btn btn-primary">
            Avaa käyttäjähallinta
          </Link>
        </div>
      </section>

      <section className="card global-admin-block">
        <h2>Yritykset</h2>
        <p className="muted">
          Työraportit, huollot, asiakkaat ja tarjouspyynnöt yhteensä per yritys. Poisto poistaa myös
          yrityksen käyttäjätilit ja kaiken tenant-dataan sidotun datan.
        </p>
        {deleteMessage && <p className="success">{deleteMessage}</p>}
        <ul className="global-admin-stats-list global-admin-company-list">
          {companies.map((company) => (
            <li key={company.id} className="global-admin-company-row">
              <div className="global-admin-company-row-main">
                <span className="global-admin-stats-name">{company.name}</span>
                <span className="muted global-admin-company-slug">{company.slug}</span>
                <span className="global-admin-stats-count">{counts[company.id] ?? 0} riviä</span>
              </div>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setDeleteMessage(null);
                  setDeleteError(null);
                  setDeleteTarget(company);
                }}
              >
                Poista
              </button>
            </li>
          ))}
        </ul>
        <p className="muted global-admin-footnote">
          Tuontikorjaus Firestore-raportointitiedon mukaan:{' '}
          <code>node scripts/fix-import-ownership.mjs --apply --production</code>
        </p>
      </section>

      <GlobalAdminCompanyDeleteDialog
        company={deleteTarget}
        open={!!deleteTarget}
        busy={deleteBusy}
        error={deleteError}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={(confirmSlug) => void confirmDeleteCompany(confirmSlug)}
      />
    </>
  );
}
