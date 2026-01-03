import { getPublicSiteUrl } from './publicBaseUrl';

export function getPublicImagesBaseUrl(
  env: { PUBLIC_IMAGES_BASE_URL?: string; PUBLIC_SITE_URL?: string; VITE_PUBLIC_SITE_URL?: string },
  request?: Request
): string {
  const raw = (env.PUBLIC_IMAGES_BASE_URL || '').trim();
  if (raw) return raw.replace(/\/+$/, '');

  const site = getPublicSiteUrl(env, request);
  if (site) return `${site}/images`;

  if (!request) return '';
  const url = new URL(request.url);
  return `${url.origin}/images`;
}
