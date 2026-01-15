import Stripe from 'stripe';
import { calculateShippingCentsForCart, type CartCategoryItem, type ShippingCategoryConfig } from '../../_lib/shipping';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
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
  is_active: number | null;
  is_one_off?: number | null;
  is_sold?: number | null;
  quantity_available?: number | null;
  stripe_price_id?: string | null;
  stripe_product_id?: string | null;
  collection?: string | null;
  created_at: string | null;
};
type CategoryShippingRow = {
  slug: string | null;
  name: string | null;
  shipping_cents: number | null;
};
type PromotionRow = {
  id: string;
  name: string | null;
  percent_off: number | null;
  scope: 'global' | 'categories' | null;
  category_slugs_json: string | null;
  banner_enabled: number | null;
  banner_text: string | null;
  starts_at: string | null;
  ends_at: string | null;
  enabled: number | null;
};

type ActivePromotion = {
  id: string;
  percentOff: number;
  scope: 'global' | 'categories';
  categorySlugs: string[];
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const createStripeClient = (secretKey: string) =>
  new Stripe(secretKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });

const normalizeOrigin = (request: Request) => {
  const url = new URL(request.url);
  const originHeader = request.headers.get('origin');
  const origin = originHeader && originHeader.startsWith('http') ? originHeader : `${url.protocol}//${url.host}`;
  return origin.replace(/\/$/, '');
};

const normalizeValue = (value?: string | null) => (value || '').trim().toLowerCase();

const parseCategorySlugs = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
};

