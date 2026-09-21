import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import CollapsibleSection from '../components/CollapsibleSection';
import InventoryPhotoThumb from '../components/inventory/InventoryPhotoThumb';
import ToggleSwitch from '../components/ToggleSwitch';
import { useProfile } from '../hooks/useProfile';
import { removeInventoryImage, uploadToolImage } from '../lib/inventoryImages';
import { supabase } from '../lib/supabase';
import {
  ensureCompanyToolsBookingToken,
  fetchCompanyDeliverySettings,
  saveCompanyDeliverySettings,
  toolsBookingStaffPath,
  toolsBookingUrl,
} from '../lib/toolBookingShares';
import {
  canStartToolLoan,
  dateInputToIsoEnd,
  dateInputToIsoStart,
  formatLoanRangeFi,
  formatToolEuro,
  groupLoansByMonth,
  hasOverlappingToolLoan,
  isoToDateInput,
  parseOptionalEuro,
  hasToolPurchaseInfo,
  toolDayRateBadge,
  toolFilledRateRows,
} from '../lib/toolInventory';
import type { CompanyToolsDeliverySettings } from '../types/inventory';
import { TOOL_STATUS_LABELS, type Tool, type ToolImage, type ToolLoan } from '../types/inventory';

interface Props {
  session: Session;
}

type CompanyUser = { id: string; display_name: string | null; email: string | null };

type ToolFormState = {
  name: string;
  tag_id: string;
  serial_number: string;
  category: string;
  purchased_at: string;
  purchased_from: string;
  purchase_price_eur: string;
  is_loanable: boolean;
  rate_day_eur: string;
  rate_weekend_eur: string;
  rate_week_eur: string;
  rate_month_eur: string;
};

const EMPTY_FORM: ToolFormState = {
  name: '',
  tag_id: '',
  serial_number: '',
  category: '',
  purchased_at: '',
  purchased_from: '',
  purchase_price_eur: '',
  is_loanable: true,
  rate_day_eur: '',
  rate_weekend_eur: '',
  rate_week_eur: '',
  rate_month_eur: '',
};

function toolToForm(tool: Tool): ToolFormState {
  return {
    name: tool.name,
    tag_id: tool.tag_id ?? '',
    serial_number: tool.serial_number ?? '',
    category: tool.category ?? '',
    purchased_at: tool.purchased_at ?? '',
    purchased_from: tool.purchased_from ?? '',
    purchase_price_eur: tool.purchase_price_eur != null ? String(tool.purchase_price_eur) : '',
    is_loanable: tool.is_loanable !== false,
    rate_day_eur: tool.rate_day_eur != null ? String(tool.rate_day_eur) : '',
    rate_weekend_eur: tool.rate_weekend_eur != null ? String(tool.rate_weekend_eur) : '',
    rate_week_eur: tool.rate_week_eur != null ? String(tool.rate_week_eur) : '',
    rate_month_eur: tool.rate_month_eur != null ? String(tool.rate_month_eur) : '',
  };
}

function formToPayload(form: ToolFormState) {
  return {
    name: form.name.trim(),
    tag_id: form.tag_id.trim() || null,
    serial_number: form.serial_number.trim() || null,
    category: form.category.trim() || null,
    purchased_at: form.purchased_at.trim() || null,
    purchased_from: form.purchased_from.trim() || null,
    purchase_price_eur: parseOptionalEuro(form.purchase_price_eur),
    is_loanable: form.is_loanable,
    rate_day_eur: parseOptionalEuro(form.rate_day_eur),
    rate_weekend_eur: parseOptionalEuro(form.rate_weekend_eur),
    rate_week_eur: parseOptionalEuro(form.rate_week_eur),
    rate_month_eur: parseOptionalEuro(form.rate_month_eur),
  };
}

const TOOL_SELECT = `
  id, company_id, tag_id, serial_number, name, category, status, assigned_user_id, last_service_at,
  purchased_at, purchased_from, purchase_price_eur, is_loanable,
  rate_day_eur, rate_weekend_eur, rate_week_eur, rate_month_eur,
  created_at, updated_at,
  assigned_user:profiles!tools_assigned_user_id_fkey(display_name, email),
  images:tool_images(id, company_id, tool_id, image_path, sort_order, created_at)
`;

