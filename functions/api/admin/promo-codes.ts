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

type PromoCodeRow = {
  id: string;
  code: string | null;
  percent_off: number | null;
  free_shipping: number | null;
  scope: 'global' | 'categories' | null;
  category_slugs_json: string | null;
  starts_at: string | null;
  ends_at: string | null;
  enabled: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type PromoCodeInput = {
  code: string;
  percentOff?: number | null;
  freeShipping?: boolean;
  scope: 'global' | 'categories';
  categorySlugs: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  enabled?: boolean;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const normalizeCode = (value: string) => value.trim().toLowerCase();

const isValidDateString = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
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

const normalizeCategorySlugs = (slugs: string[]) =>
  slugs.map((slug) => slug.trim().toLowerCase()).filter(Boolean);

const validatePromoCodeInput = (input: PromoCodeInput): string | null => {
  const code = (input.code || '').trim();
  if (!code) return 'code is required';
  const percent = input.percentOff ?? null;
  const hasPercent = percent !== null && percent !== undefined && percent !== 0;
  if (hasPercent) {
    const percentValue = Number(percent);
    if (!Number.isInteger(percentValue) || percentValue < 1 || percentValue > 90) {
      return 'percentOff must be an integer between 1 and 90';
    }
  }
  const freeShipping = !!input.freeShipping;
  if (!hasPercent && !freeShipping) {
    return 'percentOff or freeShipping is required';
  }
  if (input.scope !== 'global' && input.scope !== 'categories') {
    return 'scope must be global or categories';
  }
  if (input.scope === 'categories') {
    if (!Array.isArray(input.categorySlugs) || input.categorySlugs.length === 0) {
      return 'categorySlugs is required for category promo codes';
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

const mapRowToPromoCode = (row: PromoCodeRow) => ({
  id: row.id,
  code: row.code || '',
  percentOff: row.percent_off ?? null,
  freeShipping: row.free_shipping === 1,
  scope: row.scope === 'categories' ? 'categories' : 'global',
  categorySlugs: parseCategorySlugs(row.category_slugs_json),
  startsAt: row.starts_at || null,
  endsAt: row.ends_at || null,
  enabled: row.enabled === 1,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
});

const toDbValue = (value: string | null | undefined) => (value ? value : null);

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
    console.error('Admin promo codes error', error);
    return json(
      { error: 'Internal server error', detail: String((error as any)?.message || error) },
      500
    );
  }
}

async function handleGet(db: D1Database): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT id, code, percent_off, free_shipping, scope, category_slugs_json,
              starts_at, ends_at, enabled, created_at, updated_at
       FROM promo_codes
       ORDER BY updated_at DESC;`
    )
    .all<PromoCodeRow>();
  const promoCodes = (results || []).map(mapRowToPromoCode);
  return json({ promoCodes });
}

async function handlePost(db: D1Database, request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as PromoCodeInput | null;
  if (!body) return json({ error: 'Invalid JSON' }, 400);

  const error = validatePromoCodeInput(body);
  if (error) return json({ error }, 400);

  const id = crypto.randomUUID();
  const normalizedCode = normalizeCode(body.code);
  const categorySlugs = normalizeCategorySlugs(body.categorySlugs || []);
  const enabled = !!body.enabled;
  const freeShipping = !!body.freeShipping;
  const percentOff = body.percentOff !== null && body.percentOff !== undefined
    ? Math.round(Number(body.percentOff))
    : null;

  try {
    const result = await db
      .prepare(
        `INSERT INTO promo_codes (
          id, code, percent_off, free_shipping, scope, category_slugs_json,
          starts_at, ends_at, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${timestampSql}, ${timestampSql});`
      )
      .bind(
        id,
        normalizedCode,
        percentOff,
        freeShipping ? 1 : 0,
        body.scope,
        JSON.stringify(categorySlugs),
        toDbValue(body.startsAt ?? null),
        toDbValue(body.endsAt ?? null),
        enabled ? 1 : 0
      )
      .run();

    if (!result.success) {
      const message = result.error || 'Failed to create promo code';
      if (/unique/i.test(message)) {
        return json({ error: 'Promo code already exists' }, 409);
      }
      return json({ error: 'Failed to create promo code' }, 500);
    }
  } catch (error) {
    const message = String((error as any)?.message || error);
    if (/unique/i.test(message)) {
      return json({ error: 'Promo code already exists' }, 409);
    }
    console.error('Failed to create promo code', error);
    return json(
      { error: 'Failed to create promo code', detail: message },
      500
    );
  }

  const created = await db
    .prepare(
      `SELECT id, code, percent_off, free_shipping, scope, category_slugs_json,
              starts_at, ends_at, enabled, created_at, updated_at
       FROM promo_codes WHERE id = ?;`
    )
    .bind(id)
    .first<PromoCodeRow>();
  return json({ promoCode: created ? mapRowToPromoCode(created) : null }, 201);
}

async function handlePut(db: D1Database, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id is required' }, 400);

  const body = (await request.json().catch(() => null)) as PromoCodeInput | null;
  if (!body) return json({ error: 'Invalid JSON' }, 400);

  const error = validatePromoCodeInput(body);
  if (error) return json({ error }, 400);

  const normalizedCode = normalizeCode(body.code);
  const categorySlugs = normalizeCategorySlugs(body.categorySlugs || []);
  const enabled = !!body.enabled;
  const freeShipping = !!body.freeShipping;
  const percentOff = body.percentOff !== null && body.percentOff !== undefined
    ? Math.round(Number(body.percentOff))
    : null;

  try {
    const result = await db
      .prepare(
        `UPDATE promo_codes
         SET code = ?, percent_off = ?, free_shipping = ?, scope = ?, category_slugs_json = ?,
             starts_at = ?, ends_at = ?, enabled = ?, updated_at = ${timestampSql}
         WHERE id = ?;`
      )
      .bind(
        normalizedCode,
        percentOff,
        freeShipping ? 1 : 0,
        body.scope,
        JSON.stringify(categorySlugs),
        toDbValue(body.startsAt ?? null),
        toDbValue(body.endsAt ?? null),
        enabled ? 1 : 0,
        id
      )
      .run();

    if (!result.success) {
      const message = result.error || 'Failed to update promo code';
      if (/unique/i.test(message)) {
        return json({ error: 'Promo code already exists' }, 409);
      }
      return json({ error: 'Failed to update promo code' }, 500);
    }
    if (result.meta?.changes === 0) {
      return json({ error: 'Promo code not found' }, 404);
    }
  } catch (error) {
    const message = String((error as any)?.message || error);
    if (/unique/i.test(message)) {
      return json({ error: 'Promo code already exists' }, 409);
    }
    console.error('Failed to update promo code', error);
    return json(
      { error: 'Failed to update promo code', detail: message },
      500
    );
  }

  const updated = await db
    .prepare(
      `SELECT id, code, percent_off, free_shipping, scope, category_slugs_json,
              starts_at, ends_at, enabled, created_at, updated_at
       FROM promo_codes WHERE id = ?;`
    )
    .bind(id)
    .first<PromoCodeRow>();
  return json({ promoCode: updated ? mapRowToPromoCode(updated) : null });
}

async function handleDelete(db: D1Database, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id is required' }, 400);

  const result = await db.prepare(`DELETE FROM promo_codes WHERE id = ?;`).bind(id).run();
  if (!result.success) return json({ error: 'Failed to delete promo code' }, 500);
  if (result.meta?.changes === 0) return json({ error: 'Promo code not found' }, 404);
  return json({ success: true });
}
