const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

function isImageFile(file: File): boolean {
  if (file.type && IMAGE_MIME.has(file.type)) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}

function scaledSize(width: number, height: number, maxEdge: number) {
  if (width <= maxEdge && height <= maxEdge) {
    return { width, height };
  }
  if (width >= height) {
    return { width: maxEdge, height: Math.max(1, Math.round((height * maxEdge) / width)) };
  }
  return { width: Math.max(1, Math.round((width * maxEdge) / height)), height: maxEdge };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Kuvan pakkaus epäonnistui'))),
      type,
      quality,
    );
  });
}

function outputName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, '') || 'kuva';
  return `${base}.jpg`;
}

/**
 * Pienentää kamerakuvat ennen tallennusta (tabletti/puhelin).
 * Alkuperäinen tiedosto palautetaan jos se on jo riittävän pieni.
 */
export async function prepareImageFileForUpload(
  file: File,
  maxBytes: number,
  maxEdge = 2048,
): Promise<File> {
  if (!isImageFile(file)) {
    throw new Error('Vain kuvatiedostot ovat sallittuja.');
  }

  if (file.size <= maxBytes) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (file.size > maxBytes) {
      throw new Error(
        `Kuva ${file.name} on liian suuri (${formatSize(file.size)}). Kokeile pienempää kuvaa tai ota kuva uudelleen.`,
      );
    }
    return file;
  }

  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Kuvan käsittely epäonnistui');
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.88;
    let blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    while (blob.size > maxBytes && quality > 0.45) {
      quality -= 0.08;
      blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    }

    if (blob.size > maxBytes) {
      throw new Error(
        `Kuvaa ${file.name} ei voitu tiivistää alle ${formatSize(maxBytes)}. Kokeile lähempää otosta.`,
      );
    }

    return new File([blob], outputName(file.name), { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kt`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
