export function getPublicImagesBaseUrl(request: Request, env: { PUBLIC_IMAGES_BASE_URL?: string }): string {
  const raw = (env.PUBLIC_IMAGES_BASE_URL || '').trim().replace(/\/+$/, '');
  if (/^https:\/\//i.test(raw)) {
    return raw;
  }
  const host = request.headers.get('host') || new URL(request.url).host;
  return `https://${host}/images`;
}
