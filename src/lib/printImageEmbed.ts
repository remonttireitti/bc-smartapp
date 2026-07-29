/** Tulosteen pienoiskuva — ~26mm korkea, riittää 480px leveys PDF:lle. */
export const PRINT_THUMB_MAX_WIDTH = 480;

const PRINT_IMAGE_TIMEOUT_MS = 8_000;
const PRINT_EMBED_CONCURRENCY = 4;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function drawImageToPrintDataUrl(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxWidth: number,
): string {
  if (!width || !height) return '';
  const scale = width > maxWidth ? maxWidth / width : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.78);
}

async function resizeDataUrlForPrint(dataUrl: string, maxWidth: number): Promise<string> {
  if (!dataUrl.startsWith('data:image/') || typeof window === 'undefined') return dataUrl;

  const resizePromise = new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height || width <= maxWidth) {
        resolve(dataUrl);
        return;
      }
      resolve(drawImageToPrintDataUrl(img, width, height, maxWidth) || dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

  return withTimeout(resizePromise, PRINT_IMAGE_TIMEOUT_MS, dataUrl);
}

async function bitmapBlobToPrintDataUrl(blob: Blob, maxWidth: number): Promise<string> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    return drawImageToPrintDataUrl(bitmap, bitmap.width, bitmap.height, maxWidth);
  } catch {
    return '';
  } finally {
    bitmap?.close();
  }
}

async function imageUrlToPrintDataUrl(url: string, maxWidth: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      resolve(drawImageToPrintDataUrl(img, width, height, maxWidth) || url);
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

async function fetchAndResizeForPrint(url: string, maxWidth: number): Promise<string> {
  if (typeof window === 'undefined') return url;

  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0) {
        const dataUrl = await bitmapBlobToPrintDataUrl(blob, maxWidth);
        if (dataUrl.startsWith('data:')) return dataUrl;
      }
    }
  } catch {
    /* try Image fallback below */
  }

  return imageUrlToPrintDataUrl(url, maxWidth);
}

export async function embedPrintThumbnail(url: string, maxWidth = PRINT_THUMB_MAX_WIDTH): Promise<string> {
  if (!url) return url;
  if (url.startsWith('data:')) {
    return url.startsWith('data:image/') ? resizeDataUrlForPrint(url, maxWidth) : url;
  }
  return withTimeout(fetchAndResizeForPrint(url, maxWidth), PRINT_IMAGE_TIMEOUT_MS, url);
}

export type PrintLogImage = { fileName: string; url: string; caption: string };

export async function shrinkUrlMapForPrint(
  urls: Record<string, string>,
  maxWidth = PRINT_THUMB_MAX_WIDTH,
): Promise<Record<string, string>> {
  const entries = Object.entries(urls);
  const shrunk = await mapWithConcurrency(entries, PRINT_EMBED_CONCURRENCY, async ([key, url]) => {
    const nextUrl = await embedPrintThumbnail(url, maxWidth);
    return [key, nextUrl] as const;
  });
  return Object.fromEntries(shrunk);
}

export async function shrinkLogImagesForPrint(
  logImages: Record<string, PrintLogImage[]>,
  maxWidth = PRINT_THUMB_MAX_WIDTH,
): Promise<Record<string, PrintLogImage[]>> {
  const flat = Object.entries(logImages).flatMap(([logId, images]) =>
    images.map((image, index) => ({ logId, index, image })),
  );

  const resized = await mapWithConcurrency(flat, PRINT_EMBED_CONCURRENCY, async (entry) => ({
    ...entry,
    url: await embedPrintThumbnail(entry.image.url, maxWidth),
  }));

  const next: Record<string, PrintLogImage[]> = {};
  for (const { logId, index, image, url } of resized) {
    if (!next[logId]) next[logId] = [...(logImages[logId] ?? [])];
    next[logId][index] = { ...image, url };
  }
  return next;
}
