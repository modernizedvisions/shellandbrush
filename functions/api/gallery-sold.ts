import { normalizePublicImageUrl } from './_lib/imageUrls';
import { getPublicImagesBaseUrl } from './_lib/imageBaseUrl';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; error?: string }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  DB?: D1Database;
  PUBLIC_IMAGES_BASE_URL?: string;
};

type GalleryItemRow = {
  id: string;
  source_type: string;
  source_id: string;
  status: string;
  image_url: string | null;
  title: string | null;
  hidden: number | null;
  created_at: string | null;
  sold_at: string | null;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
    },
  });

export async function onRequestGet(context: { env: Env; request: Request }): Promise<Response> {
  const { env, request } = context;
  if (!env.DB) {
    console.error('[api/gallery-sold] missing DB binding');
    return json({ error: 'missing_db' }, 500);
  }

  try {
    await ensureGalleryItemsSchema(env.DB);
    const baseUrl = getPublicImagesBaseUrl(env, request);
    const normalize = (value: string | null | undefined) =>
      normalizePublicImageUrl(value, { PUBLIC_IMAGES_BASE_URL: baseUrl }, request);

    const { results } = await env.DB.prepare(
      `SELECT id, source_type, source_id, status, image_url, title, hidden, created_at, sold_at
       FROM gallery_items
       WHERE status = 'sold'
       ORDER BY datetime(sold_at) DESC, datetime(created_at) DESC`
    ).all<GalleryItemRow>();

    const items = (results || [])
      .filter((row) => !(row.hidden === 1))
      .map((row) => ({
        id: row.id,
        sourceType: row.source_type,
        sourceId: row.source_id,
        status: row.status,
        imageUrl: normalize(row.image_url),
        title: row.title || undefined,
        hidden: row.hidden === 1,
        createdAt: row.created_at || undefined,
        soldAt: row.sold_at || undefined,
      }))
      .filter((row) => !!row.imageUrl);

    return json({ items });
  } catch (error) {
    console.error('[api/gallery-sold] failed', { message: (error as any)?.message, stack: (error as any)?.stack });
    return json({ error: 'gallery_sold_fetch_failed' }, 500);
  }
}

async function ensureGalleryItemsSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS gallery_items (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    status TEXT NOT NULL,
    image_url TEXT,
    title TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sold_at TEXT
  );`).run();

  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_items_source ON gallery_items(source_type, source_id);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_gallery_items_status ON gallery_items(status);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_gallery_items_created_at ON gallery_items(created_at);`).run();
}
