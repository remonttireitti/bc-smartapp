import assert from 'node:assert/strict';
import { normalizeChecklistReport } from '../src/lib/huoltoChecklist/logic';
import { normalizeHuoltoReportData } from '../src/lib/huoltoRaportti/defaults';
import {
  draftMatchesMaintenanceSeason,
  groupMaintenanceProtocols,
  maintenanceProtocolVisibleToPortal,
  protocolsForAudience,
  readExplicitMaintenanceSeason,
  seasonDeviceRows,
  type MaintenanceProtocolRef,
} from '../src/lib/maintenanceSeasonOverview';
import { subscriberPortalReportVisible } from '../src/lib/subscriberPortalVisibility';

function row(partial: MaintenanceProtocolRef): MaintenanceProtocolRef {
  return partial;
}

const springDate = row({
  id: 'repair-spring',
  equipmentId: 'e1',
  status: 'submitted',
  title: 'Korjaus',
  data: { huoltoPaivamaara: '2026-03-12', huomiot: 'Tehtiin keväällä, ei kausihuolto' },
});
const autumnDate = row({
  id: 'repair-autumn',
  equipmentId: 'e1',
  status: 'submitted',
  title: 'Vuototarkastus',
  data: { huoltoPaivamaara: '2026-10-02', laiteKayttotarkoitus: 'Toimistoverkoston vuosihuolto' },
});
const explicitAutumn = row({
  id: 'autumn-2026',
  equipmentId: 'e1',
  status: 'submitted',
  title: 'Pöytäkirja',
  data: { huoltokausi: 'syksy', huoltokausiVuosi: 2026, huoltoPaivamaara: '2026-03-02' },
});
const explicitSpringDraft = row({
  id: 'spring-draft',
  equipmentId: 'e1',
  status: 'draft',
  title: 'Luonnos',
  data: { huoltoKausi: 'kevät', huoltoVuosi: 2026, huoltoPaivamaara: '2026-11-01' },
});
const titledSpring = row({
  id: 'titled-2025',
  equipmentId: 'e2',
  status: 'valmis',
  title: 'Keväthuolto',
  data: { huoltoPaivamaara: '2025-11-20' },
});
const alias = row({
  id: 'alias-2024',
  equipmentId: 'e2',
  status: 'completed',
  title: 'Vanha',
  data: { season: 'autumn', seasonYear: 2024 },
});
const nested = row({
  id: 'nested-2023',
  equipmentId: 'e2',
  status: 'done',
  title: 'Vanha kevät',
  data: { kausihuolto: { kausi: 'kevät', vuosi: 2023 } },
});
const secondAutumn = row({
  id: 'autumn-extra',
  equipmentId: 'e1',
  status: 'draft',
  title: 'Syyshuolto uusinta',
  data: { huoltokausi: 'Syyshuolto 2026' },
});
const commissioning = row({
  id: 'commission',
  equipmentId: 'e3',
  status: 'submitted',
  title: 'Käyttöönotto',
  data: { huoltoReportDocumentKind: 'kayttoonotto', huoltoPaivamaara: '2026-04-01' },
});
const undatedSeason = row({
  id: 'no-year',
  equipmentId: 'e3',
  status: 'submitted',
  title: 'Syyshuolto',
  data: {},
});

const all = [
  springDate,
  autumnDate,
  explicitAutumn,
  explicitSpringDraft,
  titledSpring,
  alias,
  nested,
  secondAutumn,
  commissioning,
  undatedSeason,
];

for (const item of all) Object.freeze(item);

assert.equal(readExplicitMaintenanceSeason(springDate), null);
assert.equal(readExplicitMaintenanceSeason(autumnDate), null);
assert.equal(readExplicitMaintenanceSeason(commissioning), null);
assert.deepEqual(readExplicitMaintenanceSeason(explicitAutumn), {
  season: 'syksy',
  year: 2026,
  source: 'field',
});
assert.deepEqual(readExplicitMaintenanceSeason(explicitSpringDraft)?.season, 'kevat');
assert.equal(readExplicitMaintenanceSeason(explicitSpringDraft)?.year, 2026);
assert.deepEqual(readExplicitMaintenanceSeason(titledSpring), { season: 'kevat', year: 2025, source: 'label' });
assert.deepEqual(readExplicitMaintenanceSeason(alias), { season: 'syksy', year: 2024, source: 'field' });
assert.deepEqual(readExplicitMaintenanceSeason(nested), { season: 'kevat', year: 2023, source: 'field' });
assert.equal(readExplicitMaintenanceSeason(undatedSeason)?.year, null);

