import type { Product } from '../../../src/lib/types';
import { resolvePublicImageUrl } from '../_lib/imageUrls';
import { getPublicImagesBaseUrl } from '../_lib/imageBaseUrl';

type D1PreparedStatement = {
  run(): Promise<{ success: boolean; error?: string }>;
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type ProductRow = {
  id: string;
  name: string | null;
  slug?: string | null;
  description: string | null;
  price_cents: number | null;
  category: string | null;
  image_url: string | null;
  image_urls_json?: string | null;
  primary_image_id?: string | null;
  image_ids_json?: string | null;
  is_active: number | null;
  is_one_off?: number | null;
  is_sold?: number | null;
  quantity_available?: number | null;
  stripe_price_id?: string | null;
  stripe_product_id?: string | null;
  collection?: string | null;
  created_at: string | null;
};

const safeParseJsonArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

const mapRowToProduct = (row: ProductRow, imageUrlMap: Map<string, string>): Product => {
  const imageIds = row.image_ids_json ? safeParseJsonArray(row.image_ids_json) : [];
  const legacyExtras = row.image_urls_json ? safeParseJsonArray(row.image_urls_json) : [];
  const legacyPrimary = row.image_url || legacyExtras[0] || '';

  let primaryImage = legacyPrimary;
  let resolvedImageUrls = legacyExtras;

  if (!primaryImage) {
    const primaryId = row.primary_image_id || imageIds[0] || '';
    const primaryFromIds = primaryId ? imageUrlMap.get(primaryId) || '' : '';
    const extraFromIds = imageIds.map((id) => imageUrlMap.get(id)).filter((url): url is string => !!url);
    primaryImage = primaryFromIds || '';
    resolvedImageUrls = primaryImage
      ? [primaryImage, ...extraFromIds.filter((url) => url !== primaryImage)]
      : extraFromIds;
  } else if (!resolvedImageUrls.length && imageIds.length) {
    const extraFromIds = imageIds.map((id) => imageUrlMap.get(id)).filter((url): url is string => !!url);
    resolvedImageUrls = primaryImage
      ? [primaryImage, ...extraFromIds.filter((url) => url !== primaryImage)]
      : extraFromIds;
  }

  if (primaryImage) {
    resolvedImageUrls = [primaryImage, ...resolvedImageUrls.filter((url) => url !== primaryImage)];
  }

  return {
    id: row.id,
    stripeProductId: row.stripe_product_id || row.id,
    stripePriceId: row.stripe_price_id || undefined,
    name: row.name ?? '',
    description: row.description ?? '',
    imageUrls: resolvedImageUrls,
    imageUrl: primaryImage,
    primaryImageId: row.primary_image_id || (imageIds[0] || undefined),
    imageIds: imageIds.length ? imageIds : undefined,
    thumbnailUrl: primaryImage || undefined,
    type: row.category ?? 'General',
    category: row.category ?? undefined,
    categories: row.category ? [row.category] : undefined,
    collection: row.collection ?? row.category ?? undefined,
    oneoff: row.is_one_off === null ? true : row.is_one_off === 1,
    visible: row.is_active === null ? true : row.is_active === 1,
    isSold: row.is_sold === 1,
    priceCents: row.price_cents ?? undefined,
    soldAt: undefined,
    quantityAvailable: row.quantity_available ?? undefined,
    slug: row.slug ?? undefined,
  };
};

export async function onRequestGet(context: {
  env: { DB: D1Database; PUBLIC_IMAGES_BASE_URL?: string };
  params: Record<string, string>;
}): Promise<Response> {
  const idOrSlug = context.params?.id;
  if (!idOrSlug) {
    return new Response(JSON.stringify({ error: 'Product id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await ensureProductSchema(context.env.DB);

    const row = await context.env.DB.prepare(
      `
      SELECT id, name, slug, description, price_cents, category, image_url, image_urls_json,
             primary_image_id, image_ids_json, is_active,
             is_one_off, is_sold, quantity_available, stripe_price_id, stripe_product_id, collection, created_at
      FROM products
      WHERE id = ? OR slug = ? OR stripe_product_id = ?
      LIMIT 1;
    `
    )
      .bind(idOrSlug, idOrSlug, idOrSlug)
      .first<ProductRow>();

    if (!row) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const imageIdSet = [
      row.primary_image_id || '',
      ...(row.image_ids_json ? safeParseJsonArray(row.image_ids_json) : []),
    ].filter(Boolean);
    const baseUrl = getPublicImagesBaseUrl(context.request, context.env);
    const imageUrlMap = await fetchImageUrlMap(context.env.DB, imageIdSet, baseUrl);
    const product = mapRowToProduct(row, imageUrlMap);
    return new Response(JSON.stringify({ product }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to load product', error);
    return new Response(JSON.stringify({ error: 'Failed to load product' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

const REQUIRED_PRODUCT_COLUMNS: Record<string, string> = {
  image_urls_json: 'image_urls_json TEXT',
  primary_image_id: 'primary_image_id TEXT',
  image_ids_json: 'image_ids_json TEXT',
  is_one_off: 'is_one_off INTEGER DEFAULT 1',
  is_sold: 'is_sold INTEGER DEFAULT 0',
  quantity_available: 'quantity_available INTEGER DEFAULT 1',
  stripe_price_id: 'stripe_price_id TEXT',
  stripe_product_id: 'stripe_product_id TEXT',
  collection: 'collection TEXT',
};

const createProductsTable = `
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT,
    slug TEXT,
    description TEXT,
    price_cents INTEGER,
    category TEXT,
    image_url TEXT,
    image_urls_json TEXT,
    primary_image_id TEXT,
    image_ids_json TEXT,
    is_active INTEGER DEFAULT 1,
    is_one_off INTEGER DEFAULT 1,
    is_sold INTEGER DEFAULT 0,
    quantity_available INTEGER DEFAULT 1,
    stripe_price_id TEXT,
    stripe_product_id TEXT,
    collection TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

const fetchImageUrlMap = async (
  db: D1Database,
  ids: string[],
  baseUrl: string
): Promise<Map<string, string>> => {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map();
  const placeholders = unique.map(() => '?').join(', ');
  const { results } = await db
    .prepare(`SELECT id, public_url, storage_key FROM images WHERE id IN (${placeholders});`)
    .bind(...unique)
    .all<{ id: string; public_url: string | null; storage_key: string | null }>();
  return new Map(
    (results || []).map((row) => [
      row.id,
      resolvePublicImageUrl(row.public_url, row.storage_key, baseUrl),
    ])
  );
};

async function ensureProductSchema(db: D1Database) {
  await db.prepare(createProductsTable).run();

  for (const [name, ddl] of Object.entries(REQUIRED_PRODUCT_COLUMNS)) {
    try {
      await db.prepare(`ALTER TABLE products ADD COLUMN ${ddl};`).run();
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (!/duplicate column|already exists/i.test(message)) {
        console.error(`Failed to add column ${name}`, error);
      }
    }
  }
}