const LOAN_SELECT = `
  id, tool_id, user_id, work_report_id, loaned_at, returned_at, expected_return_at, notes,
  user:profiles!tool_loans_user_id_fkey(display_name, email),
  tool:tools!tool_loans_tool_id_fkey(name, tag_id, serial_number)
`;

type DeliveryForm = {
  tools_booking_enabled: boolean;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  delivery_min_fee_eur: string;
  delivery_distance_limit_km: string;
  delivery_per_km_eur: string;
};

const EMPTY_DELIVERY: DeliveryForm = {
  tools_booking_enabled: true,
  delivery_enabled: false,
  pickup_enabled: true,
  delivery_min_fee_eur: '',
  delivery_distance_limit_km: '',
  delivery_per_km_eur: '',
};

function settingsToDeliveryForm(s: CompanyToolsDeliverySettings | null): DeliveryForm {
  if (!s) return EMPTY_DELIVERY;
  return {
    tools_booking_enabled: s.tools_booking_enabled !== false,
    delivery_enabled: !!s.delivery_enabled,
    pickup_enabled: s.pickup_enabled !== false,
    delivery_min_fee_eur: s.delivery_min_fee_eur != null ? String(s.delivery_min_fee_eur) : '',
    delivery_distance_limit_km:
      s.delivery_distance_limit_km != null ? String(s.delivery_distance_limit_km) : '',
    delivery_per_km_eur: s.delivery_per_km_eur != null ? String(s.delivery_per_km_eur) : '',
  };
}

