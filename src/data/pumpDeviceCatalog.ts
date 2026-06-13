/**
 * Lämpöpumppujen peruskatalogi (listahinnat alv 0). Käytetään tarjouspyynnössä ja laiterekisterissä.
 */
// Laitelistat (alv 0%)
export interface HeatPumpDevice {
  id: string;
  /** Valmistaja / brändi (esim. Daikin, Inventor) */
  brand: string;
  name: string;
  model: string;
  // Daikin VILP - yhteensopivuusmatriisin metatiedot (valinnainen)
  vilpSeries?: string;
  vilpOutdoorModel?: string;
  vilpIndoorModel?: string;
  vilpIndoorType?: 'hydrobox' | 'integrated';
  vilpTankLiters?: 0 | 180 | 230;
  vilpZones?: 1 | 2;
  vilpCooling?: boolean;
  heatingPowerMin: number; // kW
  heatingPowerMax: number; // kW
  coolingPowerMin?: number; // kW
  coolingPowerMax?: number; // kW
  /**
   * Ilma–ilma: valmistajan nimellisteho (kW), yleensä jäähdytyksen nimellisarvo (esim. 7,1 kW @ 24k BTU).
   * Käytetään suositus-/mitoitusnäkymässä; jos puuttuu, arvataan mallikoodista.
   */
  iilpNominalKw?: number;
  /** Tulosteen lyhyt ominaisuuslista (WiFi, suodatin, …) — jos tyhjä, arvataan merkistä */
  printFeatures?: string[];
  listPrice: number;
  /** Oletusalennus % brändin oletuksen sijaan (esim. Daikin Altherma 4 H 52.5%) */
  defaultDiscountPercent?: number;
  category: 'ilmalampopumppu' | 'vesi-ilmalampopumppu';

  /**
   * Inventor: postitusyksiköt / järjestelmä (RAC-split, multisplit, VILP). €/yksikkö tulee laiterekisteristä (IILP/VILP erikseen).
   * Voit yliajaa yksikkömäärän (harvoin tarvitaan).
   */
  inventorPostageUnits?: number;
  /** Ilma–ilma multisplit-paketti (näytä vertailu erillisiin splitteihin) */
  iilpMultisplit?: boolean;
  /** Vertailu: vastaavien erillisten split-laitteiden määrä (esim. 2) */
  iilpCompareSplitCount?: number;
  /** Vertailu: `ilmaLampopumput`-id (esim. inv-ar5vi-09) */
  iilpCompareSplitDeviceId?: string;

  /**
   * Vesi–ilmalämpöpumput:
   * - Daikin (split): tulosteeseen voidaan näyttää sisäyksikkö (integroitu varaaja / hydrobox)
   * - Inventor (monoblock): ei sisäyksikköä → tulosteessa vain ulkoyksikkö
   */
  vilpHasIndoorUnit?: boolean;
  /**
   * VILP: ulkoyksikön syöttö (1 tai 3 vaihetta). Täytetään laiterekisterissä; 1-vaihe näytetään huomiona.
   */
  vilpOutdoorSupplyPhases?: 1 | 3;
  /**
   * Ilma–ilma: myytävä kokonaisuus — pelkkä jäähdytys vai jäähdytys ja lämmitys (esim. kerrostalon viilennykseen).
   */
  iilpProductMode?: 'cooling_only' | 'cooling_and_heating';
  /** Laiterekisterin yliajokuvat tulosteisiin (URL). */
  registryImageUrlIndoor?: string;
  registryImageUrlOutdoor?: string;
}

