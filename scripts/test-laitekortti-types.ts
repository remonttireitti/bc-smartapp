import assert from 'node:assert/strict';
import { createEmptyHuoltoReportData, ensureMlpData } from '../src/lib/huoltoRaportti/defaults';
import { applyEquipmentSnapshotToForm, buildHuoltoEquipmentTechnicalSnapshot } from '../src/lib/huoltoRaportti/equipmentSnapshot';
import type { HuoltoReportData } from '../src/lib/huoltoRaportti/types';

const base = (laiteTyyppi: string): HuoltoReportData => ({ ...createEmptyHuoltoReportData(), laiteTyyppi } as HuoltoReportData);
const next = (r1: HuoltoReportData) => {
  const snap = JSON.parse(JSON.stringify(buildHuoltoEquipmentTechnicalSnapshot(r1)));
  const r2 = base(r1.laiteTyyppi);
  return { snap, r2: { ...r2, ...applyEquipmentSnapshotToForm(r2, snap) } as HuoltoReportData };
};

// MLP
{
  const r1 = base('mlp');
  r1.mlpData = ensureMlpData({
    ...ensureMlpData(null),
    keruupiiriPumpunValmistaja: 'Grundfos', keruupiiriNeste: 'Etanoli 28%', keruuPaisuntaAstiaKoko: '18',
    keruuPaisuntaAstiaEsipaine: '0.5', keruupiiriTarkastusTila: 'ok' as never, keruupiiriTarkastusHuomio: 'vuotaa',
    latausGlykoliPakkaskestavyys: '-15', keruupiiriVirtaus: '1.2',
    kayttovesiSahkoVastukset: [{ tunnus: 'V1', teho: '3', jannite: '400', asetusarvo: '55', ohjaustapa: 'termostaatti', toimintaTestattu: true }],
  });
  const { snap, r2 } = next(r1);
  const m = snap.mlpData;
  for (const leak of ['keruuPaisuntaAstiaEsipaine', 'keruupiiriTarkastusTila', 'keruupiiriTarkastusHuomio', 'latausGlykoliPakkaskestavyys', 'keruupiiriVirtaus']) assert.ok(!(leak in m), 'MLP leak ' + leak);
  assert.ok(!('toimintaTestattu' in m.kayttovesiSahkoVastukset[0]), 'MLP vastus testattu leak');
  assert.equal(r2.mlpData!.keruupiiriPumpunValmistaja, 'Grundfos');
  assert.equal(r2.mlpData!.keruuPaisuntaAstiaKoko, '18');
  assert.equal(r2.mlpData!.keruupiiriVirtaus, ensureMlpData(null).keruupiiriVirtaus);
  // ei ylikirjoitusta
  const r3 = base('mlp'); r3.mlpData = ensureMlpData({ ...ensureMlpData(null), keruupiiriPumpunValmistaja: 'Wilo' });
  assert.equal(applyEquipmentSnapshotToForm(r3, snap).mlpData!.keruupiiriPumpunValmistaja, 'Wilo');
  console.log('mlp ok');
}

// VJK
{
  const r1 = base('vedenjäähdytyskone');
  const any1 = r1 as unknown as Record<string, any>;
  any1.vapaajahdytysData = { ...(any1.vapaajahdytysData ?? {}), neste: 'Glykoli', pumppuMalli: 'Magna', virtaus: '3', tarkastusHuomio: 'x' };
  any1.jaahdytysvesiData = { ...(any1.jaahdytysvesiData ?? {}), pumppuValmistaja: 'KSB', paisuntaAstiaKoko: '50', paisuntaAstiaEsipaine: '1.5', paineBar: '2' };
  any1.vjOhjausData = { ohjausValmistaja: 'Carel', lauhdutusOhjausLahde: 'kone', asetusArvot: '7/12', kuvaus: 'käynti' };
  const { snap, r2 } = next(r1);
  const a2 = r2 as unknown as Record<string, any>;
  assert.equal(a2.vapaajahdytysData.neste, 'Glykoli');
  assert.equal(a2.vapaajahdytysData.pumppuMalli, 'Magna');
  assert.ok(!a2.vapaajahdytysData.virtaus, 'VJK virtaus leak');
  assert.ok(!a2.vapaajahdytysData.tarkastusHuomio, 'VJK huomio leak');
  assert.equal(a2.jaahdytysvesiData.pumppuValmistaja, 'KSB');
  assert.equal(a2.jaahdytysvesiData.paisuntaAstiaKoko, '50');
  assert.ok(!a2.jaahdytysvesiData.paisuntaAstiaEsipaine && !a2.jaahdytysvesiData.paineBar, 'VJK esipaine/paine leak');
  assert.equal(a2.vjOhjausData.ohjausValmistaja, 'Carel');
  assert.ok(!a2.vjOhjausData.kuvaus, 'VJK kuvaus leak');
  const r3 = base('vedenjäähdytyskone'); (r3 as any).vjOhjausData = { ohjausValmistaja: 'Danfoss', lauhdutusOhjausLahde: '', asetusArvot: '', kuvaus: '' };
  assert.equal((applyEquipmentSnapshotToForm(r3, snap) as any).vjOhjausData.ohjausValmistaja, 'Danfoss');
  console.log('vjk ok');
}

// VAK
{
  const r1 = base('vakioilmastointtikone');
  r1.kylmaaineTyyppi = 'R-410A'; r1.kylmaainePiireja = '2';
  r1.condenserData = [{ ...r1.condenserData[0], valmistaja: 'Güntner', malli: 'GVH' } as never];
  const { r2 } = next(r1);
  assert.equal(r2.kylmaaineTyyppi, 'R-410A');
  assert.equal(r2.kylmaainePiireja, '2');
  assert.equal(r2.condenserData[0].valmistaja, 'Güntner');
  const r3 = base('vakioilmastointtikone'); r3.kylmaaineTyyppi = 'R-32';
  const p3 = applyEquipmentSnapshotToForm(r3, buildHuoltoEquipmentTechnicalSnapshot(r1));
  assert.ok(!('kylmaaineTyyppi' in p3), 'VAK report value overwritten');
  console.log('vak ok');
}

// ILP
{
  const r1 = base('lämpöpumppu') as any;
  r1.ulkoyksikkoMalli = 'MUZ-LN35'; r1.ulkoyksikkoSarjanumero = 'U123';
  r1.sisayksikkoMaara = 1; r1.sisayksikkoData = [{ ...(r1.sisayksikkoData?.[0] ?? {}), malli: 'MSZ-LN35', sarjanumero: 'S1' }];
  const { r2 } = next(r1) as any;
  assert.equal(r2.ulkoyksikkoMalli, 'MUZ-LN35');
  assert.equal(r2.sisayksikkoData[0].malli, 'MSZ-LN35');
  const r3 = base('lämpöpumppu') as any; r3.ulkoyksikkoMalli = 'Oma';
  assert.ok(!('ulkoyksikkoMalli' in applyEquipmentSnapshotToForm(r3, buildHuoltoEquipmentTechnicalSnapshot(r1))), 'ILP overwritten');
  console.log('ilp ok');
}
console.log('laitekortti-types ok');
