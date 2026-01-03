import { getPublicImagesBaseUrl as sharedGetPublicImagesBaseUrl } from '../../_lib/imageBaseUrl';

export function getPublicImagesBaseUrl(
  env: { PUBLIC_IMAGES_BASE_URL?: string; PUBLIC_SITE_URL?: string; VITE_PUBLIC_SITE_URL?: string },
  request?: Request
): string {
  return sharedGetPublicImagesBaseUrl(env, request);
}
