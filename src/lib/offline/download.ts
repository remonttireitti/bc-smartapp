import { supabase } from '../supabase';
import { CUSTOMER_SELECT, EQUIPMENT_SELECT } from '../customers';
import { loadCustomerMaintenanceContext } from '../equipmentMaintenanceHistory';
import { loadCustomerLinkedDocuments } from '../customerDocuments';
import { loadEquipmentDeviceFields } from '../equipmentDeviceFields';
import { loadEquipmentNotes } from '../equipmentNotes';
import { loadMaintenanceReportImagesBySection } from '../maintenanceReportPhotoSync';
import { idbAll, idbDelete } from './idb';
import {
  listOfflineCustomers,
  setOfflineCustomers,
  type OfflineCustomer,
  type RowEntry,
} from './store';
import { listOutbox } from './store';

const PAGE = 500;
const STALE_MS = 6 * 60 * 60 * 1000;

async function pagedAll(table: string, customerId: string, order: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('customer_id', customerId)
      .order(order, { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Lataa asiakkaan laitteet, laitekortit, pöytäkirjat ja merkinnät laitteen välimuistiin (IndexedDB). */
export async function downloadCustomerOffline(
  customerId: string,
  name: string,
  onStep?: (step: number, total: number) => void,
): Promise<OfflineCustomer> {
  const total = 5;
  const step = (n: number) => onStep?.(n, total);
  step(0);
  const cust = await supabase.from('customers').select('*').eq('id', customerId);
  if (cust.error) throw new Error(cust.error.message);
  await supabase.from('customers').select(CUSTOMER_SELECT).eq('id', customerId).maybeSingle();
  step(1);
  const equipment = await pagedAll('equipment', customerId, 'created_at');
  await supabase.from('equipment').select(EQUIPMENT_SELECT).eq('customer_id', customerId);
  await loadEquipmentDeviceFields(supabase, equipment.map((e) => String(e.id)));
  step(2);
  const reports = await pagedAll('maintenance_reports', customerId, 'updated_at');
  // Kuvametatiedot per pöytäkirja (editori lukee ne avattaessa); itse kuvat eivät tallennu offline-käyttöön.
  const ids = reports.map((r) => String(r.id));
  for (let i = 0; i < ids.length; i += 6) {
    await Promise.all(ids.slice(i, i + 6).map((id) => loadMaintenanceReportImagesBySection(id).catch(() => undefined)));
  }
  step(3);
  await loadCustomerMaintenanceContext(supabase, customerId);
  await loadCustomerLinkedDocuments(supabase, customerId, { portalReadOnly: false });
  step(4);
  await loadEquipmentNotes(supabase, { customerId });
  if (equipment.length > 0) {
    await supabase.from('equipment_notes').select('*').in('equipment_id', equipment.map((e) => String(e.id)));
  }
  step(5);
  const entry: OfflineCustomer = { id: customerId, name, at: Date.now(), devices: equipment.length, reports: reports.length };
  const others = (await listOfflineCustomers()).filter((c) => c.id !== customerId);
  await setOfflineCustomers([...others, entry]);
  return entry;
}

/** Poista asiakkaan välimuisti (lähettämättömiä muutoksia ei koskaan poisteta). */
export async function removeCustomerOffline(customerId: string): Promise<void> {
  const rows = await idbAll<RowEntry>('rows');
  const pending = new Set((await listOutbox()).map((e) => `${e.table}:${e.id}`));
  const equipmentIds = new Set(rows.filter((r) => r.table === 'equipment' && String(r.row.customer_id) === customerId).map((r) => r.id));
  for (const r of rows) {
    const mine =
      (r.table === 'customers' && r.id === customerId) ||
      (r.table !== 'customers' && String(r.row.customer_id) === customerId) ||
      (r.table === 'equipment_notes' && equipmentIds.has(String(r.row.equipment_id)));
    if (mine && !pending.has(r.k)) await idbDelete('rows', r.k);
  }
  const list = (await listOfflineCustomers()).filter((c) => c.id !== customerId);
  await setOfflineCustomers(list);
}

let refreshing = false;
/** Päivitä yli 6 h vanhat offline-asiakkaat taustalla kun verkko on ja jono tyhjä. */
export async function refreshStaleOfflineCustomers(): Promise<void> {
  if (refreshing || !navigator.onLine) return;
  refreshing = true;
  try {
    if ((await listOutbox()).length > 0) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    for (const c of await listOfflineCustomers()) {
      if (Date.now() - c.at > STALE_MS) await downloadCustomerOffline(c.id, c.name).catch(() => undefined);
    }
  } finally {
    refreshing = false;
  }
}
