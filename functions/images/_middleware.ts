type Env = {
  IMAGES_BUCKET?: R2Bucket;
  MV_IMAGES?: R2Bucket;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const allowedPrefix = (key: string) =>
  key.startsWith('shellandbrush/') || key.startsWith('shell-and-brush/');

const isInvalidKey = (key: string) => !key || key.includes('..') || key.includes('\\');

const contentTypeForKey = (key: string) => {
  const ext = key.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'avif':
      return 'image/avif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
};

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  const url = new URL(request.url);
  if (url.pathname === '/images/ping') {
    return next();
  }
  if (!url.pathname.startsWith('/images/')) {
    return next();
  }

  const storageKey = decodeURIComponent(url.pathname.replace(/^\/images\//, ''));
  if (isInvalidKey(storageKey)) {
    return json({ ok: false, code: 'INVALID_KEY' }, 400);
  }
  if (!allowedPrefix(storageKey)) {
    return json({ ok: false, code: 'FORBIDDEN_KEY' }, 403);
  }

  const bucket = env.IMAGES_BUCKET ?? env.MV_IMAGES;
  if (!bucket) {
    return json({ ok: false, code: 'MISSING_R2_BINDING' }, 500);
  }

  const object = await bucket.get(storageKey);
  if (!object) {
    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  }

  const headers = new Headers();
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set(
    'Content-Type',
    object.httpMetadata?.contentType || contentTypeForKey(storageKey)
  );
  if (object.httpEtag) {
    headers.set('ETag', object.httpEtag);
  }

  return new Response(object.body, { status: 200, headers });
};
