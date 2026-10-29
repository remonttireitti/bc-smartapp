/** Yrityksen brändiväri tulosteeseen: logon hallitseva värikäs sävy (ei tietokantakenttää). */

/** Valitsee RGBA-pikseleistä yleisimmän värikkään sävyn; valkoinen, musta ja harmaa ohitetaan. */
export function dominantColorFromPixels(px: ArrayLike<number>): string | undefined {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < px.length; i += 4) {
    const a = px[i + 3];
    if (a < 200) continue;
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 235 && min > 215) continue; // lähes valkoinen
    if (max < 40) continue; // lähes musta
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat < 0.3) continue; // harmaa
    let h: number;
    const d = max - min;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    const key = Math.floor(((h * 60 + 360) % 360) / 20);
    const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n += 1;
    cur.r += r;
    cur.g += g;
    cur.b += b;
    buckets.set(key, cur);
  }
  let best: { n: number; r: number; g: number; b: number } | undefined;
  for (const v of buckets.values()) if (!best || v.n > best.n) best = v;
  if (!best || best.n < 8) return undefined;
  const hex = (n: number) => Math.round(n / best!.n).toString(16).padStart(2, '0');
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}

/** Lukee logon selaimessa; epäonnistuessa (CORS, ei kuvaa) palauttaa undefined → oletusväri. */
export async function logoBrandColor(url: string | undefined): Promise<string | undefined> {
  if (!url || typeof document === 'undefined') return undefined;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), 4000);
      img.onload = () => {
        clearTimeout(t);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(t);
        reject(new Error('load'));
      };
      img.src = url;
    });
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, size, size);
    return dominantColorFromPixels(ctx.getImageData(0, 0, size, size).data);
  } catch {
    return undefined;
  }
}
