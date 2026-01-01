import { getPublicImagesBaseUrl } from '../../_lib/imageBaseUrl';

type Env = {
  PUBLIC_IMAGES_BASE_URL?: string;
  IMAGES_BUCKET?: R2Bucket;
  MV_IMAGES?: R2Bucket;
  DB?: unknown;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const base = getPublicImagesBaseUrl(context.request, context.env);
  return json({
    ok: true,
    publicImagesBaseUrl: base,
    example: `${base}/shellandbrush/products/2026/01/example.png`,
    hasBucket: !!context.env.IMAGES_BUCKET || !!context.env.MV_IMAGES,
    hasDb: !!context.env.DB,
  });
}
