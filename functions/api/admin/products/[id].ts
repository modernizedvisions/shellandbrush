import type { Product } from '../../../../src/lib/types';
import { requireAdmin } from '../../_lib/adminAuth';
import { isBlockedImageUrl, normalizePublicImageUrl, resolvePublicImageUrl } from '../../_lib/imageUrls';
import { getPublicImagesBaseUrl } from '../../_lib/imageBaseUrl';

type D1PreparedStatement = {
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

type UpdateProductInput = {
  name?: string;
  description?: string;
  priceCents?: number;
  category?: string;
  imageUrl?: string;
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

const validateUpdate = (input: UpdateProductInput) => {
  if (input.priceCents !== undefined && input.priceCents < 0) {
    return 'priceCents must be non-negative';
  }
  if (input.category !== undefined && !sanitizeCategory(input.category)) {
    return 'category cannot be empty';
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

export async function onRequestPut(context: {
  env: { DB: D1Database; ADMIN_PASSWORD?: string; PUBLIC_IMAGES_BASE_URL?: string };
  request: Request;
  params: Record<string, string>;
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

    const id = context.params?.id;
    if (!id) {
      return new Response(JSON.stringify({ error: 'Product id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let body: UpdateProductInput;
    try {
      body = (await context.request.json()) as UpdateProductInput;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({ error: 'Invalid JSON', detail }), {
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
    const validationError = validateUpdate(body);
    if (validationError) {
      return new Response(JSON.stringify({ error: validationError }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (hasBlockedUrls([body.imageUrl, ...(Array.isArray(body.imageUrls) ? body.imageUrls : [])])) {
      return new Response(
        JSON.stringify({ error: 'Images must be uploaded first; only URLs allowed.' }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const sets: string[] = [];
    const values: unknown[] = [];

    await ensureProductSchema(context.env.DB);
    try {
      const table = await context.env.DB.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='products';`
      ).first<{ name: string }>();
      if (!table?.name) {
        return new Response(JSON.stringify({ error: 'Products table missing' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (dbError) {
      const detail = dbError instanceof Error ? dbError.message : String(dbError);
      return new Response(JSON.stringify({ error: 'DB schema check failed', detail }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const addSet = (clause: string, value: unknown) => {
      sets.push(clause);
      values.push(value);
    };

    if (body.name !== undefined) addSet('name = ?', body.name);
    if (body.name) addSet('slug = ?', toSlug(body.name));
    if (body.description !== undefined) addSet('description = ?', body.description);
    if (body.priceCents !== undefined) addSet('price_cents = ?', body.priceCents);
    if (body.category !== undefined) {
      const categoryValue = sanitizeCategory(body.category);
      addSet('category = ?', categoryValue || null);
    }
    const baseUrl = getPublicImagesBaseUrl(context.env, context.request);
    if (primaryImageId || imageIds.length) {
      const resolved = await resolveImageUrlsFromIds(context.env.DB, baseUrl, primaryImageId, imageIds);
      if (primaryImageId && !resolved.primaryUrl && !body.imageUrl) {
        return new Response(JSON.stringify({ error: 'Primary image id not found' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const primaryUrl = resolved.primaryUrl || (typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '');
      const extraUrls = resolved.extraUrls.length
        ? resolved.extraUrls
        : Array.isArray(body.imageUrls)
        ? body.imageUrls
        : [];
      if (hasBlockedUrls([primaryUrl, ...extraUrls])) {
        return new Response(JSON.stringify({ error: 'Images must be uploaded first; only URLs allowed.' }), {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      addSet('primary_image_id = ?', primaryImageId);
      addSet('image_ids_json = ?', JSON.stringify(imageIds));
      addSet('image_url = ?', primaryUrl ? primaryUrl : null);
      addSet('image_urls_json = ?', JSON.stringify(extraUrls));
    } else if (body.imageUrl !== undefined || body.imageUrls !== undefined) {
      const primary = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
      const extras = Array.isArray(body.imageUrls) ? body.imageUrls : [];
      if (hasBlockedUrls([primary, ...extras])) {
        return new Response(JSON.stringify({ error: 'Images must be uploaded first; only URLs allowed.' }), {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      addSet('image_url = ?', primary ? primary : null);
      addSet('image_urls_json = ?', JSON.stringify(extras));
      const urlToId = await resolveImageIdsFromUrls(context.env.DB, [primary, ...extras]);
      const resolvedPrimaryImageId = primary ? urlToId.get(primary) || null : null;
      const resolvedImageIds = extras.map((url) => urlToId.get(url)).filter((val): val is string => !!val);
      addSet('primary_image_id = ?', resolvedPrimaryImageId);
      addSet('image_ids_json = ?', JSON.stringify(resolvedImageIds));
    }
    if (body.quantityAvailable !== undefined) addSet('quantity_available = ?', body.quantityAvailable);
    if (body.isOneOff !== undefined) addSet('is_one_off = ?', body.isOneOff ? 1 : 0);
    if (body.isActive !== undefined) addSet('is_active = ?', body.isActive ? 1 : 0);
    if (body.stripePriceId !== undefined) addSet('stripe_price_id = ?', body.stripePriceId);
    if (body.stripeProductId !== undefined) addSet('stripe_product_id = ?', body.stripeProductId);
    if (body.collection !== undefined) addSet('collection = ?', body.collection);

    if (!sets.length) {
      return new Response(JSON.stringify({ error: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const statement = context.env.DB.prepare(
      `UPDATE products SET ${sets.join(', ')} WHERE id = ?;`
    ).bind(...values, id);

    // TODO: When Stripe is wired, sync updates to Stripe product/price as needed.
    const result = await statement.run();
    if (!result.success) {
      throw new Error(result.error || 'Update failed');
    }
    if (result.meta?.changes === 0) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updated = await context.env.DB.prepare(
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

    const imageIdSet = [
      updated?.primary_image_id || '',
      ...(updated?.image_ids_json ? safeParseJsonArray(updated.image_ids_json) : []),
    ].filter(Boolean);
    const imageUrlMap = await fetchImageUrlMap(context.env.DB, imageIdSet, baseUrl);
    const normalize = (value: string | null | undefined) =>
      normalizePublicImageUrl(value, context.env, context.request);
    const product = updated ? mapRowToProduct(updated, imageUrlMap, normalize) : null;

    return new Response(JSON.stringify({ product }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Failed to update product', { detail, id: context.params?.id });
    return new Response(JSON.stringify({ error: 'Update product failed', detail }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestDelete(context: {
  env: { DB: D1Database; ADMIN_PASSWORD?: string };
  request: Request;
  params: Record<string, string>;
}): Promise<Response> {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;
  try {
    const id = context.params?.id;
    if (!id) {
      return new Response(JSON.stringify({ error: 'Product id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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



