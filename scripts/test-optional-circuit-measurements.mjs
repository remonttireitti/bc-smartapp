import assert from 'node:assert/strict';
import { circuitMeasurementsStatus } from '../src/lib/huoltoRaportti/refrigerantCircuitHelpers.ts';
import { createEmptyHuoltoReportData } from '../src/lib/huoltoRaportti/defaults.ts';
import { inspectionStatusToDocumentCompletion } from '../src/lib/huoltoRaportti/maintenanceDocumentUnitEntries.ts';

const emptyCircuit = createEmptyHuoltoReportData().kylmaainePiiri1;
assert.ok(emptyCircuit);
assert.equal(emptyCircuit.onKaytossa, true);
assert.equal(circuitMeasurementsStatus(emptyCircuit), 'ok');
assert.equal(inspectionStatusToDocumentCompletion(circuitMeasurementsStatus(emptyCircuit)), 'ok');

assert.equal(
  circuitMeasurementsStatus({ ...emptyCircuit, onKaytossa: false }),
  'na',
);

assert.equal(
  circuitMeasurementsStatus({ ...emptyCircuit, imupaine: '3.5', korkeapaine: '12.0' }),
  'ok',
);

console.log('test-optional-circuit-measurements: ok');
