import assert from 'node:assert/strict';
import { formatCustomerAddressParts, customerAddressLine } from '../src/lib/customers.ts';
import {
  buildHuoltoCustomerFieldsFromRegistry,
  parseReportOsoite,
} from '../src/lib/updateRegistryCustomer.ts';

assert.equal(
  formatCustomerAddressParts({
    address: 'Mannerheimintie 1',
    postal_code: '00100',
    city: 'Helsinki',
  }),
  'Mannerheimintie 1, 00100 Helsinki',
);

assert.equal(
  formatCustomerAddressParts({ address: 'Katu 2', postal_code: null, city: 'Tampere' }),
  'Katu 2, Tampere',
);

assert.equal(
  formatCustomerAddressParts({ address: null, postal_code: '00100', city: 'Helsinki' }),
  '00100 Helsinki',
);

assert.equal(customerAddressLine({ address: null, city: null }), '—');

const parsed = parseReportOsoite('Mannerheimintie 1, 00100 Helsinki');
assert.equal(parsed.address, 'Mannerheimintie 1');
assert.equal(parsed.postal_code, '00100');
assert.equal(parsed.city, 'Helsinki');

const roundTrip = parseReportOsoite('Mannerheimintie 1, 00100 Helsinki', {
  address: 'Mannerheimintie 1',
  postal_code: '00100',
  city: 'Helsinki',
});
assert.equal(roundTrip.postal_code, '00100');

const customer = {
  id: 'c1',
  name: 'Villa Tammikko',
  address: 'Rantatie 5',
  postal_code: '02100',
  city: 'Espoo',
  phone: '040123',
  email: 'a@b.fi',
  business_id: '1234567-8',
};

const patch = buildHuoltoCustomerFieldsFromRegistry(customer, {
  asiakas: '',
  osoite: '',
  asiakasPuhelin: '',
  asiakasEmail: '',
  asiakasYtunnus: '',
  customerId: '',
});

assert.equal(patch.asiakas, 'Villa Tammikko');
assert.equal(patch.osoite, 'Rantatie 5, 02100 Espoo');
assert.equal(patch.asiakasPuhelin, '040123');
assert.equal(patch.asiakasEmail, 'a@b.fi');
assert.equal(patch.asiakasYtunnus, '1234567-8');

const noOverwrite = buildHuoltoCustomerFieldsFromRegistry(customer, {
  asiakas: 'Käyttäjän nimi',
  osoite: 'Käyttäjän osoite',
  asiakasPuhelin: '999',
  asiakasEmail: 'x@y.fi',
  asiakasYtunnus: 'yt',
  customerId: 'c1',
});
assert.equal(noOverwrite.asiakas, undefined);
assert.equal(noOverwrite.osoite, undefined);
assert.equal(noOverwrite.asiakasPuhelin, undefined);

console.log('test-customer-address-sync: ok');
