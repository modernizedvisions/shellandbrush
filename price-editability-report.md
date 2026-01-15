# Price Editability Report (Shell & Brush)

Goal: determine whether editing product price in admin would change cart/checkout + Stripe charges.

## Step 1 — Inventory pricing data model (D1)

**Products table and price-related fields**

Source: `db/schema.sql`

```sql
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT,
  slug TEXT,
  description TEXT,
  price_cents INTEGER,
  ...
  stripe_price_id TEXT,
  stripe_product_id TEXT,
  ...
);
```

**Source of truth today**

- The D1 column `price_cents` is used for display/subtotals in the cart and checkout preview.
- The Stripe `stripe_price_id` is used to build the actual Stripe Checkout line items (and therefore determines what Stripe charges).

Evidence:

- Price shown and subtotals are computed from `price_cents` in the cart/checkout UI (`src/store/cartStore.ts`, `src/pages/CheckoutPage.tsx`).
- Checkout session creation requires both `price_cents` and `stripe_price_id`, but charges by `stripe_price_id` (`functions/api/checkout/create-session.ts`).

## Step 2 — Admin “Edit Product” behavior

**Edit modal component**

Path: `src/components/admin/AdminShopTab.tsx`

The price input in the Edit Product modal is disabled:

```tsx
<input
  type="number"
  min="0"
  step="0.01"
  value={editProductForm?.price || ''}
  disabled
  className="w-full rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
/>
```

**Save handler and payload**

Path: `src/pages/AdminPage.tsx`

The edit save handler builds a payload via `formStateToPayload` and sends it to the admin update endpoint:

```tsx
const payload = {
  ...formStateToPayload(editProductForm),
  imageUrl: mergedImages.imageUrl || '',
  imageUrls: mergedImages.imageUrls,
  ...
};

const updated = await adminUpdateProduct(editProductId, payload);
```

`formStateToPayload` includes `priceCents`:

```tsx
return {
  ...,
  priceCents: Math.round(priceNumber * 100),
  ...
  stripePriceId: state.stripePriceId?.trim() || undefined,
  stripeProductId: state.stripeProductId?.trim() || undefined,
};
```

**API call used**

- Function: `adminUpdateProduct`
- Endpoint: `PUT /api/admin/products/:id`
- Path: `src/lib/db/adminProducts.ts`

## Step 3 — Backend update route: what happens if price changes?

**Update route**

Path: `functions/api/admin/products/[id].ts`

Key detail: **price updates are not applied**. The update handler never sets `price_cents`.

```ts
if (body.name !== undefined) addSet('name = ?', body.name);
if (body.description !== undefined) addSet('description = ?', body.description);
if (body.category !== undefined) addSet('category = ?', categoryValue || null);
...
if (body.quantityAvailable !== undefined) addSet('quantity_available = ?', body.quantityAvailable);
if (body.isOneOff !== undefined) addSet('is_one_off = ?', body.isOneOff ? 1 : 0);
if (body.isActive !== undefined) addSet('is_active = ?', body.isActive ? 1 : 0);
if (body.stripePriceId !== undefined) addSet('stripe_price_id = ?', body.stripePriceId);
if (body.stripeProductId !== undefined) addSet('stripe_product_id = ?', body.stripeProductId);
if (body.collection !== undefined) addSet('collection = ?', body.collection);

const statement = context.env.DB.prepare(
  `UPDATE products SET ${sets.join(', ')} WHERE id = ?;`
).bind(...values, id);

// TODO: When Stripe is wired, sync updates to Stripe product/price as needed.
```

**Stripe behavior on update**

- There is **no Stripe API call** on update. No new Price is created, and no existing price is replaced.
- The comment explicitly states Stripe sync is TODO.

**Conclusion if `priceCents=NEW` is passed**

- `price_cents` is not updated because the update SQL does not include it.
- `stripe_price_id` stays unchanged unless explicitly passed.
- Stripe is not updated.

## Step 4 — Cart + checkout: where is the charged amount computed?

**Cart totals (client side)**

Path: `src/store/cartStore.ts`

```ts
getSubtotal: () => {
  return get().items.reduce((total, item) => total + (item.priceCents * item.quantity), 0);
},
```

**Checkout preview totals (client side)**

Path: `src/pages/CheckoutPage.tsx`

```tsx
const subtotalCents = useMemo(() => {
  if (cartItems.length) return cartSubtotal;
  return previewItems.reduce((sum, item) => sum + item.priceCents * (item.quantity || 1), 0);
}, [cartItems.length, cartSubtotal, previewItems]);
```

