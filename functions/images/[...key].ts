type Env = {
  IMAGES_BUCKET?: R2Bucket;
  MV_IMAGES?: R2Bucket;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const getKeyFromRequest = (request: Request): string => {
  const url = new URL(request.url);
  const prefix = '/images/';
  const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : '';
  return decodeURIComponent(path);
};

const buildResponse = (object: R2ObjectBody, status = 200) => {
  const headers = new Headers();
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  return new Response(object.body, { status, headers });
};

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const key = getKeyFromRequest(context.request);
  if (!key || !key.startsWith('shellandbrush/')) {
    return json({ ok: false, error: 'invalid_key' }, 400);
  }

  const bucket = context.env.IMAGES_BUCKET ?? context.env.MV_IMAGES;
  if (!bucket) {
    return json({ ok: false, error: 'missing_bucket_binding' }, 500);
  }

  const object = await bucket.get(key);
  if (!object) {
    return new Response('Not Found', { status: 404 });
  }

  return buildResponse(object, 200);
}

export async function onRequestHead(context: { request: Request; env: Env }): Promise<Response> {
  const key = getKeyFromRequest(context.request);
  if (!key || !key.startsWith('shellandbrush/')) {
    return json({ ok: false, error: 'invalid_key' }, 400);
  }

  const bucket = context.env.IMAGES_BUCKET ?? context.env.MV_IMAGES;
  if (!bucket) {
    return json({ ok: false, error: 'missing_bucket_binding' }, 500);
  }

  const object = await bucket.get(key);
  if (!object) {
    return new Response('Not Found', { status: 404 });
  }

  const headers = new Headers();
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  return new Response(null, { status: 200, headers });
}
