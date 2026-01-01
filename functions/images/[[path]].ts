type Env = {
  IMAGES_BUCKET?: R2Bucket;
  MV_IMAGES?: R2Bucket;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const extractKey = (request: Request, params?: Record<string, string>): string => {
  const paramValue = params?.path;
  if (paramValue) return decodeURIComponent(paramValue);
  const url = new URL(request.url);
  const prefix = '/images/';
  const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : '';
  return decodeURIComponent(path);
};

const isInvalidKey = (key: string) => !key || key.includes('..') || key.includes('\\');

const buildHeaders = (object: R2ObjectBody, includeBody: boolean) => {
  const headers = new Headers();
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  if (object.httpEtag) {
    headers.set('ETag', object.httpEtag);
  }
  return new Response(includeBody ? object.body : null, { status: 200, headers });
};

export async function onRequestGet(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
}): Promise<Response> {
  const key = extractKey(context.request, context.params);
  if (isInvalidKey(key)) {
    return json({ ok: false, code: 'INVALID_KEY' }, 400);
  }
  if (!key.startsWith('shellandbrush/')) {
    return json({ ok: false, code: 'FORBIDDEN_KEY' }, 403);
  }

  const bucket = context.env.IMAGES_BUCKET ?? context.env.MV_IMAGES;
  if (!bucket) {
    return json({ ok: false, code: 'MISSING_R2_BINDING' }, 500);
  }

  const object = await bucket.get(key);
  if (!object) {
    return new Response('Not Found', { status: 404 });
  }
  return buildHeaders(object, true);
}

export async function onRequestHead(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
}): Promise<Response> {
  const key = extractKey(context.request, context.params);
  if (isInvalidKey(key)) {
    return json({ ok: false, code: 'INVALID_KEY' }, 400);
  }
  if (!key.startsWith('shellandbrush/')) {
    return json({ ok: false, code: 'FORBIDDEN_KEY' }, 403);
  }

  const bucket = context.env.IMAGES_BUCKET ?? context.env.MV_IMAGES;
  if (!bucket) {
    return json({ ok: false, code: 'MISSING_R2_BINDING' }, 500);
  }

  const object = await bucket.head(key);
  if (!object) {
    return new Response('Not Found', { status: 404 });
  }
  const headers = new Headers();
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  if (object.httpEtag) {
    headers.set('ETag', object.httpEtag);
  }
  return new Response(null, { status: 200, headers });
}
