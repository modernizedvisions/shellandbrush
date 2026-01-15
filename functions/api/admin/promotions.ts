import { requireAdmin } from '../_lib/adminAuth';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
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
  created_at: string | null;
  updated_at: string | null;
};

type PromotionInput = {
  name: string;
  percentOff: number;
  scope: 'global' | 'categories';
  categorySlugs: string[];
  bannerEnabled: boolean;
  bannerText: string;
  startsAt: string | null;
  endsAt: string | null;
  enabled: boolean;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const isValidDateString = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

const normalizeSlug = (value: string) => value.trim().toLowerCase();

const validatePromotionInput = (input: PromotionInput): string | null => {
  const name = (input.name || '').trim();
  if (!name) return 'name is required';
  const percent = Number(input.percentOff);
  if (!Number.isInteger(percent) || percent < 1 || percent > 90) {
    return 'percentOff must be an integer between 1 and 90';
  }
  if (input.scope !== 'global' && input.scope !== 'categories') {
    return 'scope must be global or categories';
  }
  if (input.scope === 'categories') {
    if (!Array.isArray(input.categorySlugs) || input.categorySlugs.length === 0) {
      return 'categorySlugs is required for category promotions';
    }
    const invalid = input.categorySlugs.some((slug) => !slug || !slug.trim());
    if (invalid) return 'categorySlugs must be non-empty strings';
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
  return null;
};

const parseCategorySlugs = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  } catch {
    return [];
  }
};

const mapRowToPromotion = (row: PromotionRow) => ({
  id: row.id,
  name: row.name || '',
  percentOff: row.percent_off ?? 0,
  scope: row.scope === 'categories' ? 'categories' : 'global',
  categorySlugs: parseCategorySlugs(row.category_slugs_json),
  bannerEnabled: row.banner_enabled === 1,
  bannerText: row.banner_text || '',
  startsAt: row.starts_at || null,
  endsAt: row.ends_at || null,
  enabled: row.enabled === 1,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
});

const toDbValue = (value: string | null | undefined) => (value ? value : null);

const normalizeCategorySlugs = (slugs: string[]) =>
  slugs.map((slug) => normalizeSlug(slug)).filter(Boolean);

const timestampSql = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

export async function onRequest(context: {
  env: { DB: D1Database; ADMIN_PASSWORD?: string };
  request: Request;
}): Promise<Response> {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;
  const method = context.request.method.toUpperCase();

  try {
    if (method === 'GET') return handleGet(context.env.DB);
    if (method === 'POST') return handlePost(context.env.DB, context.request);
    if (method === 'PUT') return handlePut(context.env.DB, context.request);
    if (method === 'DELETE') return handleDelete(context.env.DB, context.request);
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Admin promotions error', error);
    return json({ error: 'Internal server error' }, 500);
  }
}

