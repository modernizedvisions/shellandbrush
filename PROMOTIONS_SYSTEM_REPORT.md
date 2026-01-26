# Promotions System Report (Shell & Brush)

This report describes the existing auto-applied promotions and the newly added promo-code system end-to-end, with concrete file references and payloads so it can be replicated in The Chesapeake Shell.

## 1) High-level behavior (what the owner can do + what customers experience)

### Auto sale (global vs category, scheduling, banner, single-active)
- Admin can create promotions with percent-off, scope (global or categories), schedule window, and banner text/enable. UI says "Create one active promotion at a time."  
  File: `src/components/admin/AdminPromotionsTab.tsx`
- Single-active is enforced in app logic: when a promotion is enabled, API disables any other enabled rows. No DB constraint enforces this.  
  File: `functions/api/admin/promotions.ts`
- Promotion can be scheduled with `startsAt` and `endsAt`. Active promo is returned only when `enabled=1` and now is within the schedule window.  
  File: `functions/api/promotions/active.ts`
- Banner text is shown site-wide when `promotion.bannerEnabled` and `bannerText` are set.  
  File: `src/layout/SiteLayout.tsx`
- Customers see discounted prices across product listing, detail, cart drawer, and checkout preview; the checkout session also applies server-side discounts.  
  Files: `src/components/ProductCard.tsx`, `src/pages/ProductDetailPage.tsx`, `src/components/cart/CartDrawer.tsx`, `src/pages/CheckoutPage.tsx`, `functions/api/checkout/create-session.ts`

### Promo codes (percent off, free shipping, both; scheduling; case-sensitivity; validation rules)
- Admin can create customer-entered promo codes with percent off and/or free shipping, with scope (global/categories), schedule window, and enabled flag.  
  File: `src/components/admin/AdminPromotionsTab.tsx`  
  File: `functions/api/admin/promo-codes.ts`
- Promo codes are stored normalized to lowercase; validation is case-insensitive.  
  File: `functions/api/admin/promo-codes.ts`  
  File: `functions/api/checkout/create-session.ts`
- Validation rules (server-side in checkout): must be enabled; in schedule window; if scope is categories, at least one cart item must match; must have percent off or free shipping. If invalid, checkout returns HTTP 400 with an error message.  
  File: `functions/api/checkout/create-session.ts`
- Promo codes are not pre-validated via a separate endpoint; validation happens inside checkout session creation.  
  File: `functions/api/checkout/create-session.ts`
- Promo codes can be percent-only, free-shipping-only, or both.  
  File: `functions/api/checkout/create-session.ts`

### Combination logic (auto promo + code)
- Percent-off: the best (max) eligible percent is applied per line item; percents do NOT stack.  
  File: `functions/api/checkout/create-session.ts`  
  File: `src/pages/CheckoutPage.tsx`
- Free shipping: if promo code has free shipping, shipping is forced to 0 regardless of auto promo.  
  File: `functions/api/checkout/create-session.ts`  
  File: `src/pages/CheckoutPage.tsx`
- "Most cost-effective" is implemented as: max of eligible percent-off (auto vs code) per item, plus free shipping if code has it.  
  File: `functions/api/checkout/create-session.ts`  
  File: `src/pages/CheckoutPage.tsx`

## 2) Data model (D1 schema)

### Relevant migrations and tables
- Promotions (auto-applied):  
  File: `db/migrations/011_add_promotions.sql`
- Promo codes (customer-entered) and promo metadata on orders:  
  File: `db/migrations/013_add_promo_codes.sql`
- Live baseline schema (includes orders + promo fields + promo_codes table):  
  File: `db/migrations/live_init.sql`

