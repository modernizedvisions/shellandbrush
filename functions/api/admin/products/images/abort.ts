import { requireAdmin } from '../../../_lib/adminAuth';

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
  IMAGES_BUCKET?: R2Bucket;
  MV_IMAGES?: R2Bucket;
  DB: D1Database;
};

type PendingUploadRow = {
  id: string;
  object_key: string;
  status: string;
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
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const uploadId = typeof body.uploadId === 'string' ? body.uploadId.trim() : '';
  if (!uploadId) {
    return json({ ok: false, error: 'Missing uploadId.' }, 400);
  }

  const pending = await env.DB.prepare(
    `SELECT id, object_key, status FROM pending_uploads WHERE id = ? AND scope = 'products' LIMIT 1;`
  )
    .bind(uploadId)
    .first<PendingUploadRow>();

  if (!pending) {
    return json({ ok: false, error: 'Upload not found.' }, 404);
  }

  if (pending.status === 'confirmed') {
    return json({ ok: false, error: 'Upload already confirmed.' }, 409);
  }

  const bucket = env.IMAGES_BUCKET ?? env.MV_IMAGES;
  if (bucket) {
    try {
      await bucket.delete(pending.object_key);
    } catch {
      // Ignore delete failures; still mark as failed.
    }
  }

  await env.DB.prepare(
    `UPDATE pending_uploads
     SET status = 'failed', error = 'aborted'
     WHERE id = ?;`
  )
    .bind(uploadId)
    .run();

  return json({ ok: true });
}
