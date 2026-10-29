import assert from 'node:assert/strict';
import { applyDeviceTypeDefaults, createEmptyHuoltoReportData } from '../src/lib/huoltoRaportti/defaults';
import * as L from '../src/lib/huoltoRaportti/deviceModuleLogic';
import { vakUsesExplicitConfig } from '../src/lib/huoltoRaportti/deviceKokoonpano';
import { buildMaintenanceReportTabs } from '../src/lib/huoltoRaportti/maintenanceReportTabs';
import { buildMaintenanceDocumentEntries } from '../src/lib/huoltoRaportti/maintenanceDocumentUnitEntries';
import { buildMaintenanceSteps } from '../src/lib/huoltoRaportti/maintenanceSteps';

const variants: Array<[string, string, Record<string, unknown>]> = [
  ['ilp', 'lämpöpumppu', {}],
  ['kylmäkoneikko', 'kylmäkoneikko', {}],
  ['kylmäkoneikko 2hoy', 'kylmäkoneikko', { hoyrystimienMaara: '2', kylmaainePiireja: '1' }],
  ['pakastin', 'pakastin', {}],
  ['vjk', 'vedenjäähdytyskone', {}],
  ['vjk nestel', 'vedenjäähdytyskone', { lauhdutinTyyppiLaite: 'vesijaahdytteinen_nestelauhdutin' }],
  ['mlp', 'mlp', {}],
  ['vil', 'vesiilmalampopumppu', {}],
  ['vak', 'vakioilmastointtikone', { lauhdutinTyyppiLaite: 'ilmalauhdutin' }],
  ['muu', 'muu', {}],
];
for (const [name, type, extra] of variants) {
  const base = applyDeviceTypeDefaults(createEmptyHuoltoReportData(), type) as any;
  const form = { ...base, ...extra } as any;
  const sel = form.selectedModules;
  const input = {
    laiteTyyppi: form.laiteTyyppi, laiteKokoonpano: form.laiteKokoonpano, selectedModules: sel, customModules: [],
    showEvaporatorSection: L.showEvaporatorModules(form.laiteTyyppi, sel),
    showCondenserSection: L.showCondenserModules(form.laiteTyyppi, sel),
    showLauhdutuspiiriSection: L.showVjLauhdutuspiiriModules(form.laiteTyyppi, form.lauhdutinTyyppiLaite, sel),
    showNestelauhduttimetSection: L.showNestelauhduttimetModules(sel, form.lauhdutinTyyppiLaite),
    showJaahdytysvesiSection: sel.vedenjajahdytyskone,
    showVapaajahdytysSection: sel.vapaajahdytys,
    showKonvektoritSection: sel.konvektorit,
    showLampopumppuSection: L.showLampopumppuModules(form.laiteTyyppi, sel),
    showMlpSection: L.showMlpModules(form.laiteTyyppi, sel),
    showChillerKiinteistoSection: L.showChillerKiinteistoSection(form.laiteTyyppi) && !vakUsesExplicitConfig(form),
    showChillerEnergySection: L.showChillerEnergySection(form.laiteTyyppi) && !vakUsesExplicitConfig(form),
    hiddenTabIds: [], moduleTabOrder: [],
  };
  const tabs = buildMaintenanceReportTabs(input as any);
  const entries = buildMaintenanceDocumentEntries(tabs, form);
  const steps = buildMaintenanceSteps(entries, form.laiteTyyppi);
  const titles = steps.map((x) => x.title);
  assert.equal(titles[0], 'Perustiedot', `${name}: Perustiedot ensin`);
  assert.equal(titles[titles.length - 1], 'Huomiot ja kuittaus', `${name}: kuittaus viimeisenä`);
  const idx = (re: RegExp) => titles.findIndex((t) => re.test(t));
  const pairs: Array<[RegExp, RegExp]> = [
    [/^Perustiedot$/, /^Kylmäaine$/],
    [/^Kylmäaine$/, /^Kylmäainepiiri$|^Lauhdutin|^Lauhdutus|^Latauspiiri|^Höyrystin|^Jäähdytys|^Keruu|^Ulko- ja sisä/],
    [/^Kylmäainepiiri$/, /^Lauhdutin|^Lauhdutus|^Latauspiiri/],
    [/^Lauhdutin|^Lauhdutus|^Latauspiiri/, /^Höyrystin|^Jäähdytys|^Keruu/],
    [/^Höyrystin|^Jäähdytys|^Keruu|^Ulko- ja sisä|^Konvektorit/, /^Ohjaus ja mittaukset$|^Mittaukset$/],
    [/^Ohjaus ja mittaukset$|^Mittaukset$/, /^Huomiot ja kuittaus$/],
  ];
  for (const [a, b] of pairs) { const i = idx(a), j = idx(b); if (i >= 0 && j >= 0) assert.ok(i < j, `${name}: ${a} ennen ${b} (${titles.join(' > ')})`); }
  // Lauhdutin kysytään vain yhdessä paikassa: ei erillistä lauhdutinvaihetta kahteen kertaan
  assert.ok(titles.filter((t) => /^Lauhdut/.test(t)).length <= 1, `${name}: lauhdutus vain yhdessä vaiheessa`);
  assert.equal(new Set(titles).size, titles.length, `${name}: ei kaksoisvaiheita`);
}
console.log('test-huolto-step-order OK');
