const pad2 = (n: number) => String(n).padStart(2, '0');

/** Oletuskello tulosteessa / laskennassa, jos päivä on tiedossa mutta kellonaikaa ei ole valittu */
export const DEFAULT_KOE_KLO = '08:00';

/**
 * Palauttaa YYYY-MM-DD -muodon laskentaa varten (HTML date, suomi d.m.yyyy tai parsittava merkkijono).
 */
export function normalizeKoePaivamaaraForCalc(pvm: string): string {
  const raw = String(pvm ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dot = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dot) {
    const d = dot[1].padStart(2, '0');
    const mo = dot[2].padStart(2, '0');
    const y = dot[3];
    return `${y}-${mo}-${d}`;
  }
  const tryDate = new Date(raw);
  if (!Number.isNaN(tryDate.getTime())) {
    return `${tryDate.getFullYear()}-${pad2(tryDate.getMonth() + 1)}-${pad2(tryDate.getDate())}`;
  }
  return '';
}

/** Kokeen päivä (tiiveys/tyhjiö): ensin kenttä, sitten huoltopäivä; kello oletuksella jos päivä löytyy. */
export function resolveKoePaivamaaraJaKello(
  koeAlkaaPvm: string,
  koeAlkaaKlo: string,
  huoltoPaivamaara: string,
): { pvmIso: string; klo: string } {
  const pvmNorm =
    normalizeKoePaivamaaraForCalc(String(koeAlkaaPvm || '')) ||
    normalizeKoePaivamaaraForCalc(String(huoltoPaivamaara || ''));
  const kloStored = String(koeAlkaaKlo || '').trim();
  const klo = kloStored || (pvmNorm ? DEFAULT_KOE_KLO : '');
  return { pvmIso: pvmNorm, klo };
}

/** Kellonajat 00:00 … 23:30 puolen tunnin välein */
export const KLO_PUOLI_TUNNIN_VAIHTOEHDOT: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    out.push(`${pad2(h)}:00`);
    out.push(`${pad2(h)}:30`);
  }
  return out;
})();

/**
 * Laskee kokeen päättymishetken (alku + kesto min) ja palauttaa suomenkielisen lyhyen päivä+aika -merkkijonon.
 */
export function laskeKokeLoppuaikaFi(
  koeAlkaaPvm: string,
  koeAlkaaKlo: string,
  kestoMinStr: string,
): string {
  const pvm = normalizeKoePaivamaaraForCalc(String(koeAlkaaPvm || ''));
  const klo = String(koeAlkaaKlo || '').trim();
  if (!pvm || !klo) return '';

  const s = String(kestoMinStr || '').trim().replace(',', '.');
  const min = parseFloat(s);
  if (!Number.isFinite(min) || min < 0) return '';

  const parts = klo.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] ?? '0', 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';

  const start = new Date(`${pvm}T${pad2(h)}:${pad2(m)}:00`);
  if (Number.isNaN(start.getTime())) return '';

  const end = new Date(start.getTime() + min * 60_000);
  return end.toLocaleString('fi-FI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTyhjiointiLoppupaine(
  arvo: string | undefined,
  yksikko: string | undefined,
  legacyMikronia?: string | undefined,
): string {
  const v = String(arvo || legacyMikronia || '').trim();
  if (!v) return '';
  return yksikko === 'mbar' ? `${v} mbar` : `${v} µm`;
}
