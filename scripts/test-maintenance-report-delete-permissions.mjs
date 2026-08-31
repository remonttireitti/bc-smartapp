import assert from 'node:assert/strict';
import { canDeleteMaintenanceReport } from '../src/lib/deletePermissions.ts';

const ownerCompanyId = 'owner-co';
const partnerCompanyId = 'partner-co';
const userId = 'user-1';

assert.equal(
  canDeleteMaintenanceReport(
    {
      status: 'draft',
      owner_company_id: ownerCompanyId,
      created_by_company_id: partnerCompanyId,
      assigned_user_id: userId,
    },
    userId,
    partnerCompanyId,
    'technician',
    false,
  ),
  true,
);

assert.equal(
  canDeleteMaintenanceReport(
    {
      status: 'submitted',
      owner_company_id: ownerCompanyId,
      created_by_company_id: partnerCompanyId,
      assigned_user_id: userId,
    },
    userId,
    partnerCompanyId,
    'technician',
    false,
  ),
  false,
);

assert.equal(
  canDeleteMaintenanceReport(
    {
      status: 'submitted',
      owner_company_id: ownerCompanyId,
      created_by_company_id: ownerCompanyId,
      assigned_user_id: userId,
    },
    userId,
    ownerCompanyId,
    'admin',
    false,
  ),
  true,
);

console.log('test-maintenance-report-delete-permissions: ok');
