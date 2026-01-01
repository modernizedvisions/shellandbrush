import { requireAdmin } from '../../_lib/adminAuth';
import { isBlockedImageUrl } from '../../_lib/imageUrls';

type D1PreparedStatement = {
  run(): Promise<{ success: boolean; error?: string }>;
  first<T>(): Promise<T | null>;
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results: T[] }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  DB?: D1Database;
  ADMIN_PASSWORD?: string;
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

const hasBlockedUrls = (urls: Array<string | null | undefined>) => urls.some((url) => isBlockedImageUrl(url));

export async function onRequestPut(context: { request: Request; env: Env }): Promise<Response> {
  const auth = requireAdmin(context.request, context.env);
  if (auth) return auth;

  const db = context.env.DB;
  if (!db) return json({ error: 'missing_d1_binding' }, 500);

  let body: any = null;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'invalid_json_payload' }, 400);
  }

  const incoming: SiteConfig = (body?.config || body) ?? {};
  const heroImages = Array.isArray(incoming.heroImages) ? incoming.heroImages : [];
  const customOrdersImages = Array.isArray(incoming.customOrdersImages) ? incoming.customOrdersImages : [];

  if (
    hasBlockedUrls([
      ...heroImages.map((img) => img?.imageUrl),
      ...customOrdersImages.map((img) => img?.imageUrl),
    ])
  ) {
    return json({ error: 'Images must be uploaded first; only URLs allowed.' }, 413);
  }

  const imageIds = [
    ...heroImages.map((img) => img?.imageId || ''),
    ...customOrdersImages.map((img) => img?.imageId || ''),
    incoming.heroImageId || '',
  ].filter(Boolean);
  const imageUrlMap = await fetchImageUrlMap(db, imageIds);

  const sanitized: SiteConfig = {
    heroImages: heroImages
      .filter((img) => (typeof img?.imageId === 'string' && img.imageId) || !!img?.imageUrl)
      .slice(0, 3)
      .map((img) => ({
        id: img.id,
        imageId: img.imageId,
        imageUrl: img.imageUrl || (img.imageId ? imageUrlMap.get(img.imageId) || '' : ''),
        alt: img.alt,
      })),
    customOrdersImages: customOrdersImages
      .filter((img) => (typeof img?.imageId === 'string' && img.imageId) || !!img?.imageUrl)
      .slice(0, 4)
      .map((img) => ({
        id: img.id,
        imageId: img.imageId,
        imageUrl: img.imageUrl || (img.imageId ? imageUrlMap.get(img.imageId) || '' : ''),
        alt: img.alt,
      })),
    heroRotationEnabled: !!incoming.heroRotationEnabled,
    heroTitle: typeof incoming.heroTitle === 'string' ? incoming.heroTitle : undefined,
    heroSubtitle: typeof incoming.heroSubtitle === 'string' ? incoming.heroSubtitle : undefined,
    heroImageId: typeof incoming.heroImageId === 'string' ? incoming.heroImageId : undefined,
  };

  const configJson = JSON.stringify(sanitized);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT INTO site_config (id, config_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at;`
    )
    .bind('home', configJson, now)
    .run();

  if (!result.success) return json({ error: 'failed_to_save' }, 500);

  const hydrate = (images: HeroImageConfig[]) =>
    images.map((img) => ({
      ...img,
      imageUrl: img.imageUrl || (img.imageId ? imageUrlMap.get(img.imageId) || '' : ''),
    }));

  return json({
    config: {
      ...sanitized,
      heroImages: hydrate(sanitized.heroImages || []),
      customOrdersImages: hydrate(sanitized.customOrdersImages || []),
      heroImageUrl: sanitized.heroImageId ? imageUrlMap.get(sanitized.heroImageId) || '' : '',
      updatedAt: now,
    },
  });
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  if (context.request.method.toUpperCase() === 'PUT') return onRequestPut(context);
  return json({ error: 'Method not allowed' }, 405);
}
