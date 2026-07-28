import { embedUrlAsDataUrl } from './quoteRequest/termatekAssets';

/** Tulosteen pienoiskuva — ~26mm korkea, riittää 480px leveys PDF:lle. */
export const PRINT_THUMB_MAX_WIDTH = 480;

const PRINT_IMAGE_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
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
      const scale = maxWidth / width;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

  return withTimeout(resizePromise, PRINT_IMAGE_TIMEOUT_MS, dataUrl);
}

export async function embedPrintThumbnail(url: string, maxWidth = PRINT_THUMB_MAX_WIDTH): Promise<string> {
  if (!url || url.startsWith('data:')) {
    return url.startsWith('data:image/') ? resizeDataUrlForPrint(url, maxWidth) : url;
  }
  const embedded = await withTimeout(embedUrlAsDataUrl(url), PRINT_IMAGE_TIMEOUT_MS, url);
  if (!embedded.startsWith('data:')) return embedded;
  return resizeDataUrlForPrint(embedded, maxWidth);
}

export type PrintLogImage = { fileName: string; url: string; caption: string };

export async function shrinkLogImagesForPrint(
  logImages: Record<string, PrintLogImage[]>,
  maxWidth = PRINT_THUMB_MAX_WIDTH,
): Promise<Record<string, PrintLogImage[]>> {
  const entries = await Promise.all(
    Object.entries(logImages).map(async ([logId, images]) => [
      logId,
      await Promise.all(
        images.map(async (image) => ({
          ...image,
          url: await embedPrintThumbnail(image.url, maxWidth),
        })),
      ),
    ] as const),
  );
  return Object.fromEntries(entries);
}
