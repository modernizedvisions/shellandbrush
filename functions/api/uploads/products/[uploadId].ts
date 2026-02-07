type D1PreparedStatement = {
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  IMAGES_BUCKET?: R2Bucket;
  MV_IMAGES?: R2Bucket;
  DB: D1Database;
};

type PendingUploadRow = {
  id: string;
  object_key: string;
  original_name: string;
  mime: string | null;
  size_bytes: number;
  token: string;
  status: string;
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT, OPTIONS',
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

export async function onRequestPut(context: {
  env: Env;
  request: Request;
  params: Record<string, string>;
}): Promise<Response> {
  const { env, request, params } = context;
  const uploadId = params?.uploadId;
  if (!uploadId) {
    return json({ ok: false, error: 'Missing uploadId.' }, 400);
  }

  const url = new URL(request.url);
  const token = (url.searchParams.get('t') || '').trim();
  if (!token) {
    return json({ ok: false, error: 'Missing token.' }, 401);
  }

  const pending = await env.DB.prepare(
    `SELECT id, object_key, original_name, mime, size_bytes, token, status
     FROM pending_uploads WHERE id = ? AND scope = 'products' LIMIT 1;`
  )
    .bind(uploadId)
    .first<PendingUploadRow>();

  if (!pending) {
    return json({ ok: false, error: 'Upload not found.' }, 404);
  }

  if (pending.token !== token) {
    return json({ ok: false, error: 'Invalid token.' }, 403);
  }

  if (pending.status !== 'pending') {
    return json({ ok: false, error: `Upload not pending (status=${pending.status}).` }, 409);
  }

  const contentLengthRaw = request.headers.get('content-length');
  const contentLength = contentLengthRaw ? Number(contentLengthRaw) : null;
  if (Number.isFinite(contentLength)) {
    if ((contentLength as number) > MAX_UPLOAD_BYTES) {
      return json({ ok: false, error: 'Upload too large. Max 8MB allowed.' }, 413);
    }
    if (pending.size_bytes && contentLength !== pending.size_bytes) {
      return json({ ok: false, error: 'Content length mismatch.' }, 400);
    }
  } else if (pending.size_bytes > MAX_UPLOAD_BYTES) {
    return json({ ok: false, error: 'Upload too large. Max 8MB allowed.' }, 413);
  }

  const bucket = env.IMAGES_BUCKET ?? env.MV_IMAGES;
  if (!bucket) {
    return json({ ok: false, error: 'Missing images bucket binding.' }, 500);
  }

  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return json({ ok: false, error: 'Upload too large. Max 8MB allowed.' }, 413);
    }
    if (pending.size_bytes && bytes.byteLength !== pending.size_bytes) {
      return json({ ok: false, error: 'Uploaded size mismatch.' }, 400);
    }

    const contentType = pending.mime || request.headers.get('content-type') || 'application/octet-stream';

    await bucket.put(pending.object_key, bytes, {
      httpMetadata: { contentType },
      customMetadata: { originalName: pending.original_name },
    });

    await env.DB.prepare(
      `UPDATE pending_uploads
       SET status = 'uploaded', uploaded_at = datetime('now'), error = NULL
       WHERE id = ?;`
    )
      .bind(uploadId)
      .run();

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await env.DB.prepare(
        `UPDATE pending_uploads
         SET status = 'failed', error = ?
         WHERE id = ?;`
      )
        .bind(message || 'UPLOAD_FAILED', uploadId)
        .run();
    } catch {
      // ignore error updates
    }
    return json({ ok: false, error: message || 'Upload failed.' }, 500);
  }
}
