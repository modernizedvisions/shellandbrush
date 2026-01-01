type D1PreparedStatement = {
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results: T[] }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  DB?: D1Database;
};

type HeroImageConfig = {
  id?: string;
  imageId?: string | null;
  imageUrl?: string;
  alt?: string;
};

type SiteConfig = {
  heroImages?: HeroImageConfig[];
  customOrdersImages?: HeroImageConfig[];
  heroRotationEnabled?: boolean;
  heroTitle?: string;
  heroSubtitle?: string;
  heroImageId?: string | null;
};

const DEFAULT_CONFIG: SiteConfig = {
  heroImages: [],
  customOrdersImages: [],
  heroRotationEnabled: false,
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const fetchImageUrlMap = async (db: D1Database, ids: string[]): Promise<Map<string, string>> => {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map();
  const placeholders = unique.map(() => '?').join(', ');
  const { results } = await db
    .prepare(`SELECT id, public_url FROM images WHERE id IN (${placeholders});`)
    .bind(...unique)
    .all<{ id: string; public_url: string }>();
  return new Map((results || []).map((row) => [row.id, row.public_url]));
};

export async function onRequestGet(context: { env: Env }): Promise<Response> {
  const db = context.env.DB;
  if (!db) return json({ error: 'missing_d1_binding' }, 500);

  const row = await db
    .prepare(`SELECT config_json, updated_at FROM site_config WHERE id = ?;`)
    .bind('home')
    .first<{ config_json: string | null; updated_at: string | null }>();

  let config: SiteConfig = { ...DEFAULT_CONFIG };
  if (row?.config_json) {
    try {
      const parsed = JSON.parse(row.config_json);
      config = { ...DEFAULT_CONFIG, ...(parsed || {}) };
    } catch {
      config = { ...DEFAULT_CONFIG };
    }
  }

  const heroImages = Array.isArray(config.heroImages) ? config.heroImages : [];
  const customOrdersImages = Array.isArray(config.customOrdersImages) ? config.customOrdersImages : [];
  const imageIds = [
    ...heroImages.map((img) => img.imageId || ''),
    ...customOrdersImages.map((img) => img.imageId || ''),
    config.heroImageId || '',
  ].filter(Boolean);
  const imageUrlMap = await fetchImageUrlMap(db, imageIds);

  const hydrate = (images: HeroImageConfig[]) =>
    images.map((img) => ({
      ...img,
      imageUrl: img.imageUrl || (img.imageId ? imageUrlMap.get(img.imageId) || '' : ''),
    }));

  const heroImageUrl = config.heroImageId ? imageUrlMap.get(config.heroImageId) || '' : '';

  return json({
    config: {
      ...config,
      heroImages: hydrate(heroImages),
      customOrdersImages: hydrate(customOrdersImages),
      heroImageUrl,
      updatedAt: row?.updated_at || null,
    },
  });
}
