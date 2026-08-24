import assert from 'node:assert/strict';
import { isInternalCompanyOrderDraft } from '../src/lib/portalWorkOrder.ts';

const base = {
  status: 'draft',
  subscriber_id: null,
  assigned_user_id: null,
  created_by_company_id: 'company-a',
  owner_company_id: 'company-a',
  partnership_id: null,
  delegate_company_id: null,
};

assert.equal(
  isInternalCompanyOrderDraft(base),
  false,
  'plain draft without partnership should not be treated as partner order draft',
);

assert.equal(
  isInternalCompanyOrderDraft({ ...base, partnership_id: 'partner-1' }),
  true,
  'draft with partnership_id should open partner order editor',
);

assert.equal(
  isInternalCompanyOrderDraft({ ...base, delegate_company_id: 'company-b' }),
  true,
  'draft with delegate_company_id should open partner order editor',
);

assert.equal(
  isInternalCompanyOrderDraft({ ...base, assigned_user_id: 'user-1' }),
  false,
  'assigned regular draft should not use partner order editor',
);

console.log('test-portal-work-order-draft: ok');
