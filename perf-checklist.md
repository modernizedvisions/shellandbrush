# Performance Checklist (before/after)

## Baseline environment
- Use production build locally: `npm run build` then `npm run preview`.
- Use a clean browser profile or incognito.
- Disable cache for the first run, then repeat with cache enabled.

## Lighthouse (Chrome DevTools)
1) Open the route to test (one at a time):
   - `/` (Home)
   - `/shop`
   - `/product/:id` (one representative product)
   - `/gallery`
   - `/checkout`
2) DevTools -> Lighthouse -> Mode: Navigation.
3) Run twice for Mobile and once for Desktop.
4) Record: LCP, CLS, INP, Total Blocking Time, Speed Index.

## Network throttling (Fast 3G)
1) DevTools -> Network -> Throttling: Fast 3G.
2) Check Disable cache.
3) Hard refresh (Ctrl+Shift+R).
4) Record:
   - Time to first thumbnail on `/shop` and `/gallery`.
   - Total image bytes transferred.
   - Total JS bytes transferred.

## Runtime interaction checks
- Scroll through `/shop` and `/gallery` to verify images load in view only.
- Open `/product/:id` and switch gallery thumbnails; ensure no layout shift.
- Load `/checkout` to verify Stripe checkout iframe renders.
- Confirm promo banner appears only when enabled and does not shift layout.
- Verify promo pricing shows on product cards, cart drawer, and checkout summary.

## Image-specific checks
- Confirm hero image loads with expected priority.
- Verify all non-hero images are lazy-loaded.
- Confirm no broken images in admin and customer views.

## Acceptance targets (initial)
- LCP: <= 2.5s on Home (mobile) under Fast 3G.
- CLS: <= 0.1 on Home and Shop.
- INP: <= 200ms on Shop interactions.
- Time to first thumbnail on Shop: <= 2.0s on Fast 3G.

## Regression checks
- Admin `/admin` still loads all tabs correctly.
- Promotions tab can create, enable, disable, and delete a promotion.
- Only one promotion is active at a time after enabling a new one.
- Checkout flow still completes and return page loads.
- Images remain correctly cropped (object-fit preserved).

