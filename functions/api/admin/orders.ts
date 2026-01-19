import { requireAdmin } from '../_lib/adminAuth';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type OrderRow = {
  id: string;
  display_order_id?: string | null;
  stripe_payment_intent_id: string | null;
  total_cents: number | null;
  customer_email: string | null;
  shipping_name: string | null;
  shipping_address_json: string | null;
  card_last4?: string | null;
  card_brand?: string | null;
  promo_code?: string | null;
  promo_percent_off?: number | null;
  promo_free_shipping?: number | null;
  promo_source?: string | null;
  created_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price_cents: number;
  product_name: string | null;
  product_image_url?: string | null;
};

export const onRequestGet = async (context: { env: { DB: D1Database; ADMIN_PASSWORD?: string }; request: Request }): Promise<Response> => {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;
  try {
    await assertOrdersTables(context.env.DB);
    const columns = await context.env.DB.prepare(`PRAGMA table_info(orders);`).all<{ name: string }>();
  const columnNames = (columns.results || []).map((c) => c.name);
    const emailColumn = columnNames.includes('customer_email')
      ? 'customer_email'
      : columnNames.includes('customer_email1')
      ? 'customer_email1'
      : null;
    const displayIdColumn = columnNames.includes('display_order_id') ? 'display_order_id' : null;
    const cardLast4Column = columnNames.includes('card_last4') ? 'card_last4' : null;
    const cardBrandColumn = columnNames.includes('card_brand') ? 'card_brand' : null;
    const promoCodeColumn = columnNames.includes('promo_code') ? 'promo_code' : null;
    const promoPercentColumn = columnNames.includes('promo_percent_off') ? 'promo_percent_off' : null;
    const promoFreeShippingColumn = columnNames.includes('promo_free_shipping') ? 'promo_free_shipping' : null;
    const promoSourceColumn = columnNames.includes('promo_source') ? 'promo_source' : null;

    const selectSql = `
      SELECT
        id,
        ${displayIdColumn ? `${displayIdColumn} AS display_order_id` : 'NULL AS display_order_id'},
        stripe_payment_intent_id,
        total_cents,
        ${emailColumn ? `${emailColumn} AS customer_email` : 'NULL AS customer_email'},
        shipping_name,
        shipping_address_json,
        ${cardLast4Column ? `${cardLast4Column} AS card_last4` : 'NULL AS card_last4'},
        ${cardBrandColumn ? `${cardBrandColumn} AS card_brand` : 'NULL AS card_brand'},
        ${promoCodeColumn ? `${promoCodeColumn} AS promo_code` : 'NULL AS promo_code'},
        ${promoPercentColumn ? `${promoPercentColumn} AS promo_percent_off` : 'NULL AS promo_percent_off'},
        ${promoFreeShippingColumn ? `${promoFreeShippingColumn} AS promo_free_shipping` : 'NULL AS promo_free_shipping'},
        ${promoSourceColumn ? `${promoSourceColumn} AS promo_source` : 'NULL AS promo_source'},
        created_at
      FROM orders
      ORDER BY datetime(created_at) DESC
      LIMIT 50;
    `;

    const res = await context.env.DB.prepare(selectSql).all<OrderRow>();
    const orderRows: OrderRow[] = res.results || [];
    console.log('[admin/orders] detected columns', {
      emailColumn,
      displayIdColumn,
      cardLast4Column,
      cardBrandColumn,
      promoCodeColumn,
      promoPercentColumn,
      promoFreeShippingColumn,
      promoSourceColumn,
      count: orderRows.length,
    });

    const productColumns = await context.env.DB.prepare(`PRAGMA table_info(products);`).all<{ name: string }>();
    const productCols = new Set((productColumns.results || []).map((c) => c.name));
  const joinColumn = productCols.has('stripe_product_id')
    ? 'stripe_product_id'
    : productCols.has('stripe_product_id'.toUpperCase())
    ? 'stripe_product_id'.toUpperCase()
    : 'id';

  const hasImageUrlsJson = productCols.has('image_urls_json');
  const hasShippingCents = columnNames.includes('shipping_cents');
  const orderIds = (orderRows || []).map((o) => o.id);
  let itemsByOrder: Record<string, OrderItemRow[]> = {};

    if (orderIds.length) {
      const placeholders = orderIds.map(() => '?').join(',');
      const imageSelect = hasImageUrlsJson
        ? `COALESCE(p.image_url,
            (SELECT json_extract(p.image_urls_json, '$[0]'))
          )`
        : `p.image_url`;

      const itemsStmt = context.env.DB.prepare(
        `
        SELECT oi.*,
               p.name AS product_name,
               ${imageSelect} AS product_image_url
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.${joinColumn}
        WHERE oi.order_id IN (${placeholders});
      `
      ).bind(...orderIds);
      const { results: itemRows } = await itemsStmt.all<OrderItemRow>();
      itemsByOrder = (itemRows || []).reduce((acc, item) => {
        acc[item.order_id] = acc[item.order_id] || [];
        acc[item.order_id].push(item);
        return acc;
      }, {} as Record<string, OrderItemRow[]>);
    }
    console.log('[admin/orders] attaching items', { orders: orderRows.length, withItems: Object.keys(itemsByOrder).length });

    const orders = (orderRows || []).map((o) => ({
      id: o.id,
      displayOrderId: o.display_order_id ?? null,
      createdAt: o.created_at,
      totalCents: o.total_cents ?? 0,
      shippingCents: hasShippingCents ? (o as any).shipping_cents ?? 0 : 0,
      promoCode: promoCodeColumn ? ((o as any).promo_code ?? null) : null,
      promoPercentOff: promoPercentColumn ? ((o as any).promo_percent_off ?? null) : null,
      promoFreeShipping: promoFreeShippingColumn ? ((o as any).promo_free_shipping ?? null) : null,
      promoSource: promoSourceColumn ? ((o as any).promo_source ?? null) : null,
      customerEmail: o.customer_email,
      shippingName: o.shipping_name,
      customerName: o.shipping_name,
      shippingAddress: o.shipping_address_json ? safeParseAddress(o.shipping_address_json) : null,
      cardLast4: o.card_last4 ?? null,
      cardBrand: o.card_brand ?? null,
      items: (itemsByOrder[o.id] || []).map((i) => ({
        productId: i.product_id,
        productName: i.product_name,
        quantity: i.quantity,
        priceCents: i.price_cents,
        productImageUrl: i.product_image_url ?? null,
      })),
    }));

    return new Response(JSON.stringify({ orders }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error fetching admin orders', err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: 'Failed to load orders', detail: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

function safeParseAddress(jsonString: string | null): Record<string, string | null> | null {
  if (!jsonString) return null;
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, string | null>;
    }
    return null;
  } catch {
    return null;
  }
}

async function assertOrdersTables(db: D1Database) {
  const { results } = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('orders','order_items');`)
    .all<{ name: string }>();
  const existing = new Set((results || []).map((r) => r.name));
  const missing = ['orders', 'order_items'].filter((t) => !existing.has(t));
  if (missing.length) {
    throw new Error(`Missing required tables: ${missing.join(', ')}`);
  }
}

async function backfillDisplayOrderIds(db: D1Database) {
  const missing = await db
    .prepare(
      `SELECT id, created_at FROM orders WHERE display_order_id IS NULL OR display_order_id = '' ORDER BY datetime(created_at) ASC`
    )
    .all<{ id: string; created_at: string }>();

  const rows = missing.results || [];
  if (!rows.length) return;

  const countersByYear = new Map<number, number>();
  const existingCounters = await db.prepare(`SELECT year, counter FROM order_counters`).all<{ year: number; counter: number }>();
  (existingCounters.results || []).forEach((row) => countersByYear.set(row.year, row.counter));

  await db.prepare('BEGIN IMMEDIATE TRANSACTION;').run();
  try {
    for (const row of rows) {
      const yearFull = row.created_at ? new Date(row.created_at).getFullYear() : new Date().getFullYear();
      const year = yearFull % 100;
      const current = countersByYear.get(year) ?? 0;
      const next = current + 1;
      countersByYear.set(year, next);
      const padded = String(next).padStart(3, '0');
      const displayId = `${year}-${padded}`;

      await db.prepare(`UPDATE orders SET display_order_id = ? WHERE id = ?`).bind(displayId, row.id).run();
    }

    for (const [year, counter] of countersByYear.entries()) {
      const existing = await db
        .prepare(`SELECT counter FROM order_counters WHERE year = ?`)
        .bind(year)
        .first<{ counter: number }>();
      if (existing) {
        await db.prepare(`UPDATE order_counters SET counter = ? WHERE year = ?`).bind(counter, year).run();
      } else {
        await db.prepare(`INSERT INTO order_counters (year, counter) VALUES (?, ?)`).bind(year, counter).run();
      }
    }

    await db.prepare('COMMIT;').run();
  } catch (error) {
    console.error('Failed to backfill display order ids', error);
    await db.prepare('ROLLBACK;').run();
    throw error;
  }
}