const isValidDateValue = (value?: string | null) => {
  if (!value) return true;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

const loadActivePromotion = async (db: D1Database): Promise<ActivePromotion | null> => {
  try {
    const row = await db
      .prepare(
        `SELECT id, percent_off, scope, category_slugs_json, starts_at, ends_at, enabled
         FROM promotions WHERE enabled = 1 ORDER BY updated_at DESC LIMIT 1;`
      )
      .first<PromotionRow>();

    if (!row || row.enabled !== 1) return null;
    if (!isValidDateValue(row.starts_at) || !isValidDateValue(row.ends_at)) return null;
    const now = Date.now();
    const startsAt = row.starts_at ? Date.parse(row.starts_at) : null;
    const endsAt = row.ends_at ? Date.parse(row.ends_at) : null;
    if (startsAt !== null && Number.isFinite(startsAt) && now < startsAt) return null;
    if (endsAt !== null && Number.isFinite(endsAt) && now > endsAt) return null;

    const percentOff = Math.round(Number(row.percent_off ?? 0));
    if (!Number.isFinite(percentOff) || percentOff <= 0) return null;
    const scope = row.scope === 'categories' ? 'categories' : 'global';
    return {
      id: row.id,
      percentOff,
      scope,
      categorySlugs: parseCategorySlugs(row.category_slugs_json),
    };
  } catch (error) {
    console.error('Failed to load active promotion', error);
    return null;
  }
};

const buildEligibleCategorySet = async (
  db: D1Database,
  slugs: string[]
): Promise<Set<string>> => {
  const normalized = slugs.map((slug) => normalizeValue(slug)).filter(Boolean);
  if (!normalized.length) return new Set();
  const placeholders = normalized.map(() => '?').join(',');
  try {
    const { results } = await db
      .prepare(`SELECT slug, name FROM categories WHERE slug IN (${placeholders});`)
      .bind(...normalized)
      .all<{ slug: string | null; name: string | null }>();
    const eligible = new Set<string>();
    (results || []).forEach((row) => {
      const slug = normalizeValue(row.slug);
      const name = normalizeValue(row.name);
      if (slug) eligible.add(slug);
      if (name) eligible.add(name);
    });
    return eligible;
  } catch (error) {
    console.error('Failed to load promo category slugs', error);
    return new Set();
  }
};

const getDiscountedCents = (priceCents: number, percentOff: number) =>
  Math.round(priceCents * (100 - percentOff) / 100);

export const onRequestPost = async (context: {
  request: Request;
  env: { DB: D1Database; STRIPE_SECRET_KEY?: string; VITE_PUBLIC_SITE_URL?: string };
}) => {
  const { request, env } = context;
  const stripeSecretKey = env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    console.error('STRIPE_SECRET_KEY is not configured');
    return json({ error: 'Stripe is not configured' }, 500);
  }
  console.log('Stripe secret present?', !!stripeSecretKey);

  try {
    const body = (await request.json()) as { items?: { productId?: string; quantity?: number }[] };
    const itemsPayload = Array.isArray(body.items) ? body.items : [];
    if (!itemsPayload.length) {
      return json({ error: 'At least one item is required' }, 400);
    }

    const normalizedItems = itemsPayload
      .map((i) => ({
        productId: i.productId?.trim(),
        quantity: Math.max(1, Number(i.quantity || 1)),
      }))
      .filter((i) => i.productId);

    if (!normalizedItems.length) {
      return json({ error: 'Invalid items' }, 400);
    }

    const summedByProduct = normalizedItems.reduce<Record<string, number>>((acc, item) => {
      if (!item.productId) return acc;
      acc[item.productId] = (acc[item.productId] || 0) + item.quantity;
      return acc;
    }, {});

    const productIds = Object.keys(summedByProduct);
    if (!productIds.length) {
      return json({ error: 'No products to checkout' }, 400);
    }

    const placeholders = productIds.map(() => '?').join(',');
    const productsRes = await env.DB.prepare(
      `
      SELECT id, name, slug, description, price_cents, category, image_url, image_urls_json, is_active,
             is_one_off, is_sold, quantity_available, stripe_price_id, stripe_product_id, collection, created_at
      FROM products
      WHERE id IN (${placeholders}) OR stripe_product_id IN (${placeholders});
    `
    )
      .bind(...productIds, ...productIds)
      .all<ProductRow>();

    const products = productsRes.results || [];

    let categoryConfigs: ShippingCategoryConfig[] = [];
    try {
      const categoryRows = await env.DB.prepare(`SELECT slug, name, shipping_cents FROM categories`).all<CategoryShippingRow>();
      categoryConfigs = (categoryRows.results || []).map((row) => ({
        slug: row.slug,
        name: row.name,
        shippingCents: row.shipping_cents ?? 0,
      }));
    } catch (error) {
      console.error('Failed to load category shipping config', error);
    }
    console.log('create-session products fetched', { requested: productIds.length, found: products.length });
    const productMap = new Map<string, ProductRow>();
    for (const p of products) {
      if (p.id) productMap.set(p.id, p);
      if (p.stripe_product_id) productMap.set(p.stripe_product_id, p);
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    const cartCategoryItems: CartCategoryItem[] = [];
    let subtotalCents = 0;
    const promotion = await loadActivePromotion(env.DB);
    const eligibleCategorySet =
      promotion && promotion.scope === 'categories'
        ? await buildEligibleCategorySet(env.DB, promotion.categorySlugs)
        : new Set<string>();
    let discountedCount = 0;

    for (const pid of productIds) {
      const product = productMap.get(pid);
      if (!product) {
        return json({ error: `Product not found: ${pid}` }, 404);
      }
      if (product.is_active === 0) {
        return json({ error: `Product inactive: ${product.name || pid}` }, 400);
      }
      if (product.is_sold === 1) {
        return json({ error: `Product already sold: ${product.name || pid}` }, 400);
      }
      if (product.price_cents === null || product.price_cents === undefined) {
        return json({ error: `Product missing price: ${product.name || pid}` }, 400);
      }
      if (!product.stripe_price_id) {
        return json({ error: `Product missing Stripe price: ${product.name || pid}` }, 400);
      }
      const requestedQuantity = summedByProduct[pid] || 1;
      const quantity =
        product.is_one_off === 1
          ? 1
          : Math.min(requestedQuantity, product.quantity_available ?? requestedQuantity);

      if (product.quantity_available !== null && product.quantity_available !== undefined && quantity > product.quantity_available) {
        return json({ error: `Requested quantity exceeds available inventory for ${product.name || pid}` }, 400);
      }

      const normalizedCategory = normalizeValue(product.category);
      const eligible =
        promotion?.scope === 'global' ||
        (promotion?.scope === 'categories' && normalizedCategory && eligibleCategorySet.has(normalizedCategory));
      const discountedCents =
        eligible && promotion ? getDiscountedCents(product.price_cents, promotion.percentOff) : product.price_cents;

      if (
        eligible &&
        promotion &&
        product.stripe_product_id &&
        Number.isFinite(discountedCents)
      ) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            unit_amount: Math.max(0, Math.round(discountedCents)),
            product: product.stripe_product_id,
          },
          quantity,
        });
        discountedCount += 1;
      } else {
        lineItems.push({
          price: product.stripe_price_id,
          quantity,
        });
      }
      subtotalCents += (product.price_cents ?? 0) * quantity;
      cartCategoryItems.push({ category: product.category ?? null });
    }

    const stripe = createStripeClient(stripeSecretKey);
    const baseUrl = env.VITE_PUBLIC_SITE_URL || normalizeOrigin(request);
    if (!baseUrl) {
      console.error('Missing VITE_PUBLIC_SITE_URL in env');
      return json({ error: 'Server configuration error: missing site URL' }, 500);
    }

    const shippingCents = calculateShippingCentsForCart(cartCategoryItems, categoryConfigs);
    const expiresAt = Math.floor(Date.now() / 1000) + 1800; // Stripe requires at least 30 minutes
    console.log('Creating embedded checkout session with expires_at', expiresAt);
    if (promotion && discountedCount > 0) {
      console.log('Promotion applied to checkout session', {
        promotionId: promotion.id,
        discountedCount,
        scope: promotion.scope,
      });
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        ui_mode: 'embedded',
        line_items: shippingCents > 0 ? [...lineItems, {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Shipping',
                metadata: { mv_line_type: 'shipping' },
              },
              unit_amount: shippingCents,
            },
            quantity: 1,
          }] : lineItems,
        return_url: `${baseUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
        metadata: { shipping_cents: String(shippingCents) },
        consent_collection: {
          promotions: 'auto',
        },
        shipping_address_collection: {
          allowed_countries: ['US', 'CA'],
        },
        expires_at: expiresAt,
      });

      if (!session.client_secret) {
        console.error('Stripe did not return a client_secret', session.id);
        return json({ error: 'Unable to create checkout session' }, 500);
      }

      return json({ clientSecret: session.client_secret, sessionId: session.id });
    } catch (stripeError: any) {
      console.error('Stripe checkout session error:', stripeError?.message || stripeError, stripeError?.raw);
      const message =
        stripeError?.raw?.message ||
        stripeError?.message ||
        'Failed to create checkout session';
      return json({ error: message }, 500);
    }
  } catch (error) {
    console.error('Error creating embedded checkout session', error);
    return json({ error: 'Failed to create checkout session' }, 500);
  }
};

