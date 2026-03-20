import { getPublicImagesBaseUrl } from '../_lib/imageBaseUrl';
import { normalizePublicImageUrl, resolvePublicImageUrl } from '../_lib/imageUrls';

type D1PreparedStatement = {
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
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
};

type ProductRow = {
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

type ImageRow = {
  id: string;
  public_url: string | null;
  storage_key: string | null;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    },
  });

const safeParseJsonArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const isActiveGiftPromotion = (row: GiftPromotionRow, now: number) => {
  if (row.enabled !== 1) return false;
  const startsAt = row.starts_at ? Date.parse(row.starts_at) : null;
  const endsAt = row.ends_at ? Date.parse(row.ends_at) : null;
  if (startsAt !== null && Number.isFinite(startsAt) && now < startsAt) return false;
  if (endsAt !== null && Number.isFinite(endsAt) && now > endsAt) return false;
  return true;
};

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const fetchImageUrlMap = async (
  db: D1Database,
  ids: string[],
  imageBaseUrl: string
): Promise<Map<string, string>> => {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map();

  const imageMap = new Map<string, string>();
  const chunks = chunkArray(unique, 80);

  for (const chunk of chunks) {
    const placeholders = chunk.map(() => '?').join(', ');
    const { results } = await db
      .prepare(`SELECT id, public_url, storage_key FROM images WHERE id IN (${placeholders});`)
      .bind(...chunk)
      .all<ImageRow>();

    for (const row of results || []) {
      imageMap.set(row.id, resolvePublicImageUrl(row.public_url, row.storage_key, imageBaseUrl));
    }
  }

  return imageMap;
};

const resolveProductImageUrl = (product: ProductRow, imageMap: Map<string, string>) => {
  const legacyPrimary = product.image_url || safeParseJsonArray(product.image_urls_json)[0] || '';
  if (legacyPrimary) return legacyPrimary;

  const imageIds = [product.primary_image_id || '', ...safeParseJsonArray(product.image_ids_json)].filter(Boolean);
  for (const imageId of imageIds) {
    const url = imageMap.get(imageId);
    if (url) return url;
  }

  return '';
};

export const onRequestGet = async (context: {
  env: { DB: D1Database; PUBLIC_IMAGES_BASE_URL?: string };
  request: Request;
}): Promise<Response> => {
  try {
    const row = await context.env.DB.prepare(
      `SELECT id, name, enabled, starts_at, ends_at, threshold_subtotal_cents, gift_product_id,
              gift_quantity, banner_enabled, banner_text, popup_enabled, popup_headline, popup_body,
              popup_cta_text, popup_cta_href, popup_image_id, promo_image_id
       FROM gift_promotions
       WHERE enabled = 1
       ORDER BY updated_at DESC
       LIMIT 1;`
    ).first<GiftPromotionRow>();

    if (!row) return json({ giftPromotion: null });
    if (!isActiveGiftPromotion(row, Date.now())) return json({ giftPromotion: null });

    const giftProductId = (row.gift_product_id || '').trim();
    if (!giftProductId) return json({ giftPromotion: null });

    const giftProduct = await context.env.DB
      .prepare(
        `SELECT id, name, description, image_url, image_urls_json, primary_image_id, image_ids_json,
                is_active, stripe_product_id, price_cents
         FROM products
         WHERE id = ?
         LIMIT 1;`
      )
      .bind(giftProductId)
      .first<ProductRow>();

    if (!giftProduct) {
      console.warn('[gift promotions] active promotion gift product missing', {
        promotionId: row.id,
        giftProductId,
      });
      return json({ giftPromotion: null });
    }

    const imageBaseUrl = getPublicImagesBaseUrl(context.env, context.request);
    const normalize = (value: string | null | undefined) =>
      normalizePublicImageUrl(value, context.env, context.request);

    const imageIds = [
      row.popup_image_id || '',
      row.promo_image_id || '',
      giftProduct.primary_image_id || '',
      ...safeParseJsonArray(giftProduct.image_ids_json),
    ];
    const imageMap = await fetchImageUrlMap(context.env.DB, imageIds, imageBaseUrl);

    const popupImageUrl = row.popup_image_id ? imageMap.get(row.popup_image_id) || '' : '';
    const promoImageUrl = row.promo_image_id ? imageMap.get(row.promo_image_id) || '' : '';
    const giftProductImageUrl = resolveProductImageUrl(giftProduct, imageMap);

    return json({
      giftPromotion: {
        id: row.id,
        name: row.name || '',
        thresholdSubtotalCents: row.threshold_subtotal_cents ?? 0,
        giftProductId: giftProduct.id,
        giftQuantity: Math.max(1, row.gift_quantity ?? 1),
        bannerEnabled: row.banner_enabled === 1,
        bannerText: row.banner_text || '',
        popupEnabled: row.popup_enabled === 1,
        popupHeadline: row.popup_headline || '',
        popupBody: row.popup_body || '',
        popupCtaText: row.popup_cta_text || '',
        popupCtaHref: row.popup_cta_href || '',
        popupImageUrl: normalize(popupImageUrl),
        promoImageUrl: normalize(promoImageUrl),
        previewImageUrl: normalize(promoImageUrl) || normalize(giftProductImageUrl),
        giftProduct: {
          id: giftProduct.id,
          name: giftProduct.name || '',
          description: giftProduct.description || '',
          imageUrl: normalize(giftProductImageUrl),
          isActive: giftProduct.is_active === 1,
          stripeProductId: giftProduct.stripe_product_id || null,
          priceCents: giftProduct.price_cents ?? 0,
        },
      },
    });
  } catch (error) {
    console.error('Failed to fetch active gift promotion', error);
    return json({ giftPromotion: null }, 200);
  }
};
