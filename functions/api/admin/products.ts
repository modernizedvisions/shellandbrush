import Stripe from 'stripe';
import type { Product } from '../../../src/lib/types';

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

type NewProductInput = {
  name: string;
  description: string;
  priceCents: number;
  category: string;
  imageUrl: string;
  imageUrls?: string[];
  quantityAvailable?: number;
  isOneOff?: boolean;
  isActive?: boolean;
  stripePriceId?: string;
  stripeProductId?: string;
  collection?: string;
};

const mapRowToProduct = (row: ProductRow): Product => {
  const imageUrls = row.image_urls_json ? safeParseJsonArray(row.image_urls_json) : [];
  const primaryImage = row.image_url || imageUrls[0] || '';

  return {
    id: row.id,
    stripeProductId: row.stripe_product_id || row.id,
    stripePriceId: row.stripe_price_id || undefined,
    name: row.name ?? '',
    description: row.description ?? '',
    imageUrls: primaryImage ? [primaryImage, ...imageUrls.filter((url) => url !== primaryImage)] : imageUrls,
    imageUrl: primaryImage,
    thumbnailUrl: primaryImage || undefined,
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
  if (!input.imageUrl) {
    return 'imageUrl is required';
  }
  return null;
};

const REQUIRED_PRODUCT_COLUMNS: Record<string, string> = {
  image_urls_json: 'image_urls_json TEXT',
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

export async function onRequestGet(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  try {
    await ensureProductSchema(context.env.DB);

    const statement = context.env.DB.prepare(`
      SELECT id, name, slug, description, price_cents, category, image_url, image_urls_json,
             is_active, is_one_off, is_sold, quantity_available, stripe_price_id, stripe_product_id,
             collection, created_at
      FROM products
      ORDER BY created_at DESC;
    `);

    const { results } = await statement.all<ProductRow>();
    const products: Product[] = (results || []).map(mapRowToProduct);

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

export async function onRequestPost(context: { env: { DB: D1Database; STRIPE_SECRET_KEY?: string }; request: Request }): Promise<Response> {
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
      return new Response(JSON.stringify({ error: 'Invalid JSON', detail }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls : [];
    console.log('[products save] payload summary', {
      keys: Object.keys(body),
      imageCount: imageUrls.length + (body.imageUrl ? 1 : 0),
      imageUrlPrefix: body.imageUrl ? body.imageUrl.slice(0, 30) : null,
      imageUrlsPreview: imageUrls.slice(0, 3).map((url) => (typeof url === 'string' ? url.slice(0, 30) : '')),
    });

    const error = validateNewProduct(body);
    if (error) {
      return new Response(JSON.stringify({ error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const id = crypto.randomUUID();
    const slug = toSlug(body.name!);
    const isOneOff = body.isOneOff ?? true;
    const quantityAvailable = isOneOff ? 1 : Math.max(1, body.quantityAvailable ?? 1);
    const isActive = body.isActive ?? true;
    const category = sanitizeCategory(body.category);

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

    const statement = context.env.DB.prepare(
      `
      INSERT INTO products (
        id, name, slug, description, price_cents, category, image_url, image_urls_json,
        is_active, is_one_off, is_sold, quantity_available, stripe_price_id, stripe_product_id, collection
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `
    ).bind(
      id,
      body.name,
      slug,
      body.description,
      body.priceCents,
      category,
      body.imageUrl,
      body.imageUrls && body.imageUrls.length ? JSON.stringify(body.imageUrls) : null,
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
      const product = inserted ? mapRowToProduct(inserted) : null;
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
      const product = inserted ? mapRowToProduct(inserted) : null;
      return new Response(JSON.stringify({ product, error: 'Failed to create Stripe product and price.' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const product = inserted ? mapRowToProduct(inserted) : null;

    return new Response(JSON.stringify({ product }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Error in POST /api/admin/products', { detail });
    return new Response(JSON.stringify({ error: 'Internal server error', detail }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function onRequestDelete(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
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

export async function onRequest(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  const method = context.request.method.toUpperCase();
  if (method === 'GET') return onRequestGet(context);
  if (method === 'POST') return onRequestPost(context);
  if (method === 'DELETE') return onRequestDelete(context);
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
