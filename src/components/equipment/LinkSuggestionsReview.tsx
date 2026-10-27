import { useEffect, useState } from 'react';
import ToggleSwitch from '../ToggleSwitch';
import { supabase } from '../../lib/supabase';
import { emitDataChanged } from '../../lib/dataRefresh';
import {
  acceptEquipmentLink,
  defaultSuggestionSelection,
  incomingEquipmentLinks,
  requestEquipmentLink,
  suggestEquipmentLinks,
  suggestionKey,
  type EquipmentLinkIncoming,
  type EquipmentLinkSuggestion,
} from '../../lib/equipmentLinks';

/** 'Linkitä ehdotetut': asiakkaan laitteiden parit toisen yrityksen laitteisiin, parikohtaiset kytkimet. */
export default function LinkSuggestionsReview({ customerId }: { customerId: string }) {
  const [suggestions, setSuggestions] = useState<EquipmentLinkSuggestion[] | null>(null);
  const [incoming, setIncoming] = useState<EquipmentLinkIncoming[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [accept, setAccept] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function refresh() {
    const [s, inc] = await Promise.all([suggestEquipmentLinks(supabase, customerId), incomingEquipmentLinks(supabase, customerId)]);
    setSuggestions(s);
    setIncoming(inc ?? []);
    setSelected(defaultSuggestionSelection(s ?? []));
    setAccept(new Set());
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  if (suggestions === null || (suggestions.length === 0 && incoming.length === 0)) return null;
  const counts = new Map<string, number>();
  for (const s of suggestions) counts.set(s.mine_id, (counts.get(s.mine_id) ?? 0) + 1);

  function toggle(set: Set<string>, key: string, on: boolean) {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    return next;
  }

  async function apply() {
    setBusy(true);
    setResult(null);
    let active = 0;
    let proposed = 0;
    let failed = 0;
    for (const s of suggestions ?? []) {
      if (!selected.has(suggestionKey(s))) continue;
      try {
        const st = await requestEquipmentLink(supabase, s.mine_id, s.other_id);
        if (st === 'active') active += 1;
        else proposed += 1;
      } catch {
        failed += 1;
      }
    }
    for (const id of accept) {
      try {
        await acceptEquipmentLink(supabase, id);
        active += 1;
      } catch {
        failed += 1;
      }
    }
    setResult(`${active} linkitetty${proposed ? ` · ${proposed} odottaa hyväksyntää` : ''}${failed ? ` · ${failed} epäonnistui` : ''}`);
    setBusy(false);
    emitDataChanged();
    await refresh();
  }

  const total = selected.size + accept.size;

  return (
    <section className="panel link-review-panel" data-testid="link-review">
      <div className="device-notes-head">
        <h2 className="customer-section-title">Linkitys muihin yrityksiin</h2>
        {!open ? (
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
            Linkitä ehdotetut ({suggestions.length + incoming.length})
          </button>
        ) : null}
      </div>
      {result ? <p className="success">{result}</p> : null}
      {open ? (
        <>
          {incoming.length > 0 ? <h3 className="device-links-sub">Pyynnöt</h3> : null}
          {incoming.map((i) => (
            <div className="link-review-row" key={i.link_id}>
              <div>
                <strong>{i.mine_label}</strong> ↔ {i.other_label} <span className="muted">· {i.other_company ?? '—'}</span>
              </div>
              <ToggleSwitch label={`Hyväksy ${i.mine_label}`} checked={accept.has(i.link_id)} onChange={(on) => setAccept((a) => toggle(a, i.link_id, on))} />
            </div>
          ))}
          {suggestions.length > 0 ? <h3 className="device-links-sub">Ehdotukset</h3> : null}
          {suggestions.map((s) => (
            <div className="link-review-row" key={suggestionKey(s)}>
              <div>
                <strong>{s.mine_label}</strong> ↔ {s.other_label}
                <span className={`link-review-score${s.score === 'medium' ? ' link-review-score--medium' : ''}`}>
                  {s.score === 'high' ? 'SN' : 'Tunnus + osoite'}
                </span>
                <div className="muted">
                  {s.other_company ?? '—'}
                  {s.can_activate ? '' : ' · vaatii hyväksynnän'}
                  {(counts.get(s.mine_id) ?? 0) > 1 ? ' · useita ehdokkaita' : ''}
                </div>
              </div>
              <ToggleSwitch
                label={`Linkitä ${s.mine_label}`}
                checked={selected.has(suggestionKey(s))}
                onChange={(on) => setSelected((cur) => toggle(cur, suggestionKey(s), on))}
              />
            </div>
          ))}
          <div className="device-qr-actions">
            <button type="button" className="btn btn-primary" disabled={busy || total === 0} onClick={() => void apply()}>
              {busy ? 'Linkitetään…' : `Linkitä valitut (${total})`}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Sulje
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
