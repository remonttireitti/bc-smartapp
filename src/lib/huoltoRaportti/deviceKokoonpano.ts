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
  /** Vakioilmastointikone: jäähdytystoiminto (puuttuva arvo = käytössä). */
  vakJaahdytys?: boolean;
  /** Vakioilmastointikone: lämmitystoiminto. */
  vakLammitys?: boolean;
  /** Vakioilmastointikone: lämmityksen tyyppi. */
  vakLammitysTyyppi?: VakLammitysTyyppi;
  /** Vakioilmastointikone: sähkölämmityksen teho (kW). */
  vakLammitysKw?: string;
  /** Vakioilmastointikone: kostuttimen tyyppi. */
  vakKostutinTyyppi?: VakKostutinTyyppi;
  /** Vakioilmastointikone: kostuttimen malli. */
  vakKostutinMalli?: string;
  /** Vakioilmastointikone: kuivauksen sähkövastusten teho (kW). */
  vakKuivausKw?: string;
  /** Vakioilmastointikone: lauhdutusveden venttiilin tyyppi (vesilauhdutus). */
  vakVesiventtiili?: VakVesiventtiili;
  /** Ilmalämpöpumppu: järjestelmätyyppi. */
  ilpJarjestelma?: IlpJarjestelma;
};

export type VakLammitysTyyppi = '' | 'sahko' | 'vesi';
export type VakKostutinTyyppi = '' | 'hoyrysylinteri' | 'elektrodi' | 'muu';
export type VakVesiventtiili = '' | 'paineohjattu' | 'moottori';

export const vakLammitysTyyppiOptions: { value: VakLammitysTyyppi; label: string }[] = [
  { value: 'sahko', label: 'Sähkövastukset' },
  { value: 'vesi', label: 'Vesipatteri' },
];
export const vakKostutinTyyppiOptions: { value: VakKostutinTyyppi; label: string }[] = [
  { value: 'hoyrysylinteri', label: 'Höyrysylinteri' },
  { value: 'elektrodi', label: 'Elektrodikostutin' },
  { value: 'muu', label: 'Muu' },
];
export const vakVesiventtiiliOptions: { value: VakVesiventtiili; label: string }[] = [
  { value: 'paineohjattu', label: 'Paineohjattu' },
  { value: 'moottori', label: 'Moottoriventtiili' },
];

function optLabel<T extends string>(opts: { value: T; label: string }[], value: T | undefined): string {
  return opts.find((o) => o.value === value)?.label ?? '';
}

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
    'vedenjäähdytyskone',
    'vakioilmastointtikone',
    'mlp',
    'lämpöpumppu',
  ].includes(laiteTyyppi);
}

export function isKylmioDevice(laiteTyyppi: string): boolean {
  return laiteTyyppi === 'pakastin' || laiteTyyppi === 'kylmäkoneikko';
}

/** Laitetyypit, joilla lauhdutustapa kysytään Lauhdutin-moduulissa (ei Kokoonpanossa). */
export function usesCondenserConfig(form: KokoonpanoForm): boolean {
  return isKylmioDevice(form.laiteTyyppi)
    || form.laiteTyyppi === 'vedenjäähdytyskone'
    || (form.laiteTyyppi === 'vakioilmastointtikone' && vakHasRefrigerant(form));
}

