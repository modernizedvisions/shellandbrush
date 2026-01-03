import { resolvePublicImageUrl } from '../_lib/imageUrls';
import { getPublicImagesBaseUrl } from '../_lib/imageBaseUrl';

export async function onRequestGet(context: { request: Request; env: { PUBLIC_IMAGES_BASE_URL?: string } }) {
  const base = getPublicImagesBaseUrl(context.env, context.request);
  const resolved = resolvePublicImageUrl('', 'shellandbrush/products/2026/01/example.png', base);
  return new Response(JSON.stringify({ ok: true, base, resolved }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

