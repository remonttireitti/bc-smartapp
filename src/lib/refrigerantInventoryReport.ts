import type { SupabaseClient } from '@supabase/supabase-js';

import type { RefrigerantCylinderMovement, RefrigerantMovementType } from '../types/inventory';
import { REFRIGERANT_MOVEMENT_TYPE_LABELS } from '../types/inventory';

export type RefrigerantPeriodReportRow = {
  kind: 'movement' | 'sold';
  date: string;
  typeLabel: string;
  refrigerant_type: string;
  serial_number: string;
  qty_kg: number;
  customer_name: string;
  location: string;
  ownership: string;
  notes: string;
};

export type RefrigerantPeriodSummary = {
  purchased_kg: number;
  customer_retrieved_kg: number;
  recycled_kg: number;
  work_use_kg: number;
  sold_kg: number;
};

const MOVEMENT_SELECT = `
  id, company_id, cylinder_id, movement_type, qty_kg, refrigerant_type, serial_number,
  customer_id, location, ownership_type, work_report_id, notes, created_at,
  customer:customers(name)
`;

export async function loadRefrigerantPeriodReport(
  supabase: SupabaseClient,
  companyId: string,
  fromIso: string,
  toIso: string,
): Promise<{ rows: RefrigerantPeriodReportRow[]; summary: RefrigerantPeriodSummary }> {
  const summary: RefrigerantPeriodSummary = {
    purchased_kg: 0,
    customer_retrieved_kg: 0,
    recycled_kg: 0,
    work_use_kg: 0,
    sold_kg: 0,
  };

  const { data: movementRows, error: movErr } = await supabase
    .from('refrigerant_cylinder_movements')
    .select(MOVEMENT_SELECT)
    .eq('company_id', companyId)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: true });

  if (movErr) throw movErr;

  const rows: RefrigerantPeriodReportRow[] = [];

  for (const raw of movementRows ?? []) {
    const row = raw as Record<string, unknown>;
    const cust = row.customer;
    const customerName =
      cust && typeof cust === 'object' && !Array.isArray(cust)
        ? (cust as { name: string | null }).name
        : Array.isArray(cust) && cust[0]
          ? (cust[0] as { name: string | null }).name
          : null;
    const m = row as unknown as RefrigerantCylinderMovement;
    const type = m.movement_type as RefrigerantMovementType;
    const qty = Number(m.qty_kg) || 0;

    if (type === 'purchase') summary.purchased_kg += qty;
    if (type === 'customer_retrieve') summary.customer_retrieved_kg += qty;
    if (type === 'recycle') summary.recycled_kg += qty;
    if (type === 'work_use') summary.work_use_kg += qty;

    rows.push({
      kind: 'movement',
      date: m.created_at,
      typeLabel: REFRIGERANT_MOVEMENT_TYPE_LABELS[type] ?? type,
      refrigerant_type: m.refrigerant_type,
      serial_number: m.serial_number ?? '—',
      qty_kg: qty,
      customer_name: customerName ?? '—',
      location: m.location ?? '—',
      ownership: m.ownership_type === 'rental' ? 'Vuokra' : m.ownership_type === 'owned' ? 'Omistus' : '—',
      notes: m.notes ?? '',
    });
  }

  const { data: soldLines, error: soldErr } = await supabase
    .from('work_report_refrigerant_lines')
    .select(
      'qty_kg, refrigerant_type, created_at, bill_to_customer, warehouse_company_id, cylinder:refrigerant_cylinders(serial_number), work_report:work_reports!inner(owner_company_id, customers(name))',
    )
    .eq('bill_to_customer', true)
    .gte('created_at', fromIso)
    .lte('created_at', toIso);

  if (soldErr) throw soldErr;

  for (const line of soldLines ?? []) {
    const wr = line.work_report as { owner_company_id?: string; customers?: { name: string | null } } | null;
    const wh = (line as { warehouse_company_id?: string | null }).warehouse_company_id;
    if (wr?.owner_company_id !== companyId && wh !== companyId) continue;
    const qty = Number(line.qty_kg) || 0;
    if (qty <= 0) continue;
    summary.sold_kg += qty;
    const cyl = line.cylinder as { serial_number?: string } | null;
    rows.push({
      kind: 'sold',
      date: String(line.created_at),
      typeLabel: 'Myyty asiakkaalle (työraportti)',
      refrigerant_type: String(line.refrigerant_type ?? ''),
      serial_number: cyl?.serial_number ?? '—',
      qty_kg: qty,
      customer_name: wr?.customers?.name ?? '—',
      location: '—',
      ownership: '—',
      notes: '',
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  return { rows, summary };
}

export function buildRefrigerantPeriodReportHtml(opts: {
  companyName: string;
  fromLabel: string;
  toLabel: string;
  summary: RefrigerantPeriodSummary;
  rows: RefrigerantPeriodReportRow[];
}): string {
  const { companyName, fromLabel, toLabel, summary, rows } = opts;
  const fmt = (n: number) => n.toFixed(2).replace('.', ',');

  const summaryRows = [
    ['Ostettu / varastoon (kg)', fmt(summary.purchased_kg)],
    ['Asiakkaalta talteen (kg)', fmt(summary.customer_retrieved_kg)],
    ['Myyty asiakkaalle (kg)', fmt(summary.sold_kg)],
    ['Käyttö työkohteilla (kg)', fmt(summary.work_use_kg)],
    ['Kierrätykseen toimitettu (kg)', fmt(summary.recycled_kg)],
  ]
    .map(([label, val]) => `<tr><td>${label}</td><td style="text-align:right;font-weight:bold">${val}</td></tr>`)
    .join('');

  const detailRows = rows
    .map(
      (r) => `<tr>
        <td>${new Date(r.date).toLocaleString('fi-FI')}</td>
        <td>${escapeHtml(r.typeLabel)}</td>
        <td>${escapeHtml(r.refrigerant_type)}</td>
        <td>${escapeHtml(r.serial_number)}</td>
        <td style="text-align:right">${fmt(r.qty_kg)}</td>
        <td>${escapeHtml(r.customer_name)}</td>
        <td>${escapeHtml(r.location)}</td>
        <td>${escapeHtml(r.ownership)}</td>
        <td>${escapeHtml(r.notes)}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>Kylmäaineraportti ${escapeHtml(companyName)}</title>
  <style>
    body { font-family: system-ui, sans-serif; font-size: 11px; margin: 16px; color: #111; }
    h1 { font-size: 16px; margin: 0 0 4px; }
    .muted { color: #555; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    @media print { body { margin: 8px; } }
  </style>
</head>
<body>
  <h1>Kylmäaineraportti</h1>
  <p class="muted">${escapeHtml(companyName)} · ${escapeHtml(fromLabel)} – ${escapeHtml(toLabel)}</p>
  <h2>Yhteenveto</h2>
  <table>${summaryRows}</table>
  <h2>Tapahtumat</h2>
  <table>
    <thead>
      <tr>
        <th>Aika</th><th>Tapahtuma</th><th>Aine</th><th>Pullo</th><th>kg</th>
        <th>Asiakas</th><th>Sijainti</th><th>Omistus</th><th>Huom.</th>
      </tr>
    </thead>
    <tbody>${detailRows || '<tr><td colspan="9">Ei tapahtumia valitulla jaksolla.</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printRefrigerantPeriodReport(html: string): void {
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => w.print();
}
