import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import SubscriberPortalSection from '../components/SubscriberPortalSection';
import { loadSubscribersForOwner } from '../lib/subscribers';
import {
  clearSubscriberNewFormDraft,
  readSubscriberNewFormDraft,
  subscriberFormDraftHasContent,
  subscriberNewFormDraftKey,
  writeSubscriberNewFormDraft,
  type SubscriberFormDraft,
} from '../lib/subscriberFormDraftStorage';
import { supabase } from '../lib/supabase';
import type { Profile, Subscriber } from '../types';

type Context = { profile: Profile; session: Session };

const emptyForm = (): SubscriberFormDraft => ({
  name: '',
  business_id: '',
  email: '',
  phone: '',
  notes: '',
});

export default function SubscribersPage() {
  const { profile, session } = useOutletContext<Context>();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  const isAdmin = profile.role === 'admin';
  const ownerCompanyId = profile.company_id;

  const newFormDraftKey = useMemo(() => {
    if (!ownerCompanyId) return null;
    return subscriberNewFormDraftKey(ownerCompanyId, session.user.id);
  }, [ownerCompanyId, session.user.id]);

  const loadNewFormDraft = useCallback((): SubscriberFormDraft => {
    if (!newFormDraftKey) return emptyForm();
    const stored = readSubscriberNewFormDraft(newFormDraftKey);
    return stored?.payload ?? emptyForm();
  }, [newFormDraftKey]);

  const [form, setForm] = useState<SubscriberFormDraft>(() => loadNewFormDraft());

  useEffect(() => {
    if (editingId || !newFormDraftKey) return;
    const stored = readSubscriberNewFormDraft(newFormDraftKey);
    if (stored?.payload) {
      setForm(stored.payload);
      setDraftRestored(true);
    }
  }, [newFormDraftKey, editingId]);

  useEffect(() => {
    if (editingId || !newFormDraftKey) return;
    if (!subscriberFormDraftHasContent(form)) {
      clearSubscriberNewFormDraft(newFormDraftKey);
      return;
    }
    writeSubscriberNewFormDraft(newFormDraftKey, form);
  }, [form, editingId, newFormDraftKey]);

  useEffect(() => {
    if (ownerCompanyId) void load();
  }, [ownerCompanyId]);

  async function load() {
    if (!ownerCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      setSubscribers(await loadSubscribersForOwner(supabase, ownerCompanyId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Lataus epäonnistui.');
      setSubscribers([]);
    }
    setLoading(false);
  }

  function startEdit(entry: Subscriber, scrollToPortal = false) {
    setEditingId(entry.id);
    setDraftRestored(false);
    setForm({
      name: entry.name,
      business_id: entry.business_id ?? '',
      email: entry.email ?? '',
      phone: entry.phone ?? '',
      notes: entry.notes ?? '',
    });
    setMessage(null);
    setError(null);
    if (scrollToPortal) {
      window.setTimeout(() => {
        document.getElementById('subscriber-portal')?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    }
  }

  function cancelEdit() {
    const draft = loadNewFormDraft();
    setEditingId(null);
    setForm(draft);
    setDraftRestored(subscriberFormDraftHasContent(draft));
    setMessage(null);
    setError(null);
  }

  function clearNewFormDraft() {
    if (newFormDraftKey) clearSubscriberNewFormDraft(newFormDraftKey);
    setForm(emptyForm());
    setDraftRestored(false);
    setMessage(null);
    setError(null);
  }

  async function saveSubscriber(e: FormEvent) {
    e.preventDefault();
    if (!ownerCompanyId || !isAdmin) return;
    if (!form.name.trim()) {
      setError('Tilaajan nimi on pakollinen.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    const payload = {
      name: form.name.trim(),
      business_id: form.business_id.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
    };

    if (editingId) {
      const { error: updateError } = await supabase
        .from('subscribers')
        .update(payload)
        .eq('id', editingId)
        .eq('owner_company_id', ownerCompanyId);

      setBusy(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setMessage('Tilaaja päivitetty.');
      cancelEdit();
    } else {
      const { error: insertError } = await supabase.from('subscribers').insert({
        owner_company_id: ownerCompanyId,
        ...payload,
      });

      setBusy(false);
      if (insertError) {
        setError(insertError.message);
        return;
      }
      setMessage('Tilaaja lisätty rekisteriin.');
      if (newFormDraftKey) clearSubscriberNewFormDraft(newFormDraftKey);
      setForm(emptyForm());
      setDraftRestored(false);
    }

    await load();
  }

  async function removeSubscriber(entry: Subscriber) {
    if (!isAdmin) return;
    if (!window.confirm(`Poistetaanko tilaaja "${entry.name}"? Asiakaskohteiden tilaaja-linkki poistuu.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const { error: deleteError } = await supabase
      .from('subscribers')
      .delete()
      .eq('id', entry.id)
      .eq('owner_company_id', ownerCompanyId!);

    setBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    if (editingId === entry.id) cancelEdit();
    setMessage('Tilaaja poistettu.');
    await load();
  }

  if (!isAdmin) {
    return (
      <p className="error">
        Vain ylläpitäjä hallitsee tilaajarekisteriä.{' '}
        <Link to="/hallinta/omat">Omat tiedot</Link>
      </p>
    );
  }

  return (
    <div>
      <p className="breadcrumb">
        <Link to="/">Etusivu</Link> / <Link to="/hallinta/yritys">Hallinta</Link> / Tilaajat
      </p>
      <h1>Tilaajat</h1>
      <p className="muted">
        Moniasiakas-tilaaja (esim. kiinteistönhallinta). Linkitä asiakaskohteet ja raportit tilaajaan —
        tilaajalle voidaan myöntää oma kirjautuminen, jolloin hän näkee kaikki kohteensa.
      </p>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <form className="panel form-grid" onSubmit={(e) => void saveSubscriber(e)}>
        <h2>{editingId ? 'Muokkaa tilaajaa' : 'Uusi tilaaja'}</h2>
        {!editingId && draftRestored && subscriberFormDraftHasContent(form) && (
          <p className="muted field-span-all" style={{ margin: '-0.25rem 0 0' }}>
            Tallentamaton luonnos palautettiin — voit jatkaa täyttämistä tai tyhjentää lomakkeen.
          </p>
        )}
        <label>
          Nimi *
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label>
          Y-tunnus
          <input
            value={form.business_id}
            onChange={(e) => setForm((f) => ({ ...f, business_id: e.target.value }))}
          />
        </label>
        <label>
          Sähköposti
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </label>
        <label>
          Puhelin
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </label>
        <label className="field-span-all">
          Muistiinpanot
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </label>
        <div className="form-actions field-span-all">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Tallennetaan…' : editingId ? 'Tallenna muutokset' : 'Lisää tilaaja'}
          </button>
          {editingId ? (
            <button type="button" className="btn btn-secondary" onClick={cancelEdit} disabled={busy}>
              Peruuta
            </button>
          ) : subscriberFormDraftHasContent(form) ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={clearNewFormDraft}
              disabled={busy}
            >
              Tyhjennä lomake
            </button>
          ) : null}
        </div>
      </form>

      {editingId && ownerCompanyId && (
        <SubscriberPortalSection
          subscriberId={editingId}
          subscriberName={form.name.trim() || subscribers.find((s) => s.id === editingId)?.name || 'Tilaaja'}
          companyId={ownerCompanyId}
        />
      )}

      <section className="panel" style={{ marginTop: '1.5rem' }}>
        <h2>Rekisteri ({subscribers.length})</h2>
        {loading ? (
          <p className="muted">Ladataan…</p>
        ) : subscribers.length === 0 ? (
          <p className="muted">Ei tilaajia. Lisää ensimmäinen yllä olevalla lomakkeella.</p>
        ) : (
          <ul className="report-list compact">
            {subscribers.map((entry) => (
              <li key={entry.id} className="report-list-row-actions">
                <div>
                  <strong>{entry.name}</strong>
                  <span className="muted">
                    {[entry.business_id, entry.email, entry.phone].filter(Boolean).join(' • ') || '—'}
                  </span>
                </div>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => window.open(`/esikatselu/tilaaja/${entry.id}`, '_blank', 'noopener,noreferrer')}
                    disabled={busy}
                  >
                    Avaa tilaajaportaali
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => startEdit(entry)}
                    disabled={busy}
                  >
                    Muokkaa
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => void removeSubscriber(entry)}
                    disabled={busy}
                  >
                    Poista
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
