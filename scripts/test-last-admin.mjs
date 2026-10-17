import assert from 'node:assert/strict';
import { LAST_ADMIN_MESSAGE, companyAdminCount, isLastAdminError, isLastCompanyAdmin, profileErrorMessage } from '../src/lib/lastAdmin.ts';

const users = [
  { id: 'a1', role: 'admin', company_id: 'c1' },
  { id: 't1', role: 'technician', company_id: 'c1' },
  { id: 'a2', role: 'admin', company_id: 'c2' },
  { id: 'a3', role: 'admin', company_id: 'c2' },
];
assert.equal(companyAdminCount(users, 'c1'), 1);
assert.equal(companyAdminCount(users, 'c2'), 2);
// Lasketaan yrityskohtaisesti (GBA-näkymässä useita yrityksiä).
assert.equal(isLastCompanyAdmin(users[0], users), true);
assert.equal(isLastCompanyAdmin(users[1], users), false);
assert.equal(isLastCompanyAdmin(users[2], users), false);
// Tietokannan virhe → selkeä viesti
assert.equal(isLastAdminError({ message: 'Yrityksellä pitää olla vähintään yksi ylläpitäjä', details: 'last_company_admin' }), true);
assert.equal(isLastAdminError(new Error('Yrityksellä pitää olla vähintään yksi ylläpitäjä. Lisää ensin toinen ylläpitäjä.')), true);
assert.equal(isLastAdminError({ message: 'permission denied' }), false);
assert.equal(profileErrorMessage({ message: 'x', details: 'last_company_admin' }, 'f'), LAST_ADMIN_MESSAGE);
assert.equal(profileErrorMessage({ message: 'muu virhe' }, 'f'), 'muu virhe');
assert.equal(profileErrorMessage(null, 'f'), 'f');
console.log('test-last-admin OK');