// Ilmalämpöpumput (ilma-ilma) — Daikin listahinnat alv 0% (Residential hinnasto 1.4.2025); oletushankinta -52.5% (DEVICE_DEFAULTS.daikin)
export const ilmaLampopumput: HeatPumpDevice[] = [
  { id: 'ftxtm30a', brand: 'Daikin', name: 'Daikin Perfera N FTXTM30 + RXTM30', model: 'FTXTM30A + RXTM30A', heatingPowerMin: 0.8, heatingPowerMax: 7.4, coolingPowerMin: 0.8, coolingPowerMax: 7.1, listPrice: 2694, category: 'ilmalampopumppu', printFeatures: ['WiFi (Daikin Residential Controller / Onecta)', 'Silver ion -pinnoite sisäyksikössä', 'R32-kylmäaine', 'Hiljainen käynti (malliasetukset)'] },
  { id: 'ftxtm40a', brand: 'Daikin', name: 'Daikin Perfera N FTXTM40 + RXTM40', model: 'FTXTM40A + RXTM40A', heatingPowerMin: 0.9, heatingPowerMax: 8.8, coolingPowerMin: 0.8, coolingPowerMax: 5.2, listPrice: 2817, category: 'ilmalampopumppu' },
  // Perfera Cool (viilentävä mallisto, hinnasto s. 4)
  { id: 'ftxm20a', brand: 'Daikin', name: 'Daikin Perfera Cool FTXM20 + RXM20', model: 'FTXM20A + RXM20A', heatingPowerMin: 1.3, heatingPowerMax: 3.5, coolingPowerMin: 1.3, coolingPowerMax: 2.6, listPrice: 2037, category: 'ilmalampopumppu', printFeatures: ['WiFi', 'Flash streamer', 'R32'] },
  { id: 'ftxm25a9', brand: 'Daikin', name: 'Daikin Perfera Cool FTXM25 + RXM25A9', model: 'FTXM25A + RXM25A9', heatingPowerMin: 1.3, heatingPowerMax: 4.7, coolingPowerMin: 1.3, coolingPowerMax: 3.2, listPrice: 2238, category: 'ilmalampopumppu', printFeatures: ['WiFi', 'Flash streamer', 'R32'] },
  { id: 'ftxm35a9', brand: 'Daikin', name: 'Daikin Perfera Cool FTXM35 + RXM35A9', model: 'FTXM35A + RXM35A9', heatingPowerMin: 1.4, heatingPowerMax: 5.2, coolingPowerMin: 1.4, coolingPowerMax: 4.0, listPrice: 2314, category: 'ilmalampopumppu', printFeatures: ['WiFi', 'Flash streamer', 'R32'] },
  { id: 'ftxm42a', brand: 'Daikin', name: 'Daikin Perfera Cool FTXM42 + RXM42', model: 'FTXM42A + RXM42A', heatingPowerMin: 1.7, heatingPowerMax: 6.0, coolingPowerMin: 1.7, coolingPowerMax: 5.0, listPrice: 2615, category: 'ilmalampopumppu', printFeatures: ['WiFi', 'Flash streamer', 'R32'] },
  { id: 'ftxm50a8', brand: 'Daikin', name: 'Daikin Perfera Cool FTXM50 + RXM50A8', model: 'FTXM50A + RXM50A8', heatingPowerMin: 1.7, heatingPowerMax: 7.7, coolingPowerMin: 1.7, coolingPowerMax: 6.0, listPrice: 2964, category: 'ilmalampopumppu', printFeatures: ['WiFi', 'Flash streamer', 'R32'] },
  { id: 'ftxm60a', brand: 'Daikin', name: 'Daikin Perfera Cool FTXM60 + RXM60', model: 'FTXM60A + RXM60A', heatingPowerMin: 1.7, heatingPowerMax: 8.0, coolingPowerMin: 1.7, coolingPowerMax: 7.0, listPrice: 4769, category: 'ilmalampopumppu', printFeatures: ['WiFi', 'Flash streamer', 'R32'] },
  { id: 'ftxm71a', brand: 'Daikin', name: 'Daikin Perfera Cool FTXM71 + RXM71', model: 'FTXM71A + RXM71A', heatingPowerMin: 2.3, heatingPowerMax: 10.2, coolingPowerMin: 2.3, coolingPowerMax: 8.5, listPrice: 5221, category: 'ilmalampopumppu', printFeatures: ['WiFi', 'Flash streamer', 'R32'] },
  { id: 'ftxj25aw', brand: 'Daikin', name: 'Daikin Emura Cool FTXJ25 Valkoinen', model: 'FTXJ25AW + RXJ25A', heatingPowerMin: 1.3, heatingPowerMax: 4.7, coolingPowerMin: 1.3, coolingPowerMax: 3.2, listPrice: 2695, category: 'ilmalampopumppu' },
  { id: 'ftxj25as', brand: 'Daikin', name: 'Daikin Emura Cool FTXJ25 Hopea', model: 'FTXJ25AS + RXJ25A', heatingPowerMin: 1.3, heatingPowerMax: 4.7, coolingPowerMin: 1.3, coolingPowerMax: 3.2, listPrice: 2886, category: 'ilmalampopumppu' },
  { id: 'ftxj25ab', brand: 'Daikin', name: 'Daikin Emura Cool FTXJ25 Musta', model: 'FTXJ25AB + RXJ25A', heatingPowerMin: 1.3, heatingPowerMax: 4.7, coolingPowerMin: 1.3, coolingPowerMax: 3.2, listPrice: 2811, category: 'ilmalampopumppu' },
  { id: 'ftxj35aw', brand: 'Daikin', name: 'Daikin Emura Cool FTXJ35 Valkoinen', model: 'FTXJ35AW + RXJ35A', heatingPowerMin: 1.4, heatingPowerMax: 5.2, coolingPowerMin: 1.4, coolingPowerMax: 4.0, listPrice: 2899, category: 'ilmalampopumppu' },
  { id: 'ftxj35as', brand: 'Daikin', name: 'Daikin Emura Cool FTXJ35 Hopea', model: 'FTXJ35AS + RXJ35A', heatingPowerMin: 1.4, heatingPowerMax: 5.2, coolingPowerMin: 1.4, coolingPowerMax: 4.0, listPrice: 3111, category: 'ilmalampopumppu' },
  { id: 'ftxj35ab', brand: 'Daikin', name: 'Daikin Emura Cool FTXJ35 Musta', model: 'FTXJ35AB + RXJ35A', heatingPowerMin: 1.4, heatingPowerMax: 5.2, coolingPowerMin: 1.4, coolingPowerMax: 4.0, listPrice: 3023, category: 'ilmalampopumppu' },
  { id: 'ftxa25cw', brand: 'Daikin', name: 'Daikin Stylish Cool FTXA25 Valkoinen', model: 'FTXA25CW + RXA25A8', heatingPowerMin: 1.3, heatingPowerMax: 4.7, coolingPowerMin: 1.3, coolingPowerMax: 3.2, listPrice: 2454, category: 'ilmalampopumppu' },
  { id: 'ftxa25cs', brand: 'Daikin', name: 'Daikin Stylish Cool FTXA25 Hopea', model: 'FTXA25CS + RXA25A8', heatingPowerMin: 1.3, heatingPowerMax: 4.7, coolingPowerMin: 1.3, coolingPowerMax: 3.2, listPrice: 2556, category: 'ilmalampopumppu' },
  { id: 'ftxa25cb', brand: 'Daikin', name: 'Daikin Stylish Cool FTXA25 Musta', model: 'FTXA25CB + RXA25A8', heatingPowerMin: 1.3, heatingPowerMax: 4.7, coolingPowerMin: 1.3, coolingPowerMax: 3.2, listPrice: 2486, category: 'ilmalampopumppu' },
  { id: 'ftxa35cw', brand: 'Daikin', name: 'Daikin Stylish Cool FTXA35 Valkoinen', model: 'FTXA35CW + RXA35A8', heatingPowerMin: 1.4, heatingPowerMax: 5.2, coolingPowerMin: 1.4, coolingPowerMax: 4.0, listPrice: 2650, category: 'ilmalampopumppu' },
  { id: 'ftxa35cs', brand: 'Daikin', name: 'Daikin Stylish Cool FTXA35 Hopea', model: 'FTXA35CS + RXA35A8', heatingPowerMin: 1.4, heatingPowerMax: 5.2, coolingPowerMin: 1.4, coolingPowerMax: 4.0, listPrice: 2769, category: 'ilmalampopumppu' },
  { id: 'ftxa35cb', brand: 'Daikin', name: 'Daikin Stylish Cool FTXA35 Musta', model: 'FTXA35CB + RXA35A8', heatingPowerMin: 1.4, heatingPowerMax: 5.2, coolingPowerMin: 1.4, coolingPowerMax: 4.0, listPrice: 2669, category: 'ilmalampopumppu' },
  { id: 'ftxtj30aw', brand: 'Daikin', name: 'Daikin Nepura N FTXTJ30', model: 'FTXTJ30AW + RXTJ30A', heatingPowerMin: 0.8, heatingPowerMax: 7.1, coolingPowerMin: 0.8, coolingPowerMax: 4.6, listPrice: 3148, category: 'ilmalampopumppu' },
  { id: 'ftxtp25a', brand: 'Daikin', name: 'Daikin Comfora N 25', model: 'FTXTP25A + RXTP25A', heatingPowerMin: 1.2, heatingPowerMax: 6.2, coolingPowerMin: 1.0, coolingPowerMax: 4.1, listPrice: 2175, category: 'ilmalampopumppu' },
  { id: 'ftxtp35a', brand: 'Daikin', name: 'Daikin Comfora N 35', model: 'FTXTP35A + RXTP35A', heatingPowerMin: 1.2, heatingPowerMax: 6.7, coolingPowerMin: 1.0, coolingPowerMax: 4.5, listPrice: 2259, category: 'ilmalampopumppu' },
  // Sensira Cool (hinnasto s. 4)
  { id: 'ftxf25e', brand: 'Daikin', name: 'Daikin Sensira Cool FTXF25', model: 'FTXF25E + RXF25F', heatingPowerMin: 1.3, heatingPowerMax: 3.0, coolingPowerMin: 1.3, coolingPowerMax: 2.8, listPrice: 1270, category: 'ilmalampopumppu' },
  { id: 'ftxf35e', brand: 'Daikin', name: 'Daikin Sensira Cool FTXF35', model: 'FTXF35E + RXF35F', heatingPowerMin: 1.3, heatingPowerMax: 4.8, coolingPowerMin: 1.3, coolingPowerMax: 3.8, listPrice: 1385, category: 'ilmalampopumppu' },
  { id: 'ftxf42f', brand: 'Daikin', name: 'Daikin Sensira Cool FTXF42', model: 'FTXF42F + RXF42F', heatingPowerMin: 1.4, heatingPowerMax: 5.0, coolingPowerMin: 1.4, coolingPowerMax: 4.3, listPrice: 1652, category: 'ilmalampopumppu' },
  { id: 'ftxf50f', brand: 'Daikin', name: 'Daikin Sensira Cool FTXF50', model: 'FTXF50F + RXF50F', heatingPowerMin: 1.7, heatingPowerMax: 7.7, coolingPowerMin: 1.7, coolingPowerMax: 6.0, listPrice: 2471, category: 'ilmalampopumppu' },
  { id: 'ftxf60f', brand: 'Daikin', name: 'Daikin Sensira Cool FTXF60', model: 'FTXF60F + RXF60D9', heatingPowerMin: 1.7, heatingPowerMax: 8.0, coolingPowerMin: 1.7, coolingPowerMax: 7.0, listPrice: 2695, category: 'ilmalampopumppu' },
  { id: 'ftxf71d', brand: 'Daikin', name: 'Daikin Sensira Cool FTXF71', model: 'FTXF71D + RXF71D', heatingPowerMin: 2.3, heatingPowerMax: 9.0, coolingPowerMin: 2.3, coolingPowerMax: 7.3, listPrice: 3364, category: 'ilmalampopumppu' },

  // Inventor (RAC split, hankintahinnat EXW) — oletuksena kate 100% ja alennus 0%
  { id: 'inv-vrvi-09', brand: 'Inventor', name: 'Inventor VERO 09', model: 'VRVI-09WFI + VRVO-09', heatingPowerMin: 0.82, heatingPowerMax: 3.37, coolingPowerMin: 0.91, coolingPowerMax: 3.40, listPrice: 235, category: 'ilmalampopumppu' },
  { id: 'inv-vrvi-12', brand: 'Inventor', name: 'Inventor VERO 12', model: 'VRVI-12WFI + VRVO-12', heatingPowerMin: 0.85, heatingPowerMax: 4.78, coolingPowerMin: 1.11, coolingPowerMax: 4.16, listPrice: 253, category: 'ilmalampopumppu' },
  { id: 'inv-vrvi-18', brand: 'Inventor', name: 'Inventor VERO 18', model: 'VRVI-18WFI + VRVO-18', heatingPowerMin: 3.1, heatingPowerMax: 5.85, coolingPowerMin: 1.82, coolingPowerMax: 6.15, listPrice: 430, category: 'ilmalampopumppu' },
  { id: 'inv-vrvi-24', brand: 'Inventor', name: 'Inventor VERO 24', model: 'VRVI-24WFI + VRVO-24', heatingPowerMin: 1.55, heatingPowerMax: 8.21, coolingPowerMin: 2.08, coolingPowerMax: 7.91, listPrice: 553, category: 'ilmalampopumppu' },
  { id: 'inv-ar5vi-09', brand: 'Inventor', name: 'Inventor ARIA 5 09', model: 'AR5VI-09WFI + AR5VO-09', heatingPowerMin: 0.82, heatingPowerMax: 3.37, listPrice: 260, category: 'ilmalampopumppu' },
  { id: 'inv-ar5vi-12', brand: 'Inventor', name: 'Inventor ARIA 5 12', model: 'AR5VI-12WFI + AR5VO-12', heatingPowerMin: 0.85, heatingPowerMax: 4.78, listPrice: 279, category: 'ilmalampopumppu' },
  { id: 'inv-ar5vi-18', brand: 'Inventor', name: 'Inventor ARIA 5 18', model: 'AR5VI-18WFI + AR5VO-18', heatingPowerMin: 3.1, heatingPowerMax: 5.85, listPrice: 444, category: 'ilmalampopumppu' },
  { id: 'inv-ar5vi-24', brand: 'Inventor', name: 'Inventor ARIA 5 24', model: 'AR5VI-24WFI + AR5VO-24', heatingPowerMin: 1.55, heatingPowerMax: 8.21, listPrice: 576, category: 'ilmalampopumppu' },
  { id: 'inv-n2uvi-09', brand: 'Inventor', name: 'Inventor NEO 09', model: 'N2UVI-09WFI + N2UVO-09', heatingPowerMin: 0.82, heatingPowerMax: 3.37, listPrice: 267, category: 'ilmalampopumppu' },
  { id: 'inv-n2uvi-12', brand: 'Inventor', name: 'Inventor NEO 12', model: 'N2UVI-12WFI + N2UVO-12', heatingPowerMin: 1.08, heatingPowerMax: 4.22, listPrice: 285, category: 'ilmalampopumppu' },
  { id: 'inv-n2uvi-18', brand: 'Inventor', name: 'Inventor NEO 18', model: 'N2UVI-18WFI + N2UVO-18', heatingPowerMin: 1.29, heatingPowerMax: 6.74, listPrice: 450, category: 'ilmalampopumppu' },
  { id: 'inv-n2uvi-24', brand: 'Inventor', name: 'Inventor NEO 24', model: 'N2UVI-24WFI + N2UVO-24', heatingPowerMin: 1.61, heatingPowerMax: 7.91, listPrice: 581, category: 'ilmalampopumppu' },
  { id: 'inv-necuvi-09', brand: 'Inventor', name: 'Inventor NEO ECO 09', model: 'NECUVI-09WFI + NECUVO-09', heatingPowerMin: 0.82, heatingPowerMax: 3.37, listPrice: 288, category: 'ilmalampopumppu' },
  { id: 'inv-necuvi-12', brand: 'Inventor', name: 'Inventor NEO ECO 12', model: 'NECUVI-12WFI + NECUVO-12', heatingPowerMin: 1.07, heatingPowerMax: 4.38, listPrice: 306, category: 'ilmalampopumppu' },
  { id: 'inv-lhuvi-09', brand: 'Inventor', name: 'Inventor LEON 09', model: 'LHUVI-09WFI + LHUVO-09', heatingPowerMin: 0.88, heatingPowerMax: 4.4, coolingPowerMin: 1.08, coolingPowerMax: 3.52, listPrice: 353, category: 'ilmalampopumppu' },
  { id: 'inv-lhuvi-12', brand: 'Inventor', name: 'Inventor LEON 12', model: 'LHUVI-12WFI + LHUVO-12', heatingPowerMin: 0.88, heatingPowerMax: 4.54, coolingPowerMin: 1.32, coolingPowerMax: 3.96, listPrice: 359, category: 'ilmalampopumppu' },
  { id: 'inv-lhuvi-18', brand: 'Inventor', name: 'Inventor LEON 18', model: 'LHUVI-18WFI + LHUVO-18', heatingPowerMin: 1.35, heatingPowerMax: 6.77, coolingPowerMin: 1.35, coolingPowerMax: 5.28, listPrice: 518, category: 'ilmalampopumppu' },
  { id: 'inv-lhuvi-24', brand: 'Inventor', name: 'Inventor LEON 24', model: 'LHUVI-24WFI + LHUVO-24', heatingPowerMin: 1.55, heatingPowerMax: 8.21, coolingPowerMin: 1.55, coolingPowerMax: 7.03, listPrice: 641, category: 'ilmalampopumppu' },
  { id: 'inv-empvi-09', brand: 'Inventor', name: 'Inventor EMPEROR 09', model: 'EMPVI-09WFI + EMPVO-09', heatingPowerMin: 0.8, heatingPowerMax: 4.2, listPrice: 358, category: 'ilmalampopumppu' },
  { id: 'inv-empvi-12', brand: 'Inventor', name: 'Inventor EMPEROR 12', model: 'EMPVI-12WFI + EMPVO-12', heatingPowerMin: 1.0, heatingPowerMax: 5.2, listPrice: 380, category: 'ilmalampopumppu' },
  { id: 'inv-empvi-18', brand: 'Inventor', name: 'Inventor EMPEROR 18', model: 'EMPVI-18WFI + EMPVO-18', heatingPowerMin: 1.4, heatingPowerMax: 6.8, listPrice: 518, category: 'ilmalampopumppu' },
  // EMPEROR 24 ≈ 24 000 BTU — valmistaja: jäähdytys 7,1 (2,1–8,0) kW; nimellisteho suosituksessa 7,1 kW
  { id: 'inv-empvi-24', brand: 'Inventor', name: 'Inventor EMPEROR 24', model: 'EMPVI-24WFI + EMPVO-24', heatingPowerMin: 1.5, heatingPowerMax: 8.5, coolingPowerMin: 2.1, coolingPowerMax: 8.0, listPrice: 641, category: 'ilmalampopumppu', iilpNominalKw: 7.1, printFeatures: ['WiFi (lisävaruste)', 'Ilmansuodatin / ionisaattori (mallista riippuen)', 'Invertteri', 'R32'] },
  { id: 'inv-thrvi-09', brand: 'Inventor', name: 'Inventor THORA 09', model: 'THRVI-09WFI + THRVO-09', heatingPowerMin: 0.75, heatingPowerMax: 7.2, listPrice: 570, category: 'ilmalampopumppu', iilpNominalKw: 7.1 },
  { id: 'inv-thrvi-12', brand: 'Inventor', name: 'Inventor THORA 12', model: 'THRVI-12WFI + THRVO-12', heatingPowerMin: 0.75, heatingPowerMax: 7.2, listPrice: 600, category: 'ilmalampopumppu', iilpNominalKw: 7.1 },

  // Inventor multisplit (ARIA 5) — EXW ATHENS Jan 2025: 2×AR5VI-09WFI 90€+90€; U6RSL(2)-18 ei tullut tekstiparsinnassa → ulkoyksikkö 389€ = U7RS-18 (18k BTU) viite
  {
    id: 'inv-ms-ar5-2x09-u6rsl218',
    brand: 'Inventor',
    name: 'Inventor ARIA 5 multisplit 2×9k + U6RSL(2)-18',
    model: 'U6RSL(2)-18 + 2×AR5VI-09WFI (multisplit)',
    heatingPowerMin: 1.6,
    heatingPowerMax: 6.7,
    coolingPowerMin: 1.8,
    coolingPowerMax: 6.8,
    listPrice: 569,
    category: 'ilmalampopumppu',
    inventorPostageUnits: 1,
    iilpMultisplit: true,
    iilpCompareSplitCount: 2,
    iilpCompareSplitDeviceId: 'inv-ar5vi-09',
    iilpNominalKw: 5.4,
    printFeatures: [
      'EXW: 2×AR5VI-09WFI 90 € + U6RSL(2)-18 389 € (ulkoyksikkö viite U7RS-18, jos U6RSL EXW puuttuu PDF-tekstistä)',
      'Postitus: 50 € / järjestelmä (multisplit)',
    ],
  },
  // 2×AR5VI-12WFI 98€+98€; U6RSL(3)-27: ulkoyksikkö 531 € (interp. U7RS-24…36, 27k BTU)
  {
    id: 'inv-ms-ar5-2x12-u6rsl327',
    brand: 'Inventor',
    name: 'Inventor ARIA 5 multisplit 2×12k + U6RSL(3)-27',
    model: 'U6RSL(3)-27 + 2×AR5VI-12WFI (multisplit)',
    heatingPowerMin: 2.1,
    heatingPowerMax: 9.6,
    coolingPowerMin: 2.2,
    coolingPowerMax: 8.3,
    listPrice: 727,
    category: 'ilmalampopumppu',
    inventorPostageUnits: 1,
    iilpMultisplit: true,
    iilpCompareSplitCount: 2,
    iilpCompareSplitDeviceId: 'inv-ar5vi-12',
    iilpNominalKw: 7.2,
    printFeatures: [
      'EXW: 2×AR5VI-12WFI 98 € + U6RSL(3)-27 531 € (ulkoyksikkö interpoloitu U7RS-24/36 väliltä 27k BTU)',
      'Postitus: 50 € / järjestelmä (multisplit)',
    ],
  },

];

