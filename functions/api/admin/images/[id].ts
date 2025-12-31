import { requireAdmin } from '../../_lib/adminAuth';

type D1PreparedStatement = {
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  ADMIN_PASSWORD?: string;
  DB?: D1Database;
  IMAGES_BUCKET?: R2Bucket;
  MV_IMAGES?: R2Bucket;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestDelete(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
}): Promise<Response> {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;

  const id = context.params?.id;
  if (!id) return json({ error: 'Image id is required' }, 400);

  const db = context.env.DB;
  if (!db) return json({ error: 'Missing D1 binding' }, 500);

  const bucket = context.env.IMAGES_BUCKET || context.env.MV_IMAGES;
  if (!bucket) return json({ error: 'Missing R2 binding' }, 500);

  const row = await db
    .prepare('SELECT id, storage_key FROM images WHERE id = ?;')
    .bind(id)
    .first<{ id: string; storage_key: string }>();

  if (!row?.id) return json({ error: 'Image not found' }, 404);

  try {
    await bucket.delete(row.storage_key);
  } catch (err) {
    console.error('[images/delete] R2 delete failed', err);
    return json({ error: 'Failed to delete image from storage' }, 500);
  }

  const result = await db.prepare('DELETE FROM images WHERE id = ?;').bind(id).run();
  if (!result.success) return json({ error: 'Failed to delete image record' }, 500);

  return json({ ok: true });
}

export async function onRequest(context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
}): Promise<Response> {
  if (context.request.method.toUpperCase() === 'DELETE') {
    return onRequestDelete(context);
  }
  return json({ error: 'Method not allowed' }, 405);
}
