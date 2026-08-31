/**
 * Päivittää laiterekisterin huoltopöytäkirjoista (myös ilman sarjanumeroa).
 *
 *   npm run sync:equipment-huolto-snapshots -- --dry-run --production
 *   npm run sync:equipment-huolto-snapshots -- --apply --production
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEquipmentUpdateFromHuoltoReport,
  findLatestMaintenanceReportForEquipment,
  snapshotHasTechnicalData,
} from '../src/lib/equipmentHuoltoSnapshotSync.ts';
import { normalizeHuoltoReportData } from '../src/lib/huoltoRaportti/defaults.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRODUCTION_URL = 'https://qvqmemeexberatbqxivw.supabase.co';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || !args.has('--apply');
const PRODUCTION = args.has('--production');
const ONLY_MISSING = !args.has('--all');

function getServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const raw = execSync('npx supabase projects api-keys --project-ref qvqmemeexberatbqxivw', {
    encoding: 'utf8',
    cwd: resolve(__dirname, '..'),
  });
  for (const line of raw.split('\n')) {
    if (!line.includes('service_role')) continue;
    const parts = line.split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[0] === 'service_role') return parts[1];
  }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY puuttuu');
}

function stableJson(value) {
  return JSON.stringify(value);
}

async function fetchAllRows(supabase, table, select) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  const supabase = createClient(
    PRODUCTION ? PRODUCTION_URL : process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    getServiceKey(),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== APPLY ===');
  console.log('ONLY_MISSING:', ONLY_MISSING);

  const equipment = await fetchAllRows(
    supabase,
    'equipment',
    'id, customer_id, owner_company_id, name, tag, model, serial_number, location, device_type, huolto_technical_snapshot',
  );
  const reports = await fetchAllRows(
    supabase,
    'maintenance_reports',
    'id, customer_id, equipment_id, status, data, updated_at, completed_at, created_at',
  );

  console.log('Laitteita:', equipment.length);
  console.log('Huoltoraportteja:', reports.length);

  let matched = 0;
  let updated = 0;
  let skippedNoReport = 0;
  let skippedNoData = 0;
  let skippedUnchanged = 0;
  let linkedReports = 0;

  for (const eq of equipment) {
    const report = findLatestMaintenanceReportForEquipment(eq, reports);
    if (!report) {
      skippedNoReport += 1;
      continue;
    }

    const reportData = normalizeHuoltoReportData(report.data);
    if (!reportData.laiteTyyppi?.trim()) {
      skippedNoData += 1;
      continue;
    }

    const patch = buildEquipmentUpdateFromHuoltoReport(reportData, eq);
    if (!snapshotHasTechnicalData(patch.snapshot)) {
      skippedNoData += 1;
      continue;
    }

    if (ONLY_MISSING && snapshotHasTechnicalData(eq.huolto_technical_snapshot)) {
      skippedUnchanged += 1;
      continue;
    }

    const nextSnapshotJson = stableJson(patch.snapshot);
    const currentSnapshotJson = stableJson(eq.huolto_technical_snapshot ?? {});
    const basicsChanged =
      (patch.tag ?? eq.tag ?? null) !== (eq.tag ?? null)
      || (patch.model ?? eq.model ?? null) !== (eq.model ?? null)
      || (patch.serial_number ?? eq.serial_number ?? null) !== (eq.serial_number ?? null)
      || (patch.location ?? eq.location ?? null) !== (eq.location ?? null)
      || (patch.device_type ?? eq.device_type ?? null) !== (eq.device_type ?? null);

    if (nextSnapshotJson === currentSnapshotJson && !basicsChanged) {
      skippedUnchanged += 1;
      continue;
    }

    matched += 1;
    const label = `${eq.tag || eq.name || eq.id}`.trim();
    console.log(
      `- ${label}: raportti ${report.id.slice(0, 8)} (${report.status})`
      + `${report.equipment_id ? '' : ' [fuzzy match]'}`,
    );

    if (!DRY_RUN) {
      const updatePayload = {
        huolto_technical_snapshot: patch.snapshot,
        device_type: patch.device_type,
      };
      if (patch.tag !== undefined) updatePayload.tag = patch.tag;
      if (patch.model !== undefined) updatePayload.model = patch.model;
      if (patch.serial_number !== undefined) updatePayload.serial_number = patch.serial_number;
      if (patch.location !== undefined) updatePayload.location = patch.location;

      const { error } = await supabase.from('equipment').update(updatePayload).eq('id', eq.id);
      if (error) throw error;
      updated += 1;

      if (!report.equipment_id) {
        const { error: linkError } = await supabase
          .from('maintenance_reports')
          .update({ equipment_id: eq.id })
          .eq('id', report.id);
        if (linkError) throw linkError;
        linkedReports += 1;
      }
    }
  }

  console.log('\nYhteenveto');
  console.log('Päivitettäviä:', matched);
  console.log('Päivitetty:', updated);
  console.log('Linkitettyjä raportteja:', linkedReports);
  console.log('Ei raporttia:', skippedNoReport);
  console.log('Ei teknistä dataa:', skippedNoData);
  console.log('Ohitettu (jo ajantasalla):', skippedUnchanged);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
