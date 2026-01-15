# PR Summary (diagnostics only)
This report documents current performance characteristics, bundle composition, and image delivery behavior. No code changes are proposed in this audit.

# Performance Audit - Shell and Brush

## Part A - Quick Recon

### Stack and deployment
- Frontend: React + Vite + TypeScript. Evidence: `package.json` scripts and deps.
- Hosting: Cloudflare Pages + D1 + Pages Functions. Evidence: `wrangler.toml` and `functions/` folder with `functions/api/*` handlers.
- Edge/server routes: multiple Pages Functions under `functions/api/*` and a `/images/*` middleware. Evidence: `functions/images/_middleware.ts` and `functions/api/*`.

### Routes and pages
Router is defined in `src/main.tsx` with direct imports (no lazy loading):
```tsx
import { HomePage } from './pages/HomePage';
import { ShopPage } from './pages/ShopPage';
import { GalleryPage } from './pages/GalleryPage';
import { AboutPage } from './pages/AboutPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { CheckoutReturnPage } from './pages/CheckoutReturnPage';
import { AdminPage } from './pages/AdminPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
```
Routes:
- Public: `/`, `/shop`, `/product/:productId`, `/gallery`, `/about`, `/checkout`, `/checkout/return`
- Admin: `/admin`

### Heavy features and embeds
- TikTok and Instagram embeds via iframes (Socials section). Evidence: `src/sections/home/SocialsSection.tsx`.
- Stripe embedded checkout iframe. Evidence: `src/pages/CheckoutPage.tsx` mounts `#embedded-checkout`.
- No maps, charts, or editors found.
- Icon library `lucide-react` used across many components. Evidence: `rg -n "lucide-react" src`.
- Form library `react-hook-form` used in admin custom orders. Evidence: `src/components/admin/AdminCustomOrdersTab.tsx`.

### Image pipeline inventory
- Product and gallery images are stored in D1 `images` table and referenced by ID or URL. Evidence: `db/migrations/006_images_pipeline.sql`.
- Public image URLs are normalized and served under `/images/<key>` with a configurable base. Evidence: `functions/_lib/imageUrls.ts` and `functions/_lib/imageBaseUrl.ts`.
- `/images/*` requests are served by a Pages Functions middleware with long cache headers. Evidence: `functions/images/_middleware.ts`.

## Part D - Network and runtime audit (current load map)

### Home (`/`)
- API calls on mount:
  - `GET /api/site-config/home` (hero image). Evidence: `src/sections/home/HeroSection.tsx`.
  - `GET /api/products?visible=true` (featured works). Evidence: `src/sections/home/FeaturedWorksSection.tsx`.
- Images loaded immediately:
  - Hero image from `heroImageUrl` (no lazy). Evidence: `src/sections/home/HeroSection.tsx`.
  - Product cards in Featured Works use `loading="lazy"` and `decoding="async"`. Evidence: `src/components/ProductCard.tsx`.
- Embeds:
  - TikTok and Instagram iframes. Evidence: `src/sections/home/SocialsSection.tsx`.

### Shop (`/shop`)
- API calls on mount:
  - `GET /api/products?visible=true` and `GET /api/categories`. Evidence: `src/pages/ShopPage.tsx`.
- Images:
  - Product grid uses `ProductCard` (lazy-loaded images). Evidence: `src/components/ProductGrid.tsx` + `src/components/ProductCard.tsx`.

### Product detail (`/product/:productId`)
- API calls on mount:
  - `GET /api/products/:id` and related products. Evidence: `src/pages/ProductDetailPage.tsx`.
- Images:
  - Main product gallery uses `<img>` without lazy. Evidence: `src/pages/ProductDetailPage.tsx`.

### Gallery (`/gallery`)
- API calls on mount:
  - `GET /api/gallery`, `GET /api/gallery-sold`, `GET /api/sold-products`. Evidence: `src/pages/GalleryPage.tsx`.
- Images:
  - Grid images do not use `loading="lazy"`. Evidence: `src/pages/GalleryPage.tsx`.

### Checkout (`/checkout`)
- API calls on mount:
  - `GET /api/categories` (shipping). Evidence: `src/pages/CheckoutPage.tsx`.
  - `GET /api/products/:id` (single product) when target product is present. Evidence: `src/pages/CheckoutPage.tsx`.
  - `POST /api/checkout/create-session` (Stripe session). Evidence: `src/lib/payments/checkout.ts`.
- Embeds:
  - Stripe Embedded Checkout iframe. Evidence: `src/pages/CheckoutPage.tsx`.

### Checkout return (`/checkout/return`)
- API calls on mount:
  - `GET /api/checkout/session/:id`. Evidence: `src/pages/CheckoutReturnPage.tsx`.

