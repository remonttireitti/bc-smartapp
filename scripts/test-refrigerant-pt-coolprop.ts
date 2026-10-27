import assert from 'node:assert/strict';
import { getBubblePointFromPressure, getSaturationTempFromPressure, isRefrigerantPtApproximate } from '../src/lib/huoltoRaportti/refrigerantPt';
import { calculateSubcoolingFromMeasurements, calculateSuperheatFromMeasurements } from '../src/lib/huoltoRaportti/utils';
const near = (a: number, b: number, tol: number, m: string) => assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`);
// Enn: imupaine 2,6 bar (man), imu 2 °C, korkeapaine 15 bar (man), nesteputki 31 °C.
// R-404A: 2,6 barg = 3,613 bar abs → kaste −15,0 °C (taulukko −15 @ 3,610). 15 barg = 16,013 bar abs → kupla 34,5 °C.
near(getSaturationTempFromPressure(2.6, 'R-404A'), -14.98, 0.05, '404A kaste');
near(getBubblePointFromPressure(15, 'R-404A'), 34.5, 0.1, '404A kupla');
near(calculateSuperheatFromMeasurements(2.6, 2, 'R-404A')!, 17.0, 0.1, '404A tulistus');
near(calculateSubcoolingFromMeasurements(15, 31, 'R-404A')!, 3.5, 0.1, '404A alijäähtyminen');
// R-448A (liukuma ~6 K): kaste −9,8 °C, kupla 33,3 °C → tulistus 11,8 K, alijäähtyminen 2,3 K.
near(getSaturationTempFromPressure(2.6, 'R-448A'), -9.77, 0.05, '448A kaste');
near(getBubblePointFromPressure(15, 'R-448A'), 33.33, 0.1, '448A kupla');
near(calculateSuperheatFromMeasurements(2.6, 2, 'R-448A')!, 11.77, 0.1, '448A tulistus');
near(calculateSubcoolingFromMeasurements(15, 31, 'R-448A')!, 2.33, 0.1, '448A alijäähtyminen');
assert.equal(isRefrigerantPtApproximate('R-448A'), false);
// Muut: R-134a 0 °C ≈ 1,93 barg, R-410A 0 °C ≈ 7,0 barg, R-717 −10 °C ≈ 1,89 barg.
near(getSaturationTempFromPressure(1.93, 'R-134a'), 0, 0.3, '134a');
near(getSaturationTempFromPressure(7.0, 'R-410A'), 0, 0.5, '410A');
near(getSaturationTempFromPressure(1.894, 'R-717'), -10, 0.1, '717');
near(getSaturationTempFromPressure(33.84, 'R-744'), 0, 0.1, '744');
console.log('refrigerant-pt ok');
