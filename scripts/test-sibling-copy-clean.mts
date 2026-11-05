import fs from 'node:fs';
import { applySiblingEquipmentCopyFields } from '../src/lib/huoltoRaportti/siblingEquipmentCopy.ts';
import { collectReportFaults } from '../src/lib/huoltoRaportti/reportFaults.ts';
import { buildHuoltoEquipmentTechnicalSnapshot } from '../src/lib/huoltoRaportti/equipmentSnapshot.ts';
const rows = JSON.parse(fs.readFileSync(process.argv[2] ?? '/tmp/copyfix.json','utf8'));
let fail=0;
for (const r of rows) {
  const s=r.data;
  const c=applySiblingEquipmentCopyFields(s,{tunnus:'JK1',sarjanumero:'',sameModel:true});
  const f=collectReportFaults(c);
  const snapS=JSON.stringify(buildHuoltoEquipmentTechnicalSnapshot(s)), snapC=JSON.stringify(buildHuoltoEquipmentTechnicalSnapshot({...c}));
  const str=JSON.stringify(c);
  const imgs=(str.match(/data:image|storage\/v1|"path":"[^"]+\.(jpe?g|png)/g)||[]).length;
  const probs=[];
  if(f.length) probs.push('faults '+JSON.stringify(f).slice(0,200));
  if(c.huomiot) probs.push('huomiot');
  if(imgs) probs.push('imgs '+imgs);
  if(c.laiteTunnus!=='JK1') probs.push('tunnus');
  if(c.laiteMalli!==(s.laiteMalli||'').replace(/^—$/,'')&&s.laiteMalli&&s.laiteMalli!=='—') probs.push('malli');
  if(c.laiteTyyppi!==s.laiteTyyppi) probs.push('tyyppi');
  for (const k of ['imupaine','korkeapaine','tulistus']) if (c.kylmaainePiiri1?.[k]) probs.push('meas '+k);
  if (c.mittausAmpeeriL1) probs.push('ampeeri');
  // config equality (ignore serials)
  const strip=(x:string)=>x.replace(/"sarjanumero":"[^"]*"/g,'').replace(/"laiteKayttotarkoitus":"[^"]*"/g,'');
  if (JSON.stringify(s.laiteKokoonpano??null)!==JSON.stringify(c.laiteKokoonpano??null) && s.laiteKokoonpano) probs.push('kokoonpano');
  console.log(s.laiteTyyppi, s.laiteTunnus, 'srcFaults', collectReportFaults(s).length, probs.join('; ')||'OK');
  if(probs.length) fail++;
}
process.exit(fail?1:0);
