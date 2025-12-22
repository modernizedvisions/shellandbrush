type Env = {
  IMAGES_BUCKET?: R2Bucket;
  PUBLIC_IMAGES_BASE_URL?: string;
};

const BUILD_FINGERPRINT = 'upload-fingerprint-2025-12-21-a';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const corsHeaders = (request?: Request | null) => ({
  'Access-Control-Allow-Origin': request?.headers.get('Origin') || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
});

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const withFingerprint = <T extends Record<string, unknown>>(data: T) => ({
  ...data,
  fingerprint: BUILD_FINGERPRINT,
});

const extensionForMime = (mime: string) => {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
};

export async function onRequestOptions(context: { request: Request }): Promise<Response> {
  const { request } = context;
  console.log('[images/upload] handler', {
    handler: 'OPTIONS',
    method: request.method,
    url: request.url,
    contentType: request.headers.get('content-type') || '',
    requestId: request.headers.get('x-upload-request-id'),
  });
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(context.request),
      'X-Upload-Fingerprint': BUILD_FINGERPRINT,
    },
  });
}

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const { request } = context;
  console.log('[images/upload] handler', {
    handler: 'GET',
    method: request.method,
    url: request.url,
    contentType: request.headers.get('content-type') || '',
    requestId: request.headers.get('x-upload-request-id'),
  });
  return json(
    withFingerprint({
      error: 'Method not allowed. Use POST.',
      method: 'GET',
      path: request.url,
    }),
    405,
    corsHeaders(request)
  );
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const contentType = request.headers.get('content-type') || '';
  const contentLength = request.headers.get('content-length') || '';

  console.log('[images/upload] handler', {
    handler: 'POST',
    method: request.method,
    url: request.url,
    contentType,
    requestId: request.headers.get('x-upload-request-id'),
  });

  try {
    if (!env.IMAGES_BUCKET || !env.PUBLIC_IMAGES_BASE_URL) {
      return json(
        withFingerprint({
          error: 'Missing R2 configuration',
          envPresent: {
            IMAGES_BUCKET: !!env.IMAGES_BUCKET,
            PUBLIC_IMAGES_BASE_URL: !!env.PUBLIC_IMAGES_BASE_URL,
          },
        }),
        500,
        corsHeaders(request)
      );
    }

    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return json(
        withFingerprint({ error: 'Expected multipart/form-data upload' }),
        400,
        corsHeaders(request)
      );
    }

    const lengthValue = Number(contentLength);
    if (Number.isFinite(lengthValue) && lengthValue > MAX_UPLOAD_BYTES) {
      return json(
        withFingerprint({ error: 'Upload too large', details: 'Max 8MB allowed' }),
        413,
        corsHeaders(request)
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch (err) {
      console.error('[images/upload] Failed to parse form data', err);
      return json(withFingerprint({ error: 'Invalid form data' }), 400, corsHeaders(request));
    }

    let file = form.get('file');
    if (!file) {
      const files = form.getAll('files[]');
      file = files.find((entry) => entry instanceof File) || null;
    }

    if (!file || !(file instanceof File)) {
      return json(withFingerprint({ error: 'Missing file field' }), 400, corsHeaders(request));
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return json(
        withFingerprint({ error: 'Unsupported image type', details: file.type || 'unknown' }),
        415,
        corsHeaders(request)
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return json(
        withFingerprint({ error: 'Upload too large', details: 'Max 8MB allowed' }),
        413,
        corsHeaders(request)
      );
    }

    console.log('[images/upload] file received', {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const ext = extensionForMime(file.type);
    const key = `chesapeake-shell/${year}/${month}/${crypto.randomUUID()}.${ext}`;

    try {
      await env.IMAGES_BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { originalName: file.name },
      });
    } catch (err) {
      console.error('[images/upload] R2 upload failed', err);
      return json(
        withFingerprint({ error: 'Image upload failed', details: 'R2 upload error' }),
        500,
        corsHeaders(request)
      );
    }

    const baseUrl = env.PUBLIC_IMAGES_BASE_URL.replace(/\/$/, '');
    const url = `${baseUrl}/${key}`;

    return json(
      withFingerprint({
        id: key,
        url,
      }),
      200,
      corsHeaders(request)
    );
  } catch (err) {
    const details = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err);
    console.error('[images/upload] Unexpected error', details);
    return json(withFingerprint({ error: 'Image upload failed', details }), 500, corsHeaders(request));
  }
}