// Vesi-ilmalämpöpumput (Altherma)
export const daikinVesiIlmaLampopumput: HeatPumpDevice[] = [
  // --- Altherma 4 H (R290) ---
  // Seinämalli (Hydrobox) – lämmitys + jäähdytys
  { id: 'epsk08aw1', brand: 'Daikin', name: 'Daikin Altherma 4 H 8kW (Hydrobox)', model: 'EPSK08AW1 + EPBX10A9W', heatingPowerMin: 2.4, heatingPowerMax: 8.0, listPrice: 17106, defaultDiscountPercent: 52.5, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPSK08AW1', vilpIndoorModel: 'EPBX10A9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 4' },
  { id: 'epsk10aw1', brand: 'Daikin', name: 'Daikin Altherma 4 H 10kW (Hydrobox)', model: 'EPSK10AW1 + EPBX10A9W', heatingPowerMin: 2.4, heatingPowerMax: 10.0, listPrice: 17901, defaultDiscountPercent: 52.5, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPSK10AW1', vilpIndoorModel: 'EPBX10A9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 4' },
  { id: 'epsk12aw1', brand: 'Daikin', name: 'Daikin Altherma 4 H 12kW (Hydrobox)', model: 'EPSK12AW1 + EPBX14A9W', heatingPowerMin: 2.4, heatingPowerMax: 12.0, listPrice: 19554, defaultDiscountPercent: 52.5, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPSK12AW1', vilpIndoorModel: 'EPBX14A9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 4' },
  { id: 'epsk14aw1', brand: 'Daikin', name: 'Daikin Altherma 4 H 14kW (Hydrobox)', model: 'EPSK14AW1 + EPBX14A9W', heatingPowerMin: 2.4, heatingPowerMax: 14.0, listPrice: 21492, defaultDiscountPercent: 52.5, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPSK14AW1', vilpIndoorModel: 'EPBX14A9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 4' },
  // Lattiamalli (integroitu varaaja) – lämmitys + jäähdytys
  { id: 'epsk08aw1_epvx10s18', brand: 'Daikin', name: 'Daikin Altherma 4 H 8kW (Integroitu 180L)', model: 'EPSK08AW1 + EPVX10S18A9W', heatingPowerMin: 2.4, heatingPowerMax: 8.0, listPrice: 18432, defaultDiscountPercent: 52.5, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPSK08AW1', vilpIndoorModel: 'EPVX10S18A9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 4' },
  { id: 'epsk08aw1_epvx10s23', brand: 'Daikin', name: 'Daikin Altherma 4 H 8kW (Integroitu 230L)', model: 'EPSK08AW1 + EPVX10S23A9W', heatingPowerMin: 2.4, heatingPowerMax: 8.0, listPrice: 18993, defaultDiscountPercent: 52.5, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPSK08AW1', vilpIndoorModel: 'EPVX10S23A9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 4' },
  { id: 'epsk10aw1_epvx10s18', brand: 'Daikin', name: 'Daikin Altherma 4 H 10kW (Integroitu 180L)', model: 'EPSK10AW1 + EPVX10S18A9W', heatingPowerMin: 2.4, heatingPowerMax: 10.0, listPrice: 19227, defaultDiscountPercent: 52.5, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPSK10AW1', vilpIndoorModel: 'EPVX10S18A9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 4' },
  { id: 'epsk10aw1_epvx10s23', brand: 'Daikin', name: 'Daikin Altherma 4 H 10kW (Integroitu 230L)', model: 'EPSK10AW1 + EPVX10S23A9W', heatingPowerMin: 2.4, vilpOutdoorModel: 'EPSK10AW1', vilpIndoorModel: 'EPVX10S23A9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 4', heatingPowerMax: 10.0, listPrice: 19788, defaultDiscountPercent: 52.5, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'epsk12aw1_epvx14s18', brand: 'Daikin', name: 'Daikin Altherma 4 H 12kW (Integroitu 180L)', model: 'EPSK12AW1 + EPVX14S18A9W', heatingPowerMin: 2.4, heatingPowerMax: 12.0, listPrice: 21216, defaultDiscountPercent: 52.5, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPSK12AW1', vilpIndoorModel: 'EPVX14S18A9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 4' },
  { id: 'epsk12aw1_epvx14s23', brand: 'Daikin', name: 'Daikin Altherma 4 H 12kW (Integroitu 230L)', model: 'EPSK12AW1 + EPVX14S23A9W', heatingPowerMin: 2.4, heatingPowerMax: 12.0, listPrice: 21828, defaultDiscountPercent: 52.5, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPSK12AW1', vilpIndoorModel: 'EPVX14S23A9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 4' },
  { id: 'epsk14aw1_epvx14s18', brand: 'Daikin', name: 'Daikin Altherma 4 H 14kW (Integroitu 180L)', model: 'EPSK14AW1 + EPVX14S18A9W', heatingPowerMin: 2.4, heatingPowerMax: 14.0, listPrice: 23154, defaultDiscountPercent: 52.5, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPSK14AW1', vilpIndoorModel: 'EPVX14S18A9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 4' },
  { id: 'epsk14aw1_epvx14s23', brand: 'Daikin', name: 'Daikin Altherma 4 H 14kW (Integroitu 230L)', model: 'EPSK14AW1 + EPVX14S23A9W', heatingPowerMin: 2.4, heatingPowerMax: 14.0, listPrice: 23766, defaultDiscountPercent: 52.5, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPSK14AW1', vilpIndoorModel: 'EPVX14S23A9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 4' },

  // --- Altherma 3 R (04–08) ---
  // Seinämalli Hydrobox – lämmitys + jäähdytys (ei integroitua varaajaa)
  { id: 'erga04eva_ehbx', brand: 'Daikin', name: 'Daikin Altherma 3 R 4kW (Hydrobox)', model: 'ERGA04EVA + EHBX08E9W', heatingPowerMin: 1.2, heatingPowerMax: 4.6, listPrice: 8274, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERGA04EVA', vilpIndoorModel: 'EHBX08E9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  { id: 'erga06eva_ehbx', brand: 'Daikin', name: 'Daikin Altherma 3 R 6kW (Hydrobox)', model: 'ERGA06EVA + EHBX08E9W', heatingPowerMin: 1.2, heatingPowerMax: 6.0, listPrice: 8444, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERGA06EVA', vilpIndoorModel: 'EHBX08E9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  { id: 'erga08eva_ehbx', brand: 'Daikin', name: 'Daikin Altherma 3 R 8kW (Hydrobox)', model: 'ERGA08EVA + EHBX08E9W', heatingPowerMin: 1.2, heatingPowerMax: 7.8, listPrice: 8859, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERGA08EVA', vilpIndoorModel: 'EHBX08E9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  // Lattiamalli (integroitu varaaja) – lämmitys + jäähdytys
  { id: 'erga04eva', brand: 'Daikin', name: 'Daikin Altherma 3 R 4kW (Integroitu 180L)', model: 'ERGA04EVA + EHVX08S18E9W', heatingPowerMin: 1.2, heatingPowerMax: 4.6, listPrice: 10859, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERGA04EVA', vilpIndoorModel: 'EHVX08S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  { id: 'erga04eva_ehvx23', brand: 'Daikin', name: 'Daikin Altherma 3 R 4kW (Integroitu 230L)', model: 'ERGA04EVA + EHVX08S23E9W', heatingPowerMin: 1.2, heatingPowerMax: 4.6, listPrice: 11163, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERGA04EVA', vilpIndoorModel: 'EHVX08S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  { id: 'erga06eva', brand: 'Daikin', name: 'Daikin Altherma 3 R 6kW (Integroitu 180L)', model: 'ERGA06EVA + EHVX08S18E9W', heatingPowerMin: 1.2, heatingPowerMax: 6.0, listPrice: 11029, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERGA06EVA', vilpIndoorModel: 'EHVX08S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  { id: 'erga06eva_ehvx23', brand: 'Daikin', name: 'Daikin Altherma 3 R 6kW (Integroitu 230L)', model: 'ERGA06EVA + EHVX08S23E9W', heatingPowerMin: 1.2, heatingPowerMax: 6.0, listPrice: 11333, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERGA06EVA', vilpIndoorModel: 'EHVX08S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  { id: 'erga08eva', brand: 'Daikin', name: 'Daikin Altherma 3 R 8kW (Integroitu 180L)', model: 'ERGA08EVA + EHVX08S18E9W', heatingPowerMin: 1.2, heatingPowerMax: 7.8, listPrice: 11444, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERGA08EVA', vilpIndoorModel: 'EHVX08S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  { id: 'erga08eva_ehvx23', brand: 'Daikin', name: 'Daikin Altherma 3 R 8kW (Integroitu 230L)', model: 'ERGA08EVA + EHVX08S23E9W', heatingPowerMin: 1.2, heatingPowerMax: 7.8, listPrice: 11748, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERGA08EVA', vilpIndoorModel: 'EHVX08S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  // 2-vyöhykemalli (integroitu) – pelkkä lämmitys
  { id: 'erga06eva_ehvz18', brand: 'Daikin', name: 'Daikin Altherma 3 R 6kW (2-vyöhyke 180L)', model: 'ERGA06EVA + EHVZ08S18E9W', heatingPowerMin: 1.2, heatingPowerMax: 6.0, listPrice: 12157, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERGA06EVA', vilpIndoorModel: 'EHVZ08S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 R' },
  { id: 'erga06eva_ehvz23', brand: 'Daikin', name: 'Daikin Altherma 3 R 6kW (2-vyöhyke 230L)', model: 'ERGA06EVA + EHVZ08S23E9W', heatingPowerMin: 1.2, heatingPowerMax: 6.0, listPrice: 12579, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERGA06EVA', vilpIndoorModel: 'EHVZ08S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 R' },
  { id: 'erga08eva_ehvz18', brand: 'Daikin', name: 'Daikin Altherma 3 R 8kW (2-vyöhyke 180L)', model: 'ERGA08EVA + EHVZ08S18E9W', heatingPowerMin: 1.2, heatingPowerMax: 7.8, listPrice: 12572, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERGA08EVA', vilpIndoorModel: 'EHVZ08S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 R' },
  { id: 'erga08eva_ehvz23', brand: 'Daikin', name: 'Daikin Altherma 3 R 8kW (2-vyöhyke 230L)', model: 'ERGA08EVA + EHVZ08S23E9W', heatingPowerMin: 1.2, heatingPowerMax: 7.8, listPrice: 12994, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERGA08EVA', vilpIndoorModel: 'EHVZ08S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 R' },

  // --- Altherma 3 R (11–16) ---
  // Seinämalli Hydrobox – lämmitys + jäähdytys (ei integroitua varaajaa)
  { id: 'erla11dw1_ebbx', brand: 'Daikin', name: 'Daikin Altherma 3 R 11kW (Hydrobox)', model: 'ERLA11DW1 + EBBX11D9W', heatingPowerMin: 2.0, heatingPowerMax: 11.0, listPrice: 12058, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA11DW1', vilpIndoorModel: 'EBBX11D9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  { id: 'erla14dw1_ebbx', brand: 'Daikin', name: 'Daikin Altherma 3 R 14kW (Hydrobox)', model: 'ERLA14DW1 + EBBX16D9W', heatingPowerMin: 2.0, heatingPowerMax: 15.0, listPrice: 13049, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA14DW1', vilpIndoorModel: 'EBBX16D9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  { id: 'erla16dw1_ebbx', brand: 'Daikin', name: 'Daikin Altherma 3 R 16kW (Hydrobox)', model: 'ERLA16DW1 + EBBX16D9W', heatingPowerMin: 2.0, heatingPowerMax: 16.0, listPrice: 13383, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA16DW1', vilpIndoorModel: 'EBBX16D9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  // Lattiamalli (integroitu varaaja) – lämmitys + jäähdytys
  { id: 'erla11dw1_ebvx18', brand: 'Daikin', name: 'Daikin Altherma 3 R 11kW (Integroitu 180L)', model: 'ERLA11DW1 + EBVX11S18D9W', heatingPowerMin: 2.0, heatingPowerMax: 11.0, listPrice: 14552, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA11DW1', vilpIndoorModel: 'EBVX11S18D9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  { id: 'erla11dw1_ebvx23', brand: 'Daikin', name: 'Daikin Altherma 3 R 11kW (Integroitu 230L)', model: 'ERLA11DW1 + EBVX11S23D9W', heatingPowerMin: 2.0, heatingPowerMax: 11.0, listPrice: 15053, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA11DW1', vilpIndoorModel: 'EBVX11S23D9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  { id: 'erla14dw1_ebvx18', brand: 'Daikin', name: 'Daikin Altherma 3 R 14kW (Integroitu 180L)', model: 'ERLA14DW1 + EBVX16S18D9W', heatingPowerMin: 2.0, heatingPowerMax: 15.0, listPrice: 15547, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA14DW1', vilpIndoorModel: 'EBVX16S18D9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  { id: 'erla14dw1_ebvx23', brand: 'Daikin', name: 'Daikin Altherma 3 R 14kW (Integroitu 230L)', model: 'ERLA14DW1 + EBVX16S23D9W', heatingPowerMin: 2.0, heatingPowerMax: 15.0, listPrice: 16045, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA14DW1', vilpIndoorModel: 'EBVX16S23D9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  { id: 'erla16dw17_ebvx18', brand: 'Daikin', name: 'Daikin Altherma 3 R 16kW (Integroitu 180L)', model: 'ERLA16DW17 + EBVX16S18D9W', heatingPowerMin: 2.0, heatingPowerMax: 16.0, listPrice: 15881, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA16DW17', vilpIndoorModel: 'EBVX16S18D9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  { id: 'erla16dw17_ebvx23', brand: 'Daikin', name: 'Daikin Altherma 3 R 16kW (Integroitu 230L)', model: 'ERLA16DW17 + EBVX16S23D9W', heatingPowerMin: 2.0, heatingPowerMax: 16.0, listPrice: 16379, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA16DW17', vilpIndoorModel: 'EBVX16S23D9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 R' },
  // 2-vyöhykemalli (integroitu) – pelkkä lämmitys
  { id: 'erla11dw1_ebvz18', brand: 'Daikin', name: 'Daikin Altherma 3 R 11kW (2-vyöhyke 180L)', model: 'ERLA11DW1 + EBVZ16S18D9W', heatingPowerMin: 2.0, heatingPowerMax: 11.0, listPrice: 16630, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA11DW1', vilpIndoorModel: 'EBVZ16S18D9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 R' },
  { id: 'erla11dw1_ebvz23', brand: 'Daikin', name: 'Daikin Altherma 3 R 11kW (2-vyöhyke 230L)', model: 'ERLA11DW1 + EBVZ16S23D9W', heatingPowerMin: 2.0, heatingPowerMax: 11.0, listPrice: 17201, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA11DW1', vilpIndoorModel: 'EBVZ16S23D9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 R' },
  { id: 'erla14dw1_ebvz18', brand: 'Daikin', name: 'Daikin Altherma 3 R 14kW (2-vyöhyke 180L)', model: 'ERLA14DW1 + EBVZ16S18D9W', heatingPowerMin: 2.0, heatingPowerMax: 15.0, listPrice: 16886, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA14DW1', vilpIndoorModel: 'EBVZ16S18D9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 R' },
  { id: 'erla14dw1_ebvz23', brand: 'Daikin', name: 'Daikin Altherma 3 R 14kW (2-vyöhyke 230L)', model: 'ERLA14DW1 + EBVZ16S23D9W', heatingPowerMin: 2.0, heatingPowerMax: 15.0, listPrice: 17457, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA14DW1', vilpIndoorModel: 'EBVZ16S23D9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 R' },
  { id: 'erla16dw17_ebvz18', brand: 'Daikin', name: 'Daikin Altherma 3 R 16kW (2-vyöhyke 180L)', model: 'ERLA16DW17 + EBVZ16S18D9W', heatingPowerMin: 2.0, heatingPowerMax: 16.0, listPrice: 17220, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA16DW17', vilpIndoorModel: 'EBVZ16S18D9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 R' },
  { id: 'erla16dw17_ebvz23', brand: 'Daikin', name: 'Daikin Altherma 3 R 16kW (2-vyöhyke 230L)', model: 'ERLA16DW17 + EBVZ16S23D9W', heatingPowerMin: 2.0, heatingPowerMax: 16.0, listPrice: 17791, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERLA16DW17', vilpIndoorModel: 'EBVZ16S23D9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 R' },

  // --- Altherma 3R MT (08–12) ---
  // Seinämalli Hydrobox – lämmitys + jäähdytys
  { id: 'erra08bew', brand: 'Daikin', name: 'Daikin Altherma 3R MT 8kW (Hydrobox)', model: 'ERRA08EW1 + ELBX12E9W', heatingPowerMin: 2.0, heatingPowerMax: 8.0, listPrice: 12018, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA08EW1', vilpIndoorModel: 'ELBX12E9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3R MT' },
  { id: 'erra10bew', brand: 'Daikin', name: 'Daikin Altherma 3R MT 10kW (Hydrobox)', model: 'ERRA10EW1 + ELBX12E9W', heatingPowerMin: 2.0, heatingPowerMax: 10.0, listPrice: 12618, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA10EW1', vilpIndoorModel: 'ELBX12E9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3R MT' },
  { id: 'erra12bew', brand: 'Daikin', name: 'Daikin Altherma 3R MT 12kW (Hydrobox)', model: 'ERRA12EW1 + ELBX12E9W', heatingPowerMin: 2.0, heatingPowerMax: 12.0, listPrice: 13094, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA12EW1', vilpIndoorModel: 'ELBX12E9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3R MT' },
  // Lattiamalli (integroitu varaaja) – lämmitys + jäähdytys
  { id: 'erra08ew1_elvx18', brand: 'Daikin', name: 'Daikin Altherma 3R MT 8kW (Integroitu 180L)', model: 'ERRA08EW1 + ELVX12S18E9W', heatingPowerMin: 2.0, heatingPowerMax: 8.0, listPrice: 13215, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA08EW1', vilpIndoorModel: 'ELVX12S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3R MT' },
  { id: 'erra08ew1_elvx23', brand: 'Daikin', name: 'Daikin Altherma 3R MT 8kW (Integroitu 230L)', model: 'ERRA08EW1 + ELVX12S23E9W', heatingPowerMin: 2.0, heatingPowerMax: 8.0, listPrice: 13494, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA08EW1', vilpIndoorModel: 'ELVX12S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3R MT' },
  { id: 'erra10ew1_elvx18', brand: 'Daikin', name: 'Daikin Altherma 3R MT 10kW (Integroitu 180L)', model: 'ERRA10EW1 + ELVX12S18E9W', heatingPowerMin: 2.0, heatingPowerMax: 10.0, listPrice: 13815, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA10EW1', vilpIndoorModel: 'ELVX12S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3R MT' },
  { id: 'erra10ew1_elvx23', brand: 'Daikin', name: 'Daikin Altherma 3R MT 10kW (Integroitu 230L)', model: 'ERRA10EW1 + ELVX12S23E9W', heatingPowerMin: 2.0, heatingPowerMax: 10.0, listPrice: 14094, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA10EW1', vilpIndoorModel: 'ELVX12S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3R MT' },
  { id: 'erra12ew1_elvx18', brand: 'Daikin', name: 'Daikin Altherma 3R MT 12kW (Integroitu 180L)', model: 'ERRA12EW1 + ELVX12S18E9W', heatingPowerMin: 2.0, heatingPowerMax: 12.0, listPrice: 14291, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA12EW1', vilpIndoorModel: 'ELVX12S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3R MT' },
  { id: 'erra12ew1_elvx23', brand: 'Daikin', name: 'Daikin Altherma 3R MT 12kW (Integroitu 230L)', model: 'ERRA12EW1 + ELVX12S23E9W', heatingPowerMin: 2.0, heatingPowerMax: 12.0, listPrice: 14570, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA12EW1', vilpIndoorModel: 'ELVX12S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3R MT' },
  // 2-vyöhykemalli (integroitu) – pelkkä lämmitys
  { id: 'erra08ew1_elvz18', brand: 'Daikin', name: 'Daikin Altherma 3R MT 8kW (2-vyöhyke 180L)', model: 'ERRA08EW1 + ELVZ12S18E9W', heatingPowerMin: 2.0, heatingPowerMax: 8.0, listPrice: 14818, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA08EW1', vilpIndoorModel: 'ELVZ12S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3R MT' },
  { id: 'erra08ew1_elvz23', brand: 'Daikin', name: 'Daikin Altherma 3R MT 8kW (2-vyöhyke 230L)', model: 'ERRA08EW1 + ELVZ12S23E9W', heatingPowerMin: 2.0, heatingPowerMax: 8.0, listPrice: 14959, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA08EW1', vilpIndoorModel: 'ELVZ12S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3R MT' },
  { id: 'erra10ew1_elvz18', brand: 'Daikin', name: 'Daikin Altherma 3R MT 10kW (2-vyöhyke 180L)', model: 'ERRA10EW1 + ELVZ12S18E9W', heatingPowerMin: 2.0, heatingPowerMax: 10.0, listPrice: 15418, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA10EW1', vilpIndoorModel: 'ELVZ12S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3R MT' },
  { id: 'erra10ew1_elvz23', brand: 'Daikin', name: 'Daikin Altherma 3R MT 10kW (2-vyöhyke 230L)', model: 'ERRA10EW1 + ELVZ12S23E9W', heatingPowerMin: 2.0, heatingPowerMax: 10.0, listPrice: 15559, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA10EW1', vilpIndoorModel: 'ELVZ12S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3R MT' },
  { id: 'erra12ew1_elvz18', brand: 'Daikin', name: 'Daikin Altherma 3R MT 12kW (2-vyöhyke 180L)', model: 'ERRA12EW1 + ELVZ12S18E9W', heatingPowerMin: 2.0, heatingPowerMax: 12.0, listPrice: 15894, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA12EW1', vilpIndoorModel: 'ELVZ12S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3R MT' },
  { id: 'erra12ew1_elvz23', brand: 'Daikin', name: 'Daikin Altherma 3R MT 12kW (2-vyöhyke 230L)', model: 'ERRA12EW1 + ELVZ12S23E9W', heatingPowerMin: 2.0, heatingPowerMax: 12.0, listPrice: 16035, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'ERRA12EW1', vilpIndoorModel: 'ELVZ12S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3R MT' },

  // --- Altherma 3 H (08–18) ---
  // Seinämalli Hydrobox – lämmitys + jäähdytys (ei integroitua varaajaa)
  { id: 'epra08ew1_etbx12e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 8kW (Hydrobox)', model: 'EPRA08EW1 + ETBX12E9W', heatingPowerMin: 2.0, heatingPowerMax: 8.0, listPrice: 14112, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA08EW1', vilpIndoorModel: 'ETBX12E9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra10ew1_etbx12e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 10kW (Hydrobox)', model: 'EPRA10EW1 + ETBX12E9W', heatingPowerMin: 2.0, heatingPowerMax: 10.0, listPrice: 14530, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA10EW1', vilpIndoorModel: 'ETBX12E9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra12ew1_etbx12e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 12kW (Hydrobox)', model: 'EPRA12EW1 + ETBX12E9W', heatingPowerMin: 2.0, heatingPowerMax: 12.0, listPrice: 14969, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA12EW1', vilpIndoorModel: 'ETBX12E9W', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra14dw17_etbx16e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 14kW (Hydrobox)', model: 'EPRA14DW17 + ETBX16E9W7', heatingPowerMin: 2.0, heatingPowerMax: 14.0, listPrice: 15328, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA14DW17', vilpIndoorModel: 'ETBX16E9W7', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra16dw17_etbx16e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 16kW (Hydrobox)', model: 'EPRA16DW17 + ETBX16E9W7', heatingPowerMin: 2.0, heatingPowerMax: 16.0, listPrice: 16093, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA16DW17', vilpIndoorModel: 'ETBX16E9W7', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra18dw17_etbx16e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 18kW (Hydrobox)', model: 'EPRA18DW17 + ETBX16E9W7', heatingPowerMin: 2.0, heatingPowerMax: 18.0, listPrice: 17275, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA18DW17', vilpIndoorModel: 'ETBX16E9W7', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },

  // Lattiamalli (integroitu varaaja) – lämmitys + jäähdytys
  { id: 'epra08ew1_etvx12s18e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 8kW (Integroitu 180L)', model: 'EPRA08EW1 + ETVX12S18E9W', heatingPowerMin: 2.0, heatingPowerMax: 8.0, listPrice: 16743, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA08EW1', vilpIndoorModel: 'ETVX12S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra08ew1_etvx12s23e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 8kW (Integroitu 230L)', model: 'EPRA08EW1 + ETVX12S23E9W', heatingPowerMin: 2.0, heatingPowerMax: 8.0, listPrice: 17276, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA08EW1', vilpIndoorModel: 'ETVX12S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra10ew1_etvx12s18e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 10kW (Integroitu 180L)', model: 'EPRA10EW1 + ETVX12S18E9W', heatingPowerMin: 2.0, heatingPowerMax: 10.0, listPrice: 17161, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA10EW1', vilpIndoorModel: 'ETVX12S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra10ew1_etvx12s23e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 10kW (Integroitu 230L)', model: 'EPRA10EW1 + ETVX12S23E9W', heatingPowerMin: 2.0, heatingPowerMax: 10.0, listPrice: 17694, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA10EW1', vilpIndoorModel: 'ETVX12S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra12ew1_etvx12s18e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 12kW (Integroitu 180L)', model: 'EPRA12EW1 + ETVX12S18E9W', heatingPowerMin: 2.0, heatingPowerMax: 12.0, listPrice: 17600, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA12EW1', vilpIndoorModel: 'ETVX12S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra12ew1_etvx12s23e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 12kW (Integroitu 230L)', model: 'EPRA12EW1 + ETVX12S23E9W', heatingPowerMin: 2.0, heatingPowerMax: 12.0, listPrice: 18133, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA12EW1', vilpIndoorModel: 'ETVX12S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra14dw17_etvx16s18e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 14kW (Integroitu 180L)', model: 'EPRA14DW17 + ETVX16S18E9W7', heatingPowerMin: 2.0, heatingPowerMax: 14.0, listPrice: 18848, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA14DW17', vilpIndoorModel: 'ETVX16S18E9W7', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra14dw17_etvx16s23e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 14kW (Integroitu 230L)', model: 'EPRA14DW17 + ETVX16S23E9W7', heatingPowerMin: 2.0, heatingPowerMax: 14.0, listPrice: 19438, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA14DW17', vilpIndoorModel: 'ETVX16S23E9W7', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra16dw17_etvx16s18e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 16kW (Integroitu 180L)', model: 'EPRA16DW17 + ETVX16S18E9W7', heatingPowerMin: 2.0, heatingPowerMax: 16.0, listPrice: 19613, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA16DW17', vilpIndoorModel: 'ETVX16S18E9W7', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra16dw17_etvx16s23e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 16kW (Integroitu 230L)', model: 'EPRA16DW17 + ETVX16S23E9W7', heatingPowerMin: 2.0, heatingPowerMax: 16.0, listPrice: 20203, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA16DW17', vilpIndoorModel: 'ETVX16S23E9W7', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra18dw17_etvx16s18e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 18kW (Integroitu 180L)', model: 'EPRA18DW17 + ETVX16S18E9W7', heatingPowerMin: 2.0, heatingPowerMax: 18.0, listPrice: 20795, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA18DW17', vilpIndoorModel: 'ETVX16S18E9W7', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },
  { id: 'epra18dw17_etvx16s23e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 18kW (Integroitu 230L)', model: 'EPRA18DW17 + ETVX16S23E9W7', heatingPowerMin: 2.0, heatingPowerMax: 18.0, listPrice: 21385, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA18DW17', vilpIndoorModel: 'ETVX16S23E9W7', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 1, vilpCooling: true, vilpSeries: 'Altherma 3 H' },

  // 2-vyöhyke malli (integroitu varaaja) – lämmitys (2 piiriä) + käyttövesi
  { id: 'epra08ew1_etvz12s18e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 8kW (2-vyöhyke 180L)', model: 'EPRA08EW1 + ETVZ12S18E9W', heatingPowerMin: 2.0, heatingPowerMax: 8.0, listPrice: 17788, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA08EW1', vilpIndoorModel: 'ETVZ12S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 H' },
  { id: 'epra08ew1_etvz12s23e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 8kW (2-vyöhyke 230L)', model: 'EPRA08EW1 + ETVZ12S23E9W', heatingPowerMin: 2.0, heatingPowerMax: 8.0, listPrice: 18071, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA08EW1', vilpIndoorModel: 'ETVZ12S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 H' },
  { id: 'epra10ew1_etvz12s18e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 10kW (2-vyöhyke 180L)', model: 'EPRA10EW1 + ETVZ12S18E9W', heatingPowerMin: 2.0, heatingPowerMax: 10.0, listPrice: 18206, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA10EW1', vilpIndoorModel: 'ETVZ12S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 H' },
  { id: 'epra10ew1_etvz12s23e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 10kW (2-vyöhyke 230L)', model: 'EPRA10EW1 + ETVZ12S23E9W', heatingPowerMin: 2.0, heatingPowerMax: 10.0, listPrice: 18489, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA10EW1', vilpIndoorModel: 'ETVZ12S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 H' },
  { id: 'epra12ew1_etvz12s18e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 12kW (2-vyöhyke 180L)', model: 'EPRA12EW1 + ETVZ12S18E9W', heatingPowerMin: 2.0, heatingPowerMax: 12.0, listPrice: 18645, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA12EW1', vilpIndoorModel: 'ETVZ12S18E9W', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 H' },
  { id: 'epra12ew1_etvz12s23e9w', brand: 'Daikin', name: 'Daikin Altherma 3 H 12kW (2-vyöhyke 230L)', model: 'EPRA12EW1 + ETVZ12S23E9W', heatingPowerMin: 2.0, heatingPowerMax: 12.0, listPrice: 18928, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA12EW1', vilpIndoorModel: 'ETVZ12S23E9W', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 H' },
  { id: 'epra14dw17_etvz16s18e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 14kW (2-vyöhyke 180L)', model: 'EPRA14DW17 + ETVZ16S18E9W7', heatingPowerMin: 2.0, heatingPowerMax: 14.0, listPrice: 20497, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA14DW17', vilpIndoorModel: 'ETVZ16S18E9W7', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 H' },
  { id: 'epra14dw17_etvz16s23e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 14kW (2-vyöhyke 230L)', model: 'EPRA14DW17 + ETVZ16S23E9W7', heatingPowerMin: 2.0, heatingPowerMax: 14.0, listPrice: 20835, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA14DW17', vilpIndoorModel: 'ETVZ16S23E9W7', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 H' },
  { id: 'epra16dw17_etvz16s18e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 16kW (2-vyöhyke 180L)', model: 'EPRA16DW17 + ETVZ16S18E9W7', heatingPowerMin: 2.0, heatingPowerMax: 16.0, listPrice: 21262, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA16DW17', vilpIndoorModel: 'ETVZ16S18E9W7', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 H' },
  { id: 'epra16dw17_etvz16s23e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 16kW (2-vyöhyke 230L)', model: 'EPRA16DW17 + ETVZ16S23E9W7', heatingPowerMin: 2.0, heatingPowerMax: 16.0, listPrice: 21600, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA16DW17', vilpIndoorModel: 'ETVZ16S23E9W7', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 H' },
  { id: 'epra18dw17_etvz16s18e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 18kW (2-vyöhyke 180L)', model: 'EPRA18DW17 + ETVZ16S18E9W7', heatingPowerMin: 2.0, heatingPowerMax: 18.0, listPrice: 22444, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA18DW17', vilpIndoorModel: 'ETVZ16S18E9W7', vilpIndoorType: 'integrated', vilpTankLiters: 180, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 H' },
  { id: 'epra18dw17_etvz16s23e9w7', brand: 'Daikin', name: 'Daikin Altherma 3 H 18kW (2-vyöhyke 230L)', model: 'EPRA18DW17 + ETVZ16S23E9W7', heatingPowerMin: 2.0, heatingPowerMax: 18.0, listPrice: 22782, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpOutdoorModel: 'EPRA18DW17', vilpIndoorModel: 'ETVZ16S23E9W7', vilpIndoorType: 'integrated', vilpTankLiters: 230, vilpZones: 2, vilpCooling: false, vilpSeries: 'Altherma 3 H' },
];

// Inventor vesi–ilmalämpöpumput (Matrix Zero R290, monoblock) – hinnasto 2025 (EXW ATHENS)
// Oletushinnat: Daikin alennus 52.5% + kate 25% • Inventor alennus 0% + kate 100% (toimitus vain rekisteristä)
// Näille oletuskate myyntihinnalle 80% → deviceMarginPercent=80 oletuksena Inventor-laitteille
export const inventorVesiIlmaLampopumput: HeatPumpDevice[] = [
  { id: 'mx290-08s', brand: 'Inventor', name: 'Inventor Matrix Zero R290 8 kW (Monoblock)', model: 'MX290-08S', heatingPowerMin: 0.0, heatingPowerMax: 8.0, listPrice: 2250, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: false },
  { id: 'mx290-10s', brand: 'Inventor', name: 'Inventor Matrix Zero R290 10 kW (Monoblock)', model: 'MX290-10S', heatingPowerMin: 0.0, heatingPowerMax: 10.0, listPrice: 2475, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: false },
  { id: 'mx290-12s', brand: 'Inventor', name: 'Inventor Matrix Zero R290 12 kW (Monoblock)', model: 'MX290-12S', heatingPowerMin: 0.0, heatingPowerMax: 12.0, listPrice: 3000, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: false },
  { id: 'mx290-14s', brand: 'Inventor', name: 'Inventor Matrix Zero R290 14 kW (Monoblock)', model: 'MX290-14S', heatingPowerMin: 0.0, heatingPowerMax: 14.0, listPrice: 3200, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: false },
  { id: 'mx290-16t', brand: 'Inventor', name: 'Inventor Matrix Zero R290 16 kW 3~ (Monoblock)', model: 'MX290-16T', heatingPowerMin: 0.0, heatingPowerMax: 16.0, listPrice: 3500, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: false },
  { id: 'mx290-40t', brand: 'Inventor', name: 'Inventor Matrix Zero R290 40 kW 3~ (Monoblock)', model: 'MX290-40T', heatingPowerMin: 0.0, heatingPowerMax: 40.0, listPrice: 6000, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: false },
];

// Yhdistetty VILP-laitevalikoima (Daikin + Inventor)


// Inventor Matrix Split (ATHENS Matrix Split, yhdistelmäpaketit ulkoyksikkö + sisäyksikkö)
// Huom: nämä ovat valmiita kombinaatioita, jotta ne näkyvät valikoimassa myös ilman erillistä sisäyksikkömatriisi-UI:ta.
export const inventorSplitVesiIlmaLampopumput: HeatPumpDevice[] = [
  // Hydrobox (ilman varaajaa)
  { id: 'inv-ats04s-hu060s3', brand: 'Inventor', name: 'Inventor Matrix Split 4.4 kW (Hydrobox)', model: 'ATS04S + HU060S3', heatingPowerMin: 0.0, heatingPowerMax: 4.4, listPrice: 1535, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats06s-hu060s3', brand: 'Inventor', name: 'Inventor Matrix Split 6.0 kW (Hydrobox)', model: 'ATS06S + HU060S3', heatingPowerMin: 0.0, heatingPowerMax: 6.0, listPrice: 1645, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats08s-hu100s3', brand: 'Inventor', name: 'Inventor Matrix Split 7.5 kW (Hydrobox)', model: 'ATS08S + HU100S3', heatingPowerMin: 0.0, heatingPowerMax: 7.5, listPrice: 1740, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats10s-hu100s3', brand: 'Inventor', name: 'Inventor Matrix Split 9.5 kW (Hydrobox)', model: 'ATS10S + HU100S3', heatingPowerMin: 0.0, heatingPowerMax: 9.5, listPrice: 1850, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats12s-hu160s3', brand: 'Inventor', name: 'Inventor Matrix Split 12.0 kW (Hydrobox)', model: 'ATS12S + HU160S3', heatingPowerMin: 0.0, heatingPowerMax: 12.0, listPrice: 2010, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats14s-hu160s3', brand: 'Inventor', name: 'Inventor Matrix Split 13.8 kW (Hydrobox)', model: 'ATS14S + HU160S3', heatingPowerMin: 0.0, heatingPowerMax: 13.8, listPrice: 2185, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats16s-hu160s3', brand: 'Inventor', name: 'Inventor Matrix Split 16.0 kW (Hydrobox)', model: 'ATS16S + HU160S3', heatingPowerMin: 0.0, heatingPowerMax: 16.0, listPrice: 2265, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats12t-hu160t9', brand: 'Inventor', name: 'Inventor Matrix Split 12.0 kW 3~ (Hydrobox)', model: 'ATS12T + HU160T9', heatingPowerMin: 0.0, heatingPowerMax: 12.0, listPrice: 2170, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats14t-hu160t9', brand: 'Inventor', name: 'Inventor Matrix Split 13.8 kW 3~ (Hydrobox)', model: 'ATS14T + HU160T9', heatingPowerMin: 0.0, heatingPowerMax: 13.8, listPrice: 2350, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats16t-hu160t9', brand: 'Inventor', name: 'Inventor Matrix Split 16.0 kW 3~ (Hydrobox)', model: 'ATS16T + HU160T9', heatingPowerMin: 0.0, heatingPowerMax: 16.0, listPrice: 2410, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },

  // Integroitu varaaja (valmiit kombot)
  { id: 'inv-ats04s-hu100wt190s3', brand: 'Inventor', name: 'Inventor Matrix Split 4.4 kW (Integroitu 190L)', model: 'ATS04S + HU100WT190S3', heatingPowerMin: 0.0, heatingPowerMax: 4.4, listPrice: 2590, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats04s-hu100wt240s3', brand: 'Inventor', name: 'Inventor Matrix Split 4.4 kW (Integroitu 240L)', model: 'ATS04S + HU100WT240S3', heatingPowerMin: 0.0, heatingPowerMax: 4.4, listPrice: 2820, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats06s-hu100wt190s3', brand: 'Inventor', name: 'Inventor Matrix Split 6.0 kW (Integroitu 190L)', model: 'ATS06S + HU100WT190S3', heatingPowerMin: 0.0, heatingPowerMax: 6.0, listPrice: 2700, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats06s-hu100wt240s3', brand: 'Inventor', name: 'Inventor Matrix Split 6.0 kW (Integroitu 240L)', model: 'ATS06S + HU100WT240S3', heatingPowerMin: 0.0, heatingPowerMax: 6.0, listPrice: 2930, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats08s-hu100wt190s3', brand: 'Inventor', name: 'Inventor Matrix Split 7.5 kW (Integroitu 190L)', model: 'ATS08S + HU100WT190S3', heatingPowerMin: 0.0, heatingPowerMax: 7.5, listPrice: 2776, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats08s-hu100wt240s3', brand: 'Inventor', name: 'Inventor Matrix Split 7.5 kW (Integroitu 240L)', model: 'ATS08S + HU100WT240S3', heatingPowerMin: 0.0, heatingPowerMax: 7.5, listPrice: 3006, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats10s-hu100wt190s3', brand: 'Inventor', name: 'Inventor Matrix Split 9.5 kW (Integroitu 190L)', model: 'ATS10S + HU100WT190S3', heatingPowerMin: 0.0, heatingPowerMax: 9.5, listPrice: 2886, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats10s-hu100wt240s3', brand: 'Inventor', name: 'Inventor Matrix Split 9.5 kW (Integroitu 240L)', model: 'ATS10S + HU100WT240S3', heatingPowerMin: 0.0, heatingPowerMax: 9.5, listPrice: 3116, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats12s-hu160wt240s3', brand: 'Inventor', name: 'Inventor Matrix Split 12.0 kW (Integroitu 240L)', model: 'ATS12S + HU160WT240S3', heatingPowerMin: 0.0, heatingPowerMax: 12.0, listPrice: 3315, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats14s-hu160wt240s3', brand: 'Inventor', name: 'Inventor Matrix Split 13.8 kW (Integroitu 240L)', model: 'ATS14S + HU160WT240S3', heatingPowerMin: 0.0, heatingPowerMax: 13.8, listPrice: 3490, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats16s-hu160wt240s3', brand: 'Inventor', name: 'Inventor Matrix Split 16.0 kW (Integroitu 240L)', model: 'ATS16S + HU160WT240S3', heatingPowerMin: 0.0, heatingPowerMax: 16.0, listPrice: 3570, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats12t-hu160wt240t9', brand: 'Inventor', name: 'Inventor Matrix Split 12.0 kW 3~ (Integroitu 240L)', model: 'ATS12T + HU160WT240T9', heatingPowerMin: 0.0, heatingPowerMax: 12.0, listPrice: 3530, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats14t-hu160wt240t9', brand: 'Inventor', name: 'Inventor Matrix Split 13.8 kW 3~ (Integroitu 240L)', model: 'ATS14T + HU160WT240T9', heatingPowerMin: 0.0, heatingPowerMax: 13.8, listPrice: 3710, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
  { id: 'inv-ats16t-hu160wt240t9', brand: 'Inventor', name: 'Inventor Matrix Split 16.0 kW 3~ (Integroitu 240L)', model: 'ATS16T + HU160WT240T9', heatingPowerMin: 0.0, heatingPowerMax: 16.0, listPrice: 3770, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true },
];



// Samsung vesi–ilmalämpöpumput (EHS Mono R290) – hankintahinnat (alv 0)
// Pakettivaihtoehdot:
// - ulkoyksikkö + hydrobox (1 tai 2 vyöhykettä)
// - ulkoyksikkö + ClimateHub (integroitu) (1 tai 2 vyöhykettä)
export const samsungVesiIlmaLampopumput: HeatPumpDevice[] = [
  { id: 'samsung-ae160-hydrobox-1z', brand: 'Samsung', name: 'Samsung EHS Mono R290 16 kW (Hydrobox 1-vyöhyke)', model: 'AE160CXYDGK/EU + AE160DNZMPK/EU', heatingPowerMin: 0.0, heatingPowerMax: 16.0, listPrice: 7506.60, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpSeries: 'EHS Mono R290', vilpOutdoorModel: 'AE160CXYDGK/EU', vilpIndoorModel: 'AE160DNZMPK/EU', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true },
  { id: 'samsung-ae160-hydrobox-2z', brand: 'Samsung', name: 'Samsung EHS Mono R290 16 kW (Hydrobox 2-vyöhyke)', model: 'AE160CXYDGK/EU + AE160DNZMPK/EU', heatingPowerMin: 0.0, heatingPowerMax: 16.0, listPrice: 7506.60, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpSeries: 'EHS Mono R290', vilpOutdoorModel: 'AE160CXYDGK/EU', vilpIndoorModel: 'AE160DNZMPK/EU', vilpIndoorType: 'hydrobox', vilpTankLiters: 0, vilpZones: 2, vilpCooling: true },

  { id: 'samsung-ae160-tank-1z', brand: 'Samsung', name: 'Samsung EHS Mono R290 16 kW (ClimateHub 200L 1-vyöhyke)', model: 'AE160CXYDGK/EU + AE200DNWMPK/EU', heatingPowerMin: 0.0, heatingPowerMax: 16.0, listPrice: 8149.80, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpSeries: 'EHS Mono R290', vilpOutdoorModel: 'AE160CXYDGK/EU', vilpIndoorModel: 'AE200DNWMPK/EU', vilpIndoorType: 'integrated', vilpTankLiters: 0, vilpZones: 1, vilpCooling: true },
  { id: 'samsung-ae160-tank-2z', brand: 'Samsung', name: 'Samsung EHS Mono R290 16 kW (ClimateHub 200L 2-vyöhyke)', model: 'AE160CXYDGK/EU + AE200DNXMPK/EU', heatingPowerMin: 0.0, heatingPowerMax: 16.0, listPrice: 8949.60, category: 'vesi-ilmalampopumppu', vilpHasIndoorUnit: true, vilpSeries: 'EHS Mono R290', vilpOutdoorModel: 'AE160CXYDGK/EU', vilpIndoorModel: 'AE200DNXMPK/EU', vilpIndoorType: 'integrated', vilpTankLiters: 0, vilpZones: 2, vilpCooling: true },
];

export const vesiIlmaLampopumput: HeatPumpDevice[] = [
  ...daikinVesiIlmaLampopumput,
  ...inventorVesiIlmaLampopumput,
  ...inventorSplitVesiIlmaLampopumput,
  ...samsungVesiIlmaLampopumput,
];

/** Kaikki tuetut lämpöpumppumallit (IILP + VILP). */
export const ALL_PUMP_DEVICES: HeatPumpDevice[] = [...ilmaLampopumput, ...vesiIlmaLampopumput];