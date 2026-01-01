import { requireAdmin } from '../../_lib/adminAuth';

type D1PreparedStatement = {
  run(): Promise<{ success: boolean; error?: string }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  ADMIN_PASSWORD?: string;
  IMAGES_BUCKET?: R2Bucket;
  MV_IMAGES?: R2Bucket;
  PUBLIC_IMAGES_BASE_URL?: string;
  DB?: D1Database;
};

const BUILD_FINGERPRINT = 'upload-fingerprint-2025-12-21-a';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_SCOPES = new Set(['products', 'gallery', 'home', 'categories']);

const corsHeaders = (request?: Request | null) => ({
  'Access-Control-Allow-Origin': request?.headers.get('Origin') || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Password, X-Upload-Request-Id',
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

export async function onRequestOptions(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const auth = requireAdmin(request, env);
  if (auth) return auth;
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

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const auth = requireAdmin(request, env);
  if (auth) return auth;
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
  const auth = requireAdmin(request, env);
  if (auth) return auth;
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
    const bucket = env.IMAGES_BUCKET ?? env.MV_IMAGES;
    if (!bucket) {
      return json(
        withFingerprint({
          error: 'Missing images bucket binding',
          details: 'Bind IMAGES_BUCKET or MV_IMAGES to R2.',
        }),
        500,
        corsHeaders(request)
      );
    }
    if (!env.PUBLIC_IMAGES_BASE_URL) {
      return json(
        withFingerprint({
          error: 'Missing PUBLIC_IMAGES_BASE_URL',
          details: 'Set PUBLIC_IMAGES_BASE_URL to the public R2 base URL.',
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

    const ext = extensionForMime(file.type);
    const url = new URL(request.url);
    const rawScope = (url.searchParams.get('scope') || '').toLowerCase();
    const scope = rawScope || 'products';
    if (!ALLOWED_SCOPES.has(scope)) {
      return json(
        withFingerprint({
          error: 'Invalid scope',
          details: `scope must be one of: ${Array.from(ALLOWED_SCOPES).join(', ')}`,
        }),
        400,
        corsHeaders(request)
      );
    }
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const storageKey = `shell-and-brush/${scope}/${year}/${month}/${crypto.randomUUID()}.${ext}`;

    try {
      await bucket.put(storageKey, file.stream(), {
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

    let baseUrl = env.PUBLIC_IMAGES_BASE_URL.replace(/\/+$/, '');
    if (request.url.startsWith('https://') && baseUrl.startsWith('http://')) {
      baseUrl = `https://${baseUrl.slice('http://'.length)}`;
    }
    const publicUrl = `${baseUrl}/${storageKey}`;
    const uploadRequestId =
      url.searchParams.get('rid') ||
      request.headers.get('x-upload-request-id') ||
      null;

    const entityType = (form.get('entityType') || new URL(request.url).searchParams.get('entityType')) as string | null;
    const entityId = (form.get('entityId') || new URL(request.url).searchParams.get('entityId')) as string | null;
    const kind = (form.get('kind') || new URL(request.url).searchParams.get('kind')) as string | null;
    const isPrimaryRaw = (form.get('isPrimary') || new URL(request.url).searchParams.get('isPrimary')) as
      | string
      | null;
    const sortOrderRaw = (form.get('sortOrder') || new URL(request.url).searchParams.get('sortOrder')) as
      | string
      | null;
    const isPrimary = isPrimaryRaw ? (isPrimaryRaw === '1' || isPrimaryRaw.toLowerCase() === 'true' ? 1 : 0) : 0;
    const sortOrder = Number.isFinite(Number(sortOrderRaw)) ? Number(sortOrderRaw) : 0;
    let dbImageId: string | null = null;
    if (env.DB) {
      dbImageId = crypto.randomUUID();
      try {
        await env.DB.prepare(
          `INSERT INTO images (
            id, storage_provider, storage_key, public_url, content_type, size_bytes, original_filename,
            entity_type, entity_id, kind, is_primary, sort_order, upload_request_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
        )
          .bind(
            dbImageId,
            'r2',
            storageKey,
            publicUrl,
            file.type || null,
            file.size || null,
            file.name || null,
            entityType || null,
            entityId || null,
            kind || null,
            isPrimary,
            sortOrder,
            uploadRequestId
          )
          .run();
      } catch (err) {
        console.error('[images/upload] D1 insert failed', err);
        return json(
          withFingerprint({ error: 'Image upload failed', details: 'DB insert error' }),
          500,
          corsHeaders(request)
        );
      }
    }

    const responsePayload: Record<string, unknown> = withFingerprint({
      id: storageKey,
      url: publicUrl,
    });
    if (dbImageId && dbImageId !== storageKey) {
      responsePayload.dbImageId = dbImageId;
    }

    return json(responsePayload, 200, corsHeaders(request));
  } catch (err) {
    const details = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err);
    console.error('[images/upload] Unexpected error', details);
    return json(withFingerprint({ error: 'Image upload failed', details }), 500, corsHeaders(request));
  }
}
