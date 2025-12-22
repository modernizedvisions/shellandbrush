import Stripe from 'stripe';

type D1PreparedStatement = {
  all<T>(): Promise<{ results: T[] }>;
  bind(...values: unknown[]): D1PreparedStatement;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type ProductRow = {
  id: string;
  name: string | null;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  image_url?: string | null;
  image_urls_json?: string | null;
  is_one_off?: number | null;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const createStripeClient = (secretKey: string) =>
  new Stripe(secretKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });

export const onRequestGet = async (context: {
  params: Record<string, string>;
  env: { STRIPE_SECRET_KEY?: string; DB?: D1Database };
}) => {
  const { params, env } = context;

  if (!env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not configured');
    return json({ error: 'Stripe is not configured' }, 500);
  }

  const sessionId = params?.id;
  if (!sessionId) {
    return json({ error: 'Missing session ID' }, 400);
  }

  try {
    const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: [
        'line_items.data.price.product',
        'payment_intent.payment_method',
        'payment_intent.charges.data.payment_method_details',
        'payment_intent.shipping',
      ],
    });

    const paymentIntent =
      session.payment_intent && typeof session.payment_intent !== 'string'
        ? session.payment_intent
        : null;

    const customerAddress = session.customer_details?.address || null;

    const shippingDetails =
      (session.shipping_details as Stripe.Checkout.Session.ShippingDetails | null) ||
      paymentIntent?.shipping ||
      (customerAddress
        ? {
            name: session.customer_details?.name ?? null,
            address: customerAddress,
          }
        : null);

    const shippingName =
      (shippingDetails as any)?.name ?? session.customer_details?.name ?? null;
    const shippingAddress =
      (shippingDetails as any)?.address ?? customerAddress ?? null;

    const firstCharge = paymentIntent?.charges?.data?.[0];
    const pmd = firstCharge?.payment_method_details as any;
    const cardFromCharges = pmd?.card || null;
    const walletType = cardFromCharges?.wallet?.type ?? null;

    const cardFromPaymentMethod =
      paymentIntent?.payment_method && typeof paymentIntent.payment_method !== 'string'
        ? (paymentIntent.payment_method as Stripe.PaymentMethod).card
        : null;

    const cardLast4 = cardFromCharges?.last4 ?? cardFromPaymentMethod?.last4 ?? null;
    const cardBrand = cardFromCharges?.brand ?? cardFromPaymentMethod?.brand ?? null;
    const paymentMethodType =
      walletType ||
      pmd?.type ||
      (paymentIntent?.payment_method_types && paymentIntent.payment_method_types[0]) ||
      null;

    const labelMap: Record<string, string> = {
      card: 'Card',
      link: 'Link',
      amazon_pay: 'Amazon Pay',
      apple_pay: 'Apple Pay',
      google_pay: 'Google Pay',
      paypal: 'PayPal',
      klarna: 'Klarna',
      afterpay_clearpay: 'Afterpay',
      affirm: 'Affirm',
    };
    const paymentMethodLabel =
      paymentMethodType && labelMap[paymentMethodType]
        ? labelMap[paymentMethodType]
        : paymentMethodType
        ? paymentMethodType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : null;

    const lineItemsRaw = session.line_items?.data ?? [];

    const stripeProductIds = lineItemsRaw
      .map((li) => {
        const priceProduct = li.price?.product;
        if (typeof priceProduct === 'string') return priceProduct;
        if (priceProduct && typeof priceProduct === 'object') return (priceProduct as Stripe.Product).id;
        return null;
      })
      .filter(Boolean) as string[];

    const stripePriceIds = lineItemsRaw
      .map((li) => (li.price && typeof li.price.id === 'string' ? li.price.id : null))
      .filter(Boolean) as string[];

    const productLookup = new Map<string, ProductRow>();
    if (env.DB && (stripeProductIds.length || stripePriceIds.length)) {
      const placeholdersProd = stripeProductIds.map(() => '?').join(',');
      const placeholdersPrice = stripePriceIds.map(() => '?').join(',');
      const whereClauses = [];
      const bindValues: unknown[] = [];
      if (placeholdersProd) {
        whereClauses.push(`stripe_product_id IN (${placeholdersProd})`);
        bindValues.push(...stripeProductIds);
      }
      if (placeholdersPrice) {
        whereClauses.push(`stripe_price_id IN (${placeholdersPrice})`);
        bindValues.push(...stripePriceIds);
      }
      try {
        const query = `
          SELECT id, name, stripe_product_id, stripe_price_id, image_url, image_urls_json, is_one_off
          FROM products
          WHERE ${whereClauses.join(' OR ')};
        `;
        const { results } = await env.DB.prepare(query).bind(...bindValues).all<ProductRow>();
        (results || []).forEach((row) => {
          if (row.stripe_product_id) productLookup.set(row.stripe_product_id, row);
          if (row.stripe_price_id) productLookup.set(row.stripe_price_id, row);
        });
      } catch (dbError) {
        console.error('Failed to lookup products for checkout session', dbError);
      }
    }

    const pickPrimaryImage = (row?: ProductRow | null): string | null => {
      if (!row) return null;
      if (row.image_url) return row.image_url;
      if (row.image_urls_json) {
        try {
          const parsed = JSON.parse(row.image_urls_json);
          if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === 'string') {
            return parsed[0];
          }
        } catch {
          // ignore parse errors
        }
      }
      return null;
    };

    let shippingAmount = 0;
    const lineItems =
      lineItemsRaw.map((li) => {
        const stripeProductId =
          typeof li.price?.product === 'string'
            ? li.price?.product
            : li.price?.product && typeof li.price.product === 'object'
            ? (li.price.product as Stripe.Product).id
            : null;
        const stripePriceId = typeof li.price?.id === 'string' ? li.price.id : null;
        const productName =
          (li.price?.product &&
            typeof li.price.product !== 'string' &&
            (li.price.product as Stripe.Product).name) ||
          li.description ||
          'Item';
        const keyMatch = stripeProductId && productLookup.get(stripeProductId);
        const priceMatch = !keyMatch && stripePriceId ? productLookup.get(stripePriceId) : null;
        const matchedProduct = keyMatch || priceMatch || null;
        const isShipping = /shipping/i.test(productName) && !matchedProduct;
        const lineTotal = li.amount_total ?? 0;
        if (isShipping) {
          shippingAmount += lineTotal;
        }
        return {
          productName,
          quantity: li.quantity ?? 0,
          lineTotal,
          imageUrl: pickPrimaryImage(matchedProduct),
          oneOff: matchedProduct ? matchedProduct.is_one_off === 1 : false,
          isShipping,
          stripeProductId,
        };
      }) ?? [];

    return json({
      id: session.id,
      amount_total: session.amount_total ?? 0,
      currency: session.currency ?? 'usd',
      customer_email: session.customer_details?.email ?? paymentIntent?.receipt_email ?? null,
      payment_method_type: paymentMethodType,
      payment_method_label: paymentMethodLabel,
      shipping: shippingAddress
        ? {
            name: shippingName,
            address: shippingAddress,
          }
        : null,
      line_items: lineItems,
      shipping_amount: shippingAmount,
      card_last4: cardLast4,
      card_brand: cardBrand,
    });
  } catch (error) {
    console.error('Error in checkout session endpoint', error);
    return json({ error: 'Failed to load checkout session' }, 500);
  }
};
