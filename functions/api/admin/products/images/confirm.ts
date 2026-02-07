import { requireAdmin } from '../../../_lib/adminAuth';
import { getPublicImagesBaseUrl } from '../../../_lib/imageBaseUrl';

type D1PreparedStatement = {
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  ADMIN_PASSWORD?: string;
  PUBLIC_IMAGES_BASE_URL?: string;
  PUBLIC_SITE_URL?: string;
  VITE_PUBLIC_SITE_URL?: string;
  DB: D1Database;
};

type PendingUploadRow = {
  id: string;
  scope: string;
  object_key: string;
  original_name: string;
  mime: string | null;
  size_bytes: number;
  status: string;
};

type ImageRow = {
  id: string;
  public_url: string | null;
  storage_key: string | null;
};

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

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestPost(context: { env: Env; request: Request }): Promise<Response> {
  const { env, request } = context;
  const auth = requireAdmin(request, env);
  if (auth) return auth;

  let body: { uploadId?: string } = {};
  try {
    body = (await request.json()) as { uploadId?: string };
  } catch (err) {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const uploadId = typeof body.uploadId === 'string' ? body.uploadId.trim() : '';
  if (!uploadId) {
    return json({ ok: false, error: 'Missing uploadId.' }, 400);
  }

  const pending = await env.DB.prepare(
    `SELECT id, scope, object_key, original_name, mime, size_bytes, status
     FROM pending_uploads WHERE id = ? AND scope = 'products' LIMIT 1;`
  )
    .bind(uploadId)
    .first<PendingUploadRow>();

  if (!pending) {
    return json({ ok: false, error: 'Upload not found.' }, 404);
  }

  const base = getPublicImagesBaseUrl(env, request).replace(/\/+$/, '');
  const publicUrl = `${base}/${pending.object_key}`;
  if (!/^https:\/\//i.test(publicUrl)) {
    return json({ ok: false, error: 'PUBLIC_IMAGES_BASE_URL must be an https URL.' }, 500);
  }

  if (pending.status === 'confirmed') {
    const existing = await env.DB.prepare(
      `SELECT id, public_url, storage_key FROM images WHERE storage_key = ? LIMIT 1;`
    )
      .bind(pending.object_key)
      .first<ImageRow>();
    return json({
      ok: true,
      id: existing?.id || pending.object_key,
      url: existing?.public_url || publicUrl,
      image: existing
        ? { id: existing.id, publicUrl: existing.public_url, storageKey: existing.storage_key }
        : { id: pending.object_key, publicUrl, storageKey: pending.object_key },
      warning: existing ? undefined : 'IMAGE_RECORD_MISSING',
    });
  }

  if (pending.status !== 'uploaded') {
    return json({ ok: false, error: `Upload not ready (status=${pending.status}).` }, 409);
  }

  let dbImageId: string | null = null;
  let insertFailed = false;
  let insertError: string | null = null;

  try {
    dbImageId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO images (
        id, storage_provider, storage_key, public_url, content_type, size_bytes, original_filename,
        entity_type, entity_id, kind, is_primary, sort_order, upload_request_id, variant, source_image_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
    )
      .bind(
        dbImageId,
        'r2',
        pending.object_key,
        publicUrl,
        pending.mime || null,
        pending.size_bytes || null,
        pending.original_name || null,
        'product',
        null,
        null,
        0,
        0,
        uploadId,
        null,
        null
      )
      .run();
  } catch (err) {
    insertFailed = true;
    insertError = err instanceof Error ? err.message : String(err);
    dbImageId = null;
  }

  try {
    await env.DB.prepare(
      `UPDATE pending_uploads
       SET status = 'confirmed', confirmed_at = datetime('now'), error = ?
       WHERE id = ?;`
    )
      .bind(insertFailed ? insertError || 'D1_INSERT_FAILED' : null, uploadId)
      .run();
  } catch (err) {
    // Keep going; confirmation should still respond.
  }

  const imageId = dbImageId || pending.object_key;
  const responsePayload: Record<string, unknown> = {
    ok: true,
    id: imageId,
    url: publicUrl,
    image: {
      id: imageId,
      publicUrl,
      storageKey: pending.object_key,
    },
  };
  if (insertFailed) {
    responsePayload.warning = 'D1_INSERT_FAILED';
  }

  return json(responsePayload);
}
