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
  DEBUG_UPLOADS?: string;
};

const BUILD_FINGERPRINT = 'upload-fingerprint-2025-12-21-a';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_SCOPES = new Set(['products', 'gallery', 'home', 'categories', 'custom-orders']);
const ALLOWED_VARIANTS = new Set(['original', 'thumb', 'medium']);

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
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

const isDebugUploads = (request: Request, env: Env) => {
  const url = new URL(request.url);
  return url.searchParams.get('debug') === '1' || env.DEBUG_UPLOADS === '1' || env.DEBUG_UPLOADS === 'true';
};

const getRefererHost = (request: Request) => {
  const referer = request.headers.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).host;
  } catch {
    return null;
  }
};

const buildDebugFields = (request: Request, contentType: string | null, contentLength: string | null) => ({
  debug: true,
  host: request.headers.get('host'),
  origin: request.headers.get('origin'),
  refererHost: getRefererHost(request),
  method: request.method,
  isOptions: request.method.toUpperCase() === 'OPTIONS',
  adminHeaderPresent: !!(request.headers.get('x-admin-password') || '').trim(),
  contentType: contentType ?? request.headers.get('content-type'),
  contentLength: contentLength ?? request.headers.get('content-length'),
  requestId: request.headers.get('x-upload-request-id') || null,
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
  const url = new URL(request.url);
  const hasDebugQuery = url.searchParams.get('debug') === '1';
  if (hasDebugQuery) {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(),
        'X-Upload-Fingerprint': BUILD_FINGERPRINT,
      },
    });
  }
  const debugEnabled = isDebugUploads(request, env);
  const auth = requireAdmin(request, env);
  if (auth) {
    if (debugEnabled) {
      return json(
        withFingerprint({
          ok: false,
          code: 'UNAUTHORIZED',
          message: 'Admin authentication required.',
          ...buildDebugFields(request, request.headers.get('content-type'), request.headers.get('content-length')),
        }),
        auth.status,
        corsHeaders()
      );
    }
    return auth;
  }
  console.log('[images/upload] handler', {
    handler: 'OPTIONS',
    method: request.method,
    url: request.url,
    contentType: request.headers.get('content-type') || '',
    requestId: request.headers.get('x-upload-request-id'),
  });
  if (debugEnabled) {
    return json(
      withFingerprint({
        ok: true,
        ...buildDebugFields(request, request.headers.get('content-type'), request.headers.get('content-length')),
      }),
      200,
      corsHeaders()
    );
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(),
      'X-Upload-Fingerprint': BUILD_FINGERPRINT,
    },
  });
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const auth = requireAdmin(request, env);
  if (auth) {
    if (isDebugUploads(request, env)) {
      return json(
        withFingerprint({
          ok: false,
          code: 'UNAUTHORIZED',
          message: 'Admin authentication required.',
          ...buildDebugFields(request, request.headers.get('content-type'), request.headers.get('content-length')),
        }),
        auth.status,
        corsHeaders()
      );
    }
    return auth;
  }
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
      ...(isDebugUploads(request, env)
        ? buildDebugFields(request, request.headers.get('content-type'), request.headers.get('content-length'))
        : {}),
    }),
    405,
    corsHeaders()
  );
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const auth = requireAdmin(request, env);
  if (auth) {
    if (isDebugUploads(request, env)) {
      return json(
        withFingerprint({
          ok: false,
          code: 'UNAUTHORIZED',
          message: 'Admin authentication required.',
          ...buildDebugFields(request, request.headers.get('content-type'), request.headers.get('content-length')),
        }),
        auth.status,
        corsHeaders()
      );
    }
    return auth;
  }
  const contentType = request.headers.get('content-type') || '';
  const contentLength = request.headers.get('content-length') || '';
  const url = new URL(request.url);
  const rid = url.searchParams.get('rid') || request.headers.get('x-upload-request-id') || null;
  const scopeParam = (url.searchParams.get('scope') || '').toLowerCase();
  const scope = scopeParam || 'products';
  const debugEnabled = isDebugUploads(request, env);

  const respondError = (options: {
    code:
      | 'UPLOAD_FAILED'
      | 'MISSING_R2'
      | 'BAD_PUBLIC_IMAGES_BASE_URL'
      | 'BAD_MULTIPART'
      | 'R2_PUT_FAILED'
      | 'D1_INSERT_FAILED';
    message: string;
    status: number;
    error?: unknown;
  }) => {
    const errorObj =
      options.error instanceof Error
        ? { message: options.error.message, stack: options.error.stack || null }
        : options.error
        ? { message: String(options.error), stack: null }
        : { message: options.message, stack: null };

    console.error('[images/upload] error', {
      rid,
      scope,
      method: request.method,
      env: {
        hasBucketIMAGES: !!env.IMAGES_BUCKET,
        hasBucketMV: !!env.MV_IMAGES,
        hasPublicBaseUrl: !!env.PUBLIC_IMAGES_BASE_URL,
        hasDB: !!env.DB,
      },
      error: errorObj,
    });

    return json(
      withFingerprint({
        ok: false,
        code: options.code,
        message: options.message,
        rid,
        scope,
        ...(debugEnabled ? buildDebugFields(request, contentType, contentLength) : {}),
      }),
      options.status,
      corsHeaders()
    );
  };

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
      return respondError({
        code: 'MISSING_R2',
        message: 'Missing images bucket binding (IMAGES_BUCKET or MV_IMAGES).',
        status: 500,
      });
    }
    const rawBase = env.PUBLIC_IMAGES_BASE_URL ?? '';
    let base = rawBase.trim().replace(/\/+$/, '');
    if (!/^https:\/\//i.test(base)) {
      const host = request.headers.get('host') || new URL(request.url).host;
      base = `https://${host}/images`;
    }

    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return respondError({
        code: 'BAD_MULTIPART',
        message: 'Expected multipart/form-data upload.',
        status: 400,
      });
    }

    const lengthValue = Number(contentLength);
    if (Number.isFinite(lengthValue) && lengthValue > MAX_UPLOAD_BYTES) {
      return respondError({
        code: 'UPLOAD_FAILED',
        message: 'Upload too large. Max 8MB allowed.',
        status: 413,
      });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch (err) {
      return respondError({
        code: 'BAD_MULTIPART',
        message: 'Invalid form data.',
        status: 400,
        error: err,
      });
    }

    let file = form.get('file');
    if (!file) {
      const files = form.getAll('files[]');
      file = files.find((entry) => entry instanceof File) || null;
    }

    if (!file || !(file instanceof File)) {
      return respondError({
        code: 'BAD_MULTIPART',
        message: 'Missing file field.',
        status: 400,
      });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return respondError({
        code: 'UPLOAD_FAILED',
        message: `Unsupported image type: ${file.type || 'unknown'}`,
        status: 415,
      });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return respondError({
        code: 'UPLOAD_FAILED',
        message: 'Upload too large. Max 8MB allowed.',
        status: 413,
      });
    }

    console.log('[images/upload] file received', {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    const ext = extensionForMime(file.type);
    if (!ALLOWED_SCOPES.has(scope)) {
      return respondError({
        code: 'UPLOAD_FAILED',
        message: `Invalid scope. scope must be one of: ${Array.from(ALLOWED_SCOPES).join(', ')}`,
        status: 400,
      });
    }
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const storageKey = `shellandbrush/${scope}/${year}/${month}/${crypto.randomUUID()}.${ext}`;

    try {
      await bucket.put(storageKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { originalName: file.name },
      });
    } catch (err) {
      return respondError({
        code: 'R2_PUT_FAILED',
        message: 'Image upload failed (R2 put).',
        status: 500,
        error: err,
      });
    }

    const publicUrl = `${base}/${storageKey}`;
    if (!/^https:\/\//i.test(publicUrl)) {
      return respondError({
        code: 'BAD_PUBLIC_IMAGES_BASE_URL',
        message: 'PUBLIC_IMAGES_BASE_URL must be an https URL like https://shellandbrush.com/images',
        status: 500,
      });
    }
    const uploadRequestId = rid;

    const entityType = (form.get('entityType') || new URL(request.url).searchParams.get('entityType')) as string | null;
    const entityId = (form.get('entityId') || new URL(request.url).searchParams.get('entityId')) as string | null;
    const kind = (form.get('kind') || new URL(request.url).searchParams.get('kind')) as string | null;
    const variantRaw = (form.get('variant') || new URL(request.url).searchParams.get('variant')) as string | null;
    const sourceImageIdRaw = (form.get('sourceImageId') || new URL(request.url).searchParams.get('sourceImageId')) as string | null;
    const isPrimaryRaw = (form.get('isPrimary') || new URL(request.url).searchParams.get('isPrimary')) as
      | string
      | null;
    const sortOrderRaw = (form.get('sortOrder') || new URL(request.url).searchParams.get('sortOrder')) as
      | string
      | null;
    const variant = variantRaw ? variantRaw.trim().toLowerCase() : null;
    if (variant && !ALLOWED_VARIANTS.has(variant)) {
      return respondError({
        code: 'UPLOAD_FAILED',
        message: `Invalid variant. Must be one of: ${Array.from(ALLOWED_VARIANTS).join(', ')}`,
        status: 400,
      });
    }
    const sourceImageId = sourceImageIdRaw ? sourceImageIdRaw.trim() : null;
    const isPrimary = isPrimaryRaw ? (isPrimaryRaw === '1' || isPrimaryRaw.toLowerCase() === 'true' ? 1 : 0) : 0;
    const sortOrder = Number.isFinite(Number(sortOrderRaw)) ? Number(sortOrderRaw) : 0;
    let dbImageId: string | null = null;
    let insertFailed = false;
    if (env.DB) {
      dbImageId = crypto.randomUUID();
      try {
        await env.DB.prepare(
          `INSERT INTO images (
            id, storage_provider, storage_key, public_url, content_type, size_bytes, original_filename,
            entity_type, entity_id, kind, is_primary, sort_order, upload_request_id, variant, source_image_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
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
            uploadRequestId,
            variant || null,
            sourceImageId || null
          )
          .run();
      } catch (err) {
        insertFailed = true;
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[images/upload] D1 insert failed', {
          rid,
          error: errMsg,
        });
      }
    }

    const responsePayload: Record<string, unknown> = withFingerprint({
      ok: true,
      image: {
        id: dbImageId || storageKey,
        storageKey,
        publicUrl,
        variant: variant || null,
        sourceImageId: sourceImageId || null,
      },
    });
    if (debugEnabled) {
      Object.assign(responsePayload, buildDebugFields(request, contentType, contentLength));
    }
    if (insertFailed) {
      responsePayload.warning = 'D1_INSERT_FAILED';
    }

    return json(responsePayload, 200, corsHeaders());
  } catch (err) {
    return respondError({
      code: 'UPLOAD_FAILED',
      message: 'Image upload failed.',
      status: 500,
      error: err,
    });
  }
}