### Table: `promotions`
- Columns and defaults:  
  `id TEXT PK`, `name TEXT`, `percent_off INTEGER`, `scope TEXT CHECK`, `category_slugs_json TEXT DEFAULT '[]'`,  
  `banner_enabled INTEGER DEFAULT 0`, `banner_text TEXT DEFAULT ''`,  
  `starts_at TEXT`, `ends_at TEXT`, `enabled INTEGER DEFAULT 0`,  
  `created_at TEXT DEFAULT strftime(...)`, `updated_at TEXT DEFAULT strftime(...)`.  
  File: `db/migrations/011_add_promotions.sql`
- Indexes: `idx_promotions_enabled` on `enabled`.  
  File: `db/migrations/011_add_promotions.sql`
- One-active is enforced in app logic (disable other enabled promos on create/update); there is no DB uniqueness constraint.  
  File: `functions/api/admin/promotions.ts`

### Table: `promo_codes`
- Columns and defaults:  
  `id TEXT PK`, `code TEXT`, `enabled INTEGER DEFAULT 0`,  
  `percent_off INTEGER NULL`, `free_shipping INTEGER DEFAULT 0`,  
  `scope TEXT CHECK`, `category_slugs_json TEXT DEFAULT '[]'`,  
  `starts_at TEXT`, `ends_at TEXT`,  
  `created_at TEXT DEFAULT strftime(...)`, `updated_at TEXT DEFAULT strftime(...)`.  
  File: `db/migrations/013_add_promo_codes.sql`  
  File: `db/migrations/live_init.sql`
- Indexes: `idx_promo_codes_code` (unique), `idx_promo_codes_enabled`.  
  File: `db/migrations/013_add_promo_codes.sql`
- Redemption tracking: NONE. There is no usage limit or redemption table.  
  File: `functions/api/checkout/create-session.ts` (no usage tracking)

### Table: `orders` (promo metadata storage)
- Promo fields: `promo_code TEXT`, `promo_percent_off INTEGER`, `promo_free_shipping INTEGER`, `promo_source TEXT`.  
  File: `db/migrations/013_add_promo_codes.sql`  
  File: `db/migrations/live_init.sql`
- Promo details are populated from Stripe session metadata in the webhook.  
  File: `functions/api/webhooks/stripe.ts`

## 3) Public APIs (customer-facing)

### GET `/api/promotions/active`
- Purpose: return the currently active auto promotion (or null).  
  File: `functions/api/promotions/active.ts`
- Cache headers: `Cache-Control: public, max-age=60`.  
  File: `functions/api/promotions/active.ts`
- Response shape:
  ```json
  { "promotion": { "id": "...", "name": "...", "percentOff": 20, "scope": "global|categories", "categorySlugs": [], "bannerEnabled": true, "bannerText": "...", "startsAt": "...|null", "endsAt": "...|null" } }
  ```
  File: `functions/api/promotions/active.ts`
- Used by: `PromotionProvider` polling in UI.  
  File: `src/lib/promotions.tsx`  

### POST `/api/checkout/create-session`
- Purpose: create Stripe Embedded Checkout session; validates promo codes here (no public validation endpoint).  
  File: `functions/api/checkout/create-session.ts`
- Request body:
  ```json
  { "items": [{ "productId": "...", "quantity": 1 }], "promoCode": "optional-code" }
  ```
  File: `functions/api/checkout/create-session.ts`
- Response shape (success):
  ```json
  { "clientSecret": "...", "sessionId": "...", "promo": { "code": "code|nullable", "percentOff": 20, "freeShippingApplied": true, "source": "auto|code|auto+code|null", "codePercentOff": 10, "codeScope": "global|categories|null", "codeCategorySlugs": [] } }
  ```
  File: `functions/api/checkout/create-session.ts`
- Failure modes: 400 with `{ error: "Promo code is invalid or expired" }` or `{ error: "Promo code is not eligible for these items" }` for invalid/ ineligible code; other validation errors for items.  
  File: `functions/api/checkout/create-session.ts`
- Used by: `createEmbeddedCheckoutSession` client helper; Checkout page.  
  File: `src/lib/payments/checkout.ts`  
  File: `src/pages/CheckoutPage.tsx`

