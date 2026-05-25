import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useProfile } from '../hooks/useProfile';
import { supabase } from '../lib/supabase';
import { TOOL_STATUS_LABELS, type Tool, type ToolLoan } from '../types/inventory';

interface Props {
  session: Session;
}

export default function ToolsPage({ session }: Props) {
  const { profile } = useProfile(session);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loans, setLoans] = useState<ToolLoan[]>([]);
  const [users, setUsers] = useState<{ id: string; display_name: string | null; email: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toolForm, setToolForm] = useState({ name: '', tag_id: '', category: '' });
  const [loanUserId, setLoanUserId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile?.company_id) void load();
  }, [profile?.company_id]);

  async function load() {
    if (!profile?.company_id) return;
    setLoading(true);
    setError(null);

    const [{ data: toolRows }, { data: loanRows }, { data: userRows }] = await Promise.all([
      supabase
        .from('tools')
        .select(`
          id, company_id, tag_id, name, category, status, assigned_user_id, last_service_at, created_at, updated_at,
          assigned_user:profiles!tools_assigned_user_id_fkey(display_name, email)
        `)
        .eq('company_id', profile.company_id)
        .order('name'),
      supabase
        .from('tool_loans')
        .select(`
          id, tool_id, user_id, work_report_id, loaned_at, returned_at,
          user:profiles!tool_loans_user_id_fkey(display_name, email),
          tool:tools!tool_loans_tool_id_fkey(name, tag_id)
        `)
        .is('returned_at', null)
        .order('loaned_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, display_name, email')
        .eq('company_id', profile.company_id)
        .neq('role', 'customer')
        .order('display_name'),
    ]);

    setTools((toolRows as unknown as Tool[]) ?? []);
    setLoans((loanRows as unknown as ToolLoan[]) ?? []);
    const userList = (userRows as { id: string; display_name: string | null; email: string | null }[]) ?? [];
    setUsers(userList);
    if (userList[0]) {
      setLoanUserId((prev) => {
        const next = { ...prev };
        for (const tool of (toolRows as unknown as Tool[]) ?? []) {
          if (!next[tool.id]) next[tool.id] = userList[0].id;
        }
        return next;
      });
    }
    setLoading(false);
  }

  async function addTool(e: FormEvent) {
    e.preventDefault();
    if (!profile?.company_id || !toolForm.name.trim()) return;
    setBusy(true);
    setError(null);
    const { error: insertError } = await supabase.from('tools').insert({
      company_id: profile.company_id,
      name: toolForm.name.trim(),
      tag_id: toolForm.tag_id.trim() || null,
      category: toolForm.category.trim() || null,
      status: 'available',
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setToolForm({ name: '', tag_id: '', category: '' });
    setMessage('Työkalu lisätty.');
    await load();
  }

  async function loanTool(toolId: string) {
    const userId = loanUserId[toolId];
    if (!userId) return;
    setBusy(true);
    setError(null);
    const { error: loanError } = await supabase.from('tool_loans').insert({
      tool_id: toolId,
      user_id: userId,
    });
    if (loanError) {
      setBusy(false);
      setError(loanError.message);
      return;
    }
    await supabase.from('tools').update({ status: 'loaned', assigned_user_id: userId }).eq('id', toolId);
    setBusy(false);
    setMessage('Työkalu lainattu.');
    await load();
  }

  async function returnTool(toolId: string) {
    setBusy(true);
    setError(null);
    const activeLoan = loans.find((l) => l.tool_id === toolId);
    if (activeLoan) {
      await supabase
        .from('tool_loans')
        .update({ returned_at: new Date().toISOString() })
        .eq('id', activeLoan.id);
    }
    await supabase
      .from('tools')
      .update({ status: 'available', assigned_user_id: null })
      .eq('id', toolId);
    setBusy(false);
    setMessage('Työkalu palautettu.');
    await load();
  }

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / Työkalut
          </p>
          <h1>Työkaluhallinta</h1>
          <p className="muted">Työkalut, tunnisteet ja lainaukset.</p>
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
                  const isLoaned = tool.status === 'loaned';
                  return (
                    <li key={tool.id} className="panel" style={{ marginBottom: '.75rem', padding: '.85rem' }}>
                      <div className="daily-log-head">
                        <div>
                          <strong>{tool.name}</strong>
                          {tool.tag_id && <span className="muted"> · {tool.tag_id}</span>}
                          <p className="muted" style={{ margin: '.25rem 0 0' }}>
                            {TOOL_STATUS_LABELS[tool.status] ?? tool.status}
                            {tool.assigned_user?.display_name && ` · ${tool.assigned_user.display_name}`}
                          </p>
                        </div>
                        <div className="daily-log-actions">
                          {isLoaned ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={busy}
                              onClick={() => void returnTool(tool.id)}
                            >
                              Palauta
                            </button>
                          ) : (
                            <>
                              <select
                                value={loanUserId[tool.id] ?? ''}
                                onChange={(e) =>
                                  setLoanUserId({ ...loanUserId, [tool.id]: e.target.value })
                                }
                              >
                                {users.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.display_name ?? u.email ?? u.id}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={busy}
                                onClick={() => void loanTool(tool.id)}
                              >
                                Lainaa
                              </button>
                            </>
                          )}
                        </div>
                      </div>
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
