import { defaultShopCategoryTiles } from '../../../src/lib/db/mockData';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type CategoryRow = {
  id: string;
  name: string | null;
  slug: string | null;
  image_url?: string | null;
  hero_image_url?: string | null;
  show_on_homepage?: number | null;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string;
  heroImageUrl?: string;
  showOnHomePage: boolean;
};

const BASE_CATEGORY_ORDER = [
  { name: 'Ring Dishes', slug: 'ring-dish' },
  { name: 'Ornaments', slug: 'ornament' },
  { name: 'Decor', slug: 'decor' },
  { name: 'Wine Stoppers', slug: 'wine-stopper' },
];

const OTHER_ITEMS_CATEGORY = {
  id: 'other-items',
  name: 'Other Items',
  slug: 'other-items',
};

const createCategoriesTable = `
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    image_url TEXT,
    hero_image_url TEXT,
    show_on_homepage INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

const REQUIRED_CATEGORY_COLUMNS: Record<string, string> = {
  show_on_homepage: 'show_on_homepage INTEGER DEFAULT 0',
  slug: 'slug TEXT',
  hero_image_url: 'hero_image_url TEXT',
};

export async function onRequest(context: { env: { DB: D1Database }; request: Request }): Promise<Response> {
  const method = context.request.method.toUpperCase();

  try {
    await ensureCategorySchema(context.env.DB);
    await seedDefaultCategories(context.env.DB);
    await ensureOtherItemsCategory(context.env.DB);

    if (method === 'GET') {
      return handleGet(context.env.DB);
    }
    if (method === 'POST') {
      return handlePost(context.env.DB, context.request);
    }
    if (method === 'PUT') {
      return handlePut(context.env.DB, context.request);
    }
    if (method === 'DELETE') {
      return handleDelete(context.env.DB, context.request);
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Admin categories error', error);
    return json({ error: 'Internal server error' }, 500);
  }
}

async function handleGet(db: D1Database): Promise<Response> {
  const { results } = await db.prepare(`SELECT id, name, slug, image_url, hero_image_url, show_on_homepage FROM categories`).all<CategoryRow>();
  const categories = orderCategories(
    (results || []).map(mapRowToCategory).filter((c): c is Category => Boolean(c))
  );
  return json({ categories });
}

async function handlePost(db: D1Database, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Partial<Category> | null;
  const name = (body?.name || '').trim();
  if (!name) return json({ error: 'name is required' }, 400);

  const slug = toSlug(body?.slug || name);
  const id = crypto.randomUUID();
  const showOnHomePage = !!body?.showOnHomePage;
  const imageUrl = body?.imageUrl || null;
  const heroImageUrl = body?.heroImageUrl || null;

  const result = await db
    .prepare(`INSERT INTO categories (id, name, slug, image_url, hero_image_url, show_on_homepage) VALUES (?, ?, ?, ?, ?, ?);`)
    .bind(id, name, slug, imageUrl, heroImageUrl, showOnHomePage ? 1 : 0)
    .run();

  if (!result.success) return json({ error: 'Failed to create category' }, 500);

  const created = await db
    .prepare(`SELECT id, name, slug, image_url, hero_image_url, show_on_homepage FROM categories WHERE id = ?;`)
    .bind(id)
    .first<CategoryRow>();

  return json({ category: mapRowToCategory(created as CategoryRow) }, 201);
}

async function handlePut(db: D1Database, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id is required' }, 400);

  const body = (await request.json().catch(() => null)) as Partial<Category> | null;
  if (!body) return json({ error: 'Invalid JSON' }, 400);

  const sets: string[] = [];
  const values: unknown[] = [];

  const addSet = (clause: string, value: unknown) => {
    sets.push(clause);
    values.push(value);
  };

  if (body.name !== undefined) addSet('name = ?', (body.name || '').trim());
  if (body.slug !== undefined || body.name !== undefined) {
    const slugSource = body.slug || body.name;
    if (slugSource !== undefined) addSet('slug = ?', toSlug(slugSource));
  }
  if (body.imageUrl !== undefined) addSet('image_url = ?', body.imageUrl || null);
  if (body.heroImageUrl !== undefined) addSet('hero_image_url = ?', body.heroImageUrl || null);
  if (body.showOnHomePage !== undefined) addSet('show_on_homepage = ?', body.showOnHomePage ? 1 : 0);

  if (!sets.length) return json({ error: 'No fields to update' }, 400);

  const result = await db
    .prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?;`)
    .bind(...values, id)
    .run();

  if (!result.success) return json({ error: 'Failed to update category' }, 500);
  if (result.meta?.changes === 0) return json({ error: 'Category not found' }, 404);

  const updated = await db
    .prepare(`SELECT id, name, slug, image_url, hero_image_url, show_on_homepage FROM categories WHERE id = ?;`)
    .bind(id)
    .first<CategoryRow>();

  return json({ category: mapRowToCategory(updated as CategoryRow) });
}

