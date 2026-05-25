import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  customerSharingSummary,
  loadCustomerSharingForPartnership,
  loadOwnCustomers,
  loadReportLinkedCustomersByPartnership,
  saveCustomerSharingForPartnership,
} from '../lib/customerPartnerAccess';
import {
  ACCESS_LEVEL_OPTIONS,
  PARTNERSHIP_MODULES,
  applyPartnershipDependencies,
  emptyPartnershipPermissions,
  formatPartnershipPerms,
  parsePartnershipPermissions,
  parsePartnerBillingRates,
  partnershipBillingRatesFieldPartnerChargesOwner,
  partnershipModuleAccess,
  partnershipNeedsCustomersRead,
  partnershipPermissionsForUs,
  partnershipPermissionsGrantedToUs,
  type PartnershipModuleKey,
  type PartnershipPermissions,
  type PartnerBillingRates,
} from '../lib/management';
import PartnerBillingRatesFields from '../components/PartnerBillingRatesFields';
import PartnerCustomerSharingPicker from '../components/PartnerCustomerSharingPicker';
import type { Company, Customer, Partnership, Profile } from '../types';

type Context = { profile: Profile; session: Session };

type SharingSummary = {
  restricted: boolean;
  sharedCount: number;
  reportLinkedCount: number;
  totalCount: number;
};

function partnershipGrantsRegistryAccess(raw: unknown) {
  return (
    partnershipModuleAccess(raw, 'customers', 'read')
    || partnershipModuleAccess(raw, 'work_reports', 'write')
    || partnershipModuleAccess(raw, 'maintenance_reports', 'write')
  );
}

