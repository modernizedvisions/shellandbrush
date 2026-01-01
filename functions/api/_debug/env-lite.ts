type Env = {
  IMAGES_BUCKET?: R2Bucket;
  MV_IMAGES?: R2Bucket;
  PUBLIC_IMAGES_BASE_URL?: string;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestGet(context: { env: Env }): Promise<Response> {
  const base = (context.env.PUBLIC_IMAGES_BASE_URL ?? '').trim();
  const baseStartsWithHttps = /^https:\/\//i.test(base);
  const baseContainsImagesPath = base.includes('/images');
  return json({
    ok: true,
    hasImagesBucket: !!context.env.IMAGES_BUCKET || !!context.env.MV_IMAGES,
    hasPublicImagesBaseUrl: !!base,
    baseStartsWithHttps,
    baseContainsImagesPath,
    baseLength: base.length,
  });
}
