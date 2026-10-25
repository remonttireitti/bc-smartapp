import { chillerLauhdutinTypeOptions, lauhdutinTypeOptions } from './constants';
/**
 * Laitekokoonpano: valinnat, joiden mukaan huoltopöytäkirjan moduulit näytetään.
 * Tallennetaan raportin data-JSONiin (laiteKokoonpano + kenttaModuulit) — ei SQL-muutoksia.
 * Vanhoissa raporteissa laiteKokoonpano puuttuu → vanha moduulirakenne säilyy.
 */

export type MlpJaahdytysTila = '' | 'ei' | 'passiivinen' | 'aktiivinen_vaihto' | 'aktiivinen_erillinen';
export type IlpJarjestelma = '' | 'split' | 'multisplit' | 'vmulti' | 'vrf';

export type LaiteKokoonpano = {
  /** Vedenjäähdytyskone: lämmitystoiminto (höyrystys- ja lauhdutuspiiri vaihtavat paikkaa). */
  lammitysToiminto?: boolean;
  /** Maalämpöpumppu: jäähdytystapa. */
  mlpJaahdytys?: MlpJaahdytysTila;
  /** Vakioilmastointikone: kylmäainepiiri (pois = vain nestekiertoinen jäähdytyspiiri). */
  vakKylmaainepiiri?: boolean;
  /** Vakioilmastointikone: kostutus höyrysylinterillä. */
  kostutus?: boolean;
  /** Vakioilmastointikone: kuivaus / jälkilämmitys sähkövastuksilla. */
  kuivaus?: boolean;
  /** Ilmalämpöpumppu: järjestelmätyyppi. */
  ilpJarjestelma?: IlpJarjestelma;
};

export type KenttaModuuliArvot = Record<string, Record<string, string | boolean>>;

type KokoonpanoForm = {
  laiteTyyppi: string;
  laiteKokoonpano?: LaiteKokoonpano;
  mlpData?: { keruuJaahdytysPiiri?: boolean } | null;
};

export const mlpJaahdytysOptions: { value: MlpJaahdytysTila; label: string }[] = [
  { value: 'ei', label: 'Ei jäähdytystä' },
  { value: 'passiivinen', label: 'Passiivinen (keruupiiri jäähdyttää)' },
  { value: 'aktiivinen_vaihto', label: 'Aktiivinen (keruu- ja lämmityspiiri vaihtavat)' },
  { value: 'aktiivinen_erillinen', label: 'Aktiivinen (erillinen jäähdytyspiiri)' },
];

export const ilpJarjestelmaOptions: { value: IlpJarjestelma; label: string; hint: string }[] = [
  { value: 'split', label: 'Split', hint: '1 ulko- ja 1 sisäyksikkö' },
  { value: 'multisplit', label: 'Multisplit', hint: 'Oma putki jokaiselle sisäyksikölle' },
  { value: 'vmulti', label: 'V-multi', hint: 'Runkoputki, sisäyksiköt käyvät yhtä aikaa' },
  { value: 'vrf', label: 'VRF', hint: 'Runkoputki, sisäyksiköt itsenäisiä' },
];

export function usesKokoonpanoStep(laiteTyyppi: string): boolean {
  return [
    'pakastin',
    'kylmäkoneikko',
    'vedenjäähdytyskone',
    'vakioilmastointtikone',
    'mlp',
    'lämpöpumppu',
  ].includes(laiteTyyppi);
}

export function isKylmioDevice(laiteTyyppi: string): boolean {
  return laiteTyyppi === 'pakastin' || laiteTyyppi === 'kylmäkoneikko';
}

/** Uuden raportin oletuskokoonpano (vanhoissa raporteissa undefined = vanha rakenne). */
export function defaultLaiteKokoonpano(laiteTyyppi: string): LaiteKokoonpano | undefined {
  switch (laiteTyyppi) {
    case 'vedenjäähdytyskone':
      return { lammitysToiminto: false };
    case 'mlp':
      return { mlpJaahdytys: '' };
    case 'vakioilmastointtikone':
      return { vakKylmaainepiiri: true, kostutus: false, kuivaus: false };
    case 'lämpöpumppu':
      return { ilpJarjestelma: '' };
    case 'pakastin':
    case 'kylmäkoneikko':
      return {};
    default:
      return undefined;
  }
}

/** VAK: kylmäainepiiri käytössä (oletus kyllä). */
export function vakHasRefrigerant(form: KokoonpanoForm): boolean {
  if (form.laiteTyyppi !== 'vakioilmastointtikone') return true;
  return form.laiteKokoonpano?.vakKylmaainepiiri !== false;
}

