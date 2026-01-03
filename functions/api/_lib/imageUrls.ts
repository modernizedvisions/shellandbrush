import { normalizePublicImageUrl as sharedNormalizePublicImageUrl } from '../../_lib/imageUrls';

export function isBlockedImageUrl(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > 2000) return true;
  const lower = trimmed.toLowerCase();
  return lower.startsWith('data:') || lower.startsWith('blob:');
}

export function normalizePublicImageUrl(
  input: string | null | undefined,
  env: { PUBLIC_IMAGES_BASE_URL?: string; PUBLIC_SITE_URL?: string; VITE_PUBLIC_SITE_URL?: string },
  request?: Request
): string {
  return sharedNormalizePublicImageUrl(input, env, request);
}

const normalizeWithBase = (value: string | null | undefined, baseUrl?: string) => {
  if (!baseUrl) return value || '';
  return sharedNormalizePublicImageUrl(value, { PUBLIC_IMAGES_BASE_URL: baseUrl }, undefined);
};

export function resolvePublicImageUrl(
  publicUrl?: string | null,
  storageKey?: string | null,
  baseUrl?: string
): string {
  if (publicUrl && /^https?:\/\//i.test(publicUrl)) return normalizeWithBase(publicUrl, baseUrl);
  if (storageKey && baseUrl) return normalizeWithBase(`${baseUrl}/${storageKey}`, baseUrl);
  return normalizeWithBase(publicUrl || '', baseUrl);
}