## 4) Admin APIs (protected)

### Auth header and validation
- Required header: `x-admin-password`.  
  File: `functions/api/_lib/adminAuth.ts`  
  File: `src/lib/adminAuth.ts`
- Validation: compares against `env.ADMIN_PASSWORD`; returns 401 JSON with diagnostic fields.  
  File: `functions/api/_lib/adminAuth.ts`

### `/api/admin/promotions` CRUD
- Methods: GET/POST/PUT/DELETE.  
  File: `functions/api/admin/promotions.ts`
- Request/response shape:
  - GET: `{ promotions: PromotionAdmin[] }`
  - POST/PUT: `{ promotion: PromotionAdmin | null }`
  - DELETE: `{ success: true }`
  File: `functions/api/admin/promotions.ts`
- Failure modes: 401 unauthorized; 400 validation error; 404 on missing; 500 on server errors.  
  File: `functions/api/admin/promotions.ts`

### `/api/admin/promo-codes` CRUD
- Methods: GET/POST/PUT/DELETE.  
  File: `functions/api/admin/promo-codes.ts`
- Request/response shape:
  - GET: `{ promoCodes: PromoCodeAdmin[] }`
  - POST/PUT: `{ promoCode: PromoCodeAdmin | null }`
  - DELETE: `{ success: true }`
  File: `functions/api/admin/promo-codes.ts`
- Validation rules: `code` required, `percentOff` 1-90 if provided, at least percentOff or freeShipping, schedule validation, category slugs required for category scope.  
  File: `functions/api/admin/promo-codes.ts`
- Failure modes: 401 unauthorized; 400 validation error; 404 not found; 409 for unique code conflict.  
  File: `functions/api/admin/promo-codes.ts`

## 5) Client state + UI wiring

### PromotionProvider
- Mounted at app layout root, wrapping all routes.  
  File: `src/layout/SiteLayout.tsx`
- Polling interval: every 60 seconds; no visibility pause.  
  File: `src/lib/promotions.tsx`
- Fetches `/api/promotions/active` and stores in React context.  
  File: `src/lib/promotions.tsx`

### Helpers
- `isPromotionEligible(...)` checks scope and category/type match.  
  File: `src/lib/promotions.tsx`
- `getDiscountedCents(price, percentOff)` computes percent off.  
  File: `src/lib/promotions.tsx`

### Price display usage (auto + promo codes)
- Product card: uses auto promotion only.  
  File: `src/components/ProductCard.tsx`
- Product detail: uses auto promotion only.  
  File: `src/pages/ProductDetailPage.tsx`
- Cart drawer: uses auto promotion only for subtotal display.  
  File: `src/components/cart/CartDrawer.tsx`
- Checkout preview: applies best percent between auto promo and promo code summary returned from checkout; also uses `freeShippingApplied` to show $0 shipping.  
  File: `src/pages/CheckoutPage.tsx`
- Note: cart drawer + product pages do NOT reflect promo codes (only checkout preview does).  
  File: `src/components/cart/CartDrawer.tsx`  
  File: `src/pages/ProductDetailPage.tsx`

### Promo code entry
- Location: Checkout page only.  
  File: `src/pages/CheckoutPage.tsx`
- Storage: React state only; not persisted to localStorage.  
  File: `src/pages/CheckoutPage.tsx`
- Submission: uses `createEmbeddedCheckoutSession(items, promoCode)` which hits `/api/checkout/create-session`.  
  File: `src/pages/CheckoutPage.tsx`  
  File: `src/lib/payments/checkout.ts`

### Caching/polling/localStorage
- `/api/promotions/active` is cached 60s; PromotionProvider polls every 60s.  
  File: `functions/api/promotions/active.ts`  
  File: `src/lib/promotions.tsx`
- Cart is stored in localStorage under `artist-cart`.  
  File: `src/store/cartStore.ts`
- Checkout session timestamps stored in localStorage for expiry tracking.  
  File: `src/pages/CheckoutPage.tsx`

