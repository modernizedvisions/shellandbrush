# Bundle Audit

## Build output (Vite production build)
Command: `npm run build`
Output:
- `dist/index.html` 0.83 kB (gzip 0.44 kB)
- `dist/assets/index-BN93KGjR.css` 39.69 kB (gzip 7.19 kB)
- `dist/assets/index-BKeYoyXG.js` 428.73 kB (gzip 124.93 kB)

Evidence: Vite build output from this run.

## Chunk map
- Single JS entry chunk only (`index-*.js`). No route-level or feature-level code splitting observed.
- Evidence: all routes are eagerly imported in `src/main.tsx` with static imports.

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

## Largest dependency suspects (by usage)
These are likely contributors to the main bundle based on import surface and typical size. This is not a measured breakdown because no visualizer is configured.

1) `@stripe/stripe-js` (checkout route)
- Evidence: `src/pages/CheckoutPage.tsx`.
- Note: this is a runtime dependency and typically heavy.

2) `react-router-dom`
- Evidence: `src/main.tsx`.
- Note: required for routing, loaded on all routes.

3) `lucide-react` icon pack
- Evidence: many imports across UI components.
- Example: `src/components/ProductCard.tsx`, `src/components/cart/CartDrawer.tsx`.

4) `react-hook-form`
- Evidence: `src/components/admin/AdminCustomOrdersTab.tsx`.
- Note: currently included in the main bundle due to no code splitting.

5) `sonner`
- Evidence: `src/main.tsx` (Toaster) and admin components.

## Promotions feature footprint (new)
- Promotion context is mounted at the layout level, so the polling logic and eligibility helpers ship to every route. Evidence: `src/layout/SiteLayout.tsx`, `src/lib/promotions.tsx`.
- Promotions admin UI ships in the main bundle because routes are eagerly imported. Evidence: `src/pages/AdminPage.tsx`, `src/components/admin/AdminPromotionsTab.tsx`.

## Code splitting status
- No dynamic imports detected in the route tree.
- All routes and most admin features ship in the single bundle.

## Recommendations (diagnostics only)
- Introduce route-level lazy imports for `/admin`, `/checkout`, `/product/:id`, and `/gallery` to reduce initial bundle cost.
- Keep Stripe JS scoped to checkout by splitting the Checkout route.

## Unknowns
- Per-module byte sizes and tree-shaking effectiveness (requires Rollup visualizer or stats build).