export default function ToolsPage({ session }: Props) {
  const { profile } = useProfile(session);
  const [tools, setTools] = useState<Tool[]>([]);
  const [activeLoans, setActiveLoans] = useState<ToolLoan[]>([]);
  const [allLoans, setAllLoans] = useState<ToolLoan[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toolForm, setToolForm] = useState<ToolFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ToolFormState>(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loanDraft, setLoanDraft] = useState<
    Record<string, { userId: string; start: string; end: string; notes: string }>
  >({});
  const [deliveryForm, setDeliveryForm] = useState<DeliveryForm>(EMPTY_DELIVERY);
  const [bookingToken, setBookingToken] = useState<string | null>(null);
  const [publicLink, setPublicLink] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.company_id) void load();
  }, [profile?.company_id]);

  async function load() {
    if (!profile?.company_id) return;
    setLoading(true);
    setError(null);

    const [
      { data: toolRows, error: toolError },
      { data: openLoanRows },
      { data: historyLoanRows },
      { data: userRows },
      deliverySettings,
    ] = await Promise.all([
      supabase
        .from('tools')
        .select(TOOL_SELECT)
        .eq('company_id', profile.company_id)
        .order('name'),
      supabase
        .from('tool_loans')
        .select(LOAN_SELECT)
        .is('returned_at', null)
        .order('loaned_at', { ascending: false }),
      supabase
        .from('tool_loans')
        .select(LOAN_SELECT)
        .order('loaned_at', { ascending: false })
        .limit(500),
      supabase
        .from('profiles')
        .select('id, display_name, email')
        .eq('company_id', profile.company_id)
        .neq('role', 'customer')
        .order('display_name'),
      fetchCompanyDeliverySettings(profile.company_id).catch(() => null),
    ]);

    if (toolError) {
      setError(toolError.message);
      setLoading(false);
      return;
    }

    const normalizedTools = ((toolRows as unknown as Tool[]) ?? []).map((row) => ({
      ...row,
      is_loanable: row.is_loanable !== false,
      images: [...(row.images ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
      ),
    }));

    setTools(normalizedTools);
    setActiveLoans((openLoanRows as unknown as ToolLoan[]) ?? []);
    setAllLoans((historyLoanRows as unknown as ToolLoan[]) ?? []);
    const userList = (userRows as CompanyUser[]) ?? [];
    setUsers(userList);
    setDeliveryForm(settingsToDeliveryForm(deliverySettings));
    if (deliverySettings?.tools_booking_token) {
      setBookingToken(deliverySettings.tools_booking_token);
      setPublicLink(toolsBookingUrl(deliverySettings.tools_booking_token));
    }

    const today = isoToDateInput(new Date().toISOString());
    setLoanDraft((prev) => {
      const next = { ...prev };
      for (const tool of normalizedTools) {
        if (!next[tool.id]) {
          next[tool.id] = {
            userId: userList[0]?.id ?? '',
            start: today,
            end: '',
            notes: '',
          };
        }
      }
      return next;
    });
    setLoading(false);
  }

  const activeLoanByTool = useMemo(() => {
    const map = new Map<string, ToolLoan>();
    for (const loan of activeLoans) map.set(loan.tool_id, loan);
    return map;
  }, [activeLoans]);

  async function addTool(e: FormEvent) {
    e.preventDefault();
    if (!profile?.company_id || !toolForm.name.trim()) return;
    setBusy(true);
    setError(null);
    const payload = formToPayload(toolForm);
    const { error: insertError } = await supabase.from('tools').insert({
      company_id: profile.company_id,
      ...payload,
      status: 'available',
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setToolForm(EMPTY_FORM);
    setMessage('Työkalu lisätty.');
    await load();
  }

  async function saveEdit(toolId: string) {
    if (!editForm.name.trim()) return;
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.from('tools').update(formToPayload(editForm)).eq('id', toolId);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditingId(null);
    setMessage('Työkalu tallennettu.');
    await load();
  }

  async function loanTool(tool: Tool) {
    const draft = loanDraft[tool.id];
    const userId = draft?.userId;
    if (!userId) {
      setError('Valitse lainaaja.');
      return;
    }
    const gate = canStartToolLoan({
      is_loanable: tool.is_loanable !== false,
      status: tool.status,
      hasOpenLoan: activeLoanByTool.has(tool.id),
    });
    if (!gate.ok) {
      setError(gate.reason);
      return;
    }

    const startIso = dateInputToIsoStart(draft.start) ?? new Date().toISOString();
    const endIso = draft.end ? dateInputToIsoEnd(draft.end) : null;
    if (endIso && new Date(endIso).getTime() < new Date(startIso).getTime()) {
      setError('Palautuspäivä ei voi olla ennen alkua.');
      return;
    }

    const toolHistory = allLoans.filter((l) => l.tool_id === tool.id);
    if (hasOverlappingToolLoan(toolHistory, startIso, endIso)) {
      setError('Lainaus limittäin olemassa olevan lainan / varauksen kanssa.');
      return;
    }

    setBusy(true);
    setError(null);
    const { error: loanError } = await supabase.from('tool_loans').insert({
      tool_id: tool.id,
      user_id: userId,
      loaned_at: startIso,
      expected_return_at: endIso,
      notes: draft.notes.trim() || null,
    });
    if (loanError) {
      setBusy(false);
      setError(loanError.message);
      return;
    }
    await supabase.from('tools').update({ status: 'loaned', assigned_user_id: userId }).eq('id', tool.id);
    setBusy(false);
    setMessage('Työkalu lainattu.');
    await load();
  }

  async function returnTool(toolId: string) {
    setBusy(true);
    setError(null);
    const activeLoan = activeLoanByTool.get(toolId);
    if (activeLoan) {
      await supabase
        .from('tool_loans')
        .update({ returned_at: new Date().toISOString() })
        .eq('id', activeLoan.id);
    }
    await supabase.from('tools').update({ status: 'available', assigned_user_id: null }).eq('id', toolId);
    setBusy(false);
    setMessage('Työkalu palautettu.');
    await load();
  }

  async function uploadPhoto(tool: Tool, file: File) {
    if (!profile?.company_id) return;
    setBusy(true);
    setError(null);
    const imageId = crypto.randomUUID();
    try {
      const path = await uploadToolImage(supabase, profile.company_id, tool.id, imageId, file);
      const sortOrder = tool.images?.length ?? 0;
      const { error: insertError } = await supabase.from('tool_images').insert({
        id: imageId,
        company_id: profile.company_id,
        tool_id: tool.id,
        image_path: path,
        sort_order: sortOrder,
      });
      if (insertError) throw insertError;
      setMessage('Kuva lisätty.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kuvan tallennus epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(image: ToolImage) {
    setBusy(true);
    setError(null);
    await removeInventoryImage(supabase, image.image_path);
    await supabase.from('tool_images').delete().eq('id', image.id);
    setBusy(false);
    setMessage('Kuva poistettu.');
    await load();
  }

  function borrowerLabel(tool: Tool): string | null {
    const loan = activeLoanByTool.get(tool.id);
    return (
      loan?.user?.display_name ??
      loan?.user?.email ??
      tool.assigned_user?.display_name ??
      tool.assigned_user?.email ??
      null
    );
  }

  async function ensureLink() {
    setBusy(true);
    setError(null);
    try {
      const token = await ensureCompanyToolsBookingToken();
      setBookingToken(token);
      setPublicLink(toolsBookingUrl(token));
      setMessage('Ulkoinen varauslinkki valmis.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Linkin luonti epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  async function copyPublicLink() {
    setBusy(true);
    setError(null);
    try {
      let url = publicLink;
      if (!url) {
        const token = await ensureCompanyToolsBookingToken();
        setBookingToken(token);
        url = toolsBookingUrl(token);
        setPublicLink(url);
      }
      await navigator.clipboard.writeText(url);
      setMessage('Ulkoinen varauslinkki kopioitu.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kopiointi epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function saveDelivery(e: FormEvent) {
    e.preventDefault();
    if (!profile?.company_id) return;
    setBusy(true);
    setError(null);
    try {
      await saveCompanyDeliverySettings(profile.company_id, {
        tools_booking_enabled: deliveryForm.tools_booking_enabled,
        delivery_enabled: deliveryForm.delivery_enabled,
        pickup_enabled: deliveryForm.pickup_enabled,
        delivery_min_fee_eur: parseOptionalEuro(deliveryForm.delivery_min_fee_eur),
        delivery_distance_limit_km: parseOptionalEuro(deliveryForm.delivery_distance_limit_km),
        delivery_per_km_eur: parseOptionalEuro(deliveryForm.delivery_per_km_eur),
      });
      if (!bookingToken && deliveryForm.tools_booking_enabled) {
        const token = await ensureCompanyToolsBookingToken();
        setBookingToken(token);
        setPublicLink(toolsBookingUrl(token));
      }
      setMessage('Kuljetusasetukset tallennettu.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tallennus epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / Työkalut
          </p>
          <h1>Työkaluhallinta</h1>
          <p className="muted">Inventaario, hinnasto, lainaus ja julkinen varauskalenteri.</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <Link to={toolsBookingStaffPath()} className="btn btn-primary">
            Varauskalenteri
          </Link>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void copyPublicLink()}>
            Kopioi ulkoinen linkki
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {loading ? (
        <section className="panel">Ladataan…</section>
      ) : (
        <>
          <section className="panel tool-booking-link-panel">
            <div className="tool-booking-promo">
              <div>
                <h2 style={{ margin: '0 0 .35rem' }}>Varauskalenteri</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Sisäinen kalenteri näyttää lainat ja ulkoiset varaukset. Ulkoinen linkki sopii asiakkaille.
                </p>
                {publicLink && (
                  <div className="tool-booking-link-row" style={{ marginTop: '.65rem' }}>
                    <input
                      readOnly
                      value={publicLink}
                      className="tool-booking-link-input"
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                <Link to={toolsBookingStaffPath()} className="btn btn-primary btn-sm">
                  Avaa varauskalenteri
                </Link>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void ensureLink()}>
                  {publicLink ? 'Varmista linkki' : 'Luo ulkoinen linkki'}
                </button>
              </div>
            </div>
          </section>

          <CollapsibleSection title="Kuljetus ja nouto (yritys)" defaultOpen={false} variant="plain" className="panel">
            <form onSubmit={(e) => void saveDelivery(e)} className="line-form-grid">
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                <ToggleSwitch
                  checked={deliveryForm.tools_booking_enabled}
                  onChange={(checked) => setDeliveryForm({ ...deliveryForm, tools_booking_enabled: checked })}
                  label="Julkinen varaus käytössä"
                />
                <ToggleSwitch
                  checked={deliveryForm.delivery_enabled}
                  onChange={(checked) => setDeliveryForm({ ...deliveryForm, delivery_enabled: checked })}
                  label="Kuljetus mahdollinen"
                />
                <ToggleSwitch
                  checked={deliveryForm.pickup_enabled}
                  onChange={(checked) => setDeliveryForm({ ...deliveryForm, pickup_enabled: checked })}
                  label="Nouto mahdollinen"
                />
              </div>
              <label>
                Minimihinta (€) — lyhyt matka
                <input
                  inputMode="decimal"
                  value={deliveryForm.delivery_min_fee_eur}
                  onChange={(e) => setDeliveryForm({ ...deliveryForm, delivery_min_fee_eur: e.target.value })}
                  disabled={!deliveryForm.delivery_enabled}
                />
              </label>
              <label>
                Raja (km)
                <input
                  inputMode="decimal"
                  value={deliveryForm.delivery_distance_limit_km}
                  onChange={(e) =>
                    setDeliveryForm({ ...deliveryForm, delivery_distance_limit_km: e.target.value })
                  }
                  disabled={!deliveryForm.delivery_enabled}
                />
              </label>
              <label>
                Yli rajan (€/km)
                <input
                  inputMode="decimal"
                  value={deliveryForm.delivery_per_km_eur}
                  onChange={(e) => setDeliveryForm({ ...deliveryForm, delivery_per_km_eur: e.target.value })}
                  disabled={!deliveryForm.delivery_enabled}
                />
              </label>
              <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
                Lyhyt matka (≤ raja): veloitetaan minimihinta. Yli rajan: minimihinta + ylimääräiset km × €/km.
              </p>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                  Tallenna kuljetusasetukset
                </button>
              </div>
            </form>
          </CollapsibleSection>

          <section className="panel form-section">
            <h2>Lisää työkalu</h2>
            <form onSubmit={(e) => void addTool(e)} className="line-form-grid">
              <label>
                Nimi *
                <input
                  value={toolForm.name}
                  onChange={(e) => setToolForm({ ...toolForm, name: e.target.value })}
                  required
                />
              </label>
              <label>
                Sarjanumero
                <input
                  value={toolForm.serial_number}
                  onChange={(e) => setToolForm({ ...toolForm, serial_number: e.target.value })}
                />
              </label>
              <label>
                Tunniste / RFID
                <input
                  value={toolForm.tag_id}
                  onChange={(e) => setToolForm({ ...toolForm, tag_id: e.target.value })}
                />
              </label>
              <label>
                Kategoria
                <input
                  value={toolForm.category}
                  onChange={(e) => setToolForm({ ...toolForm, category: e.target.value })}
                />
              </label>
              <label>
                Hankittu milloin
                <input
                  type="date"
                  value={toolForm.purchased_at}
                  onChange={(e) => setToolForm({ ...toolForm, purchased_at: e.target.value })}
                />
              </label>
              <label>
                Mistä hankittu
                <input
                  value={toolForm.purchased_from}
                  onChange={(e) => setToolForm({ ...toolForm, purchased_from: e.target.value })}
                />
              </label>
              <label>
                Hankintahinta (€)
                <input
                  inputMode="decimal"
                  value={toolForm.purchase_price_eur}
                  onChange={(e) => setToolForm({ ...toolForm, purchase_price_eur: e.target.value })}
                />
              </label>
              <div style={{ alignSelf: 'end' }}>
                <ToggleSwitch
                  checked={toolForm.is_loanable}
                  onChange={(checked) => setToolForm({ ...toolForm, is_loanable: checked })}
                  label="Lainattavissa"
                />
              </div>
              <label>
                €/päivä
                <input
                  inputMode="decimal"
                  value={toolForm.rate_day_eur}
                  onChange={(e) => setToolForm({ ...toolForm, rate_day_eur: e.target.value })}
                />
              </label>
              <label>
                €/viikonloppu
                <input
                  inputMode="decimal"
                  value={toolForm.rate_weekend_eur}
                  onChange={(e) => setToolForm({ ...toolForm, rate_weekend_eur: e.target.value })}
                />
              </label>
              <label>
                €/viikko
                <input
                  inputMode="decimal"
                  value={toolForm.rate_week_eur}
                  onChange={(e) => setToolForm({ ...toolForm, rate_week_eur: e.target.value })}
                />
              </label>
              <label>
                €/kk
                <input
                  inputMode="decimal"
                  value={toolForm.rate_month_eur}
                  onChange={(e) => setToolForm({ ...toolForm, rate_month_eur: e.target.value })}
                />
              </label>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Tallennetaan…' : 'Lisää työkalu'}
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <h2>Työkalut ({tools.length})</h2>
            {tools.length === 0 ? (
              <p className="muted">Ei työkaluja vielä.</p>
            ) : (
              <ul className="tool-card-grid">
                {tools.map((tool) => {
                  const isLoaned = tool.status === 'loaned' || activeLoanByTool.has(tool.id);
                  const borrower = borrowerLabel(tool);
                  const dayBadge = toolDayRateBadge(tool);
                  const isExpanded = expandedId === tool.id;
                  const isEditing = editingId === tool.id;
                  const gate = canStartToolLoan({
                    is_loanable: tool.is_loanable !== false,
                    status: tool.status,
                    hasOpenLoan: activeLoanByTool.has(tool.id),
                  });
                  const draft =
                    loanDraft[tool.id] ?? { userId: users[0]?.id ?? '', start: '', end: '', notes: '' };
                  const history = allLoans.filter((l) => l.tool_id === tool.id);
                  const months = groupLoansByMonth(history);
                  const filledRates = toolFilledRateRows(tool);
                  const hasPurchase = hasToolPurchaseInfo(tool);
                  const images = tool.images ?? [];
                  const primaryImage = images[0] ?? null;
                  const activeLoan = activeLoanByTool.get(tool.id);
                  const metaBits = [
                    !isExpanded && borrower ? `Lainaaja: ${borrower}` : null,
                    !isExpanded && !borrower ? 'Ei lainaajaa' : null,
                    tool.serial_number ? `SN ${tool.serial_number}` : null,
                    tool.tag_id ? `RFID ${tool.tag_id}` : null,
                    tool.category ? tool.category : null,
                  ].filter(Boolean);

                  return (
                    <li key={tool.id} className={`tool-card ${isExpanded ? 'is-expanded' : ''}`}>
                      <div className="tool-card-header">
                        <div className="tool-card-header-main">
                          {!isExpanded && (
                            <InventoryPhotoThumb
                              imagePath={primaryImage?.image_path}
                              label={tool.name}
                              canEdit
                              busy={busy}
                              size="sm"
                              onPick={(file) => uploadPhoto(tool, file)}
                              onRemove={primaryImage ? () => removePhoto(primaryImage) : undefined}
                            />
                          )}
                          <div className="tool-card-body">
                            <div className="tool-card-title-row">
                              <strong className="tool-card-name">{tool.name}</strong>
                              <span className={`badge ${isLoaned ? 'badge-scheduled' : 'badge-success'}`}>
                                {TOOL_STATUS_LABELS[tool.status] ?? tool.status}
                              </span>
                              <span
                                className={`badge ${tool.is_loanable !== false ? 'badge-success' : 'badge-draft'}`}
                              >
                                {tool.is_loanable !== false ? 'Lainattavissa' : 'Ei lainattavissa'}
                              </span>
                              {!isExpanded && dayBadge && (
                                <span className="badge badge-scheduled">{dayBadge}</span>
                              )}
                              {!isExpanded && tool.purchase_price_eur != null && (
                                <span className="badge">Hankinta {formatToolEuro(tool.purchase_price_eur)}</span>
                              )}
                            </div>
                            {metaBits.length > 0 && (
                              <p className="muted tool-card-meta">{metaBits.join(' · ')}</p>
                            )}
                          </div>
                        </div>
                        <div className="tool-card-toolbar">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setExpandedId(isExpanded ? null : tool.id)}
                          >
                            {isExpanded ? 'Sulje' : 'Tiedot'}
                          </button>
                          {isLoaned ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={busy}
                              onClick={() => void returnTool(tool.id)}
                            >
                              Palauta
                            </button>
                          ) : null}
                          {isExpanded && !isEditing ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setEditingId(tool.id);
                                  setEditForm(toolToForm(tool));
                                }}
                              >
                                Muokkaa
                              </button>
                              <Link to={toolsBookingStaffPath()} className="btn btn-secondary btn-sm">
                                Varauskalenteri
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="tool-card-details">
                          {isEditing ? (
                            <div className="inventory-details-grid tool-detail-edit-grid">
                              {(
                                [
                                  ['name', 'Nimi *'],
                                  ['serial_number', 'Sarjanumero'],
                                  ['tag_id', 'Tunniste / RFID'],
                                  ['category', 'Kategoria'],
                                  ['purchased_from', 'Mistä hankittu'],
                                  ['purchase_price_eur', 'Hankintahinta (€)'],
                                  ['rate_day_eur', '€/päivä'],
                                  ['rate_weekend_eur', '€/viikonloppu'],
                                  ['rate_week_eur', '€/viikko'],
                                  ['rate_month_eur', '€/kk'],
                                ] as const
                              ).map(([key, label]) => (
                                <label key={key}>
                                  {label}
                                  <input
                                    type="text"
                                    inputMode={
                                      key === 'purchase_price_eur' || key.startsWith('rate_')
                                        ? 'decimal'
                                        : undefined
                                    }
                                    value={editForm[key]}
                                    onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                                  />
                                </label>
                              ))}
                              <label>
                                Hankittu milloin
                                <input
                                  type="date"
                                  value={editForm.purchased_at}
                                  onChange={(e) => setEditForm({ ...editForm, purchased_at: e.target.value })}
                                />
                              </label>
                              <div style={{ alignSelf: 'end' }}>
                                <ToggleSwitch
                                  checked={editForm.is_loanable}
                                  onChange={(checked) => setEditForm({ ...editForm, is_loanable: checked })}
                                  label="Lainattavissa"
                                />
                              </div>
                              <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={busy}
                                  onClick={() => void saveEdit(tool.id)}
                                >
                                  Tallenna
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setEditingId(null)}
                                >
                                  Peruuta
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="tool-detail-media">
                                {images.length === 0 ? (
                                  <div className="tool-detail-media-empty">
                                    <InventoryPhotoThumb
                                      imagePath={null}
                                      label={`${tool.name}, lisää kuva`}
                                      canEdit
                                      busy={busy}
                                      size="sm"
                                      onPick={(file) => uploadPhoto(tool, file)}
                                    />
                                    <p className="muted tool-detail-media-hint">Ei kuvaa — lisää kuva</p>
                                  </div>
                                ) : (
                                  <div className="tool-detail-media-filled">
                                    <div className="tool-detail-primary">
                                      <InventoryPhotoThumb
                                        imagePath={primaryImage?.image_path}
                                        label={tool.name}
                                        canEdit
                                        busy={busy}
                                        size="md"
                                        onPick={(file) => uploadPhoto(tool, file)}
                                        onRemove={
                                          primaryImage ? () => removePhoto(primaryImage) : undefined
                                        }
                                      />
                                    </div>
                                    <div className="tool-detail-thumbs">
                                      {images.map((img) => (
                                        <InventoryPhotoThumb
                                          key={img.id}
                                          imagePath={img.image_path}
                                          label={`${tool.name} kuva`}
                                          canEdit
                                          busy={busy}
                                          size="sm"
                                          onPick={(file) => uploadPhoto(tool, file)}
                                          onRemove={() => removePhoto(img)}
                                        />
                                      ))}
                                      <InventoryPhotoThumb
                                        imagePath={null}
                                        label={`${tool.name}, lisää kuva`}
                                        canEdit
                                        busy={busy}
                                        size="sm"
                                        onPick={(file) => uploadPhoto(tool, file)}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="tool-detail-sections">
                                <section className="tool-detail-section">
                                  <h3 className="tool-detail-section-title">Hankinta</h3>
                                  {hasPurchase ? (
                                    <dl className="detail-list tool-detail-kv">
                                      {tool.purchased_at ? (
                                        <>
                                          <dt>Milloin</dt>
                                          <dd>{new Date(tool.purchased_at).toLocaleDateString('fi-FI')}</dd>
                                        </>
                                      ) : null}
                                      {tool.purchased_from?.trim() ? (
                                        <>
                                          <dt>Mistä</dt>
                                          <dd>{tool.purchased_from.trim()}</dd>
                                        </>
                                      ) : null}
                                      {tool.purchase_price_eur != null ? (
                                        <>
                                          <dt>Hinta</dt>
                                          <dd>{formatToolEuro(tool.purchase_price_eur)}</dd>
                                        </>
                                      ) : null}
                                    </dl>
                                  ) : (
                                    <p className="muted tool-detail-empty">Ei hankintatietoja</p>
                                  )}
                                </section>

                                <section className="tool-detail-section">
                                  <h3 className="tool-detail-section-title">Hinnasto</h3>
                                  {filledRates.length > 0 ? (
                                    <div className="tool-rate-chips">
                                      {filledRates.map((row) => (
                                        <span key={row.key} className="tool-rate-chip">
                                          <span className="tool-rate-chip-label">{row.label}</span>
                                          <strong>{row.value}</strong>
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="muted tool-detail-empty">Ei hinnastoa</p>
                                  )}
                                </section>
                              </div>

                              <section className="tool-detail-section tool-detail-history">
                                <h3 className="tool-detail-section-title">Lainaushistoria</h3>
                                {isLoaned && borrower ? (
                                  <p className="tool-detail-borrower">
                                    <strong>Nykyinen lainaaja:</strong> {borrower}
                                    {activeLoan?.expected_return_at
                                      ? ` · odotettu paluu ${new Date(
                                          activeLoan.expected_return_at,
                                        ).toLocaleDateString('fi-FI')}`
                                      : ''}
                                  </p>
                                ) : null}
                                {months.length === 0 ? (
                                  <p className="muted tool-detail-empty">Ei lainauksia vielä.</p>
                                ) : (
                                  <ul className="tool-loan-month-list">
                                    {months.map((month) => (
                                      <li key={month.monthKey}>
                                        <strong className="tool-loan-month-label">{month.label}</strong>
                                        <ul className="tool-loan-range-list">
                                          {month.ranges.map((range, idx) => (
                                            <li key={`${month.monthKey}-${idx}`}>
                                              {formatLoanRangeFi(range.loaned_at, range.ends_at)}
                                            </li>
                                          ))}
                                        </ul>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </section>
                            </>
                          )}

                          {!isLoaned && !isEditing && (
                            <div className="panel tool-loan-form-panel">
                              <h3 className="tool-detail-section-title">Uusi lainaus</h3>
                              {!gate.ok ? (
                                <p className="muted" style={{ margin: 0 }}>
                                  {gate.reason}
                                </p>
                              ) : (
                                <div className="line-form-grid">
                                  <label>
                                    Lainaaja
                                    <select
                                      value={draft.userId}
                                      onChange={(e) =>
                                        setLoanDraft({
                                          ...loanDraft,
                                          [tool.id]: { ...draft, userId: e.target.value },
                                        })
                                      }
                                    >
                                      {users.map((u) => (
                                        <option key={u.id} value={u.id}>
                                          {u.display_name ?? u.email ?? u.id}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    Alkaa
                                    <input
                                      type="date"
                                      value={draft.start}
                                      onChange={(e) =>
                                        setLoanDraft({
                                          ...loanDraft,
                                          [tool.id]: { ...draft, start: e.target.value },
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Odotettu paluu (valinnainen)
                                    <input
                                      type="date"
                                      value={draft.end}
                                      onChange={(e) =>
                                        setLoanDraft({
                                          ...loanDraft,
                                          [tool.id]: { ...draft, end: e.target.value },
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Huomio
                                    <input
                                      value={draft.notes}
                                      onChange={(e) =>
                                        setLoanDraft({
                                          ...loanDraft,
                                          [tool.id]: { ...draft, notes: e.target.value },
                                        })
                                      }
                                    />
                                  </label>
                                  <div className="form-actions">
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      disabled={busy || !draft.userId}
                                      onClick={() => void loanTool(tool)}
                                    >
                                      Lainaa
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

            )}
          </section>
        </>
      )}
    </AppLayout>
  );
}