async function handleDelete(db: D1Database, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id is required' }, 400);

  const existing = await db
    .prepare(`SELECT id, name, slug FROM categories WHERE id = ?;`)
    .bind(id)
    .first<{ id: string; name: string | null; slug: string | null }>();

  if (!existing) return json({ error: 'Category not found' }, 404);

  const normalized = toSlug(existing.slug || existing.name);
  if (normalized === OTHER_ITEMS_CATEGORY.slug) {
    return json({ error: 'Cannot delete Other Items category' }, 400);
  }

  await ensureOtherItemsCategory(db);

  const normalizedTarget = toSlug(existing.slug || existing.name);
  try {
    const { results } = await db
      .prepare(`SELECT id, category FROM products WHERE category IS NOT NULL;`)
      .all<{ id: string; category: string | null }>();

    const toUpdate =
      results?.filter((row) => row?.id && toSlug(row.category) === normalizedTarget).map((row) => row.id) || [];

    if (toUpdate.length) {
      const placeholders = toUpdate.map(() => '?').join(', ');
      await db
        .prepare(`UPDATE products SET category = ? WHERE id IN (${placeholders});`)
        .bind(OTHER_ITEMS_CATEGORY.slug, ...toUpdate)
        .run();
    }
  } catch (error) {
    console.error('Failed to reassign products to Other Items', error);
    return json({ error: 'Failed to reassign products to Other Items' }, 500);
  }

  const result = await db.prepare(`DELETE FROM categories WHERE id = ?;`).bind(id).run();
  if (!result.success) return json({ error: 'Failed to delete category' }, 500);
  if (result.meta?.changes === 0) return json({ error: 'Category not found' }, 404);

  return json({ success: true });
}

const mapRowToCategory = (row: CategoryRow): Category | null => {
  if (!row || !row.id || !row.name || !row.slug) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    imageUrl: row.image_url || undefined,
    heroImageUrl: row.hero_image_url || undefined,
    showOnHomePage: row.show_on_homepage === 1,
  };
};