export default function PartnershipsPage() {
  const { profile } = useOutletContext<Context>();
  const companyName = profile.companies?.name ?? 'yrityksemme';
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [partners, setPartners] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<PartnershipPermissions>(emptyPartnershipPermissions());
  const [editingRatesId, setEditingRatesId] = useState<string | null>(null);
  const [editRates, setEditRates] = useState<PartnerBillingRates>({});
  const [editingCustomersId, setEditingCustomersId] = useState<string | null>(null);
  const [ownCustomers, setOwnCustomers] = useState<Customer[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [reportLinkedCustomerIds, setReportLinkedCustomerIds] = useState<string[]>([]);
  const [sharingSummaries, setSharingSummaries] = useState<Record<string, SharingSummary>>({});
  const [invitingId, setInvitingId] = useState<string | null>(null);

  useEffect(() => {
    if (profile.company_id) void load();
  }, [profile.company_id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('company_partnerships')
      .select('id, company_a_id, company_b_id, status, permissions_a_to_b, permissions_b_to_a, billing_rates_a_to_b, billing_rates_b_to_a, customer_access_restricted')
      .eq('status', 'active');

    const rows = (data ?? []) as Omit<Partnership, 'partner_company'>[];
    const mine = rows.filter(
      (p) => p.company_a_id === profile.company_id || p.company_b_id === profile.company_id,
    );

    const enriched: Partnership[] = [];
    for (const p of mine) {
      const partnerId = p.company_a_id === profile.company_id ? p.company_b_id : p.company_a_id;
      const { data: company } = await supabase.from('companies').select('id, name, slug').eq('id', partnerId).single();
      if (company) enriched.push({ ...p, partner_company: company });
    }
    setPartnerships(enriched);

    if (profile.company_id) {
      try {
        const customers = await loadOwnCustomers(supabase, profile.company_id);
        const partnershipLinks = enriched.map((partnership) => ({
          id: partnership.id,
          partnerCompanyId: partnership.company_a_id === profile.company_id
            ? partnership.company_b_id
            : partnership.company_a_id,
        }));
        const [{ data: accessRows }, reportLinkedByPartnership] = await Promise.all([
          partnershipLinks.length
            ? supabase
                .from('customer_partner_access')
                .select('partnership_id, customer_id, can_view')
                .in('partnership_id', partnershipLinks.map((entry) => entry.id))
                .eq('can_view', true)
            : Promise.resolve({ data: [] }),
          loadReportLinkedCustomersByPartnership(supabase, profile.company_id, partnershipLinks),
        ]);

        const counts = new Map<string, number>();
        for (const row of accessRows ?? []) {
          counts.set(row.partnership_id, (counts.get(row.partnership_id) ?? 0) + 1);
        }

        const summaries: Record<string, SharingSummary> = {};
        for (const partnership of enriched) {
          summaries[partnership.id] = {
            restricted: Boolean(partnership.customer_access_restricted ?? true),
            sharedCount: counts.get(partnership.id) ?? 0,
            reportLinkedCount: reportLinkedByPartnership[partnership.id]?.length ?? 0,
            totalCount: customers.length,
          };
        }
        setSharingSummaries(summaries);
      } catch {
        setSharingSummaries({});
      }
    }

    const { data: allPartners } = await supabase
      .from('companies')
      .select('id, name, slug')
      .neq('id', profile.company_id!)
      .order('name');
    setPartners((allPartners as Company[]) ?? []);
    setLoading(false);
  }

  function partnerCompanyId(p: Partnership) {
    return p.company_a_id === profile.company_id! ? p.company_b_id : p.company_a_id;
  }

  function partnerChargesOwnerRatesField(p: Partnership) {
    if (!profile.company_id) return null;
    return partnershipBillingRatesFieldPartnerChargesOwner(
      p,
      profile.company_id,
      partnerCompanyId(p),
    );
  }

  function startEditRates(p: Partnership) {
    const field = partnerChargesOwnerRatesField(p);
    if (!field) return;
    setEditingRatesId(p.id);
    setEditRates(parsePartnerBillingRates(p[field]));
    setEditingId(null);
    setEditingCustomersId(null);
  }

  async function startEditCustomers(p: Partnership) {
    if (!profile.company_id) return;
    setError(null);
    setEditingCustomersId(p.id);
    setEditingId(null);
    setEditingRatesId(null);
    try {
      const partnerId = partnerCompanyId(p);
      const [customers, sharing] = await Promise.all([
        loadOwnCustomers(supabase, profile.company_id),
        loadCustomerSharingForPartnership(supabase, p.id, profile.company_id, partnerId),
      ]);
      setOwnCustomers(customers);
      setSelectedCustomerIds(sharing.sharedCustomerIds);
      setReportLinkedCustomerIds(sharing.reportLinkedCustomerIds);
    } catch (loadError) {
      setEditingCustomersId(null);
      setError(loadError instanceof Error ? loadError.message : 'Asiakkaiden lataus epäonnistui.');
    }
  }

  async function saveCustomerSharing(p: Partnership) {
    setError(null);
    try {
      await saveCustomerSharingForPartnership(supabase, p.id, selectedCustomerIds);
      setMessage('Jaetut asiakkaat tallennettu.');
      setEditingCustomersId(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Tallennus epäonnistui.');
    }
  }

  async function saveBillingRates(p: Partnership) {
    const field = partnerChargesOwnerRatesField(p);
    if (!field) return;
    setError(null);
    const { error: updateError } = await supabase
      .from('company_partnerships')
      .update({ [field]: editRates })
      .eq('id', p.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage('Kumppanuuden laskutushinnat tallennettu.');
    setEditingRatesId(null);
    await load();
  }

  function startEdit(p: Partnership) {
    const field = partnershipPermissionsForUs(p, profile.company_id!);
    if (!field) return;
    setEditingId(p.id);
    setEditPerms(parsePartnershipPermissions(p[field]));
    setEditingRatesId(null);
    setEditingCustomersId(null);
  }

  function setModuleLevel(module: PartnershipModuleKey, value: string) {
    setEditPerms((prev) => {
      const level = value === 'read' || value === 'write' || value === 'none' ? value : 'none';
      return applyPartnershipDependencies({ ...prev, [module]: level });
    });
  }

  async function savePermissions(p: Partnership) {
    const field = partnershipPermissionsForUs(p, profile.company_id!);
    if (!field) return;
    setError(null);
    const normalized = applyPartnershipDependencies({ ...editPerms, use_branding: false });
    const { error: updateError } = await supabase
      .from('company_partnerships')
      .update({ [field]: normalized })
      .eq('id', p.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage('Kumppanuusoikeudet tallennettu.');
    setEditingId(null);
    await load();
  }

  async function invitePartner(partnerCompanyId: string) {
    setMessage(null);
    setError(null);
    setInvitingId(partnerCompanyId);
    const { error: insertError } = await supabase.from('company_partnerships').insert({
      company_a_id: profile.company_id,
      company_b_id: partnerCompanyId,
      status: 'active',
      permissions_a_to_b: emptyPartnershipPermissions(),
      permissions_b_to_a: emptyPartnershipPermissions(),
    });
    setInvitingId(null);
    if (insertError) {
      setError(
        insertError.code === '23505'
          ? 'Kumppanuus on jo olemassa tämän yrityksen kanssa.'
          : insertError.message.includes('row-level security') ||
              insertError.message.toLowerCase().includes('policy')
            ? 'Yritys ei salli kumppanuuskutsuja tai sinulla ei ole oikeutta luoda kumppanuutta.'
            : insertError.message,
      );
      return;
    }
    setMessage('Kumppanuus luotu. Muokkaa oikeuksia yllä olevasta Muokkaa oikeuksia -painikkeesta.');
    await load();
  }

  const inviteCandidates = partners.filter(
    (company) =>
      !partnerships.some(
        (partnership) =>
          partnership.company_a_id === company.id || partnership.company_b_id === company.id,
      ),
  );

  if (loading) return <p className="muted">Ladataan…</p>;

  return (
    <>
      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <section className="panel">
        <h2>Aktiiviset kumppanuudet</h2>
        <p className="muted">
          Voit määrittää vain <strong>mitä kumppani saa tehdä yrityksesi nimissä</strong>.
          Jokaiselle osiolle: ei oikeutta, lukuoikeus tai luonti ja muokkaus.
          Oikeus toimia kumppanin nimissä määrittää aina kumppanin ylläpitäjä.
        </p>
        {partnerships.length === 0 ? (
          <p className="muted">Ei kumppanuuksia vielä.</p>
        ) : (
          <ul className="report-list">
            {partnerships.map((p) => {
              const grantField = partnershipPermissionsForUs(p, profile.company_id!);
              const receiveField = partnershipPermissionsGrantedToUs(p, profile.company_id!);
              const grantedByUs = grantField ? p[grantField] : {};
              const grantedToUs = receiveField ? p[receiveField] : {};
              const isEditing = editingId === p.id;
              const isEditingRates = editingRatesId === p.id;
              const isEditingCustomers = editingCustomersId === p.id;
              const ratesField = partnerChargesOwnerRatesField(p);
              const ourRates = ratesField ? parsePartnerBillingRates(p[ratesField]) : {};
              const sharingSummary = sharingSummaries[p.id];
              const canManageCustomerSharing = grantField && partnershipGrantsRegistryAccess(grantedByUs);

              return (
                <li key={p.id}>
                  <div className="report-link-body" style={{ width: '100%' }}>
                    <strong>{p.partner_company.name}</strong>
                    <div className="muted">
                      <strong>Myönnät kumppanille:</strong> {formatPartnershipPerms(grantedByUs)}
                    </div>
                    <div className="muted">
                      <strong>Kumppani myöntää teille:</strong> {formatPartnershipPerms(grantedToUs)}
                      <span className="perm-readonly-note"> (vain luku — muokkaa kumppanin ylläpitäjä)</span>
                    </div>

                    {grantField && ratesField && (
                    <div className="muted">
                      <strong>Kumppanin laskutushinnat meille:</strong>{' '}
                      {ourRates.hourly_regular != null
                        ? `${ourRates.hourly_regular} €/h (ylityö ${ourRates.hourly_overtime ?? '—'}, päivystys ${ourRates.hourly_on_call ?? '—'})`
                        : 'Ei erillisiä — käytetään kumppanin oletushintoja'}
                    </div>
                    )}

                    {canManageCustomerSharing && sharingSummary && (
                      <div className="muted">
                        <strong>Jaetut asiakkaat:</strong>{' '}
                        {customerSharingSummary(
                          sharingSummary.restricted,
                          sharingSummary.sharedCount,
                          sharingSummary.reportLinkedCount,
                          sharingSummary.totalCount,
                        )}
                      </div>
                    )}

                    {canManageCustomerSharing && isEditingCustomers && (
                      <div className="perm-grid">
                        <p>
                          <strong>Valitse asiakkaat, jotka {p.partner_company.name} näkee</strong>
                        </p>
                        <p className="muted">
                          Oletus: kumppani ei näe yhtään asiakasta. Asiakas avautuu automaattisesti, kun
                          kumppani on laatinut sille raportin. Voit myös jakaa asiakkaan etukäteen, jotta
                          kumppani voi luoda raportin tai nähdä tiedot ilman aiempaa raporttia.
                        </p>
                        {ownCustomers.length === 0 ? (
                          <p className="muted">Rekisterissäsi ei ole vielä asiakkaita.</p>
                        ) : (
                          <PartnerCustomerSharingPicker
                            customers={ownCustomers}
                            selectedIds={selectedCustomerIds}
                            reportLinkedIds={reportLinkedCustomerIds}
                            onChange={setSelectedCustomerIds}
                          />
                        )}
                        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
                          <button type="button" className="btn btn-primary" onClick={() => void saveCustomerSharing(p)}>
                            Tallenna asiakkaat
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => setEditingCustomersId(null)}>
                            Peruuta
                          </button>
                        </div>
                      </div>
                    )}

                    {grantField && isEditingRates && ratesField && (
                      <div className="perm-grid">
                        <p>
                          <strong>
                            Hinta, jolla {p.partner_company.name} laskuttaa meitä
                          </strong>
                        </p>
                        <p className="muted">
                          Kun annat kumppanille oikeuden tehdä raportteja {companyName} -nimissä, kumppani
                          laskuttaa näillä hinnoilla. Tyhjät kentät = kumppanin oletushinnat (kumppanin Hallinta →
                          Yritystiedot). Raportin laatija voi tarvittaessa muokata hintaa yksittäisessä
                          työraportissa.
                        </p>
                        <PartnerBillingRatesFields rates={editRates} onChange={setEditRates} />
                        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
                          <button type="button" className="btn btn-primary" onClick={() => void saveBillingRates(p)}>
                            Tallenna hinnat
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => setEditingRatesId(null)}>
                            Peruuta
                          </button>
                        </div>
                      </div>
                    )}

                    {isEditing && grantField && (
                      <div className="perm-grid">
                        <p><strong>Myönnä kumppanille oikeus toimia {companyName} -nimissä</strong></p>
                        {partnershipNeedsCustomersRead(editPerms) && (
                          <p className="muted perm-dependency-note">
                            Työ-/huoltoraportin tai tarjouspyynnön luonti vaatii vähintään asiakkaiden lukuoikeuden.
                            Laiterekisteri (asiakkaan laitteet) seuraa samaa oikeutta.
                          </p>
                        )}
                        <div className="perm-module-grid">
                          {PARTNERSHIP_MODULES.map((mod) => (
                            <label key={mod.key}>
                              {mod.label}
                              <select
                                value={editPerms[mod.key]}
                                onChange={(e) => setModuleLevel(mod.key, e.target.value)}
                              >
                                {ACCESS_LEVEL_OPTIONS.map((opt) => (
                                  <option
                                    key={opt.value}
                                    value={opt.value}
                                    disabled={
                                      mod.key === 'customers'
                                      && opt.value === 'none'
                                      && partnershipNeedsCustomersRead(editPerms)
                                    }
                                  >
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
                          <button type="button" className="btn btn-primary" onClick={() => void savePermissions(p)}>
                            Tallenna oikeudet
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => setEditingId(null)}>
                            Peruuta
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {grantField && !isEditing && !isEditingRates && !isEditingCustomers && (
                    <div className="partner-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => startEdit(p)}>
                        Muokkaa oikeuksia
                      </button>
                      {canManageCustomerSharing && (
                        <button type="button" className="btn btn-secondary" onClick={() => void startEditCustomers(p)}>
                          Valitse asiakkaat
                        </button>
                      )}
                      <button type="button" className="btn btn-secondary" onClick={() => startEditRates(p)}>
                        Muokkaa hintoja
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Kutsu kumppani</h2>
        <p className="muted">
          Uusi kumppani ei saa oikeuksia automaattisesti — aseta ne yllä olevasta Muokkaa oikeuksia -painikkeesta.
          Listassa näkyvät vain yritykset, jotka ovat sallineet kumppanuuskutsut.
        </p>
        <div className="line-form-grid">
          {inviteCandidates.length === 0 ? (
            <p className="muted">Ei muita kutsuttavia yrityksiä — kaikki ovat jo kumppaneita tai ovat estäneet kumppanuuskutsut.</p>
          ) : (
            inviteCandidates.map((company) => (
              <button
                key={company.id}
                type="button"
                className="btn btn-secondary"
                disabled={invitingId === company.id}
                onClick={() => void invitePartner(company.id)}
              >
                {invitingId === company.id ? 'Luodaan…' : `+ ${company.name}`}
              </button>
            ))
          )}
        </div>
      </section>
    </>
  );
}