**Checkout session creation (server side)**

Path: `functions/api/checkout/create-session.ts`

- Requires `price_cents` **and** `stripe_price_id`.
- Uses Stripe Price ID to charge.

```ts
if (product.price_cents === null || product.price_cents === undefined) {
  return json({ error: `Product missing price: ${product.name || pid}` }, 400);
}
if (!product.stripe_price_id) {
  return json({ error: `Product missing Stripe price: ${product.name || pid}` }, 400);
}
...
lineItems.push({
  price: product.stripe_price_id,
  quantity,
});
subtotalCents += (product.price_cents ?? 0) * quantity;
```

**What happens if DB price changes but stripe_price_id stays the same?**

- Cart + checkout preview would show the new `price_cents` (if it were updated).
- Stripe Checkout would still charge the old Stripe Price because `line_items` uses `price: stripe_price_id`.

## Step 5 — Confirmation pages + emails

### Checkout return page (client)

Path: `src/pages/CheckoutReturnPage.tsx`

The UI uses the Stripe session endpoint’s line items and totals:

```tsx
session.lineItems
  .filter((item) => !item.isShipping)
  .map((item) => {
    const lineTotal = item.lineTotal;
    ...
  })
...
{formatCurrency(session.amountTotal, session.currency)}
```

The data comes from the Stripe session API response:

Path: `functions/api/checkout/session/[id].ts`

```ts
const lineTotal = li.amount_total ?? 0;
...
return json({
  amount_total: session.amount_total ?? 0,
  ...,
  line_items: lineItems,
});
```

**Source of truth:** Stripe line items and session totals.

### Order creation + emails (server)

Path: `functions/api/webhooks/stripe.ts`

Emails and order items are derived from Stripe line items:

```ts
const preparedLineItems =
  lineItemsOverride ||
  filterNonShippingLineItems(session.line_items?.data || []).map((line) => {
    const qty = line.quantity ?? 1;
    const priceCents = line.price?.unit_amount ?? 0;
    ...
    return { productId: resolvedProductId as string, quantity: qty, priceCents };
  });

INSERT INTO order_items (id, order_id, product_id, quantity, price_cents)
```

Customer and owner emails use Stripe line items:

```ts
const confirmationItems: OrderConfirmationEmailItem[] = (
  await mapLineItemsToEmailItems(env.DB, rawLineItems, session.currency || 'usd', imageBaseUrl)
).map((item) => ({
  ...
  lineTotal: item.amountCents || 0,
}));
```

**Source of truth:** Stripe line items (`amount_total` / `price.unit_amount`) and Stripe session totals. The DB is only used for image lookups and product metadata.

## Step 6 — Verdict

**1) If we enable editing price in the admin UI today, will checkout charge the NEW price?**

**NO.**

- The admin update endpoint ignores `priceCents` (`functions/api/admin/products/[id].ts`).
- Even if `price_cents` were updated, Stripe Checkout charges by `stripe_price_id`, which remains unchanged (`functions/api/checkout/create-session.ts`).

**2) If not, what specifically prevents it?**

- **Backend update route does not write `price_cents`.**
- **Checkout charges by `stripe_price_id`**, so Stripe would still use the old price unless a new Stripe Price is created and stored.

**3) Minimal change required to safely support editable prices**

Recommended:

- **Option A (best aligned with current flow):**
  - When price changes, create a new Stripe Price (`stripe.prices.create`) and update `products.stripe_price_id` and `products.price_cents` in D1.
  - This keeps Checkout charging via `price: stripe_price_id` while allowing price edits.

Alternative:

- **Option B:** switch checkout line items to `price_data.unit_amount` built from `price_cents`.
  - This would make Stripe charge the D1 price directly, but it removes a stable Stripe Price ID and can break product matching logic in the checkout session return + webhook code (which currently matches by `stripe_price_id` and `stripe_product_id`).

**4) Risks with existing orders, webhooks, or inventory if we change pricing**

- **Existing orders:** no change; historic Stripe sessions and order_items are immutable and already store amounts from Stripe.
- **Webhooks / confirmation pages:** current logic relies on Stripe line item prices. If you keep Stripe Price IDs updated (Option A), behavior remains stable.
- **If switching to `price_data` (Option B):**
  - Product lookup in `functions/api/checkout/session/[id].ts` may fail to match DB products (it matches by `stripe_price_id` / `stripe_product_id`).
  - Email image enrichment and one-off flags that depend on product lookup may degrade.

---

End of report.