### Admin (`/admin`)
- API calls on load and tab switches:
  - Orders, products, gallery images, hero config, sold products, custom orders. Evidence: `src/pages/AdminPage.tsx`.

## Part D - Prioritized laggards (top 10)

1) Single large JS bundle (no route splitting)
- Evidence: `src/main.tsx` uses eager imports; Vite build output shows one JS chunk.
- Impact: all routes ship to every visitor.
- Fix idea: route-level lazy imports with `React.lazy`.
- Risk: Medium.
- Measure: reduce main JS gzip size; check LCP and TTFB unaffected.

2) Social embeds load iframes on home
- Evidence: `src/sections/home/SocialsSection.tsx` embeds TikTok/Instagram iframes.
- Impact: heavy third-party scripts and iframes on initial load.
- Fix idea: defer embeds until scroll or user interaction.
- Risk: Medium.
- Measure: LCP/INP improvements and reduced request count on home.

3) Gallery page images load without lazy loading
- Evidence: `src/pages/GalleryPage.tsx` uses `<img>` without `loading="lazy"`.
- Impact: eager download of large grid images.
- Fix idea: add lazy and decoding async; consider pagination.
- Risk: Low.
- Measure: time-to-first-thumbnail and reduced network bytes.

4) Product detail gallery uses full-size images
- Evidence: `src/pages/ProductDetailPage.tsx` uses direct image URLs with `object-cover` and no srcset.
- Impact: large images downloaded for thumbnails and main image.
- Fix idea: introduce thumbnail variants or sizes hints.
- Risk: Medium.
- Measure: LCP and image byte reduction.

5) Hero image has no explicit loading or decoding hints
- Evidence: `src/sections/home/HeroSection.tsx` `<img>` lacks `loading` and `decoding`.
- Impact: potential main-thread decode cost and uncontrolled priority.
- Fix idea: set `fetchPriority="high"` for hero; `decoding="async"`.
- Risk: Low.
- Measure: LCP and LCP image load time.

6) Product grids may use full-res images
- Evidence: `ProductCard` uses `product.imageUrl` or `imageUrls[0]` with no srcset. `src/components/ProductCard.tsx`.
- Impact: larger-than-needed downloads on grid views.
- Fix idea: use image variants or dedicated thumbnail URLs.
- Risk: Medium.
- Measure: bytes per product card.

7) Admin page loads multiple datasets on initial auth
- Evidence: `src/pages/AdminPage.tsx` loads orders, products, gallery, hero config, sold products, custom orders.
- Impact: heavy admin load and potential sluggishness.
- Fix idea: lazy-load tabs or defer non-active tab data.
- Risk: Low.
- Measure: admin TTI and network requests.

8) Stripe embedded checkout (heavy third-party)
- Evidence: `src/pages/CheckoutPage.tsx` uses `@stripe/stripe-js` and embedded checkout.
- Impact: large third-party payload on checkout route.
- Fix idea: code-split checkout route so Stripe JS is not on other pages.
- Risk: Low.
- Measure: JS bytes on non-checkout routes.

9) Socials section uses fixed-height iframes (720px) on mobile
- Evidence: `src/sections/home/SocialsSection.tsx`.
- Impact: larger layout and additional paint cost on mobile.
- Fix idea: collapse with expand/consent or lazy-load after first interaction.
- Risk: Medium.
- Measure: CLS and total layout time.

10) No explicit image sizing attributes (width/height) in many surfaces
- Evidence: multiple components use `<img>` without width/height, e.g., `src/pages/GalleryPage.tsx`.
- Impact: layout shifting or delayed layout stabilization.
- Fix idea: use width/height or aspect-ratio wrappers consistently.
- Risk: Low.
- Measure: CLS improvement.

## Part E - Gameplan (phased)

Phase 1 (lowest risk)
- Lazy-load non-critical embeds on home (TikTok/Instagram).
- Add `loading="lazy"` + `decoding="async"` to non-hero images lacking it.
- Ensure fallback behavior does not block cached image rendering (guard onLoad fallback logic).
- Introduce route-level code splitting for Admin and Checkout routes.

Phase 2 (medium)
- Add pagination or load-more to Gallery and Sold grids.
- Add deterministic thumbnail variants for shop grid only (fallback-safe).

Phase 3 (higher)
- Full image variants pipeline with on-demand resizing (Cloudflare Images or R2 processing).
- Store and use size metadata (width/height) in D1 for better CLS control.

## Unknowns / data needed
- Real-world image byte sizes per surface (need network capture).
- LCP and CLS baselines per route (need Lighthouse or Web Vitals).
- Whether `PUBLIC_IMAGES_BASE_URL` is set in production and its CDN characteristics.

