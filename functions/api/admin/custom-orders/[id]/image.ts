import { requireAdmin } from '../../../_lib/adminAuth';
import { getPublicImagesBaseUrl } from '../../../../_lib/imageBaseUrl';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
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
  PUBLIC_IMAGES_BASE_URL?: string;
  PUBLIC_SITE_URL?: string;
  VITE_PUBLIC_SITE_URL?: string;
  DB: D1Database;
};

type CustomOrderRow = {
  id: string;
  status: string | null;
  display_custom_order_id: string | null;
  paid_at: string | null;
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SCOPE = 'custom-orders';

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

export async function onRequestPost(context: {
  env: Env;
  request: Request;
  params: Record<string, string>;
}): Promise<Response> {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;
  const { env, request, params } = context;
  const id = params?.id;
  if (!id) return json({ error: 'Missing id' }, 400);

  try {
    await ensureCustomOrdersSchema(env.DB);
    const existing = await env.DB
      .prepare(
        `SELECT id, status, display_custom_order_id, paid_at
         FROM custom_orders WHERE id = ?`
      )
      .bind(id)
      .first<CustomOrderRow>();

    if (!existing) return json({ error: 'Not found' }, 404);

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return json({ error: 'Expected multipart/form-data upload.' }, 400);
    }

    const form = await request.formData().catch(() => null);
    if (!form) return json({ error: 'Invalid form data.' }, 400);

    let file = form.get('file');
    if (!file) {
      const files = form.getAll('files[]');
      file = files.find((entry) => entry instanceof File) || null;
    }
    if (!file || !(file instanceof File)) {
      return json({ error: 'Missing file field.' }, 400);
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return json({ error: `Unsupported image type: ${file.type || 'unknown'}` }, 415);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return json({ error: 'Upload too large. Max 8MB allowed.' }, 413);
    }

    const bucket = env.IMAGES_BUCKET ?? env.MV_IMAGES;
    if (!bucket) {
      return json({ error: 'Missing images bucket binding (IMAGES_BUCKET or MV_IMAGES).' }, 500);
    }

    const ext = extensionForMime(file.type);
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const storageKey = `shellandbrush/${SCOPE}/${year}/${month}/${crypto.randomUUID()}.${ext}`;

    await bucket.put(storageKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: file.name },
    });

    const base = getPublicImagesBaseUrl(env, request).replace(/\/+$/, '');
    const publicUrl = `${base}/${storageKey}`;
    if (!/^https:\/\//i.test(publicUrl)) {
      return json({ error: 'PUBLIC_IMAGES_BASE_URL must be an https URL like https://shellandbrush.com/images' }, 500);
    }

    const updatedAt = new Date().toISOString();
    const update = await env.DB
      .prepare(
        `UPDATE custom_orders
         SET image_url = ?, image_key = ?, image_updated_at = ?
         WHERE id = ?`
      )
      .bind(publicUrl, storageKey, updatedAt, id)
      .run();

    if (!update.success) {
      return json({ error: 'Failed to save image info' }, 500);
    }

    if ((existing.status || '').toLowerCase() === 'paid') {
      await ensureGalleryItemsSchema(env.DB);
      const title = `Custom Order ${existing.display_custom_order_id || existing.id}`;
      const soldAt = existing.paid_at || new Date().toISOString();
      await env.DB
        .prepare(
          `INSERT INTO gallery_items (
             id, source_type, source_id, status, image_url, title, hidden, created_at, sold_at
           ) VALUES (?, 'custom_order', ?, 'sold', ?, ?, 0, COALESCE(?, CURRENT_TIMESTAMP), ?)
           ON CONFLICT(source_type, source_id) DO UPDATE SET
             status = 'sold',
             image_url = excluded.image_url,
             title = COALESCE(excluded.title, gallery_items.title),
             hidden = 0,
             sold_at = COALESCE(gallery_items.sold_at, excluded.sold_at)`
        )
        .bind(crypto.randomUUID(), id, publicUrl, title, soldAt, soldAt)
        .run();
    }

    return json({ ok: true, imageUrl: publicUrl, imageKey: storageKey, imageUpdatedAt: updatedAt });
  } catch (err) {
    console.error('[custom-orders image] upload failed', err);
    return json({ error: 'Upload failed' }, 500);
  }
}

export async function onRequestDelete(context: {
  env: Env;
  request: Request;
  params: Record<string, string>;
}): Promise<Response> {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;
  const { env, params } = context;
  const id = params?.id;
  if (!id) return json({ error: 'Missing id' }, 400);

  try {
    await ensureCustomOrdersSchema(env.DB);
    const existing = await env.DB
      .prepare(
        `SELECT id, status, display_custom_order_id, paid_at
         FROM custom_orders WHERE id = ?`
      )
      .bind(id)
      .first<CustomOrderRow>();
    if (!existing) return json({ error: 'Not found' }, 404);

    const updatedAt = new Date().toISOString();
    const update = await env.DB
      .prepare(
        `UPDATE custom_orders
         SET image_url = NULL, image_key = NULL, image_updated_at = ?
         WHERE id = ?`
      )
      .bind(updatedAt, id)
      .run();
    if (!update.success) return json({ error: 'Failed to remove image' }, 500);

    if ((existing.status || '').toLowerCase() === 'paid') {
      await ensureGalleryItemsSchema(env.DB);
      await env.DB
        .prepare(
          `UPDATE gallery_items
           SET image_url = NULL, hidden = 1
           WHERE source_type = 'custom_order' AND source_id = ?`
        )
        .bind(id)
        .run();
    }

    return json({ ok: true });
  } catch (err) {
    console.error('[custom-orders image] delete failed', err);
    return json({ error: 'Delete failed' }, 500);
  }
}

async function ensureCustomOrdersSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS custom_orders (
    id TEXT PRIMARY KEY,
    display_custom_order_id TEXT,
    customer_name TEXT,
    customer_email TEXT,
    description TEXT,
    amount INTEGER,
    message_id TEXT,
    status TEXT DEFAULT 'pending',
    payment_link TEXT,
    stripe_session_id TEXT,
    stripe_payment_intent_id TEXT,
    paid_at TEXT,
    image_url TEXT,
    image_key TEXT,
    image_updated_at TEXT,
    shipping_name TEXT,
    shipping_line1 TEXT,
    shipping_line2 TEXT,
    shipping_city TEXT,
    shipping_state TEXT,
    shipping_postal_code TEXT,
    shipping_country TEXT,
    shipping_phone TEXT,
    shipping_cents INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`).run();

  const columns = await db.prepare(`PRAGMA table_info(custom_orders);`).all<{ name: string }>();
  const names = (columns.results || []).map((c) => c.name);
  const ensureColumn = async (col: string) => {
    if (!names.includes(col)) {
      await db.prepare(`ALTER TABLE custom_orders ADD COLUMN ${col} TEXT;`).run();
    }
  };
  await ensureColumn('display_custom_order_id');
  await ensureColumn('stripe_session_id');
  await ensureColumn('stripe_payment_intent_id');
  await ensureColumn('paid_at');
  await ensureColumn('image_url');
  await ensureColumn('image_key');
  await ensureColumn('image_updated_at');
  if (!names.includes('shipping_cents')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN shipping_cents INTEGER DEFAULT 0;`).run();
  }
  const shippingCols = [
    'shipping_name',
    'shipping_line1',
    'shipping_line2',
    'shipping_city',
    'shipping_state',
    'shipping_postal_code',
    'shipping_country',
    'shipping_phone',
  ];
  for (const col of shippingCols) {
    await ensureColumn(col);
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

