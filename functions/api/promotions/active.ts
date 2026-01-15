type D1PreparedStatement = {
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
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
    },
  });

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

const isValidDate = (value?: string | null) => {
  if (!value) return true;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

const isActivePromotion = (row: PromotionRow, now: number): boolean => {
  if (row.enabled !== 1) return false;
  if (!isValidDate(row.starts_at) || !isValidDate(row.ends_at)) return false;
  const startsAt = row.starts_at ? Date.parse(row.starts_at) : null;
  const endsAt = row.ends_at ? Date.parse(row.ends_at) : null;
  if (startsAt !== null && Number.isFinite(startsAt) && now < startsAt) return false;
  if (endsAt !== null && Number.isFinite(endsAt) && now > endsAt) return false;
  return true;
};

export const onRequestGet = async (context: { env: { DB: D1Database } }): Promise<Response> => {
  try {
    const row = await context.env.DB.prepare(
      `SELECT id, name, percent_off, scope, category_slugs_json, banner_enabled, banner_text, starts_at, ends_at, enabled
       FROM promotions WHERE enabled = 1 ORDER BY updated_at DESC LIMIT 1;`
    ).first<PromotionRow>();

    if (!row) return json({ promotion: null });

    const now = Date.now();
    if (!isActivePromotion(row, now)) {
      return json({ promotion: null });
    }

    return json({
      promotion: {
        id: row.id,
        name: row.name || '',
        percentOff: row.percent_off ?? 0,
        scope: row.scope === 'categories' ? 'categories' : 'global',
        categorySlugs: parseCategorySlugs(row.category_slugs_json),
        bannerEnabled: row.banner_enabled === 1,
        bannerText: row.banner_text || '',
        startsAt: row.starts_at || null,
        endsAt: row.ends_at || null,
      },
    });
  } catch (error) {
    console.error('Failed to fetch active promotion', error);
    return json({ promotion: null }, 200);
  }
};
