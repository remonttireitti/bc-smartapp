import assert from 'node:assert/strict';
import { generateWorkReportPrintHtml } from '../src/lib/workReportPrintHtml.ts';

const report = {
  id: 'r1',
  status: 'done',
  equipment_id: 'e1',
  equipment: { name: 'Vain yksi', tag: 'A' },
  customers: { name: 'Testiasiakas' },
  title: 'Huolto',
  description: 'Kuvaus',
  heading: null,
  location_text: null,
  orderer_name: null,
  completed_at: '2026-09-20T10:00:00Z',
  scheduled_start: null,
  branding_company: null,
  owner_company: { name: 'BC' },
  delegate_company: null,
  assignee: null,
  created_by_profile: null,
};

const htmlOne = generateWorkReportPrintHtml({
  report,
  logs: [],
  showPartnerPrices: false,
  calculation: null,
  meta: { companyName: 'BC' },
  equipmentLinks: [
    { id: 'e1', name: 'ILP 1', tag: 'ILP-1' },
    { id: 'e2', name: 'ILP 2', tag: 'ILP-2' },
    { id: 'e3', name: 'ILP 3', tag: null },
  ],
});

assert.match(htmlOne, /Laitteet/);
assert.match(htmlOne, /ILP-1/);
assert.match(htmlOne, /ILP-2/);
assert.match(htmlOne, /ILP 3/);
assert.doesNotMatch(htmlOne, /Vain yksi/);

const htmlLegacy = generateWorkReportPrintHtml({
  report,
  logs: [],
  showPartnerPrices: false,
  calculation: null,
  meta: { companyName: 'BC' },
});
assert.match(htmlLegacy, /Laite/);
assert.match(htmlLegacy, /Vain yksi|A/);

console.log('test-work-report-print-multi-equipment: ok');