const toSlug = (value: string | undefined | null) =>
  (value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const orderCategories = (items: Category[]): Category[] => {
  const normalize = (value: string) => toSlug(value);
  const used = new Set<string>();
  const ordered: Category[] = [];

  BASE_CATEGORY_ORDER.forEach((base) => {
    const match = items.find(
      (item) => normalize(item.slug) === normalize(base.slug) || normalize(item.name) === normalize(base.name)
    );
    if (match) {
      const key = normalize(match.slug);
      if (!used.has(key)) {
        ordered.push(match);
        used.add(key);
      }
    }
  });

  const remaining = items
    .filter((item) => !used.has(normalize(item.slug)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const combined = [...ordered, ...remaining];
  const otherItemsKey = normalize(OTHER_ITEMS_CATEGORY.slug);
  const isOtherItems = (item: Category) =>
    normalize(item.slug) === otherItemsKey || normalize(item.name) === otherItemsKey;
  const otherItems = combined.filter(isOtherItems);
  const withoutOtherItems = combined.filter((item) => !isOtherItems(item));
  return [...withoutOtherItems, ...otherItems];
};

async function seedDefaultCategories(db: D1Database) {
  const existing = await db.prepare('SELECT COUNT(*) as count FROM categories').first<{ count: number | string }>();
  const count = typeof existing?.count === 'number' ? existing.count : Number(existing?.count ?? 0);
  if (count > 0) return;

  for (const tile of defaultShopCategoryTiles) {
    const id = tile.id || tile.categorySlug || crypto.randomUUID();
    const name = tile.label;
    const slug = tile.categorySlug || toSlug(tile.label);
    const imageUrl = tile.imageUrl || null;
    const heroImageUrl = tile.imageUrl || null;
    await db
      .prepare(
        `INSERT OR IGNORE INTO categories (id, name, slug, image_url, hero_image_url, show_on_homepage) VALUES (?, ?, ?, ?, ?, ?);`
      )
      .bind(id, name, slug, imageUrl, heroImageUrl, 1)
      .run();
  }
}

async function ensureCategorySchema(db: D1Database) {
  await db.prepare(createCategoriesTable).run();

  for (const ddl of Object.values(REQUIRED_CATEGORY_COLUMNS)) {
    try {
      await db.prepare(`ALTER TABLE categories ADD COLUMN ${ddl};`).run();
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (!/duplicate column|already exists/i.test(message)) {
        console.error('Failed to add column to categories', error);
      }
    }
  }

  const { results } = await db
    .prepare(`SELECT id, name FROM categories WHERE slug IS NULL OR slug = ''`)
    .all<{ id: string; name: string | null }>();
  if (results && results.length) {
    for (const row of results) {
      if (!row?.id || !row?.name) continue;
      const slug = toSlug(row.name);
      await db.prepare(`UPDATE categories SET slug = ? WHERE id = ?;`).bind(slug, row.id).run();
    }
  }
  await db.prepare(`UPDATE categories SET show_on_homepage = 0 WHERE show_on_homepage IS NULL;`).run();
  await db
    .prepare(
      `UPDATE categories SET hero_image_url = image_url WHERE (hero_image_url IS NULL OR hero_image_url = '') AND image_url IS NOT NULL;`
    )
    .run();
  await ensureOtherItemsCategory(db);
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function ensureOtherItemsCategory(db: D1Database) {
  try {
    const existing = await db
      .prepare(`SELECT id, slug, name FROM categories WHERE LOWER(slug) IN (?, ?) OR LOWER(name) = ? LIMIT 1;`)
      .bind(OTHER_ITEMS_CATEGORY.slug, 'uncategorized', OTHER_ITEMS_CATEGORY.name.toLowerCase())
      .first<{ id: string | null; slug?: string | null; name?: string | null }>();

    if (existing?.id) {
      const normalizedSlug = toSlug(existing.slug || existing.name || '');
      if (normalizedSlug !== OTHER_ITEMS_CATEGORY.slug) {
        await db
          .prepare(`UPDATE categories SET slug = ?, name = ?, show_on_homepage = 1 WHERE id = ?;`)
          .bind(OTHER_ITEMS_CATEGORY.slug, OTHER_ITEMS_CATEGORY.name, existing.id)
          .run();
        await db
          .prepare(`UPDATE products SET category = ? WHERE LOWER(TRIM(category)) = ?;`)
          .bind(OTHER_ITEMS_CATEGORY.slug, 'uncategorized')
          .run();
      }
      return existing.id;
    }

    const id = OTHER_ITEMS_CATEGORY.id || crypto.randomUUID();
    const name = OTHER_ITEMS_CATEGORY.name;
    const slug = OTHER_ITEMS_CATEGORY.slug;
    await db
      .prepare(`INSERT INTO categories (id, name, slug, show_on_homepage) VALUES (?, ?, ?, 1);`)
      .bind(id, name, slug)
      .run();
    return id;
  } catch (error) {
    console.error('Failed to ensure Other Items category', error);
    return null;
  }
}
