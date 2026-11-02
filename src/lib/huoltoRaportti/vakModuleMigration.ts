import type { KenttaModuuliArvot } from './deviceKokoonpano';

type Vals = Record<string, string | boolean>;

/**
 * VAK-pöytäkirjan kenttämoduulit jaettiin loogisiin moduuleihin (#277): vanhan `lampotilansaato`-moduulin
 * ja kostutus/kuivaus-moduulien asetusarvot siirtyvät `vakMittaukset`-moduuliin, lämmityksen laitetarkistukset
 * `lammitys`-moduuliin. Siirto on idempotentti eikä ylikirjoita uuden rakenteen arvoja.
 */
export function migrateVakFieldModules(kentta: KenttaModuuliArvot | undefined): KenttaModuuliArvot | undefined {
  if (!kentta) return kentta;
  const old = kentta.lampotilansaato;
  const kost = kentta.kostutus ?? {};
  const kuiv = kentta.kuivaus ?? {};
  const needs =
    !!old
    || ['asetusarvo', 'saatoalue', 'mitattu'].some((k) => k in kost)
    || 'asetusarvo' in kuiv;
  if (!needs) return kentta;

  const next: Record<string, Vals> = { ...kentta } as Record<string, Vals>;
  const mitt: Vals = { ...(next.vakMittaukset ?? {}) };
  const lam: Vals = { ...(next.lammitys ?? {}) };
  const put = (target: Vals, key: string, value: string | boolean | undefined) => {
    if (value === undefined || value === '') return;
    if (target[key] === undefined || target[key] === '') target[key] = value;
  };

  if (old) {
    for (const k of ['asetusarvo', 'saatoalue', 'jaahdytysToiminta', 'tuloIlma', 'poistoIlma', 'huomio']) put(mitt, k, old[k]);
    put(lam, 'toiminta', old.lammitysToiminta);
    put(lam, 'virta', old.lammitysVirta);
    put(lam, 'ventiili', old.lammitysVentiili);
    put(lam, 'meno', old.lammitysMeno);
    put(lam, 'paluu', old.lammitysPaluu);
    delete next.lampotilansaato;
  }
  if (next.kostutus) {
    const { asetusarvo, saatoalue, mitattu, ...rest } = next.kostutus;
    put(mitt, 'kosteusAsetus', asetusarvo);
    put(mitt, 'kosteusSaatoalue', saatoalue);
    put(mitt, 'kosteusMitattu', mitattu);
    next.kostutus = rest;
  }
  if (next.kuivaus) {
    const { asetusarvo, ...rest } = next.kuivaus;
    put(mitt, 'kuivausAsetus', asetusarvo);
    next.kuivaus = rest;
  }
  if (Object.keys(mitt).length) next.vakMittaukset = mitt;
  if (Object.keys(lam).length) next.lammitys = lam;
  return next as KenttaModuuliArvot;
}
