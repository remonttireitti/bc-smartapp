import assert from 'node:assert/strict';
import {
  appendReturnTripLeg,
  insertIntermediateTripLeg,
  normalizeTripLegDrafts,
  tripLegDeparture,
} from '../src/lib/workReportTripLegs.ts';

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const office = 'Kaivokatu 10, helsinki';
const site = 'Itälahdenkatu 22A';
const otherSite = 'Toinen kohde 1';
const departure = tripLegDeparture(office, office);

function leg(from, to, km = '') {
  return {
    key: crypto.randomUUID(),
    from_label: from,
    to_label: to,
    distance_km: km,
    bill_to_customer: true,
  };
}

test('append väliajo after return starts from office', () => {
  let drafts = normalizeTripLegDrafts([leg(office, site, '4.7')], departure);
  ({ drafts } = appendReturnTripLeg(drafts, 0, departure));
  assert.equal(drafts.length, 2);
  assert.equal(drafts[1].from_label, site);
  assert.equal(drafts[1].to_label, office);

  drafts = insertIntermediateTripLeg(drafts, departure);
  assert.equal(drafts.length, 3);
  assert.equal(drafts[2].from_label, office);
  assert.equal(drafts[2].to_label, '');
});

test('multi-visit route chains office-site-office-site-office', () => {
  let drafts = normalizeTripLegDrafts([leg(office, site)], departure);
  ({ drafts } = appendReturnTripLeg(drafts, 0, departure));
  drafts = insertIntermediateTripLeg(drafts, departure);
  drafts = normalizeTripLegDrafts(
    drafts.map((row, index) => (index === 2 ? { ...row, to_label: site } : row)),
    departure,
  );
  ({ drafts } = appendReturnTripLeg(drafts, 2, departure));

  assert.equal(drafts.length, 4);
  assert.equal(drafts[0].from_label, office);
  assert.equal(drafts[0].to_label, site);
  assert.equal(drafts[1].from_label, site);
  assert.equal(drafts[1].to_label, office);
  assert.equal(drafts[2].from_label, office);
  assert.equal(drafts[2].to_label, site);
  assert.equal(drafts[3].from_label, site);
  assert.equal(drafts[3].to_label, office);
});

test('detour before return via appended stop', () => {
  let drafts = normalizeTripLegDrafts([leg(office, site)], departure);
  drafts = insertIntermediateTripLeg(drafts, departure);
  drafts = normalizeTripLegDrafts(
    drafts.map((row, index) => (index === 1 ? { ...row, to_label: 'Huoltoasema' } : row)),
    departure,
  );
  ({ drafts } = appendReturnTripLeg(drafts, 1, departure));

  assert.equal(drafts.length, 3);
  assert.equal(drafts[0].to_label, site);
  assert.equal(drafts[1].from_label, site);
  assert.equal(drafts[1].to_label, 'Huoltoasema');
  assert.equal(drafts[2].from_label, 'Huoltoasema');
  assert.equal(drafts[2].to_label, office);
});

test('other site to this site then office', () => {
  let drafts = normalizeTripLegDrafts([leg(otherSite, site)], departure);
  ({ drafts } = appendReturnTripLeg(drafts, 0, departure));
  assert.equal(drafts[1].from_label, site);
  assert.equal(drafts[1].to_label, office);
});

console.log('All work report trip leg tests passed.');
