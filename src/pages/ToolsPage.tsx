import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import InventoryPhotoThumb from '../components/inventory/InventoryPhotoThumb';
import { useProfile } from '../hooks/useProfile';
import { removeInventoryImage, uploadToolImage } from '../lib/inventoryImages';
import { supabase } from '../lib/supabase';
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
  toolDayRateBadge,
  toolRateLabelRows,
} from '../lib/toolInventory';
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

  useEffect(() => {
    if (profile?.company_id) void load();
  }, [profile?.company_id]);

  async function load() {
    if (!profile?.company_id) return;
    setLoading(true);
    setError(null);

    const [{ data: toolRows, error: toolError }, { data: openLoanRows }, { data: historyLoanRows }, { data: userRows }] =
      await Promise.all([
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
      ]);

    if (toolError) {
      setError(toolError.message);
      setLoading(false);
      return;
    }

    const normalizedTools = ((toolRows as unknown as Tool[]) ?? []).map((row) => ({
      ...row,
      is_loanable: row.is_loanable !== false,
      images: [...(row.images ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    }));

    setTools(normalizedTools);
    setActiveLoans((openLoanRows as unknown as ToolLoan[]) ?? []);
    setAllLoans((historyLoanRows as unknown as ToolLoan[]) ?? []);
    const userList = (userRows as CompanyUser[]) ?? [];
    setUsers(userList);

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
      const sortOrder = (tool.images?.length ?? 0);
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
    const name =
      loan?.user?.display_name ??
      loan?.user?.email ??
      tool.assigned_user?.display_name ??
      tool.assigned_user?.email ??
      null;
    return name;
  }

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / Työkalut
          </p>
          <h1>Työkaluhallinta</h1>
          <p className="muted">Työkaluinventaario: tiedot, kuvat, hinnasto ja lainauskalenteri.</p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {loading ? (
        <section className="panel">Ladataan…</section>
      ) : (
        <>
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
              <label className="checkbox-label" style={{ alignSelf: 'end' }}>
                <input
                  type="checkbox"
                  checked={toolForm.is_loanable}
                  onChange={(e) => setToolForm({ ...toolForm, is_loanable: e.target.checked })}
                />{' '}
                Lainattavissa
              </label>
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
              <ul className="daily-log-list">
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
                  const draft = loanDraft[tool.id] ?? { userId: users[0]?.id ?? '', start: '', end: '', notes: '' };
                  const history = allLoans.filter((l) => l.tool_id === tool.id);
                  const months = groupLoansByMonth(history);
                  const rateRows = toolRateLabelRows(tool);
                  const primaryImage = tool.images?.[0] ?? null;

                  return (
                    <li key={tool.id} className="panel" style={{ marginBottom: '.75rem', padding: '.85rem' }}>
                      <div className="daily-log-head" style={{ gap: '0.75rem', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                          <InventoryPhotoThumb
                            imagePath={primaryImage?.image_path}
                            label={tool.name}
                            canEdit
                            busy={busy}
                            size="md"
                            onPick={(file) => uploadPhoto(tool, file)}
                            onRemove={primaryImage ? () => removePhoto(primaryImage) : undefined}
                          />
                          <div style={{ minWidth: 0 }}>
                            <strong>{tool.name}</strong>
                            <p className="muted" style={{ margin: '.25rem 0 0' }}>
                              {TOOL_STATUS_LABELS[tool.status] ?? tool.status}
                              {borrower ? ` · Lainaaja: ${borrower}` : ''}
                              {tool.serial_number ? ` · SN ${tool.serial_number}` : ''}
                              {tool.tag_id ? ` · RFID ${tool.tag_id}` : ''}
                            </p>
                            <p style={{ margin: '.35rem 0 0', display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
                              <span className={`badge ${tool.is_loanable !== false ? 'badge-success' : 'badge-draft'}`}>
                                {tool.is_loanable !== false ? 'Lainattavissa' : 'Ei lainattavissa'}
                              </span>
                              {dayBadge && <span className="badge badge-scheduled">{dayBadge}</span>}
                              {tool.purchase_price_eur != null && (
                                <span className="badge">Hankinta {formatToolEuro(tool.purchase_price_eur)}</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="daily-log-actions" style={{ flexWrap: 'wrap' }}>
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
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{ marginTop: '0.85rem' }}>
                          <div className="inventory-details-grid" style={{ marginBottom: '0.75rem' }}>
                            {isEditing ? (
                              <>
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
                                <label className="checkbox-label" style={{ alignSelf: 'end' }}>
                                  <input
                                    type="checkbox"
                                    checked={editForm.is_loanable}
                                    onChange={(e) => setEditForm({ ...editForm, is_loanable: e.target.checked })}
                                  />{' '}
                                  Lainattavissa
                                </label>
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
                              </>
                            ) : (
                              <>
                                <div>
                                  <p className="muted" style={{ margin: 0 }}>
                                    Hankinta
                                  </p>
                                  <p style={{ margin: '.2rem 0 0' }}>
                                    {tool.purchased_at
                                      ? new Date(tool.purchased_at).toLocaleDateString('fi-FI')
                                      : '—'}
                                    {tool.purchased_from ? ` · ${tool.purchased_from}` : ''}
                                    {tool.purchase_price_eur != null
                                      ? ` · ${formatToolEuro(tool.purchase_price_eur)}`
                                      : ''}
                                  </p>
                                </div>
                                <div>
                                  <p className="muted" style={{ margin: 0 }}>
                                    Lainaushinnasto
                                  </p>
                                  <p style={{ margin: '.2rem 0 0' }}>
                                    {rateRows.map((r) => `${r.label} ${r.value}`).join(' · ')}
                                  </p>
                                </div>
                                <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
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
                                </div>
                              </>
                            )}
                          </div>

                          <div style={{ marginBottom: '0.75rem' }}>
                            <h3 style={{ margin: '0 0 .4rem', fontSize: '1rem' }}>Kuvat</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center' }}>
                              {(tool.images ?? []).map((img) => (
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

                          <div style={{ marginBottom: '0.75rem' }}>
                            <h3 style={{ margin: '0 0 .4rem', fontSize: '1rem' }}>Lainauskalenteri</h3>
                            {months.length === 0 ? (
                              <p className="muted" style={{ margin: 0 }}>
                                Ei lainauksia vielä.
                              </p>
                            ) : (
                              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                                {months.map((month) => (
                                  <li key={month.monthKey} style={{ marginBottom: '.35rem' }}>
                                    <strong style={{ textTransform: 'capitalize' }}>{month.label}</strong>
                                    <ul style={{ margin: '.15rem 0 0', paddingLeft: '1rem' }}>
                                      {month.ranges.map((range, idx) => (
                                        <li key={`${month.monthKey}-${idx}`} className="muted">
                                          {formatLoanRangeFi(range.loaned_at, range.ends_at)}
                                        </li>
                                      ))}
                                    </ul>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {isLoaned && borrower && (
                              <p style={{ margin: '.5rem 0 0' }}>
                                <strong>Nykyinen lainaaja:</strong> {borrower}
                                {activeLoanByTool.get(tool.id)?.expected_return_at
                                  ? ` · odotettu paluu ${new Date(
                                      activeLoanByTool.get(tool.id)!.expected_return_at!,
                                    ).toLocaleDateString('fi-FI')}`
                                  : ''}
                              </p>
                            )}
                          </div>

                          {!isLoaned && (
                            <div className="panel" style={{ padding: '.75rem', margin: 0 }}>
                              <h3 style={{ margin: '0 0 .5rem', fontSize: '1rem' }}>Uusi lainaus</h3>
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
