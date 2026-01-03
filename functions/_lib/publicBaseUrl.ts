export function getPublicSiteUrl(
  env: { PUBLIC_SITE_URL?: string; VITE_PUBLIC_SITE_URL?: string },
  request?: Request
): string {
  const raw = (env.PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL || '').trim();
  if (raw) return raw.replace(/\/+$/, '');

  if (!request) return '';
  const url = new URL(request.url);
  return `${url.origin}`.replace(/\/+$/, '');
}
