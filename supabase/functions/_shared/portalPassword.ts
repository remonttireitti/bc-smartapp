/** Vahva mutta luettava pysyvä salasana, esim. "Kepa7-Muro4-Tisu9" (17 merkkiä). Ei sekoittuvia merkkejä. */
const CONS = 'bdfghjkmnprstvz';
const VOW = 'aeiu';
const DIG = '23456789';

function pick(set: string): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return set[buf[0] % set.length];
}

export function generatePortalPassword(): string {
  const group = () => {
    const w = pick(CONS) + pick(VOW) + pick(CONS) + pick(VOW);
    return w[0].toUpperCase() + w.slice(1) + pick(DIG);
  };
  return `${group()}-${group()}-${group()}`;
}
