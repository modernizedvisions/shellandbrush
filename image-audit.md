# Image Audit

## Image sources and URL shapes

### D1 image records
Images are stored in a D1 `images` table and referenced by ID and public URL.
Evidence: `db/migrations/006_images_pipeline.sql`.

```sql
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  storage_provider TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  ...
);
```

### Public URL normalization
Server-side normalization maps legacy and relative `/images/*` URLs to a public base:
Evidence: `functions/_lib/imageUrls.ts`.

```ts
if (trimmed.startsWith('/images/')) {
  return `${base}${trimmed.slice('/images'.length)}`;
}
```

Public base resolution:
Evidence: `functions/_lib/imageBaseUrl.ts`.

```ts
const site = getPublicSiteUrl(env, request);
if (site) return `${site}/images`;
```

### Image delivery and caching
Images are served from `/images/*` by a Pages Functions middleware with long-lived caching:
Evidence: `functions/images/_middleware.ts`.

```ts
headers.set('Cache-Control', 'public, max-age=31536000, immutable');
```

### Upload path and public URL shape
Admin uploads build a public URL under `PUBLIC_IMAGES_BASE_URL` (or fallback to host `/images`).
Evidence: `functions/api/admin/images/upload.ts`.

```ts
const rawBase = env.PUBLIC_IMAGES_BASE_URL ?? '';
let base = rawBase.trim().replace(/\/+$/, '');
if (!/^https:\/\//i.test(base)) {
  const host = request.headers.get('host') || new URL(request.url).host;
  base = `https://${host}/images`;
}
const publicUrl = `${base}/${storageKey}`;
```

Unknown:
- Whether production uses a dedicated CDN URL in `PUBLIC_IMAGES_BASE_URL`.
- Exact image byte sizes per surface (needs network trace).

## Major image surfaces

### Home hero
Component: `src/sections/home/HeroSection.tsx`
Snippet:
```tsx
<img
  src={heroImageUrl}
  alt="Artist holding artwork"
  className="absolute inset-0 h-full w-full object-cover z-0"
  onLoad={() => console.log('[hero] loaded', heroImageUrl)}
  onError={() => { ... }}
/>
```
- object-fit: cover
- aspect-ratio wrapper: `aspect-[4/5]`
- loading/decoding: none
- srcset/sizes: none

### Featured works grid (Home)
Component: `src/sections/home/FeaturedWorksSection.tsx` uses `ProductCard`.
`ProductCard` image:
```tsx
<img
  src={imageSrc}
  alt={product.name}
  className="absolute inset-0 w-full h-full object-cover"
  loading="lazy"
  decoding="async"
/>
```
- object-fit: cover
- aspect ratio: `aspect-square`
- loading: lazy, decoding async
- srcset/sizes: none

### Shop grid
Component: `src/components/ProductGrid.tsx` and `src/components/ProductCard.tsx`.
Same image behavior as featured works.

### Product detail gallery
Component: `src/pages/ProductDetailPage.tsx`.
Snippets:
```tsx
<img src={images[currentIndex]} alt={product?.name || 'Product'} className="w-full h-full object-cover" />
<img src={url} alt={`${product?.name}-thumb-${idx}`} className="w-full h-full object-cover" />
```
- object-fit: cover
- aspect ratio: wrapper uses `aspect-square` (main and thumbs)
- loading/decoding: none
- srcset/sizes: none

### Gallery page grid
Component: `src/pages/GalleryPage.tsx`.
Snippet:
```tsx
<img
  src={item.imageUrl}
  alt={item.title || 'Gallery item'}
  className="w-full h-full object-cover"
/>
```
- object-fit: cover
- aspect ratio: `aspect-square`
- loading/decoding: none

### Gallery lightbox
Component: `src/pages/GalleryPage.tsx`.
Snippet:
```tsx
<img
  src={selectedImage}
  alt="Gallery item"
  className="max-w-full max-h-full object-contain"
/>
```
- object-fit: contain
- loading/decoding: none

### Checkout order preview
Component: `src/pages/CheckoutPage.tsx`.
Snippet:
```tsx
<img
  src={item.imageUrl}
  alt={item.name || 'Item'}
  className="w-14 h-14 rounded-md object-cover"
  loading="lazy"
/>
```
- object-fit: cover
- loading: lazy

### Cart drawer
Component: `src/components/cart/CartDrawer.tsx`.
Snippet:
```tsx
<img
  src={item.imageUrl}
  alt={item.name}
  className="w-16 h-16 object-cover rounded-md"
/>
```
- object-fit: cover
- loading/decoding: none

## Current gaps observed
- Many non-hero images lack `loading="lazy"` and `decoding="async"` (Gallery, Product Detail, Cart, Hero).
- No `srcset` or `sizes` on any image surfaces.
- Most images are rendered at grid sizes but are sourced from original URLs (no resizing pipeline visible).

## Image fixes ladder (prioritized)

Level 0 (safest, CSS only)
- Ensure aspect-ratio wrappers are consistent (already used in several grids).
- Avoid whitespace and layout shifts by ensuring image containers have fixed aspect ratios.

Level 1 (low-risk markup)
- Add `loading="lazy"` and `decoding="async"` to all non-hero images.
- Add `fetchpriority="high"` for the hero image to stabilize LCP.

Level 2 (layout hints)
- Add `sizes` hints to grids even without srcset (improves preload priority).

Level 3 (thumbnail optimization)
- Add dedicated thumbnail URLs for product and gallery grids (smallest ROI with minimal risk).

Level 4 (full image variants)
- Introduce Cloudflare Images or similar resizing with width/quality variants.