const installer = protocolsForAudience(all, 'installer');
const portal = protocolsForAudience(all, 'portal');
assert.equal(installer.some((item) => item.id === 'spring-draft'), true);
assert.equal(portal.some((item) => item.id === 'spring-draft'), false);
assert.equal(portal.some((item) => item.id === 'autumn-extra'), false);
assert.equal(portal.some((item) => item.id === 'autumn-2026'), true);
assert.equal(maintenanceProtocolVisibleToPortal('draft'), false);
assert.equal(maintenanceProtocolVisibleToPortal('submitted'), true);
assert.equal(subscriberPortalReportVisible({ kind: 'maintenance', status: 'draft', visibility: 'as_draft' }), false);
assert.equal(subscriberPortalReportVisible({ kind: 'maintenance', status: 'draft', visibility: 'as_in_progress' }), false);
assert.equal(subscriberPortalReportVisible({ kind: 'maintenance', status: 'submitted', visibility: 'when_ready' }), true);
assert.equal(subscriberPortalReportVisible({ kind: 'work', status: 'draft', visibility: 'as_draft' }), true);

const groups = groupMaintenanceProtocols(installer, { currentYear: 2026 });
assert.deepEqual(groups.map((group) => group.year), [2026, 2025, 2024, 2023, null]);
const year2026 = groups[0];
assert.deepEqual(year2026.seasons.map((bucket) => bucket.label), ['Syyshuolto', 'Keväthuolto']);
assert.deepEqual(year2026.seasons[0].protocols.map((item) => item.id), ['autumn-2026', 'autumn-extra']);
assert.deepEqual(year2026.seasons[1].protocols.map((item) => item.id), ['spring-draft']);
assert.deepEqual(year2026.other.map((item) => item.id), ['repair-autumn', 'commission', 'repair-spring']);
assert.deepEqual(groups[1].seasons[1].protocols.map((item) => item.id), ['titled-2025']);
assert.equal(groups[1].seasons[0].protocols.length, 0);
assert.equal(groups.find((group) => group.year == null)?.seasons[0].protocols[0].id, 'no-year');

const devices = [
  { id: 'e1', label: 'JK10', deviceType: 'lämpöpumppu' },
  { id: 'e2', label: 'IV01', deviceType: 'iv' },
  { id: 'e4', label: 'Uusi', deviceType: null },
];
const autumnDevices = seasonDeviceRows({ devices, protocols: installer, year: 2026, season: 'syksy' });
assert.deepEqual(autumnDevices.map((device) => [device.label, device.status]), [
  ['IV01', 'not_started'],
  ['JK10', 'done'],
  ['Uusi', 'not_started'],
]);
assert.deepEqual(autumnDevices[1].protocols.map((item) => item.id), ['autumn-2026', 'autumn-extra']);
const springDevices = seasonDeviceRows({ devices, protocols: installer, year: 2026, season: 'kevat' });
assert.equal(springDevices.find((device) => device.deviceId === 'e1')?.status, 'started');
assert.equal(springDevices.find((device) => device.deviceId === 'e1')?.protocols.length, 1);
assert.equal(seasonDeviceRows({ devices, protocols: portal, year: 2026, season: 'kevat' }).find((device) => device.deviceId === 'e1')?.status, 'not_started');
assert.equal(seasonDeviceRows({ devices, protocols: installer, year: 2024, season: 'syksy' }).find((device) => device.deviceId === 'e2')?.status, 'done');
assert.equal(draftMatchesMaintenanceSeason(explicitSpringDraft.data, 'kevat', 2026), true);
assert.equal(draftMatchesMaintenanceSeason(explicitSpringDraft.data, 'syksy', 2026), false);
assert.equal(draftMatchesMaintenanceSeason(springDate.data, 'kevat', 2026), false);
assert.equal(draftMatchesMaintenanceSeason(secondAutumn.data, 'syksy', 2025), false);

const before = { huoltoPaivamaara: '2026-04-04', asiakas: 'A' };
const normalized = normalizeHuoltoReportData(before as never);
assert.equal(normalized.huoltokausi, undefined);
assert.equal(normalized.huoltokausiVuosi, undefined);
assert.equal(before.huoltoPaivamaara, '2026-04-04');
const kept = normalizeHuoltoReportData({ ...before, huoltokausi: 'Syksy', huoltokausiVuosi: 2026 } as never);
assert.equal(kept.huoltokausi, 'Syksy');
assert.equal(kept.huoltokausiVuosi, 2026);

const checklist = normalizeChecklistReport({
  reportCategory: 'lvi',
  huoltokausi: 'Syksy',
  huoltokausiVuosi: '2022',
  tarkastusPvm: '2022-03-01',
}, 'lvi');
assert.equal(checklist.huoltokausi, 'Syksy');
assert.equal(checklist.huoltokausiVuosi, 2022);
const checklistPlain = normalizeChecklistReport({ reportCategory: 'iv', tarkastusPvm: '2026-09-01' }, 'iv');
assert.equal(checklistPlain.huoltokausi, undefined);

console.log('test-maintenance-season-overview OK');