/** VAK, jonka kokoonpano on valittu: kiinteistöpiiri/energia eivät kuulu (suora höyrystys tai vain jäähdytyspiiri). */
export function vakUsesExplicitConfig(form: KokoonpanoForm): boolean {
  return form.laiteTyyppi === 'vakioilmastointtikone' && Boolean(form.laiteKokoonpano);
}

/** MLP: näytetäänkö erillinen jäähdytys-/keruupiiri (5.1b). */
export function showMlpJaahdytyspiiriUnit(form: KokoonpanoForm): boolean {
  const tila = form.laiteKokoonpano?.mlpJaahdytys;
  if (form.laiteKokoonpano && tila !== undefined) {
    return tila === 'passiivinen' || tila === 'aktiivinen_erillinen';
  }
  return true;
}

export function mlpJaahdytyspiiriTitleFor(form: KokoonpanoForm): string | null {
  const tila = form.laiteKokoonpano?.mlpJaahdytys;
  if (tila === 'passiivinen') return '5.1b Passiivijäähdytys (keruupiiri)';
  if (tila === 'aktiivinen_erillinen') return '5.1b Jäähdytyspiiri';
  return null;
}

export function vjHeatingEnabled(form: KokoonpanoForm): boolean {
  return form.laiteTyyppi === 'vedenjäähdytyskone' && form.laiteKokoonpano?.lammitysToiminto === true;
}

export function ilpSisayksikkoChoices(jarjestelma: IlpJarjestelma | undefined): number[] {
  if (jarjestelma === 'split') return [1];
  if (jarjestelma === 'multisplit' || jarjestelma === 'vmulti') return [2, 3, 4, 5];
  if (jarjestelma === 'vrf') return [2, 3, 4, 5, 6, 7, 8, 9, 10];
  return [1, 2, 3, 4, 5];
}

export function kokoonpanoSummary(form: KokoonpanoForm & { lauhdutinTyyppiLaite?: string }, lauhdutinLabel?: string): string {
  const k = form.laiteKokoonpano;
  const parts: string[] = [];
  if (form.laiteTyyppi === 'lämpöpumppu') {
    const opt = ilpJarjestelmaOptions.find((o) => o.value === k?.ilpJarjestelma);
    if (opt) parts.push(opt.label);
    return parts.join(' · ');
  }
  if (form.laiteTyyppi === 'vakioilmastointtikone' && k?.vakKylmaainepiiri === false) {
    parts.push('Ei kylmäainepiiriä (nestekiertoinen jäähdytys)');
  } else if (lauhdutinLabel) {
    parts.push(lauhdutinLabel);
  }
  if (k?.lammitysToiminto) parts.push('Lämmitystoiminto');
  if (form.laiteTyyppi === 'mlp') {
    const opt = mlpJaahdytysOptions.find((o) => o.value === k?.mlpJaahdytys);
    if (opt) parts.push(opt.label);
  }
  if (k?.kostutus) parts.push('Kostutus');
  if (k?.kuivaus) parts.push('Kuivaus');
  return parts.join(' · ');
}

/** Kokoonpano-vaiheen tila: valmis kun laitetyypin pakolliset valinnat on tehty. */
export function kokoonpanoComplete(form: KokoonpanoForm & { lauhdutinTyyppiLaite?: string }): boolean {
  const k = form.laiteKokoonpano;
  switch (form.laiteTyyppi) {
    case 'mlp':
      return !k || k.mlpJaahdytys === undefined || Boolean(k.mlpJaahdytys);
    case 'lämpöpumppu':
      return !k || k.ilpJarjestelma === undefined || Boolean(k.ilpJarjestelma);
    case 'vakioilmastointtikone':
      if (k?.vakKylmaainepiiri === false) return true;
      return Boolean(form.lauhdutinTyyppiLaite);
    case 'vedenjäähdytyskone':
    case 'pakastin':
    case 'kylmäkoneikko':
      return Boolean(form.lauhdutinTyyppiLaite);
    default:
      return true;
  }
}

export function kokoonpanoLauhdutinLabel(form: { laiteTyyppi: string; lauhdutinTyyppiLaite?: string }): string | undefined {
  const value = form.lauhdutinTyyppiLaite;
  if (!value) return undefined;
  const opts: readonly { value: string; label: string }[] =
    form.laiteTyyppi === 'vedenjäähdytyskone' || form.laiteTyyppi === 'vakioilmastointtikone'
      ? chillerLauhdutinTypeOptions
      : lauhdutinTypeOptions;
  return opts.find((o) => o.value === value)?.label;
}
