type Env = {
  PUBLIC_IMAGES_BASE_URL?: string;
};

export function getPublicImagesBaseUrl(request: Request, env: Env): string {
  const raw = (env.PUBLIC_IMAGES_BASE_URL || '').trim();
  if (/^https:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, '');
  }
  const host = new URL(request.url).host;
  return `https://${host}/images`;
}
