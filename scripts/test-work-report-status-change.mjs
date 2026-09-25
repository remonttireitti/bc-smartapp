/**
 * Työraportin tilan vaihto raporttinäkymässä ja listassa:
 * - työn tila: Tulossa / Työn alla / Valmis (luonnos ja "Odottaa vastaanottoa" omissa työnkuluissaan)
 * - laskutuksen tila: sama joukko kuin laskutusmoduulin "Merkitse laskutetuksi" / "Peru laskutettu"
 */
import assert from 'node:assert/strict';
import {
  EDITABLE_WORKFLOW_STATUSES,
  buildWorkReportStatusPatch,
  canChangeWorkflowStatus,
  workflowStatusChangedNotice,
  workflowStatusMenuOptions,
} from '../src/lib/workReportStatusUpdate.ts';
import {
  canManageCustomerBillingStatus,
  canManagePartnerBillingStatus,
} from '../src/lib/workReportBillingCopy.ts';

// --- Työn tila
assert.deepEqual(EDITABLE_WORKFLOW_STATUSES, ['scheduled', 'in_progress', 'completed']);
for (const status of ['scheduled', 'in_progress', 'completed', 'billed_partner', 'billed_customer']) {
  assert.equal(canChangeWorkflowStatus(status), true, status);
}
for (const status of ['draft', 'delegated', '', null, undefined, 'tuntematon']) {
  assert.equal(canChangeWorkflowStatus(status), false, String(status));
  assert.deepEqual(workflowStatusMenuOptions(status), []);
}

assert.deepEqual(workflowStatusMenuOptions('in_progress'), [
  { value: 'scheduled', label: 'Tulossa', active: false },
  { value: 'in_progress', label: 'Työn alla', active: true },
  { value: 'completed', label: 'Valmis', active: false },
]);
// Vanha laskutettu-tila näytetään Valmiina
assert.equal(workflowStatusMenuOptions('billed_partner').find((o) => o.active)?.value, 'completed');
assert.equal(workflowStatusChangedNotice('completed'), 'Työn tila vaihdettu: Valmis.');
assert.equal(workflowStatusChangedNotice('in_progress'), 'Työn tila vaihdettu: Työn alla.');

// Tallennettava muutos: Valmis asettaa completed_at, Valmiista pois tyhjentää sen
{
  const toCompleted = buildWorkReportStatusPatch('in_progress', 'completed');
  assert.equal(toCompleted.status, 'completed');
  assert.ok(!Number.isNaN(Date.parse(toCompleted.completed_at)));
  assert.deepEqual(buildWorkReportStatusPatch('completed', 'in_progress'), { status: 'in_progress', completed_at: null });
  assert.deepEqual(buildWorkReportStatusPatch('billed_partner', 'scheduled'), { status: 'scheduled', completed_at: null });
  assert.deepEqual(buildWorkReportStatusPatch('scheduled', 'in_progress'), { status: 'in_progress' });
  assert.equal(buildWorkReportStatusPatch('completed', 'billed_partner'), null, 'laskutus ei ole työn tila');
}

// --- Laskutuksen tila
const baseRow = {
  id: 'wr-1',
  title: 'Wärtsilä – 3 kpl muuntamon jäähdytys',
  status: 'in_progress',
  completed_at: null,
  scheduled_start: null,
  created_at: '2026-09-03T08:00:00Z',
  owner_company_id: 'owner',
  created_by_company_id: 'creator',
  delegate_company_id: null,
  customers: null,
  owner_company: { name: 'Lämpökatsastus Oy' },
  delegate_company: null,
  billing: {
    partner_invoice_status: 'partial',
    partner_invoice_amount: 6706.07,
    partner_billed_amount: 3131.5,
    partner_billed_at: '2026-09-24T12:00:00Z',
    customer_invoice_status: 'none',
    customer_invoice_amount: null,
    customer_billed_at: null,
  },
  billable: { partner_total: 6706.07 },
};

// Kumppaniraportti: tekijä (lähtevä) ja omistaja (saapuva) voivat merkitä, ulkopuolinen ei
assert.equal(canManagePartnerBillingStatus(baseRow, 'creator', true), true, 'tekijä');
assert.equal(canManagePartnerBillingStatus(baseRow, 'owner', true), true, 'omistaja');
assert.equal(canManagePartnerBillingStatus(baseRow, 'someone-else', true), false);
assert.equal(canManagePartnerBillingStatus(baseRow, null, true), false);

// Oma raportti (ei kumppania): ei kumppanilaskutusta
const ownRow = { ...baseRow, created_by_company_id: 'owner', billing: null, billable: null };
assert.equal(canManagePartnerBillingStatus(ownRow, 'owner', true), false);

// Toimeksianto: toimeksisaaja voi merkitä
const delegatedRow = { ...baseRow, created_by_company_id: 'owner', delegate_company_id: 'delegate' };
assert.equal(canManagePartnerBillingStatus(delegatedRow, 'delegate', true), true);

// Kumppaniraportti ilman kirjauksia / summia: ei laskutettavaa
const emptyPartnerRow = { ...baseRow, billing: null, billable: null };
assert.equal(canManagePartnerBillingStatus(emptyPartnerRow, 'creator', false), false);
assert.equal(canManagePartnerBillingStatus(emptyPartnerRow, 'creator', true), true);

// Asiakaslaskutus: vain omistaja, kun moduuli käytössä, ei luonnos / vastaanottamaton
assert.equal(canManageCustomerBillingStatus(baseRow, 'owner', true), true);
assert.equal(canManageCustomerBillingStatus(baseRow, 'owner', false), false);
assert.equal(canManageCustomerBillingStatus(baseRow, 'creator', true), false);
assert.equal(canManageCustomerBillingStatus({ ...baseRow, status: 'draft' }, 'owner', true), false);
assert.equal(canManageCustomerBillingStatus({ ...baseRow, status: 'delegated' }, 'owner', true), false);

console.log('test-work-report-status-change: ok');