/** Uuden raportin oletuskokoonpano (vanhoissa raporteissa undefined = vanha rakenne). */
export function defaultLaiteKokoonpano(laiteTyyppi: string): LaiteKokoonpano | undefined {
  switch (laiteTyyppi) {
    case 'vedenjäähdytyskone':
      return { lammitysToiminto: false };
    case 'mlp':
      return { mlpJaahdytys: '' };
    case 'vakioilmastointtikone':
      return { vakKylmaainepiiri: true, kostutus: false, kuivaus: false, vakJaahdytys: true, vakLammitys: false };
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

/** VAK: jäähdytys käytössä (oletus kyllä; vanhoissa raporteissa kenttä puuttuu). */
export function vakCoolingOn(form: KokoonpanoForm): boolean {
  return form.laiteTyyppi === 'vakioilmastointtikone' && form.laiteKokoonpano?.vakJaahdytys !== false;
}

/** VAK: lämmitys käytössä. */
export function vakHeatingOn(form: KokoonpanoForm): boolean {
  return form.laiteTyyppi === 'vakioilmastointtikone' && form.laiteKokoonpano?.vakLammitys === true;
}

/** VAK: lyhyet toimintojen nimet (jäähdytys, lämmitys, kostutus, kuivaus). */
export function vakFunctionLabels(k: LaiteKokoonpano | undefined): string[] {
  const out: string[] = [];
  if (k?.vakJaahdytys !== false) out.push('Jäähdytys');
  if (k?.vakLammitys) {
    const t = optLabel(vakLammitysTyyppiOptions, k.vakLammitysTyyppi).toLowerCase();
    const kw = k.vakLammitysKw?.trim();
    out.push(`Lämmitys${t || kw ? ` (${[t, kw ? `${kw} kW` : ''].filter(Boolean).join(', ')})` : ''}`);
  }
  if (k?.kostutus) {
    const t = optLabel(vakKostutinTyyppiOptions, k.vakKostutinTyyppi).toLowerCase();
    const m = k.vakKostutinMalli?.trim();
    out.push(`Kostutus${t || m ? ` (${[t, m].filter(Boolean).join(', ')})` : ''}`);
  }
  if (k?.kuivaus) {
    const kw = k.vakKuivausKw?.trim();
    out.push(`Kuivaus${kw ? ` (${kw} kW)` : ''}`);
  }
  return out;
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
  if (tila === 'passiivinen') return 'Passiivijäähdytys (keruupiiri)';
  if (tila === 'aktiivinen_erillinen') return 'Jäähdytyspiiri';
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

/** VAK: tulosteen kaksi riviä — rakenne (lauhdutus, höyrystys, venttiili) ja toiminnot. */
export function vakKokoonpanoPrintRows(form: KokoonpanoForm, lauhdutinLabel?: string): { kokoonpano: string; toiminnot: string } {
  const k = form.laiteKokoonpano;
  const parts: string[] = [];
  if (k?.vakKylmaainepiiri === false) parts.push('Ei kylmäainepiiriä (nestekiertoinen jäähdytys)');
  else {
    if (lauhdutinLabel) parts.push(lauhdutinLabel);
    parts.push('suora höyrystys');
  }
  const valve = optLabel(vakVesiventtiiliOptions, k?.vakVesiventtiili);
  if (valve) parts.push(`vesiventtiili: ${valve.toLowerCase()}`);
  return { kokoonpano: parts.join(' · '), toiminnot: vakFunctionLabels(k).join(' · ') };
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
  if (form.laiteTyyppi === 'vakioilmastointtikone') {
    if (k?.vakKylmaainepiiri !== false) parts.push('Suora höyrystys');
    const valve = optLabel(vakVesiventtiiliOptions, k?.vakVesiventtiili);
    if (valve) parts.push(`Vesiventtiili: ${valve.toLowerCase()}`);
    parts.push(...vakFunctionLabels(k));
    return parts.join(' · ');
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

/** VJK lämmitystoiminnolla: piirien nimet kaksoisroolin mukaan (vanhat raportit ennallaan). */
export function vjHeatingTitle(title: string, form: KokoonpanoForm): string {
  if (!vjHeatingEnabled(form)) return title;
  return title
    .replace(/Kiinteistön jäähdytyspiiri/i, 'Kiinteistön jäähdytys-/lämmitysverkosto')
    .replace(/^(\d+\.\d+ )?Jäähdytyspiiri$/i, '$1Jäähdytys-/lämmitysverkosto')
    .replace(/Lauhdutuspiiri/i, 'Lauhdutus-/lämmönlähdepiiri');
}