## 6) Shipping logic integration

### Client-side shipping (display)
- Client computes shipping for display using category shipping data, choosing the minimum shipping across cart categories.  
  File: `src/lib/shipping.ts`  
  File: `src/components/cart/CartDrawer.tsx`  
  File: `src/pages/CheckoutPage.tsx`

### Server-side shipping (Stripe session)
- Checkout session computes shipping using the same logic and category configs from D1.  
  File: `functions/_lib/shipping.ts`  
  File: `functions/api/checkout/create-session.ts`
- Shipping is appended as a Stripe line item named “Shipping” with `metadata.mv_line_type = "shipping"` when > 0.  
  File: `functions/api/checkout/create-session.ts`

### Free shipping promo override
- If promo code has free shipping, server-side shipping is forced to 0 and metadata records it.  
  File: `functions/api/checkout/create-session.ts`
- Client checkout preview uses `promoSummary.freeShippingApplied` to show $0.  
  File: `src/pages/CheckoutPage.tsx`

### Custom orders/invoices
- Promo code logic is only in `/api/checkout/create-session` (shop checkout). Custom order and custom invoice sessions use different endpoints and are unaffected.  
  File: `functions/api/checkout/custom-invoice-session.ts`  
  File: `functions/api/admin/custom-orders/[id]/send-payment-link.ts`

## 7) Stripe checkout session creation

### Endpoint
- File implementing `/api/checkout/create-session`: `functions/api/checkout/create-session.ts`

### Price vs price_data
- Default: uses Stripe `price` for items.  
  File: `functions/api/checkout/create-session.ts`
- When a discount applies: uses `price_data.unit_amount` with existing product ID to override the price.  
  File: `functions/api/checkout/create-session.ts`

### Promo logic
- Auto promotion: loads from `promotions` table; eligibility is global or category via D1 categories lookup.  
  File: `functions/api/checkout/create-session.ts`
- Promo code: loads from `promo_codes` by `LOWER(code)`; validates enabled and time window; eligibility global or categories.  
  File: `functions/api/checkout/create-session.ts`
- Percent decision: best eligible percent off per item is chosen (`max(auto, code)`).  
  File: `functions/api/checkout/create-session.ts`

### Metadata stored on session
- `mv_promo_code`, `mv_free_shipping_applied`, `mv_percent_off_applied`, `mv_promo_source`, `mv_auto_promo_id`, plus `shipping_cents`.  
  File: `functions/api/checkout/create-session.ts`
- `mv_promo_source` is computed as `auto`, `code`, or `auto+code`.  
  File: `functions/api/checkout/create-session.ts`
- Stripe params used appear valid for Embedded Checkout.  
  File: `functions/api/checkout/create-session.ts`

## 8) Stripe webhook + DB order persistence

### Webhook event
- Uses `checkout.session.completed`.  
  File: `functions/api/webhooks/stripe.ts`

### Totals computation
- Subtotal is derived from non-shipping line items; shipping is derived from Stripe total details or shipping line items; total from Stripe session.  
  File: `functions/api/webhooks/stripe.ts`
- Discounts are implicit: `order_items.price_cents` reflects discounted `unit_amount` if a promo applied.  
  File: `functions/api/webhooks/stripe.ts`

### Promo persistence
- Promo metadata is pulled from Stripe session metadata and persisted into orders (`promo_code`, `promo_percent_off`, `promo_free_shipping`, `promo_source`).  
  File: `functions/api/webhooks/stripe.ts`

## 9) Emails + totals correctness

### Templates used
- Customer confirmation: `renderOrderConfirmationEmailHtml/Text`.  
  File: `functions/_lib/orderConfirmationEmail.ts`  
  File: `functions/api/webhooks/stripe.ts`
- Owner sale email: `renderOwnerNewSaleEmailHtml/Text`.  
  File: `functions/_lib/ownerNewSaleEmail.ts`  
  File: `functions/api/webhooks/stripe.ts`

