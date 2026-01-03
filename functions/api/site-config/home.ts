import { normalizePublicImageUrl, resolvePublicImageUrl } from '../_lib/imageUrls';
import { getPublicImagesBaseUrl } from '../_lib/imageBaseUrl';

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
  PUBLIC_IMAGES_BASE_URL?: string;
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
  heroImageUrl?: string;
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

const createSiteConfigTable = `
  CREATE TABLE IF NOT EXISTS site_config (
    id TEXT PRIMARY KEY,
    config_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
`;
const fetchImageUrlMap = async (
  db: D1Database,
  ids: string[],
  baseUrl: string
): Promise<Map<string, string>> => {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map();
  const placeholders = unique.map(() => '?').join(', ');
  const { results } = await db
    .prepare(`SELECT id, public_url, storage_key FROM images WHERE id IN (${placeholders});`)
    .bind(...unique)
    .all<{ id: string; public_url: string | null; storage_key: string | null }>();
  return new Map(
    (results || []).map((row) => [
      row.id,
      resolvePublicImageUrl(row.public_url, row.storage_key, baseUrl),
    ])
  );
};

export async function onRequestGet(context: { env: Env; request: Request }): Promise<Response> {
  const db = context.env.DB;
  if (!db) {
    return json({ ok: true, config: { ...DEFAULT_CONFIG } }, 200);
  }

  const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);
  const resolveFromMaybeKey = (value: string, baseUrl: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (isHttpUrl(trimmed)) return trimmed;
    if (baseUrl && (trimmed.startsWith('shellandbrush/') || trimmed.startsWith('shell-and-brush/'))) {
      return `${baseUrl}/${trimmed}`;
    }
    return trimmed;
  };

  let row: { config_json: string | null; updated_at: string | null } | null = null;
  try {
    await db.prepare(createSiteConfigTable).run();
    row = await db
      .prepare(`SELECT config_json, updated_at FROM site_config WHERE id = ?;`)
      .bind('home')
      .first<{ config_json: string | null; updated_at: string | null }>();
  } catch (err) {
    return json({ ok: true, config: { ...DEFAULT_CONFIG } }, 200);
  }

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
  const baseUrl = getPublicImagesBaseUrl(context.env, context.request);
  const imageUrlMap = await fetchImageUrlMap(db, imageIds, baseUrl);
  const normalize = (value: string | null | undefined) =>
    normalizePublicImageUrl(value, context.env, context.request);

  const hydrate = (images: HeroImageConfig[]) =>
    images.map((img) => {
      const fromConfig = resolveFromMaybeKey(img.imageUrl || '', baseUrl);
      const fromId = img.imageId ? imageUrlMap.get(img.imageId) || '' : '';
      const resolved = isHttpUrl(fromConfig) ? fromConfig : isHttpUrl(fromId) ? fromId : fromId || fromConfig || '';
      return {
        ...img,
        imageUrl: normalize(resolved),
      };
    });

  const heroFromConfig = resolveFromMaybeKey(config.heroImageUrl || '', baseUrl);
  const heroFromId = config.heroImageId ? imageUrlMap.get(config.heroImageId) || '' : '';
  const hydratedHeroImages = hydrate(heroImages);
  const heroFromList = hydratedHeroImages[0]?.imageUrl?.trim() || '';
  const heroUrl = normalize(heroFromConfig || heroFromId || heroFromList || '');
  const heroUrlSource = heroFromConfig
    ? 'config.heroImageUrl'
    : heroFromId
    ? 'config.heroImageId'
    : heroFromList
    ? 'config.heroImages[0].imageUrl'
    : 'none';

  const response: Record<string, unknown> = {
    ok: true,
    config: {
      ...config,
      heroImages: hydratedHeroImages,
      customOrdersImages: hydrate(customOrdersImages),
      heroImageUrl: heroUrl,
      updatedAt: row?.updated_at || null,
    },
  };

  if (context.env?.DEBUG_IMAGE_URLS === '1') {
    response.debug = {
      ...(response.debug as Record<string, unknown> | undefined),
      normalized: true,
      base: baseUrl,
    };
  }

  const host = context.request.headers.get('host') || '';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    response.debug = {
      heroUrlSource,
      resolvedHeroUrl: heroUrl,
    };
  }

  return json(response);
}



