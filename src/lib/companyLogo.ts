import { supabase } from './supabase';

export const COMPANY_LOGO_BUCKET = 'company-logos';
export const COMPANY_LOGO_MAX_BYTES = 2 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function isStorageLogoPath(value: string | null | undefined) {
  return !!value && !/^https?:\/\//i.test(value) && !/^data:/i.test(value) && !/^blob:/i.test(value);
}

export function inferLogoMimeType(file: File): string {
  if (file.type && MIME_EXT[file.type]) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'image/png';
}

export function validateCompanyLogoFile(file: File): string | null {
  if (file.size > COMPANY_LOGO_MAX_BYTES) {
    return 'Logo on liian suuri (max 2 MB).';
  }
  const mime = inferLogoMimeType(file);
  if (!MIME_EXT[mime]) {
    return 'Tiedostomuoto ei ole tuettu. Käytä PNG, JPG, WebP tai GIF.';
  }
  return null;
}

export function companyLogoPath(companyId: string, mimeType: string) {
  const ext = MIME_EXT[mimeType] ?? 'png';
  return `${companyId}/logo.${ext}`;
}

export async function getCompanyLogoSignedUrl(storagePath: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from(COMPANY_LOGO_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function resolveCompanyLogoUrl(logoUrl: string | null | undefined) {
  if (!logoUrl) return null;
  if (!isStorageLogoPath(logoUrl)) return logoUrl;
  return getCompanyLogoSignedUrl(logoUrl);
}

export async function uploadCompanyLogo(companyId: string, file: File, previousPath?: string | null) {
  const validationError = validateCompanyLogoFile(file);
  if (validationError) throw new Error(validationError);

  const mimeType = inferLogoMimeType(file);
  const path = companyLogoPath(companyId, mimeType);

  if (previousPath && isStorageLogoPath(previousPath) && previousPath !== path) {
    await supabase.storage.from(COMPANY_LOGO_BUCKET).remove([previousPath]);
  }

  const { error: uploadError } = await supabase.storage
    .from(COMPANY_LOGO_BUCKET)
    .upload(path, file, { contentType: mimeType, upsert: true });

  if (uploadError) throw new Error(uploadError.message);
  return path;
}

export async function saveCompanyLogo(companyId: string, file: File, previousPath?: string | null) {
  const path = await uploadCompanyLogo(companyId, file, previousPath);
  const { error: updateError } = await supabase
    .from('companies')
    .update({ logo_url: path })
    .eq('id', companyId);

  if (updateError) {
    await supabase.storage.from(COMPANY_LOGO_BUCKET).remove([path]);
    throw new Error(updateError.message);
  }

  return path;
}

export async function removeCompanyLogo(companyId: string, storagePath: string | null | undefined) {
  if (storagePath && isStorageLogoPath(storagePath)) {
    const { error: removeError } = await supabase.storage.from(COMPANY_LOGO_BUCKET).remove([storagePath]);
    if (removeError) throw new Error(removeError.message);
  }
  const { error } = await supabase.from('companies').update({ logo_url: null }).eq('id', companyId);
  if (error) throw new Error(error.message);
}
