import Stripe from 'stripe';
import type { Product } from '../../../src/lib/types';
import { requireAdmin } from '../_lib/adminAuth';
import { isBlockedImageUrl, normalizePublicImageUrl, resolvePublicImageUrl } from '../_lib/imageUrls';
import { getPublicImagesBaseUrl } from '../_lib/imageBaseUrl';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
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

const createStripeClient = (secretKey: string) =>
  new Stripe(secretKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });

const buildNormalize = (baseUrl: string) =>
  (value: string | null | undefined) =>
    normalizePublicImageUrl(value, { PUBLIC_IMAGES_BASE_URL: baseUrl }, undefined);

type NewProductInput = {
  name: string;
  description: string;
  priceCents: number;
  category: string;
  categoryId?: string;
  imageUrl: string;
  imageUrls?: string[];
  primaryImageId?: string | null;
  imageIds?: string[] | null;
  quantityAvailable?: number;
  isOneOff?: boolean;
  isActive?: boolean;
  stripePriceId?: string;
  stripeProductId?: string;
  collection?: string;
};

const mapRowToProduct = (row: ProductRow, imageUrlMap: Map<string, string>, normalize: (value: string | null | undefined) => string): Product => {
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

  const normalizedPrimary = normalize(primaryImage);
  const normalizedUrls = resolvedImageUrls
    .map((url) => normalize(url))
    .filter((url) => url && url.length > 0);
  const finalUrls = normalizedPrimary
    ? [normalizedPrimary, ...normalizedUrls.filter((url) => url !== normalizedPrimary)]
    : normalizedUrls;

  return {
    id: row.id,
    stripeProductId: row.stripe_product_id || row.id,
    stripePriceId: row.stripe_price_id || undefined,
    name: row.name ?? '',
    description: row.description ?? '',
    imageUrls: finalUrls,
    imageUrl: normalizedPrimary,
    primaryImageId: row.primary_image_id || (imageIds[0] || undefined),
    imageIds: imageIds.length ? imageIds : undefined,
    thumbnailUrl: normalizedPrimary || undefined,
    type: row.category ?? 'General',
    category: row.category ?? undefined,
    categories: row.category ? [row.category] : undefined,
    collection: row.collection ?? undefined,
    oneoff: row.is_one_off === null ? true : row.is_one_off === 1,
    visible: row.is_active === null ? true : row.is_active === 1,
    isSold: row.is_sold === 1,
    priceCents: row.price_cents ?? undefined,
    soldAt: undefined,
    quantityAvailable: row.quantity_available ?? undefined,
    slug: row.slug ?? undefined,
  };
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

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const sanitizeCategory = (value: string | undefined | null) => (value || '').trim();

const isD1ErrorMessage = (value: string) =>
  /no such table|no such column|SQLITE|D1/i.test(value);

const jsonError = (code: 'D1_ERROR' | 'VALIDATION_ERROR' | 'UNKNOWN', message: string, extra?: Record<string, unknown>) =>
  new Response(JSON.stringify({ ok: false, code, message, ...extra }), {
    status: code === 'VALIDATION_ERROR' ? 400 : 500,
    headers: { 'Content-Type': 'application/json' },
  });

const validateNewProduct = (input: Partial<NewProductInput>) => {
  if (!input.name || !input.description || input.priceCents === undefined || input.priceCents === null) {
    return 'name, description, and priceCents are required';
  }
  if (input.priceCents < 0) {
    return 'priceCents must be non-negative';
  }
  if (!sanitizeCategory(input.category)) {
    return 'category is required';
  }
  const hasIds = !!input.primaryImageId || (Array.isArray(input.imageIds) && input.imageIds.length > 0);
  if (!hasIds && !input.imageUrl) {
    return 'imageUrl or primaryImageId is required';
  }
  return null;
};

const hasBlockedUrls = (urls: Array<string | null | undefined>) => urls.some((url) => isBlockedImageUrl(url));

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

const resolveCategoryFromId = async (db: D1Database, categoryId?: string | null): Promise<string> => {
  if (!categoryId) return '';
  try {
    const row = await db
      .prepare(`SELECT slug, name FROM categories WHERE id = ? LIMIT 1;`)
      .bind(categoryId)
      .first<{ slug: string | null; name: string | null }>();
    return sanitizeCategory(row?.slug || row?.name || '');
  } catch (err) {
    return '';
  }
};

const resolveImageUrlsFromIds = async (
  db: D1Database,
  baseUrl: string,
  primaryImageId?: string | null,
  imageIds?: string[] | null
) => {
  const ids = [primaryImageId || '', ...(imageIds || [])].filter(Boolean);
  const urlMap = await fetchImageUrlMap(db, ids, baseUrl);
  const primaryUrl = primaryImageId ? urlMap.get(primaryImageId) || '' : '';
  const extraUrls = (imageIds || []).map((id) => urlMap.get(id)).filter((url): url is string => !!url);
  return { primaryUrl, extraUrls, urlMap };
};

const resolveImageIdsFromUrls = async (db: D1Database, urls: string[]) => {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  if (!unique.length) return new Map<string, string>();
  const placeholders = unique.map(() => '?').join(', ');
  const { results } = await db
    .prepare(`SELECT id, public_url FROM images WHERE public_url IN (${placeholders});`)
    .bind(...unique)
    .all<{ id: string; public_url: string }>();
  return new Map((results || []).map((row) => [row.public_url, row.id]));
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

export async function onRequestGet(context: {
  env: { DB: D1Database; ADMIN_PASSWORD?: string; PUBLIC_IMAGES_BASE_URL?: string };
  request: Request;
}): Promise<Response> {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;
  try {
    await ensureProductSchema(context.env.DB);

    const statement = context.env.DB.prepare(`
      SELECT id, name, slug, description, price_cents, category, image_url, image_urls_json,
             primary_image_id, image_ids_json,
             is_active, is_one_off, is_sold, quantity_available, stripe_price_id, stripe_product_id,
             collection, created_at
      FROM products
      ORDER BY created_at DESC;
    `);

    const { results } = await statement.all<ProductRow>();
    const rows = results || [];
    const imageIds = rows.flatMap((row) => {
      const extra = row.image_ids_json ? safeParseJsonArray(row.image_ids_json) : [];
      const primary = row.primary_image_id ? [row.primary_image_id] : [];
      return [...primary, ...extra];
    });
    const baseUrl = getPublicImagesBaseUrl(context.env, context.request);
    const normalize = buildNormalize(baseUrl);
    const imageUrlMap = await fetchImageUrlMap(context.env.DB, imageIds, baseUrl);
    const products: Product[] = rows.map((row) => mapRowToProduct(row, imageUrlMap, normalize));

    return new Response(JSON.stringify({ products }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in GET /api/admin/products', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestPost(context: {
  env: { DB: D1Database; STRIPE_SECRET_KEY?: string; ADMIN_PASSWORD?: string; PUBLIC_IMAGES_BASE_URL?: string };
  request: Request;
}): Promise<Response> {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;
  try {
    console.log('[products save] incoming', {
      method: context.request.method,
      url: context.request.url,
      contentType: context.request.headers.get('content-type'),
      contentLength: context.request.headers.get('content-length'),
    });

    let body: Partial<NewProductInput>;
    try {
      body = (await context.request.json()) as Partial<NewProductInput>;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({ ok: false, code: 'VALIDATION_ERROR', message: 'Invalid JSON', detail }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls : [];
    const imageIds = Array.isArray(body.imageIds) ? body.imageIds.filter(Boolean) : [];
    const primaryImageId = body.primaryImageId || imageIds[0] || null;
    console.log('[products save] payload summary', {
      keys: Object.keys(body),
      imageCount: imageUrls.length + (body.imageUrl ? 1 : 0),
      imageIdCount: imageIds.length + (primaryImageId ? 1 : 0),
      imageUrlPrefix: body.imageUrl ? body.imageUrl.slice(0, 30) : null,
      imageUrlsPreview: imageUrls.slice(0, 3).map((url) => (typeof url === 'string' ? url.slice(0, 30) : '')),
    });

    if (!sanitizeCategory(body.category)) {
      const resolved = await resolveCategoryFromId(context.env.DB, body.categoryId);
      if (resolved) {
        body.category = resolved;
      }
    }

    const error = validateNewProduct(body);
    if (error) {
      if (error === 'category is required') {
        return new Response(
          JSON.stringify({ ok: false, code: 'VALIDATION_ERROR', field: 'category', message: 'category is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ ok: false, code: 'VALIDATION_ERROR', message: error }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (hasBlockedUrls([body.imageUrl, ...imageUrls])) {
      return new Response(JSON.stringify({ error: 'Images must be uploaded first; only URLs allowed.' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const id = crypto.randomUUID();
    const slug = toSlug(body.name!);
    const isOneOff = body.isOneOff ?? true;
    const quantityAvailable = isOneOff ? 1 : Math.max(1, body.quantityAvailable ?? 1);
    const isActive = body.isActive ?? true;
    const category = sanitizeCategory(body.category);

    let resolvedPrimaryUrl = body.imageUrl || '';
    let resolvedExtraUrls = imageUrls;
    let resolvedPrimaryImageId = primaryImageId;
    let resolvedImageIds = imageIds;
    const baseUrl = getPublicImagesBaseUrl(context.env, context.request);
    const normalize = buildNormalize(baseUrl);

    if (primaryImageId || imageIds.length) {
      const resolved = await resolveImageUrlsFromIds(context.env.DB, baseUrl, primaryImageId, imageIds);
      if (primaryImageId && !resolved.primaryUrl && !body.imageUrl) {
        return new Response(JSON.stringify({ error: 'Primary image id not found' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      resolvedPrimaryUrl = resolved.primaryUrl || resolvedPrimaryUrl;
      resolvedExtraUrls = resolved.extraUrls.length ? resolved.extraUrls : resolvedExtraUrls;
    } else {
      const urlToId = await resolveImageIdsFromUrls(context.env.DB, [resolvedPrimaryUrl, ...resolvedExtraUrls]);
      resolvedPrimaryImageId = resolvedPrimaryUrl ? urlToId.get(resolvedPrimaryUrl) || null : null;
      resolvedImageIds = resolvedExtraUrls
        .map((url) => urlToId.get(url))
        .filter((val): val is string => !!val);
    }
    if (hasBlockedUrls([resolvedPrimaryUrl, ...resolvedExtraUrls])) {
      return new Response(JSON.stringify({ error: 'Images must be uploaded first; only URLs allowed.' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await ensureProductSchema(context.env.DB);
    try {
      const table = await context.env.DB.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='products';`
      ).first<{ name: string }>();
      if (!table?.name) {
        return jsonError('D1_ERROR', 'Products table missing');
      }
    } catch (dbError) {
      const detail = dbError instanceof Error ? dbError.message : String(dbError);
      return jsonError('D1_ERROR', 'DB schema check failed', { detail });
    }

    const statement = context.env.DB.prepare(
      `
      INSERT INTO products (
        id, name, slug, description, price_cents, category,
        image_url, image_urls_json, primary_image_id, image_ids_json,
        is_active, is_one_off, is_sold, quantity_available,
        stripe_price_id, stripe_product_id, collection
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `
    ).bind(
      id,
      body.name,
      slug,
      body.description,
      body.priceCents,
      category,
      resolvedPrimaryUrl || null,
      resolvedExtraUrls && resolvedExtraUrls.length ? JSON.stringify(resolvedExtraUrls) : null,
      resolvedPrimaryImageId,
      resolvedImageIds && resolvedImageIds.length ? JSON.stringify(resolvedImageIds) : null,
      isActive ? 1 : 0,
      isOneOff ? 1 : 0,
      0,
      quantityAvailable,
      body.stripePriceId || null,
      body.stripeProductId || null,
      body.collection || null
    );

    // TODO: When Stripe is wired, create/update Stripe product + price and persist IDs here.
    const result = await statement.run();
    if (!result.success) {
      throw new Error(result.error || 'Insert failed');
    }

    const fetchRow = async () =>
      context.env.DB.prepare(
        `
        SELECT id, name, slug, description, price_cents, category, image_url, image_urls_json,
               primary_image_id, image_ids_json,
               is_active, is_one_off, is_sold, quantity_available, stripe_price_id, stripe_product_id,
               collection, created_at
        FROM products WHERE id = ?;
      `
      )
        .bind(id)
        .first<ProductRow>();

    let inserted = await fetchRow();

    const stripeSecret = context.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      const imageIdSet = [
        inserted?.primary_image_id || '',
        ...(inserted?.image_ids_json ? safeParseJsonArray(inserted.image_ids_json) : []),
      ].filter(Boolean);
      const imageUrlMap = await fetchImageUrlMap(context.env.DB, imageIdSet, baseUrl);
      const product = inserted ? mapRowToProduct(inserted, imageUrlMap, normalize) : null;
      return new Response(JSON.stringify({ product, error: 'Stripe is not configured' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const stripe = createStripeClient(stripeSecret);

      // Only create Stripe resources if missing.
      if (!inserted?.stripe_product_id || !inserted?.stripe_price_id) {
        const stripeProduct = await stripe.products.create({
          name: body.name || 'Chesapeake Shell Item',
          description: body.description || undefined,
          metadata: {
            d1_product_id: id,
            d1_product_slug: slug,
          },
        });

        const stripePrice = await stripe.prices.create({
          product: stripeProduct.id,
          unit_amount: body.priceCents,
          currency: 'usd',
        });

        await context.env.DB.prepare(
          `UPDATE products SET stripe_product_id = ?, stripe_price_id = ? WHERE id = ?;`
        )
          .bind(stripeProduct.id, stripePrice.id, id)
          .run();

        inserted = await fetchRow();
      }
    } catch (stripeError) {
      console.error('Failed to create Stripe product/price', stripeError);
      const product = inserted ? mapRowToProduct(inserted, imageUrlMap, normalize) : null;
      return new Response(JSON.stringify({ product, error: 'Failed to create Stripe product and price.' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const imageIdSet = [
      inserted?.primary_image_id || '',
      ...(inserted?.image_ids_json ? safeParseJsonArray(inserted.image_ids_json) : []),
    ].filter(Boolean);
    const imageUrlMap = await fetchImageUrlMap(context.env.DB, imageIdSet, baseUrl);
    const product = inserted ? mapRowToProduct(inserted, imageUrlMap, normalize) : null;

    return new Response(JSON.stringify({ product }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[admin/products] failed', { message: detail, stack });
    if (isD1ErrorMessage(detail)) {
      return jsonError('D1_ERROR', detail);
    }
    return jsonError('UNKNOWN', detail);
  }
}

async function onRequestDelete(context: { env: { DB: D1Database; ADMIN_PASSWORD?: string }; request: Request }): Promise<Response> {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;
  try {
    const url = new URL(context.request.url);
    let id = url.searchParams.get('id');

    if (!id) {
      try {
        const body = (await context.request.json().catch(() => null)) as { id?: string } | null;
        if (body?.id) id = body.id;
      } catch {
        // ignore body parse errors
      }
    }

    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await ensureProductSchema(context.env.DB);

    const result = await context.env.DB.prepare('DELETE FROM products WHERE id = ?;')
      .bind(id)
      .run();

    if (!result.success) {
      throw new Error(result.error || 'Delete failed');
    }

    if (result.meta?.changes === 0) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to delete product', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequest(context: { env: { DB: D1Database; ADMIN_PASSWORD?: string }; request: Request }): Promise<Response> {
  const method = context.request.method.toUpperCase();
  if (method === 'GET') return onRequestGet(context);
  if (method === 'POST') return onRequestPost(context);
  if (method === 'DELETE') return onRequestDelete(context);
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}