### Data sources
- Email line items and totals are derived from Stripe line items and shipping totals in the webhook.  
  File: `functions/api/webhooks/stripe.ts`
- Discounts are not shown as a separate line item; they are reflected in line item totals and derived subtotal.  
  File: `functions/api/webhooks/stripe.ts`

### Mismatch risks
- If promo metadata is missing but discounts were applied, emails still reflect Stripe totals (because they derive from Stripe line items); admin promo fields may be blank.  
  File: `functions/api/webhooks/stripe.ts`

### Promo data in emails (explicit)
- Customer confirmation emails do NOT import promo metadata or show promo codes. They only use Stripe line items and totals, so discounts are reflected in the line item totals and derived subtotal.  
  Files: `functions/api/webhooks/stripe.ts`, `functions/_lib/orderConfirmationEmail.ts`, `functions/_lib/emailTotals.ts`
- Owner sale emails behave the same way: no promo fields, only Stripe line items + totals.  
  Files: `functions/api/webhooks/stripe.ts`, `functions/_lib/ownerNewSaleEmail.ts`, `functions/_lib/emailTotals.ts`

## 10) Admin dashboard display

### Promotions tab
- Promotions form with fields for name/percent/scope/banner/schedule/enabled, list with edit/enable/delete.  
  File: `src/components/admin/AdminPromotionsTab.tsx`
- Category selection is populated from `/api/admin/categories`.  
  File: `src/components/admin/AdminPromotionsTab.tsx`  
  File: `src/lib/api.ts`

### Promo codes UI
- Lives in the same promotions tab with a separate form and list (no modal).  
  File: `src/components/admin/AdminPromotionsTab.tsx`
- Fields: code, percent off, free shipping, scope, category slugs, schedule, enabled.  
  File: `src/components/admin/AdminPromotionsTab.tsx`

### Orders modal
- Promo fields shown: code (uppercased), percent off, free shipping, source.  
  File: `src/components/admin/OrderDetailsModal.tsx`
- Values are read from admin orders API.  
  File: `functions/api/admin/orders.ts`  
  File: `src/lib/db/orders.ts`

## 11) Promo touchpoints + non-touchpoints (implementation checklist)
- Promo creation/edit: admin UI + admin APIs + D1 tables (`promotions`, `promo_codes`).  
  Files: `src/components/admin/AdminPromotionsTab.tsx`, `functions/api/admin/promotions.ts`, `functions/api/admin/promo-codes.ts`, `db/migrations/011_add_promotions.sql`, `db/migrations/013_add_promo_codes.sql`
- Promo evaluation + pricing: checkout creation computes best percent + free shipping; applies `price_data.unit_amount` and writes promo metadata onto the Stripe session.  
  File: `functions/api/checkout/create-session.ts`
- Client preview: auto promo used on product list/detail/cart; promo code feedback + combined preview only in checkout.  
  Files: `src/components/ProductCard.tsx`, `src/pages/ProductDetailPage.tsx`, `src/components/cart/CartDrawer.tsx`, `src/pages/CheckoutPage.tsx`
- Persistence: webhook reads Stripe session metadata and persists promo fields to `orders`.  
  File: `functions/api/webhooks/stripe.ts`
- Emails + checkout return: both use Stripe line items/totals only (no promo metadata or promo code display).  
  Files: `functions/_lib/orderConfirmationEmail.ts`, `functions/_lib/ownerNewSaleEmail.ts`, `functions/_lib/emailTotals.ts`, `functions/api/checkout/session/[id].ts`, `src/pages/CheckoutReturnPage.tsx`
- Not covered by promos: custom invoice/custom order sessions do not evaluate promo codes.  
  Files: `functions/api/checkout/custom-invoice-session.ts`, `functions/api/admin/custom-orders/[id]/send-payment-link.ts`

## 12) Known pitfalls + "copy to Chesapeake Shell" checklist