async function handleGet(db: D1Database): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT id, name, percent_off, scope, category_slugs_json, banner_enabled, banner_text,
              starts_at, ends_at, enabled, created_at, updated_at
       FROM promotions
       ORDER BY updated_at DESC;`
    )
    .all<PromotionRow>();
  const promotions = (results || []).map(mapRowToPromotion);
  return json({ promotions });
}

async function handlePost(db: D1Database, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as PromotionInput | null;
  if (!body) return json({ error: 'Invalid JSON' }, 400);

  const error = validatePromotionInput(body);
  if (error) return json({ error }, 400);

  const id = crypto.randomUUID();
  const categorySlugs = normalizeCategorySlugs(body.categorySlugs || []);
  const enabled = !!body.enabled;
  const bannerEnabled = !!body.bannerEnabled;

  try {
    await db.prepare('BEGIN;').run();
    if (enabled) {
      await db
        .prepare(`UPDATE promotions SET enabled = 0, updated_at = ${timestampSql} WHERE enabled = 1 AND id != ?;`)
        .bind(id)
        .run();
    }
    const result = await db
      .prepare(
        `INSERT INTO promotions (
          id, name, percent_off, scope, category_slugs_json,
          banner_enabled, banner_text, starts_at, ends_at, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${timestampSql}, ${timestampSql});`
      )
      .bind(
        id,
        body.name.trim(),
        Math.round(Number(body.percentOff)),
        body.scope,
        JSON.stringify(categorySlugs),
        bannerEnabled ? 1 : 0,
        body.bannerText || '',
        toDbValue(body.startsAt),
        toDbValue(body.endsAt),
        enabled ? 1 : 0
      )
      .run();

    if (!result.success) {
      await db.prepare('ROLLBACK;').run();
      return json({ error: 'Failed to create promotion' }, 500);
    }

    await db.prepare('COMMIT;').run();
  } catch (error) {
    await db.prepare('ROLLBACK;').run();
    console.error('Failed to create promotion', error);
    return json({ error: 'Failed to create promotion' }, 500);
  }

  const created = await db
    .prepare(
      `SELECT id, name, percent_off, scope, category_slugs_json, banner_enabled, banner_text,
              starts_at, ends_at, enabled, created_at, updated_at
       FROM promotions WHERE id = ?;`
    )
    .bind(id)
    .first<PromotionRow>();
  return json({ promotion: created ? mapRowToPromotion(created) : null }, 201);
}

async function handlePut(db: D1Database, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id is required' }, 400);

  const body = (await request.json().catch(() => null)) as PromotionInput | null;
  if (!body) return json({ error: 'Invalid JSON' }, 400);

  const error = validatePromotionInput(body);
  if (error) return json({ error }, 400);

  const categorySlugs = normalizeCategorySlugs(body.categorySlugs || []);
  const enabled = !!body.enabled;
  const bannerEnabled = !!body.bannerEnabled;

  try {
    await db.prepare('BEGIN;').run();
    if (enabled) {
      await db
        .prepare(`UPDATE promotions SET enabled = 0, updated_at = ${timestampSql} WHERE enabled = 1 AND id != ?;`)
        .bind(id)
        .run();
    }

    const result = await db
      .prepare(
        `UPDATE promotions
         SET name = ?, percent_off = ?, scope = ?, category_slugs_json = ?,
             banner_enabled = ?, banner_text = ?, starts_at = ?, ends_at = ?, enabled = ?, updated_at = ${timestampSql}
         WHERE id = ?;`
      )
      .bind(
        body.name.trim(),
        Math.round(Number(body.percentOff)),
        body.scope,
        JSON.stringify(categorySlugs),
        bannerEnabled ? 1 : 0,
        body.bannerText || '',
        toDbValue(body.startsAt),
        toDbValue(body.endsAt),
        enabled ? 1 : 0,
        id
      )
      .run();

    if (!result.success) {
      await db.prepare('ROLLBACK;').run();
      return json({ error: 'Failed to update promotion' }, 500);
    }
    if (result.meta?.changes === 0) {
      await db.prepare('ROLLBACK;').run();
      return json({ error: 'Promotion not found' }, 404);
    }
    await db.prepare('COMMIT;').run();
  } catch (error) {
    await db.prepare('ROLLBACK;').run();
    console.error('Failed to update promotion', error);
    return json({ error: 'Failed to update promotion' }, 500);
  }

  const updated = await db
    .prepare(
      `SELECT id, name, percent_off, scope, category_slugs_json, banner_enabled, banner_text,
              starts_at, ends_at, enabled, created_at, updated_at
       FROM promotions WHERE id = ?;`
    )
    .bind(id)
    .first<PromotionRow>();
  return json({ promotion: updated ? mapRowToPromotion(updated) : null });
}

async function handleDelete(db: D1Database, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id is required' }, 400);

  const result = await db.prepare(`DELETE FROM promotions WHERE id = ?;`).bind(id).run();
  if (!result.success) return json({ error: 'Failed to delete promotion' }, 500);
  if (result.meta?.changes === 0) return json({ error: 'Promotion not found' }, 404);
  return json({ success: true });
}
