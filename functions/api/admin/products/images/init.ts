import { requireAdmin } from '../../../_lib/adminAuth';

type D1PreparedStatement = {
  run(): Promise<{ success: boolean; error?: string }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  ADMIN_PASSWORD?: string;
  DB: D1Database;
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const EXPIRES_IN_SECONDS = 15 * 60;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders() },
  });

const sanitizeFilename = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 'upload';
  const stripped = trimmed.replace(/[/\\]+/g, '/').split('/').pop() || trimmed;
  return stripped.replace(/[^\w.\-() ]+/g, '_').trim() || 'upload';
};

const extensionFromFilename = (name: string) => {
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
};

const extensionForMime = (mime: string) => {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return '';
  }
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestPost(context: { env: Env; request: Request }): Promise<Response> {
  const { env, request } = context;
  const auth = requireAdmin(request, env);
  if (auth) return auth;

  let body: { filename?: string; size?: number; mime?: string } = {};
  try {
    body = (await request.json()) as { filename?: string; size?: number; mime?: string };
  } catch (err) {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const filename = sanitizeFilename(typeof body.filename === 'string' ? body.filename : '');
  const size = Number(body.size);
  const mime = typeof body.mime === 'string' ? body.mime.trim() : '';

  if (!Number.isFinite(size) || size <= 0) {
    return json({ ok: false, error: 'Invalid file size.' }, 400);
  }
  if (size > MAX_UPLOAD_BYTES) {
    return json({ ok: false, error: 'Upload too large. Max 8MB allowed.' }, 413);
  }

  const extFromMime = mime ? extensionForMime(mime) : '';
  if (mime && !ALLOWED_MIME_TYPES.has(mime)) {
    return json({ ok: false, error: `Unsupported image type: ${mime}` }, 415);
  }

  const extFromName = extensionFromFilename(filename);
  const ext = extFromMime || extFromName;
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return json({ ok: false, error: 'Unsupported file type.' }, 415);
  }

  const uploadId = crypto.randomUUID();
  const token = crypto.randomUUID();
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const objectKey = `shellandbrush/products/${year}/${month}/${crypto.randomUUID()}.${ext}`;

  try {
    const result = await env.DB.prepare(
      `INSERT INTO pending_uploads (
        id, scope, object_key, original_name, mime, size_bytes, token, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending');`
    )
      .bind(uploadId, 'products', objectKey, filename, mime || null, size, token)
      .run();
    if (!result.success) {
      return json({ ok: false, error: result.error || 'Failed to initialize upload.' }, 500);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: message || 'Failed to initialize upload.' }, 500);
  }

  const putUrl = `/api/uploads/products/${uploadId}?t=${encodeURIComponent(token)}`;

  return json({
    ok: true,
    uploadId,
    putUrl,
    expiresInSeconds: EXPIRES_IN_SECONDS,
    objectKey,
  });
}