### Pitfalls
- Promo codes only affect checkout preview; product listings and cart drawer show auto promo only.  
  File: `src/components/cart/CartDrawer.tsx`  
  File: `src/components/ProductCard.tsx`
- Promo validation only occurs in checkout creation; there is no public validation endpoint.  
  File: `functions/api/checkout/create-session.ts`
- No redemption tracking or usage limits.  
  File: `functions/api/checkout/create-session.ts`

### Exact file list to port
- Migrations:  
  `db/migrations/011_add_promotions.sql`, `db/migrations/013_add_promo_codes.sql`, `db/migrations/live_init.sql`
- Backend:  
  `functions/api/promotions/active.ts`, `functions/api/admin/promotions.ts`, `functions/api/admin/promo-codes.ts`,  
  `functions/api/checkout/create-session.ts`, `functions/api/webhooks/stripe.ts`,  
  `functions/api/checkout/session/[id].ts`, `functions/api/_lib/adminAuth.ts`,  
  `functions/_lib/shipping.ts`, `functions/api/lib/shipping.ts`,  
  `functions/_lib/orderConfirmationEmail.ts`, `functions/_lib/ownerNewSaleEmail.ts`, `functions/_lib/emailTotals.ts`
- Frontend:  
  `src/lib/promotions.tsx`, `src/components/ProductCard.tsx`, `src/pages/ProductDetailPage.tsx`,  
  `src/components/cart/CartDrawer.tsx`, `src/pages/CheckoutPage.tsx`,  
  `src/pages/CheckoutReturnPage.tsx`,  
  `src/components/admin/AdminPromotionsTab.tsx`, `src/components/admin/OrderDetailsModal.tsx`,  
  `src/lib/adminPromotions.ts`, `src/lib/adminPromoCodes.ts`, `src/lib/adminAuth.ts`,  
  `src/lib/payments/checkout.ts`, `src/lib/types.ts`, `src/lib/db/orders.ts`, `src/lib/api.ts`

### Env vars
- `ADMIN_PASSWORD` for admin APIs.  
  File: `functions/api/_lib/adminAuth.ts`
- `STRIPE_SECRET_KEY` + `VITE_STRIPE_PUBLISHABLE_KEY` for checkout.  
  File: `functions/api/checkout/create-session.ts`  
  File: `src/pages/CheckoutPage.tsx`
- `PUBLIC_SITE_URL` or `VITE_PUBLIC_SITE_URL` for checkout return URLs.  
  File: `functions/api/checkout/create-session.ts`

### Migrations to apply
- `db/migrations/011_add_promotions.sql` (auto promotions table)  
- `db/migrations/013_add_promo_codes.sql` (promo codes + orders columns)

### Minimal smoke-test checklist
- Create auto promotion (global + categories) and confirm banner + prices.  
  File: `src/components/admin/AdminPromotionsTab.tsx`
- Create promo code: percent only, free shipping only, both.  
  File: `src/components/admin/AdminPromotionsTab.tsx`
- Checkout with no code: auto promo applies, shipping normal.  
  File: `functions/api/checkout/create-session.ts`
- Checkout with free shipping code: shipping forced to 0; item prices use best percent (auto vs code).  
  File: `functions/api/checkout/create-session.ts`
- Checkout with auto promo 20% + code 10% + free shipping: items use 20%, shipping 0, promo_source `auto+code`.  
  File: `functions/api/checkout/create-session.ts`
- Confirm emails and order totals match Stripe; verify promo fields in Admin Order modal.  
  File: `functions/api/webhooks/stripe.ts`  
  File: `src/components/admin/OrderDetailsModal.tsx`

## UNKNOWNs / Ambiguities
- Whether Stripe's `consent_collection.promotions = 'auto'` is needed for non-Stripe-coupon discounts (it is currently set but discounts are manual via `price_data.unit_amount`). This doesn't affect current logic, but purpose should be confirmed.  
  File: `functions/api/checkout/create-session.ts`

