import { requireAdmin } from '../_lib/adminAuth';
import { getPublicImagesBaseUrl } from '../_lib/imageBaseUrl';
import { normalizePublicImageUrl, resolvePublicImageUrl } from '../_lib/imageUrls';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type GiftPromotionRow = {
  id: string;
  name: string | null;
  enabled: number | null;
  starts_at: string | null;
  ends_at: string | null;
  threshold_subtotal_cents: number | null;
  gift_product_id: string | null;
  gift_quantity: number | null;
  banner_enabled: number | null;
  banner_text: string | null;
  popup_enabled: number | null;
  popup_headline: string | null;
  popup_body: string | null;
  popup_cta_text: string | null;
  popup_cta_href: string | null;
  popup_image_id: string | null;
  promo_image_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ProductLookupRow = {
  id: string;
  name: string | null;
  description: string | null;
  image_url: string | null;
  image_urls_json: string | null;
  primary_image_id: string | null;
  image_ids_json: string | null;
  is_active: number | null;
  stripe_product_id: string | null;
  price_cents: number | null;
};

type GiftPromotionInput = {
  name: string;
  enabled?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  thresholdSubtotalCents: number;
  giftProductId: string;
  giftQuantity?: number;
  bannerEnabled?: boolean;
  bannerText?: string;
  popupEnabled?: boolean;
  popupHeadline?: string;
  popupBody?: string;
  popupCtaText?: string;
  popupCtaHref?: string;
  popupImageId?: string | null;
  promoImageId?: string | null;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const timestampSql = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

const createGiftPromotionsTable = `
  CREATE TABLE IF NOT EXISTS gift_promotions (
    id TEXT PRIMARY KEY,
    name TEXT,
    enabled INTEGER NOT NULL DEFAULT 0,
    starts_at TEXT,
    ends_at TEXT,
    threshold_subtotal_cents INTEGER NOT NULL,
    gift_product_id TEXT NOT NULL,
    gift_quantity INTEGER NOT NULL DEFAULT 1,
    banner_enabled INTEGER NOT NULL DEFAULT 0,
    banner_text TEXT,
    popup_enabled INTEGER NOT NULL DEFAULT 0,
    popup_headline TEXT,
    popup_body TEXT,
    popup_cta_text TEXT,
    popup_cta_href TEXT,
    popup_image_id TEXT,
    promo_image_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
`;

const REQUIRED_GIFT_PROMOTION_COLUMNS: Record<string, string> = {
  enabled: 'enabled INTEGER NOT NULL DEFAULT 0',
  starts_at: 'starts_at TEXT',
  ends_at: 'ends_at TEXT',
  threshold_subtotal_cents: 'threshold_subtotal_cents INTEGER NOT NULL DEFAULT 0',
  gift_product_id: 'gift_product_id TEXT',
  gift_quantity: 'gift_quantity INTEGER NOT NULL DEFAULT 1',
  banner_enabled: 'banner_enabled INTEGER NOT NULL DEFAULT 0',
  banner_text: 'banner_text TEXT',
  popup_enabled: 'popup_enabled INTEGER NOT NULL DEFAULT 0',
  popup_headline: 'popup_headline TEXT',
  popup_body: 'popup_body TEXT',
  popup_cta_text: 'popup_cta_text TEXT',
  popup_cta_href: 'popup_cta_href TEXT',
  popup_image_id: 'popup_image_id TEXT',
  promo_image_id: 'promo_image_id TEXT',
  created_at: `created_at TEXT NOT NULL DEFAULT (${timestampSql})`,
  updated_at: `updated_at TEXT NOT NULL DEFAULT (${timestampSql})`,
};

const selectByIdSql = `
  SELECT id, name, enabled, starts_at, ends_at, threshold_subtotal_cents, gift_product_id,
         gift_quantity, banner_enabled, banner_text, popup_enabled, popup_headline, popup_body,
         popup_cta_text, popup_cta_href, popup_image_id, promo_image_id, created_at, updated_at
  FROM gift_promotions
  WHERE id = ?;
`;

const selectAllSql = `
  SELECT id, name, enabled, starts_at, ends_at, threshold_subtotal_cents, gift_product_id,
         gift_quantity, banner_enabled, banner_text, popup_enabled, popup_headline, popup_body,
         popup_cta_text, popup_cta_href, popup_image_id, promo_image_id, created_at, updated_at
  FROM gift_promotions
  ORDER BY updated_at DESC;
`;

const parseBoolean = (value: unknown) => value === true || value === 1 || value === '1';

const toDbValue = (value: string | null | undefined) => {
  const trimmed = (value || '').trim();
  return trimmed ? trimmed : null;
};

const isValidDateString = (value: string) => Number.isFinite(Date.parse(value));

const isValidCtaHref = (value?: string | null) => {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('/')) return true;
  return /^https?:\/\//i.test(trimmed);
};

const safeParseJsonArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const getScheduleStatus = (row: {
  enabled: number | null;
  starts_at: string | null;
  ends_at: string | null;
}): 'Active' | 'Scheduled' | 'Expired' | 'Disabled' => {
  if (row.enabled !== 1) return 'Disabled';
  const now = Date.now();
  const startsAt = row.starts_at ? Date.parse(row.starts_at) : null;
  const endsAt = row.ends_at ? Date.parse(row.ends_at) : null;
  if (startsAt !== null && Number.isFinite(startsAt) && now < startsAt) return 'Scheduled';
  if (endsAt !== null && Number.isFinite(endsAt) && now > endsAt) return 'Expired';
  return 'Active';
};

const validateInput = (input: GiftPromotionInput): string | null => {
  if (!input || typeof input !== 'object') return 'Invalid payload';
  const name = (input.name || '').trim();
  if (!name) return 'name is required';

  const threshold = Number(input.thresholdSubtotalCents);
  if (!Number.isInteger(threshold) || threshold < 1) {
    return 'thresholdSubtotalCents must be an integer greater than 0';
  }

  const giftProductId = (input.giftProductId || '').trim();
  if (!giftProductId) return 'giftProductId is required';

  const giftQuantity = Number(input.giftQuantity ?? 1);
  if (!Number.isInteger(giftQuantity) || giftQuantity < 1 || giftQuantity > 25) {
    return 'giftQuantity must be an integer between 1 and 25';
  }

  if (input.startsAt && !isValidDateString(input.startsAt)) {
    return 'startsAt must be a valid ISO date';
  }
  if (input.endsAt && !isValidDateString(input.endsAt)) {
    return 'endsAt must be a valid ISO date';
  }
  if (input.startsAt && input.endsAt) {
    const start = Date.parse(input.startsAt);
    const end = Date.parse(input.endsAt);
    if (Number.isFinite(start) && Number.isFinite(end) && start >= end) {
      return 'startsAt must be before endsAt';
    }
  }

  if (!isValidCtaHref(input.popupCtaHref ?? null)) {
    return 'popupCtaHref must be a relative path or absolute http(s) URL';
  }

  return null;
};

const fetchImageUrlMap = async (
  db: D1Database,
  imageIds: string[],
  imageBaseUrl: string
): Promise<Map<string, string>> => {
  const unique = Array.from(new Set(imageIds.filter(Boolean)));
  if (!unique.length) return new Map();

  const result = new Map<string, string>();
  const chunks = chunkArray(unique, 80);

  for (const chunk of chunks) {
    const placeholders = chunk.map(() => '?').join(', ');
    const { results } = await db
      .prepare(`SELECT id, public_url, storage_key FROM images WHERE id IN (${placeholders});`)
      .bind(...chunk)
      .all<{ id: string; public_url: string | null; storage_key: string | null }>();

    for (const row of results || []) {
      result.set(row.id, resolvePublicImageUrl(row.public_url, row.storage_key, imageBaseUrl));
    }
  }

  return result;
};

const fetchProductMap = async (
  db: D1Database,
  productIds: string[]
): Promise<Map<string, ProductLookupRow>> => {
  const unique = Array.from(new Set(productIds.filter(Boolean)));
  if (!unique.length) return new Map();
  const placeholders = unique.map(() => '?').join(', ');
  const { results } = await db
    .prepare(
      `SELECT id, name, description, image_url, image_urls_json, primary_image_id, image_ids_json,
              is_active, stripe_product_id, price_cents
       FROM products
       WHERE id IN (${placeholders});`
    )
    .bind(...unique)
    .all<ProductLookupRow>();
  return new Map((results || []).map((row) => [row.id, row]));
};

const resolveProductImageUrl = (
  row: ProductLookupRow,
  imageMap: Map<string, string>
): string => {
  const legacyPrimary = row.image_url || safeParseJsonArray(row.image_urls_json)[0] || '';
  if (legacyPrimary) return legacyPrimary;
  const imageIds = [row.primary_image_id || '', ...safeParseJsonArray(row.image_ids_json)].filter(Boolean);
  for (const imageId of imageIds) {
    const url = imageMap.get(imageId);
    if (url) return url;
  }
  return '';
};

const mapRow = (
  row: GiftPromotionRow,
  productMap: Map<string, ProductLookupRow>,
  imageMap: Map<string, string>,
  normalize: (value: string | null | undefined) => string
) => {
  const giftProduct = row.gift_product_id ? productMap.get(row.gift_product_id) : null;
  const popupImageUrl = row.popup_image_id ? imageMap.get(row.popup_image_id) || '' : '';
  const promoImageUrl = row.promo_image_id ? imageMap.get(row.promo_image_id) || '' : '';
  const giftProductImageUrl = giftProduct ? resolveProductImageUrl(giftProduct, imageMap) : '';

  return {
    id: row.id,
    name: row.name || '',
    enabled: parseBoolean(row.enabled),
    status: getScheduleStatus(row),
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    thresholdSubtotalCents: row.threshold_subtotal_cents ?? 0,
    giftProductId: row.gift_product_id || '',
    giftQuantity: row.gift_quantity ?? 1,
    bannerEnabled: parseBoolean(row.banner_enabled),
    bannerText: row.banner_text || '',
    popupEnabled: parseBoolean(row.popup_enabled),
    popupHeadline: row.popup_headline || '',
    popupBody: row.popup_body || '',
    popupCtaText: row.popup_cta_text || '',
    popupCtaHref: row.popup_cta_href || '',
    popupImageId: row.popup_image_id || null,
    popupImageUrl: normalize(popupImageUrl),
    promoImageId: row.promo_image_id || null,
    promoImageUrl: normalize(promoImageUrl),
    previewImageUrl: normalize(promoImageUrl) || normalize(giftProductImageUrl),
    giftProduct: giftProduct
      ? {
          id: giftProduct.id,
          name: giftProduct.name || '',
          description: giftProduct.description || '',
          imageUrl: normalize(giftProductImageUrl),
          isActive: giftProduct.is_active === 1,
          stripeProductId: giftProduct.stripe_product_id || null,
          priceCents: giftProduct.price_cents ?? 0,
        }
      : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
};

async function ensureGiftPromotionSchema(db: D1Database) {
  await db.prepare(createGiftPromotionsTable).run();
  for (const ddl of Object.values(REQUIRED_GIFT_PROMOTION_COLUMNS)) {
    try {
      await db.prepare(`ALTER TABLE gift_promotions ADD COLUMN ${ddl};`).run();
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (!/duplicate column|already exists/i.test(message)) {
        console.error('Failed to add gift_promotions column', error);
      }
    }
  }
}

async function assertGiftProductExists(db: D1Database, giftProductId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT id FROM products WHERE id = ? LIMIT 1;`)
    .bind(giftProductId)
    .first<{ id: string }>();
  return !!row?.id;
}

async function buildMappedRows(
  db: D1Database,
  rows: GiftPromotionRow[],
  env: { PUBLIC_IMAGES_BASE_URL?: string },
  request: Request
) {
  const imageBaseUrl = getPublicImagesBaseUrl(env, request);
  const normalize = (value: string | null | undefined) => normalizePublicImageUrl(value, env, request);

  const productIds = rows.map((row) => row.gift_product_id || '').filter(Boolean);
  const productMap = await fetchProductMap(db, productIds);

  const imageIdsFromPromotions = rows.flatMap((row) => [row.popup_image_id || '', row.promo_image_id || '']);
  const imageIdsFromProducts = Array.from(productMap.values()).flatMap((row) => [
    row.primary_image_id || '',
    ...safeParseJsonArray(row.image_ids_json),
  ]);

  const imageMap = await fetchImageUrlMap(db, [...imageIdsFromPromotions, ...imageIdsFromProducts], imageBaseUrl);

  return rows.map((row) => mapRow(row, productMap, imageMap, normalize));
}

export async function onRequest(context: {
  env: { DB: D1Database; ADMIN_PASSWORD?: string; PUBLIC_IMAGES_BASE_URL?: string };
  request: Request;
}): Promise<Response> {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;

  const method = context.request.method.toUpperCase();
  const db = context.env.DB;

  try {
    await ensureGiftPromotionSchema(db);

    if (method === 'GET') return handleGet(db, context.env, context.request);
    if (method === 'POST') return handlePost(db, context.request, context.env);
    if (method === 'PUT') return handlePut(db, context.request, context.env);
    if (method === 'DELETE') return handleDelete(db, context.request);

    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Admin gift promotions error', error);
    return json(
      { error: 'Internal server error', detail: String((error as Error)?.message || error) },
      500
    );
  }
}

async function handleGet(
  db: D1Database,
  env: { PUBLIC_IMAGES_BASE_URL?: string },
  request: Request
): Promise<Response> {
  const { results } = await db.prepare(selectAllSql).all<GiftPromotionRow>();
  const mapped = await buildMappedRows(db, results || [], env, request);
  return json({ giftPromotions: mapped });
}

async function handlePost(
  db: D1Database,
  request: Request,
  env: { PUBLIC_IMAGES_BASE_URL?: string }
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as GiftPromotionInput | null;
  if (!body) return json({ error: 'Invalid JSON' }, 400);

  const validationError = validateInput(body);
  if (validationError) return json({ error: validationError }, 400);

  const normalizedGiftProductId = (body.giftProductId || '').trim();
  if (!(await assertGiftProductExists(db, normalizedGiftProductId))) {
    return json({ error: 'giftProductId does not exist' }, 400);
  }

  const id = crypto.randomUUID();
  const enabled = !!body.enabled;
  if (enabled) {
    await db
      .prepare(`UPDATE gift_promotions SET enabled = 0, updated_at = ${timestampSql} WHERE enabled = 1;`)
      .run();
  }

  const result = await db
    .prepare(
      `INSERT INTO gift_promotions (
        id, name, enabled, starts_at, ends_at, threshold_subtotal_cents, gift_product_id,
        gift_quantity, banner_enabled, banner_text, popup_enabled, popup_headline, popup_body,
        popup_cta_text, popup_cta_href, popup_image_id, promo_image_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${timestampSql}, ${timestampSql});`
    )
    .bind(
      id,
      (body.name || '').trim(),
      enabled ? 1 : 0,
      toDbValue(body.startsAt),
      toDbValue(body.endsAt),
      Math.round(Number(body.thresholdSubtotalCents)),
      normalizedGiftProductId,
      Math.max(1, Math.round(Number(body.giftQuantity ?? 1))),
      body.bannerEnabled ? 1 : 0,
      toDbValue(body.bannerText) || '',
      body.popupEnabled ? 1 : 0,
      toDbValue(body.popupHeadline) || '',
      toDbValue(body.popupBody) || '',
      toDbValue(body.popupCtaText) || '',
      toDbValue(body.popupCtaHref),
      toDbValue(body.popupImageId),
      toDbValue(body.promoImageId)
    )
    .run();

  if (!result.success) {
    return json({ error: result.error || 'Failed to create gift promotion' }, 500);
  }

  const created = await db.prepare(selectByIdSql).bind(id).first<GiftPromotionRow>();
  if (!created) return json({ giftPromotion: null }, 201);

  const [mapped] = await buildMappedRows(db, [created], env, request);
  return json({ giftPromotion: mapped || null }, 201);
}

async function handlePut(
  db: D1Database,
  request: Request,
  env: { PUBLIC_IMAGES_BASE_URL?: string }
): Promise<Response> {
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').trim();
  if (!id) return json({ error: 'id is required' }, 400);

  const body = (await request.json().catch(() => null)) as GiftPromotionInput | null;
  if (!body) return json({ error: 'Invalid JSON' }, 400);

  const validationError = validateInput(body);
  if (validationError) return json({ error: validationError }, 400);

  const normalizedGiftProductId = (body.giftProductId || '').trim();
  if (!(await assertGiftProductExists(db, normalizedGiftProductId))) {
    return json({ error: 'giftProductId does not exist' }, 400);
  }

  const enabled = !!body.enabled;
  if (enabled) {
    await db
      .prepare(`UPDATE gift_promotions SET enabled = 0, updated_at = ${timestampSql} WHERE enabled = 1 AND id != ?;`)
      .bind(id)
      .run();
  }

  const result = await db
    .prepare(
      `UPDATE gift_promotions
       SET name = ?, enabled = ?, starts_at = ?, ends_at = ?, threshold_subtotal_cents = ?, gift_product_id = ?,
           gift_quantity = ?, banner_enabled = ?, banner_text = ?, popup_enabled = ?, popup_headline = ?,
           popup_body = ?, popup_cta_text = ?, popup_cta_href = ?, popup_image_id = ?, promo_image_id = ?,
           updated_at = ${timestampSql}
       WHERE id = ?;`
    )
    .bind(
      (body.name || '').trim(),
      enabled ? 1 : 0,
      toDbValue(body.startsAt),
      toDbValue(body.endsAt),
      Math.round(Number(body.thresholdSubtotalCents)),
      normalizedGiftProductId,
      Math.max(1, Math.round(Number(body.giftQuantity ?? 1))),
      body.bannerEnabled ? 1 : 0,
      toDbValue(body.bannerText) || '',
      body.popupEnabled ? 1 : 0,
      toDbValue(body.popupHeadline) || '',
      toDbValue(body.popupBody) || '',
      toDbValue(body.popupCtaText) || '',
      toDbValue(body.popupCtaHref),
      toDbValue(body.popupImageId),
      toDbValue(body.promoImageId),
      id
    )
    .run();

  if (!result.success) {
    return json({ error: result.error || 'Failed to update gift promotion' }, 500);
  }
  if (result.meta?.changes === 0) {
    return json({ error: 'Gift promotion not found' }, 404);
  }

  const updated = await db.prepare(selectByIdSql).bind(id).first<GiftPromotionRow>();
  if (!updated) return json({ giftPromotion: null });

  const [mapped] = await buildMappedRows(db, [updated], env, request);
  return json({ giftPromotion: mapped || null });
}

async function handleDelete(db: D1Database, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').trim();
  if (!id) return json({ error: 'id is required' }, 400);

  const result = await db.prepare(`DELETE FROM gift_promotions WHERE id = ?;`).bind(id).run();
  if (!result.success) return json({ error: result.error || 'Failed to delete gift promotion' }, 500);
  if (result.meta?.changes === 0) return json({ error: 'Gift promotion not found' }, 404);

  return json({ success: true });
}
