import assert from 'node:assert/strict';
import {
  formatRentalPeriodLabel,
  rentalDayCount,
  rentalRegisteredDate,
} from '../src/lib/refrigerantBottle.ts';

const rental = {
  ownership_type: 'rental',
  purchase_date: '2026-08-01',
  created_at: '2026-08-01T08:00:00.000Z',
  returned_at: null,
};

assert.equal(rentalRegisteredDate(rental), '2026-08-01');

const days = rentalDayCount(rental, new Date('2026-08-28T12:00:00'));
assert.equal(days, 28);

const owned = {
  ownership_type: 'owned',
  purchase_date: '2026-08-01',
  created_at: '2026-08-01T08:00:00.000Z',
  returned_at: null,
};
assert.equal(rentalDayCount(owned), null);

const returned = {
  ...rental,
  returned_at: '2026-08-10',
};
assert.equal(rentalDayCount(returned), 10);
assert.match(formatRentalPeriodLabel(returned) ?? '', /10 päivää vuokralla/);

const legacy = {
  ownership_type: 'rental',
  purchase_date: null,
  created_at: '2026-06-15T10:00:00.000Z',
  returned_at: null,
};
assert.equal(rentalRegisteredDate(legacy), '2026-06-15');

assert.match(formatRentalPeriodLabel({ ...rental, rental_supplier: 'onninen' }) ?? '', /Onninen/);

console.log('test-refrigerant-rental-days: ok');
