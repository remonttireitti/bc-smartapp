import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const INVENTORY_IMAGE_BUCKET = 'inventory-images';

const MAX_EDGE = 480;
const JPEG_QUALITY = 0.72;

export function inventoryImagePublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from(INVENTORY_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function inventoryImageObjectPath(
  companyId: string,
  kind: 'materials' | 'cylinders',
  entityId: string,
): string {
  return `${companyId}/${kind}/${entityId}.jpg`;
}

export async function resizeImageFile(file: File, maxEdge = MAX_EDGE, quality = JPEG_QUALITY): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Kuvan käsittely epäonnistui');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Kuvan pakkaus epäonnistui'))),
      'image/jpeg',
      quality,
    );
  });
}

export async function uploadInventoryImage(
  client: SupabaseClient,
  companyId: string,
  kind: 'materials' | 'cylinders',
  entityId: string,
  file: File,
): Promise<string> {
  const path = inventoryImageObjectPath(companyId, kind, entityId);
  const blob = await resizeImageFile(file);
  const { error } = await client.storage.from(INVENTORY_IMAGE_BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '3600',
  });
  if (error) throw error;
  return path;
}

export async function removeInventoryImage(client: SupabaseClient, path: string | null | undefined) {
  if (!path) return;
  await client.storage.from(INVENTORY_IMAGE_BUCKET).remove([path]);
}
