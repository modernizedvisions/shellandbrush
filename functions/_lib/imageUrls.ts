import { getPublicImagesBaseUrl } from './imageBaseUrl';

export function normalizePublicImageUrl(
  input: string | null | undefined,
  env: { PUBLIC_IMAGES_BASE_URL?: string; PUBLIC_SITE_URL?: string; VITE_PUBLIC_SITE_URL?: string },
  request?: Request
): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('blob:')) return '';

  const base = getPublicImagesBaseUrl(env, request).replace(/\/+$/, '');
  const legacyImagesHttps = 'https://shellandbrush.pages.dev/images';
  const legacyImagesHttp = 'http://shellandbrush.pages.dev/images';
  const legacyHostHttps = 'https://shellandbrush.pages.dev';
  const legacyHostHttp = 'http://shellandbrush.pages.dev';

  if (trimmed.startsWith(legacyImagesHttps)) {
    return `${base}${trimmed.slice(legacyImagesHttps.length)}`;
  }
  if (trimmed.startsWith(legacyImagesHttp)) {
    return `${base}${trimmed.slice(legacyImagesHttp.length)}`;
  }
  if (trimmed.startsWith(legacyHostHttps) && trimmed.slice(legacyHostHttps.length).startsWith('/images/')) {
    return `${base}${trimmed.slice(legacyHostHttps.length + '/images'.length)}`;
  }
  if (trimmed.startsWith(legacyHostHttp) && trimmed.slice(legacyHostHttp.length).startsWith('/images/')) {
    return `${base}${trimmed.slice(legacyHostHttp.length + '/images'.length)}`;
  }

  if (trimmed.startsWith('/images/')) {
    return `${base}${trimmed.slice('/images'.length)}`;
  }

  return trimmed;
}

export function resolvePublicImageUrl(
  input: string | null | undefined,
  env: { PUBLIC_IMAGES_BASE_URL?: string; PUBLIC_SITE_URL?: string; VITE_PUBLIC_SITE_URL?: string },
  request?: Request
): string {
  return normalizePublicImageUrl(input, env, request);
}
