import Stripe from 'stripe';
import { sendEmail } from '../../_lib/email';
import {
  renderOrderConfirmationEmailHtml,
  renderOrderConfirmationEmailText,
  type OrderConfirmationEmailItem,
} from '../../_lib/orderConfirmationEmail';
import { renderOwnerInvoicePaidEmail, type EmailItem } from '../../_lib/emailTemplates';
import {
  formatMoney,
  renderOwnerNewSaleEmailHtml,
  renderOwnerNewSaleEmailText,
  type OwnerNewSaleItem,
} from '../../_lib/ownerNewSaleEmail';
import { getPublicImagesBaseUrl } from '../_lib/imageBaseUrl';
import { normalizePublicImageUrl, resolvePublicImageUrl } from '../_lib/imageUrls';
import {
  extractShippingCentsFromLineItems,
  filterNonShippingLineItems,
} from '../lib/shipping';

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type Env = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  DB: D1Database;
  EMAIL_OWNER_TO?: string;
  EMAIL_FROM?: string;
  RESEND_OWNER_TO?: string;
  RESEND_FROM?: string;
  RESEND_FROM_EMAIL?: string;
  RESEND_REPLY_TO?: string;
  RESEND_API_KEY?: string;
  PUBLIC_SITE_URL?: string;
  VITE_PUBLIC_SITE_URL?: string;
  PUBLIC_IMAGES_BASE_URL?: string;
  DEBUG_STRIPE_WEBHOOK?: string;
  EMAIL_DEBUG?: string;
};

const createStripeClient = (secretKey: string) =>
  new Stripe(secretKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const normalizeShippingLabel = (value?: string | null) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const isExactShippingLabel = (value?: string | null) => normalizeShippingLabel(value) === 'shipping';

const containsShippingLabel = (value?: string | null) =>
  normalizeShippingLabel(value).includes('shipping');

const getLineItemLabel = (line: Stripe.LineItem): string =>
  line.description ||
  ((line.price?.product && typeof line.price.product !== 'string'
    ? (line.price.product as Stripe.Product).name
    : null) as string | null) ||
  (line.price as any)?.product_data?.name ||
  (line.price as any)?.nickname ||
  '';

const getShippingMatchSignals = (line: Stripe.LineItem): string[] => {
  const signals: string[] = [];
  const lineMeta = (line.metadata as any) || {};
  if (isExactShippingLabel(lineMeta?.mv_line_type)) signals.push('line.metadata.mv_line_type');
  const priceMeta = (line.price as any)?.metadata || {};
  if (isExactShippingLabel(priceMeta?.mv_line_type)) signals.push('price.metadata.mv_line_type');
  const productMeta =
    line.price?.product && typeof line.price.product !== 'string'
      ? (line.price.product as Stripe.Product).metadata || {}
      : {};
  if (isExactShippingLabel((productMeta as any)?.mv_line_type)) signals.push('product.metadata.mv_line_type');
  if (containsShippingLabel(line.description || '')) signals.push('description');
  const priceNickname = (line.price as any)?.nickname;
  if (containsShippingLabel(priceNickname)) signals.push('price.nickname');
  const productName =
    line.price?.product && typeof line.price.product !== 'string'
      ? (line.price.product as Stripe.Product).name
      : null;
  if (isExactShippingLabel(productName)) signals.push('product.name');
  const productDataName = (line.price as any)?.product_data?.name;
  if (isExactShippingLabel(productDataName)) signals.push('price.product_data.name');
  return signals;
};

const isShippingLine = (lineItem: Stripe.LineItem) => getShippingMatchSignals(lineItem).length > 0;

const getLineItemTotalCents = (lineItem: Stripe.LineItem): number => {
  const quantity = lineItem.quantity ?? 1;
  const total = lineItem.amount_total ?? (lineItem.price?.unit_amount ?? 0) * quantity;
  return Math.round(Number(total || 0));
};

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
}) => {
  const { request, env } = context;
  const ownerTo = env.RESEND_OWNER_TO || env.EMAIL_OWNER_TO;
  const siteUrl = (env.PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const imageBaseUrl = getPublicImagesBaseUrl(env, request);
  const ok = () =>
    new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    console.error('Stripe secrets are not configured');
    return new Response('Stripe is not configured', { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;

  try {
    const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      cryptoProvider
    );
  } catch (error) {
    console.error('Stripe webhook signature verification failed', error);
    return new Response('Invalid signature', { status: 400 });
  }

  console.log('[stripe webhook] received event', { type: event.type, id: event.id });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
      const sessionSummary = event.data.object as Stripe.Checkout.Session;
      console.log('[stripe webhook] checkout.session.completed', { sessionId: sessionSummary.id });
      const stripeClient = createStripeClient(env.STRIPE_SECRET_KEY);
      const session = await stripeClient.checkout.sessions.retrieve(sessionSummary.id, {
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
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || null;

      const customerEmail = session.customer_details?.email || paymentIntent?.receipt_email || null;
      const shippingDetails = (session.shipping_details as Stripe.Checkout.Session.ShippingDetails | null) || paymentIntent?.shipping || null;
      const shippingName =
        shippingDetails?.name ||
        session.customer_details?.name ||
        null;
      const shippingAddress = shippingDetails?.address || null;

      const firstCharge = paymentIntent?.charges?.data?.[0];
      console.log(
        'PI first charge method details (safe)',
        JSON.stringify(
          firstCharge?.payment_method_details
            ? {
                type: firstCharge.payment_method_details.type,
                card:
                  firstCharge.payment_method_details.type === 'card'
                    ? {
                        brand: (firstCharge.payment_method_details as any).card?.brand ?? null,
                        last4: (firstCharge.payment_method_details as any).card?.last4 ?? null,
                      }
                    : undefined,
                us_bank_account:
                  firstCharge.payment_method_details.type === 'us_bank_account'
                    ? {
                        bank_name: (firstCharge.payment_method_details as any).us_bank_account?.bank_name ?? null,
                        last4: (firstCharge.payment_method_details as any).us_bank_account?.last4 ?? null,
                      }
                    : undefined,
              }
            : null,
          null,
          2
        )
      );

      let cardLast4: string | null = null;
      let cardBrand: string | null = null;

      if (paymentIntent?.charges?.data?.length) {
        const charge = paymentIntent.charges.data[0];
        const pmd = charge.payment_method_details as any;

        if (pmd?.card) {
          cardLast4 = pmd.card.last4 ?? null;
          cardBrand = pmd.card.brand ?? null;
        } else if (pmd?.link?.card) {
          // Link payment backed by a card
          cardLast4 = pmd.link.card.last4 ?? null;
          cardBrand = pmd.link.card.brand ?? null;
        } else if (pmd?.us_bank_account) {
          cardLast4 = pmd.us_bank_account.last4 ?? null;
          cardBrand = pmd.us_bank_account.bank_name ?? 'us_bank_account';
        }
      }

      if (!cardLast4 && paymentIntent?.payment_method && typeof paymentIntent.payment_method !== 'string') {
        const pm = paymentIntent.payment_method as Stripe.PaymentMethod;
        if (pm.card) {
          cardLast4 = pm.card.last4 ?? null;
          cardBrand = pm.card.brand ?? null;
        }
      }

      console.log('checkout.session.completed summary', {
        sessionId: session.id,
        email: customerEmail,
        shippingName,
        hasShippingAddress: !!shippingAddress,
        cardLast4,
        cardBrand,
      });

      const productId = session.metadata?.product_id;
      const quantityFromMeta = session.metadata?.quantity ? Number(session.metadata.quantity) : 1;

      const invoiceId = session.metadata?.invoiceId;
      const customOrderId = session.metadata?.customOrderId;
      const customSource = session.metadata?.source === 'custom_order';
      const rawLineItems = session.line_items?.data || [];
      const shippingCentsFromStripe = (session.total_details as any)?.amount_shipping ?? null;
      const amountShipping = Number(shippingCentsFromStripe);
      const hasStripeShipping = shippingCentsFromStripe !== null && shippingCentsFromStripe !== undefined;
      const shippingFromLineItems = extractShippingCentsFromLineItems(rawLineItems);
      const shippingFromMetadataRaw = (session.metadata as any)?.shipping_cents ?? null;
      const shippingFromMetadata = Number(shippingFromMetadataRaw);
      const inferredShipping =
        hasStripeShipping && Number.isFinite(amountShipping)
          ? amountShipping
          : shippingFromLineItems > 0
          ? shippingFromLineItems
          : Number.isFinite(shippingFromMetadata)
          ? shippingFromMetadata
          : 0;
      const shippingCents = Number.isFinite(inferredShipping) ? Math.max(0, Number(inferredShipping)) : 0;
      const debugStripeWebhook = !!(env.DEBUG_STRIPE_WEBHOOK || env.EMAIL_DEBUG);

      const shippingSignalMatches = rawLineItems
        .map((line) => {
          const signals = getShippingMatchSignals(line);
          if (!signals.length) return null;
          return {
            name: getLineItemLabel(line),
            signals,
          };
        })
        .filter(Boolean) as { name: string; signals: string[] }[];

      const shippingLineItems = rawLineItems.filter(isShippingLine);
      const nonShippingLineItems = rawLineItems.filter((line) => !isShippingLine(line));
      const itemsSubtotalFromLines = nonShippingLineItems.reduce(
        (sum, line) => sum + getLineItemTotalCents(line),
        0
      );
      const shippingFromLines = shippingLineItems.reduce(
        (sum, line) => sum + getLineItemTotalCents(line),
        0
      );
      const amountShippingFromStripe = (session.total_details as any)?.amount_shipping;
      const amountShippingStripe = Number(amountShippingFromStripe);
      const hasAmountShipping =
        amountShippingFromStripe !== null &&
        amountShippingFromStripe !== undefined &&
        Number.isFinite(amountShippingStripe);
      const shippingCentsForEmail =
        hasAmountShipping && (amountShippingStripe > 0 || shippingFromLines === 0)
          ? Math.max(0, amountShippingStripe)
          : shippingFromLines;
      const totalCentsForEmail =
        session.amount_total ?? itemsSubtotalFromLines + shippingCentsForEmail;
      const itemsSubtotalCents =
        nonShippingLineItems.length > 0
          ? itemsSubtotalFromLines
          : session.amount_subtotal ?? Math.max(0, totalCentsForEmail - shippingCentsForEmail);
      const isShopOrder = !invoiceId && !customOrderId && !customSource;
      const promoCodeRaw = (session.metadata as any)?.mv_promo_code ?? null;
      const promoSourceRaw = (session.metadata as any)?.mv_promo_source ?? null;
      const promoPercentRaw = (session.metadata as any)?.mv_percent_off_applied ?? null;
      const promoFreeShippingRaw = (session.metadata as any)?.mv_free_shipping_applied ?? null;
      const hasPromoMetadata = !!(promoCodeRaw || promoSourceRaw);
      const promoCode = typeof promoCodeRaw === 'string' && promoCodeRaw.trim() ? promoCodeRaw.trim() : null;
      const promoSource = typeof promoSourceRaw === 'string' && promoSourceRaw.trim() ? promoSourceRaw.trim() : null;
      const promoPercentParsed = Number(promoPercentRaw);
      const promoPercentOff =
        Number.isFinite(promoPercentParsed) && promoPercentParsed >= 0
          ? Math.round(promoPercentParsed)
          : null;
      const promoFreeShipping =
        promoFreeShippingRaw === '1' || promoFreeShippingRaw === 1 || promoFreeShippingRaw === true ? 1 : 0;
      const shippingAddressText = formatShippingAddress(shippingAddress);
      const billingAddressText = formatShippingAddress(firstCharge?.billing_details?.address || null);
      const paymentMethodLabel = formatPaymentMethodLabel(cardBrand, cardLast4);

      if (debugStripeWebhook && (customOrderId || customSource)) {
        const lineItems = rawLineItems.map((line) => {
          const productObj =
            line.price?.product && typeof line.price.product !== 'string'
              ? (line.price.product as Stripe.Product)
              : null;
          const mvLineType =
            (line.metadata as any)?.mv_line_type ||
            (line.price as any)?.metadata?.mv_line_type ||
            productObj?.metadata?.mv_line_type ||
            null;
          const label =
            line.description ||
            productObj?.name ||
            (line.price as any)?.product_data?.name ||
            '';
          return {
            name: label,
            amount_total: line.amount_total ?? null,
            mv_line_type: mvLineType,
          };
        });
        const subtotalFromLines = rawLineItems.reduce((sum, line) => {
          if (isShippingLine(line)) return sum;
          return sum + getLineItemTotalCents(line);
        }, 0);
        const shippingFromLineItems = rawLineItems.reduce((sum, line) => {
          if (!isShippingLine(line)) return sum;
          return sum + getLineItemTotalCents(line);
        }, 0);
        console.log('[stripe webhook] custom order shipping debug', {
          sessionId: session.id,
          customOrderId,
          lineItems,
          subtotalCents: subtotalFromLines,
          shippingCents: shippingFromLineItems,
          totalCents: subtotalFromLines + shippingFromLineItems,
        });
      }

      if (debugStripeWebhook) {
        console.log('[stripe webhook] email totals debug', {
          sessionId: session.id,
          amount_subtotal: session.amount_subtotal ?? null,
          amount_total: session.amount_total ?? null,
          amount_shipping: (session.total_details as any)?.amount_shipping ?? null,
          itemsSubtotalCents,
          shippingCents: shippingCentsForEmail,
          totalCents: totalCentsForEmail,
          shippingLineCount: shippingLineItems.length,
          shippingSignals: shippingSignalMatches,
        });
        if (isShopOrder) {
          console.log('[stripe webhook] shop order debug', {
            sessionId: session.id,
            paymentIntentId,
            customerEmail,
            amount_total: session.amount_total ?? null,
            metadata: session.metadata || {},
          });
        }
      }

      if (invoiceId) {
        await handleCustomInvoicePayment({
          db: env.DB,
          env,
          session,
          paymentIntentId,
          amountTotal: session.amount_total ?? 0,
          currency: session.currency || 'usd',
          customerEmail,
        });
      } else if (customOrderId || customSource) {
        await handleCustomOrderPayment({
          db: env.DB,
          env,
          session,
          paymentIntentId,
          customerEmail,
          shippingName,
          shippingAddress,
          cardLast4,
          cardBrand,
          shippingCents,
        });
      } else {
        // Update inventory for all line items (skip shipping)
        const lineItems = rawLineItems;
        const aggregate: Record<string, number> = {};
        for (const line of lineItems) {
          if (isShippingLine(line)) continue;
          const productIdFromPrice =
            typeof line.price?.product === 'string'
              ? line.price.product
              : (line.price?.product as Stripe.Product | undefined)?.id;
          const key = productIdFromPrice || (typeof line.price?.id === 'string' ? line.price.id : null) || productId || 'unknown';
          const qty = line.quantity ?? 1;
          if (!key) continue;
          aggregate[key] = (aggregate[key] || 0) + qty;
        }

        for (const [key, qty] of Object.entries(aggregate)) {
          const updateResult = await env.DB.prepare(
            `
            UPDATE products
            SET
              quantity_available = CASE
                WHEN quantity_available IS NULL THEN 0
                WHEN quantity_available > ? THEN quantity_available - ?
                ELSE 0
              END,
              is_sold = CASE
                WHEN quantity_available IS NULL THEN 1
                WHEN quantity_available <= ? THEN 1
                ELSE is_sold
              END
            WHERE stripe_product_id = ? OR id = ?;
          `
          )
            .bind(qty, qty, qty, key, key)
            .run();

          if (!updateResult.success) {
            console.error('Failed to update product as sold', { key, error: updateResult.error });
          }
        }
      }

      const insertResult = await insertStandardOrderAndItems({
        db: env.DB,
        session,
        paymentIntentId,
        customerEmail,
        shippingName,
        shippingAddress,
        cardLast4,
        cardBrand,
        shippingCents,
        promoCode: hasPromoMetadata ? promoCode : null,
        promoPercentOff: hasPromoMetadata ? (promoPercentOff ?? 0) : null,
        promoFreeShipping: hasPromoMetadata ? promoFreeShipping : null,
        promoSource: hasPromoMetadata ? promoSource : null,
        productId,
        quantityFromMeta,
      });

      if (insertResult && customerEmail) {
        const confirmationItems: OrderConfirmationEmailItem[] = (
          await mapLineItemsToEmailItems(env.DB, rawLineItems, session.currency || 'usd', imageBaseUrl)
        ).map((item) => ({
          name: item.name,
          qty: item.quantity,
          unitAmount:
            item.quantity && item.quantity > 0
              ? Math.round((item.amountCents || 0) / item.quantity)
              : item.amountCents || 0,
          lineTotal: item.amountCents || 0,
          imageUrl: item.imageUrl || undefined,
        }));

        const totalsForEmail = {
          subtotalCents: itemsSubtotalCents,
          shippingCents: shippingCentsForEmail,
          totalCents: totalCentsForEmail,
        };
        console.log('[email totals raw]', {
          kind: 'shop_customer',
          orderId: insertResult.orderId,
          displayOrderId: insertResult.displayOrderId,
          subtotalCents: totalsForEmail.subtotalCents,
          shippingCents: totalsForEmail.shippingCents,
          totalCents: totalsForEmail.totalCents,
        });

        const confirmationUrl =
          siteUrl ? `${siteUrl}/checkout/return?session_id=${session.id}` : `/checkout/return?session_id=${session.id}`;
        const orderLabel = insertResult.displayOrderId || insertResult.orderId;
        const orderDate = formatOrderDate(new Date());
        try {
          const html = renderOrderConfirmationEmailHtml({
            brandName: 'Shell & Brush',
            orderNumber: orderLabel,
            orderDate,
            customerName: shippingName || session.customer_details?.name || null,
            customerEmail: customerEmail || undefined,
            shippingAddress: shippingAddressText || undefined,
            billingAddress: billingAddressText || undefined,
            paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totalsForEmail.subtotalCents,
            shipping: totalsForEmail.shippingCents,
            total: totalsForEmail.totalCents,
            primaryCtaUrl: confirmationUrl,
            primaryCtaLabel: 'View Order Details',
          });
          const text = renderOrderConfirmationEmailText({
            brandName: 'Shell & Brush',
            orderNumber: orderLabel,
            orderDate,
            customerName: shippingName || session.customer_details?.name || null,
            customerEmail: customerEmail || undefined,
            shippingAddress: shippingAddressText || undefined,
            billingAddress: billingAddressText || undefined,
            paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totalsForEmail.subtotalCents,
            shipping: totalsForEmail.shippingCents,
            total: totalsForEmail.totalCents,
            primaryCtaUrl: confirmationUrl,
            primaryCtaLabel: 'View Order Details',
          });

        const emailResult = await sendEmail(
          {
            to: customerEmail,
            subject: `Shell & Brush - Order Confirmed (${orderLabel})`,
            html,
            text,
          },
          env
        );
        if (!emailResult.ok) {
          console.error('[stripe webhook] customer confirmation email failed', emailResult.error);
        }
      } catch (emailError) {
        console.error('[stripe webhook] customer confirmation email error', emailError);
      }
    }

      if (!ownerTo) {
        console.warn('[stripe webhook] owner email missing; skipping receipt email');
        return new Response('ok', { status: 200 });
      }

      if (isShopOrder) {
        const orderLabel = insertResult?.displayOrderId || insertResult?.orderId || session.id;
        const confirmationItems: OwnerNewSaleItem[] = (
          await mapLineItemsToEmailItems(env.DB, rawLineItems, session.currency || 'usd', imageBaseUrl)
        ).map((item) => ({
          name: item.name,
          qtyLabel: item.quantity > 1 ? `x${item.quantity}` : '',
          lineTotal: formatMoney(item.amountCents),
          imageUrl: item.imageUrl || undefined,
        }));

        const totalsForEmail = {
          subtotalCents: itemsSubtotalCents,
          shippingCents: shippingCentsForEmail,
          totalCents: totalCentsForEmail,
        };
        console.log('[email totals raw]', {
          kind: 'shop_owner',
          orderId: insertResult.orderId,
          displayOrderId: insertResult.displayOrderId,
          subtotalCents: totalsForEmail.subtotalCents,
          shippingCents: totalsForEmail.shippingCents,
          totalCents: totalsForEmail.totalCents,
        });
        const totals = {
          subtotal: formatMoney(totalsForEmail.subtotalCents),
          shipping: formatMoney(totalsForEmail.shippingCents),
          total: formatMoney(totalsForEmail.totalCents),
        };
        const adminUrl = siteUrl ? `${siteUrl}/admin` : '/admin';
        const stripeUrl = buildStripeDashboardUrl(paymentIntentId, session.id, env.STRIPE_SECRET_KEY);
        const orderDate = formatOrderDate(new Date());

        try {
          if (debugStripeWebhook) {
            console.log('[stripe webhook] owner email send start', {
              sessionId: session.id,
              orderLabel,
              ownerTo,
              htmlLen: undefined,
              textLen: undefined,
            });
          }
          const html = renderOwnerNewSaleEmailHtml({
            orderNumber: orderLabel,
            orderDate,
            orderTypeLabel: 'Shop Order',
            statusLabel: 'PAID',
            customerName: shippingName || session.customer_details?.name || 'Customer',
            customerEmail: customerEmail || '',
            shippingAddress: shippingAddressText || undefined,
            billingAddress: billingAddressText || undefined,
            paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totals.subtotal,
            shipping: totals.shipping,
            total: totals.total,
            adminUrl,
            stripeUrl,
          });
          const text = renderOwnerNewSaleEmailText({
            orderNumber: orderLabel,
            orderDate,
            orderTypeLabel: 'Shop Order',
            statusLabel: 'PAID',
            customerName: shippingName || session.customer_details?.name || 'Customer',
            customerEmail: customerEmail || '',
            shippingAddress: shippingAddressText || undefined,
            billingAddress: billingAddressText || undefined,
            paymentMethod: paymentMethodLabel,
            items: confirmationItems,
            subtotal: totals.subtotal,
            shipping: totals.shipping,
            total: totals.total,
            adminUrl,
            stripeUrl,
          });

          if (debugStripeWebhook) {
            console.log('[stripe webhook] owner email payload', {
              sessionId: session.id,
              orderLabel,
              ownerTo,
              subject: `NEW SALE - Shell & Brush (${orderLabel})`,
              htmlLen: html.length,
              textLen: text.length,
            });
          }
          const emailResult = await sendEmail(
            {
              to: ownerTo,
              subject: `NEW SALE - Shell & Brush (${orderLabel})`,
              html,
              text,
            },
            env
          );
          if (debugStripeWebhook) {
            console.log('[stripe webhook] owner email send result', {
              sessionId: session.id,
              orderLabel,
              ok: emailResult.ok,
              error: emailResult.ok ? undefined : emailResult.error,
            });
          }
          if (!emailResult.ok) {
            console.error('[stripe webhook] owner receipt email failed', emailResult.error);
          }
        } catch (emailError) {
          console.error('[stripe webhook] owner receipt email error', emailError);
        }
      }
        break;
      }
      case 'checkout.session.expired': {
        const sessionId = (event.data.object as { id?: string | null })?.id ?? null;
        console.log('[stripe webhook] checkout.session.expired', { eventId: event.id, sessionId });
        return ok();
      }
      case 'payment_intent.succeeded': {
        const paymentIntentId = (event.data.object as { id?: string | null })?.id ?? null;
        console.log('[stripe webhook] payment_intent.succeeded', { eventId: event.id, paymentIntentId });
        return ok();
      }
      case 'payment_intent.payment_failed': {
        const paymentIntentId = (event.data.object as { id?: string | null })?.id ?? null;
        console.log('[stripe webhook] payment_intent.payment_failed', { eventId: event.id, paymentIntentId });
        return ok();
      }
      default: {
        console.log('[stripe webhook] ignored event type', { eventType: event.type, eventId: event.id });
        return ok();
      }
    }

    return new Response('ok', { status: 200 });
  } catch (error) {
    console.error('Error handling Stripe webhook', error);
    return new Response('Webhook handling failed', { status: 500 });
  }
};

async function ensureOrdersSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    display_order_id TEXT,
    order_type TEXT,
    stripe_payment_intent_id TEXT,
    total_cents INTEGER,
    currency TEXT,
    customer_email TEXT,
    shipping_name TEXT,
    shipping_address_json TEXT,
    card_last4 TEXT,
    card_brand TEXT,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    product_id TEXT,
    quantity INTEGER,
    price_cents INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS order_counters (
    year INTEGER PRIMARY KEY,
    counter INTEGER NOT NULL
  );`).run();

  const columns = await db.prepare(`PRAGMA table_info(orders);`).all<{ name: string }>();
  const columnNames = (columns.results || []).map((c) => c.name);
  const addColumnIfMissing = async (name: string, ddl: string) => {
    if (!columnNames.includes(name)) {
      await db.prepare(ddl).run();
    }
  };

  await addColumnIfMissing('display_order_id', `ALTER TABLE orders ADD COLUMN display_order_id TEXT;`);
  await addColumnIfMissing('order_type', `ALTER TABLE orders ADD COLUMN order_type TEXT;`);
  await addColumnIfMissing('currency', `ALTER TABLE orders ADD COLUMN currency TEXT;`);
  await addColumnIfMissing('description', `ALTER TABLE orders ADD COLUMN description TEXT;`);
  await addColumnIfMissing('promo_code', `ALTER TABLE orders ADD COLUMN promo_code TEXT;`);
  await addColumnIfMissing('promo_percent_off', `ALTER TABLE orders ADD COLUMN promo_percent_off INTEGER;`);
  await addColumnIfMissing('promo_free_shipping', `ALTER TABLE orders ADD COLUMN promo_free_shipping INTEGER;`);
  await addColumnIfMissing('promo_source', `ALTER TABLE orders ADD COLUMN promo_source TEXT;`);

  await db
    .prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_display_order_id ON orders(display_order_id);`
    )
    .run();

  await backfillDisplayOrderIds(db);
}

async function generateDisplayOrderId(db: D1Database): Promise<string> {
  const yearFull = new Date().getFullYear();
  const yy = yearFull % 100;
  let counter = 1;
  try {
    const counterRow = await db
      .prepare(
        `INSERT INTO order_counters (year, counter)
         VALUES (?, 1)
         ON CONFLICT(year) DO UPDATE SET counter = counter + 1
         RETURNING counter;`
      )
      .bind(yearFull)
      .first<{ counter: number }>();

    if (!counterRow || typeof counterRow.counter !== 'number') {
      throw new Error('counter missing');
    }
    counter = counterRow.counter;
  } catch (err) {
    console.error('[stripe webhook] counter upsert failed, falling back', err);
    const existing = await db
      .prepare(`SELECT counter FROM order_counters WHERE year = ?`)
      .bind(yearFull)
      .first<{ counter: number }>();
    counter = existing?.counter ? existing.counter + 1 : 1;
    const res = existing
      ? await db.prepare(`UPDATE order_counters SET counter = ? WHERE year = ?`).bind(counter, yearFull).run()
      : await db.prepare(`INSERT INTO order_counters (year, counter) VALUES (?, ?)`).bind(yearFull, counter).run();
    if (!res.success) {
      throw new Error('Failed to update order counter');
    }
  }

  const padded = String(counter).padStart(3, '0');
  return `${yy}-${padded}`;
}

async function assertOrdersTables(db: D1Database) {
  const tables = await db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('orders','order_items','order_counters');`
    )
    .all<{ name: string }>();
  const existing = new Set((tables.results || []).map((t) => t.name));
  const missing = ['orders', 'order_items', 'order_counters'].filter((t) => !existing.has(t));
  if (missing.length) {
    const message = `Missing required tables: ${missing.join(', ')}`;
    console.error('[stripe webhook] schema missing', message);
    throw new Error(message);
  }
}

async function ensureShippingColumn(db: D1Database) {
  const columns = await db.prepare(`PRAGMA table_info(orders);`).all<{ name: string }>();
  const columnNames = new Set((columns.results || []).map((c) => c.name));
  if (!columnNames.has('shipping_cents')) {
    try {
      await db.prepare(`ALTER TABLE orders ADD COLUMN shipping_cents INTEGER DEFAULT 0;`).run();
      console.log('[stripe webhook] added shipping_cents column to orders');
    } catch (err) {
      console.error('[stripe webhook] failed to add shipping_cents column', err);
      // Continue; insert attempts will surface errors if column truly missing.
    }
  }
}

async function handleCustomInvoicePayment(args: {
  db: D1Database;
  env: Env;
  session: Stripe.Checkout.Session;
  paymentIntentId: string | null;
  amountTotal: number;
  currency: string;
  customerEmail: string | null;
}) {
  const { db, env, session, paymentIntentId, amountTotal, currency, customerEmail } = args;
  const invoiceId = session.metadata?.invoiceId;
  if (!invoiceId) return;

  // Update invoice status
  const now = new Date().toISOString();
  const update = await db
    .prepare(
      `UPDATE custom_invoices
       SET status = 'paid',
           paid_at = ?,
           stripe_payment_intent_id = ?
       WHERE id = ?;`
    )
    .bind(now, paymentIntentId, invoiceId)
    .run();

  if (!update.success) {
    console.error('[webhooks] Failed to mark custom invoice paid', update.error);
  }

  // Insert order record (must succeed to return 200)
  await assertOrdersTables(db);
  const orderId = crypto.randomUUID();
  const displayOrderId = await generateDisplayOrderId(db);
  const description = session.metadata?.description || 'Custom invoice payment';
  const amountCents = amountTotal ?? 0;
  const email = customerEmail || session.customer_details?.email || null;
  const shippingCents = Number((session.total_details as any)?.amount_shipping ?? 0) || 0;

  await ensureShippingColumn(db);
  let inserted = await db
    .prepare(
      `INSERT INTO orders (
        id, display_order_id, order_type, stripe_payment_intent_id, total_cents, currency, customer_email, shipping_name, shipping_address_json, card_last4, card_brand, description, shipping_cents
      ) VALUES (?, ?, 'custom', ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?);`
    )
    .bind(orderId, displayOrderId, paymentIntentId, amountCents, currency, email, description, shippingCents)
    .run();

  if (!inserted.success && inserted.error?.includes('no such column')) {
    inserted = await db
      .prepare(
        `INSERT INTO orders (
          id, display_order_id, stripe_payment_intent_id, total_cents, customer_email, shipping_cents
        ) VALUES (?, ?, ?, ?, ?, ?);`
      )
      .bind(orderId, displayOrderId, paymentIntentId, amountCents, email, shippingCents)
      .run();
  }

  if (!inserted.success) {
    throw new Error('[webhooks] Failed to insert custom order record');
  }

  // Send emails (best effort)
  const invoiceAmount = formatAmount(amountTotal, currency);
  const siteUrl = (env.PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  const invoiceLink = siteUrl ? `${siteUrl}/invoice/${invoiceId}` : `/invoice/${invoiceId}`;

  if (customerEmail) {
    try {
      const emailResult = await sendEmail(
        {
          to: customerEmail,
          subject: 'Payment received - The Chesapeake Shell',
          html: `
            <div style="font-family: Inter, Arial, sans-serif; color: #0f172a; padding: 12px; line-height: 1.5;">
              <h2 style="margin: 0 0 12px; font-size: 18px; font-weight: 700;">Thank you for your payment</h2>
              <p style="margin: 0 0 8px;">We received your payment for invoice ${invoiceId}.</p>
              <p style="margin: 0 0 12px; font-weight: 600;">Amount: ${invoiceAmount}</p>
              <p style="margin: 0 0 12px;">You can revisit your invoice here: <a href="${invoiceLink}" style="color:#0f172a;">${invoiceLink}</a></p>
            </div>
          `,
          text: `Thank you for your payment.\nInvoice: ${invoiceId}\nAmount: ${invoiceAmount}\nView invoice: ${invoiceLink}`,
        },
        env
      );
      if (!emailResult.ok) {
        console.error('[custom invoice] customer email failed', emailResult.error);
      }
    } catch (emailError) {
      console.error('[custom invoice] customer email error', emailError);
    }
  }

  const ownerTo = env.RESEND_OWNER_TO || env.EMAIL_OWNER_TO;
  if (!ownerTo) {
    console.warn('[custom invoice] owner email missing; skipping receipt email');
    return;
  }

  const subtotalCents = Math.max(0, amountTotal - shippingCents);
  const emailItems: EmailItem[] =
    (session.line_items?.data || [])
      .filter((line) => {
        const desc = line.description || (line.price as any)?.product_data?.name || '';
        return !desc.toLowerCase().includes('shipping');
      })
      .map((line) => {
        const name =
          line.description ||
          (line.price?.product && typeof line.price.product !== 'string'
            ? (line.price.product as Stripe.Product).name
            : null) ||
          'Invoice item';
        const imageUrl =
          (line.price?.product && typeof line.price.product !== 'string'
            ? (line.price.product as Stripe.Product).images?.[0]
            : null) ||
          (line.price as any)?.product_data?.images?.[0] ||
          null;
        return {
          name,
          quantity: line.quantity ?? 1,
          amountCents: line.amount_total ?? 0,
          imageUrl,
        } as EmailItem;
      });

  if (!emailItems.length) {
    emailItems.push({
      name: description || 'Invoice payment',
      quantity: 1,
      amountCents: subtotalCents || amountTotal,
      imageUrl: null,
    });
  }

  const emailPayload = renderOwnerInvoicePaidEmail({
    invoiceId,
    orderLabel: displayOrderId,
    customerName: session.customer_details?.name || null,
    customerEmail: customerEmail || null,
    shippingAddress: session.shipping_details || null,
    items: emailItems,
    amounts: {
      subtotalCents,
      shippingCents,
      totalCents: amountTotal,
      currency,
    },
    createdAtIso: now,
    adminUrl: siteUrl ? `${siteUrl}/admin` : undefined,
    description,
  });

  try {
    const emailResult = await sendEmail(
      {
        to: ownerTo,
        subject: emailPayload.subject,
        html: emailPayload.html,
        text: emailPayload.text,
      },
      env
    );
    if (!emailResult.ok) {
      console.error('[custom invoice] owner email failed', emailResult.error);
    }
  } catch (emailError) {
    console.error('[custom invoice] owner email error', emailError);
  }
}

function formatAmount(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format((amountCents || 0) / 100);
  } catch {
    return `$${((amountCents || 0) / 100).toFixed(2)} ${currency}`;
  }
}

async function backfillDisplayOrderIds(db: D1Database) {
  const missing = await db
    .prepare(
      `SELECT id, created_at FROM orders WHERE display_order_id IS NULL OR display_order_id = '' ORDER BY datetime(created_at) ASC`
    )
    .all<{ id: string; created_at: string }>();

  const rows = missing.results || [];
  if (!rows.length) return;

  const countersByYear = new Map<number, number>();
  const existingCounters = await db.prepare(`SELECT year, counter FROM order_counters`).all<{ year: number; counter: number }>();
  (existingCounters.results || []).forEach((row) => countersByYear.set(row.year, row.counter));

  await db.prepare('BEGIN IMMEDIATE TRANSACTION;').run();
  try {
    for (const row of rows) {
      const yearFull = row.created_at ? new Date(row.created_at).getFullYear() : new Date().getFullYear();
      const year = yearFull % 100;
      const current = countersByYear.get(year) ?? 0;
      const next = current + 1;
      countersByYear.set(year, next);
      const padded = String(next).padStart(3, '0');
      const displayId = `${year}-${padded}`;

      await db.prepare(`UPDATE orders SET display_order_id = ? WHERE id = ?`).bind(displayId, row.id).run();
    }

    for (const [year, counter] of countersByYear.entries()) {
      const existing = await db
        .prepare(`SELECT counter FROM order_counters WHERE year = ?`)
        .bind(year)
        .first<{ counter: number }>();
      if (existing) {
        await db.prepare(`UPDATE order_counters SET counter = ? WHERE year = ?`).bind(counter, year).run();
      } else {
        await db.prepare(`INSERT INTO order_counters (year, counter) VALUES (?, ?)`).bind(year, counter).run();
      }
    }

    await db.prepare('COMMIT;').run();
  } catch (error) {
    console.error('Failed to backfill display order ids', error);
    await db.prepare('ROLLBACK;').run();
    throw error;
  }
}

async function ensureCustomOrdersSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS custom_orders (
    id TEXT PRIMARY KEY,
    display_custom_order_id TEXT,
    customer_name TEXT,
    customer_email TEXT,
    description TEXT,
    amount INTEGER,
    message_id TEXT,
    status TEXT DEFAULT 'pending',
    payment_link TEXT,
    stripe_session_id TEXT,
    stripe_payment_intent_id TEXT,
    paid_at TEXT,
    image_url TEXT,
    image_key TEXT,
    image_updated_at TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`).run();

  const columns = await db.prepare(`PRAGMA table_info(custom_orders);`).all<{ name: string }>();
  const names = (columns.results || []).map((c) => c.name);
  if (!names.includes('display_custom_order_id')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN display_custom_order_id TEXT;`).run();
  }
  if (!names.includes('stripe_session_id')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN stripe_session_id TEXT;`).run();
  }
  if (!names.includes('stripe_payment_intent_id')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN stripe_payment_intent_id TEXT;`).run();
  }
  if (!names.includes('paid_at')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN paid_at TEXT;`).run();
  }
  if (!names.includes('image_url')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN image_url TEXT;`).run();
  }
  if (!names.includes('image_key')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN image_key TEXT;`).run();
  }
  if (!names.includes('image_updated_at')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN image_updated_at TEXT;`).run();
  }
  if (!names.includes('shipping_cents')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN shipping_cents INTEGER DEFAULT 0;`).run();
  }
  if (!names.includes('archived')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;`).run();
  }
  if (!names.includes('archived_at')) {
    await db.prepare(`ALTER TABLE custom_orders ADD COLUMN archived_at TEXT;`).run();
  }
  const shippingCols = [
    'shipping_name',
    'shipping_line1',
    'shipping_line2',
    'shipping_city',
    'shipping_state',
    'shipping_postal_code',
    'shipping_country',
    'shipping_phone',
  ];
  for (const col of shippingCols) {
    if (!names.includes(col)) {
      try {
        await db.prepare(`ALTER TABLE custom_orders ADD COLUMN ${col} TEXT;`).run();
      } catch (err) {
        const msg = (err as any)?.message || '';
        if (!/duplicate column|already exists/i.test(msg)) {
          console.error('[webhooks] failed to add custom_orders column', { col, msg });
        }
      }
    }
  }
}

async function ensurePromoColumns(db: D1Database) {
  const columns = await db.prepare(`PRAGMA table_info(orders);`).all<{ name: string }>();
  const columnNames = new Set((columns.results || []).map((c) => c.name));
  const addColumn = async (name: string, ddl: string) => {
    if (columnNames.has(name)) return;
    try {
      await db.prepare(ddl).run();
      console.log('[stripe webhook] added', name, 'column to orders');
    } catch (err) {
      console.error('[stripe webhook] failed to add', name, 'column', err);
    }
  };
  await addColumn('promo_code', `ALTER TABLE orders ADD COLUMN promo_code TEXT;`);
  await addColumn('promo_percent_off', `ALTER TABLE orders ADD COLUMN promo_percent_off INTEGER;`);
  await addColumn('promo_free_shipping', `ALTER TABLE orders ADD COLUMN promo_free_shipping INTEGER;`);
  await addColumn('promo_source', `ALTER TABLE orders ADD COLUMN promo_source TEXT;`);
}

async function ensureGalleryItemsSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS gallery_items (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    status TEXT NOT NULL,
    image_url TEXT,
    title TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sold_at TEXT
  );`).run();

  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_items_source ON gallery_items(source_type, source_id);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_gallery_items_status ON gallery_items(status);`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_gallery_items_created_at ON gallery_items(created_at);`).run();
}

async function upsertCustomOrderGalleryItem(
  db: D1Database,
  args: { customOrderId: string; displayId: string; imageUrl: string | null; soldAt: string }
) {
  await ensureGalleryItemsSchema(db);
  const title = `Custom Order ${args.displayId}`;
  const hidden = args.imageUrl ? 0 : 1;
  await db
    .prepare(
      `INSERT INTO gallery_items (
         id, source_type, source_id, status, image_url, title, hidden, created_at, sold_at
       ) VALUES (?, 'custom_order', ?, 'sold', ?, ?, ?, ?, ?)
       ON CONFLICT(source_type, source_id) DO UPDATE SET
         status = 'sold',
         image_url = excluded.image_url,
         title = COALESCE(excluded.title, gallery_items.title),
         hidden = excluded.hidden,
         sold_at = COALESCE(gallery_items.sold_at, excluded.sold_at)`
    )
    .bind(crypto.randomUUID(), args.customOrderId, args.imageUrl, title, hidden, args.soldAt, args.soldAt)
    .run();
}

async function mapLineItemsToEmailItems(
  db: D1Database,
  lineItems: Stripe.LineItem[],
  currency: string,
  imageBaseUrl: string
): Promise<EmailItem[]> {
  const productIds = filterNonShippingLineItems(lineItems)
    .map((line) => {
      if (typeof line.price?.product === 'string') return line.price.product;
      if (line.price?.product && typeof line.price.product !== 'string') {
        return (line.price.product as Stripe.Product).id;
      }
      return null;
    })
    .filter(Boolean) as string[];
  const productImageMap = await buildProductImageMap(db, productIds, imageBaseUrl);

  return filterNonShippingLineItems(lineItems).map((line) => {
    const productObj =
      line.price?.product && typeof line.price.product !== 'string'
        ? (line.price.product as Stripe.Product)
        : null;
    const name =
      line.description ||
      productObj?.name ||
      (line.price as any)?.product_data?.name ||
      'Item';
    const productId =
      typeof line.price?.product === 'string'
        ? line.price.product
        : productObj?.id || null;
    const stripeImageUrl =
      productObj?.images?.[0] ||
      (line.price as any)?.product_data?.images?.[0] ||
      null;
    const imageUrl =
      (productId ? productImageMap.get(productId) || null : null) ||
      resolveCandidateImageUrl(stripeImageUrl, imageBaseUrl);
    return {
      name,
      quantity: line.quantity ?? 1,
      amountCents: line.amount_total ?? (line.price?.unit_amount ?? 0) * (line.quantity ?? 1),
      imageUrl,
    } as EmailItem;
  });
}

type ProductImageRow = {
  id: string;
  stripe_product_id?: string | null;
  image_url?: string | null;
  image_urls_json?: string | null;
  primary_image_id?: string | null;
  image_ids_json?: string | null;
};

type ImageRow = {
  id: string;
  public_url?: string | null;
  storage_key?: string | null;
};

async function buildProductImageMap(
  db: D1Database,
  productIds: string[],
  imageBaseUrl: string
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(productIds.filter(Boolean)));
  if (!unique.length) return new Map();
  const placeholders = unique.map(() => '?').join(',');
  let rows: ProductImageRow[] = [];

  try {
    const result = await db
      .prepare(
        `SELECT id, stripe_product_id, image_url, image_urls_json, primary_image_id, image_ids_json
         FROM products
         WHERE stripe_product_id IN (${placeholders}) OR id IN (${placeholders});`
      )
      .bind(...unique, ...unique)
      .all<ProductImageRow>();
    rows = result.results || [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stripe webhook] failed to load product images', { message });
    return new Map();
  }

  const imageIds = new Set<string>();
  for (const row of rows) {
    if (row.primary_image_id) imageIds.add(row.primary_image_id);
    const extras = safeParseJsonArray(row.image_ids_json);
    for (const id of extras) imageIds.add(id);
  }

  const imageMap = new Map<string, ImageRow>();
  if (imageIds.size) {
    const imageIdList = Array.from(imageIds);
    const imagePlaceholders = imageIdList.map(() => '?').join(',');
    try {
      const imageResult = await db
        .prepare(
          `SELECT id, public_url, storage_key FROM images WHERE id IN (${imagePlaceholders});`
        )
        .bind(...imageIdList)
        .all<ImageRow>();
      for (const row of imageResult.results || []) {
        imageMap.set(row.id, row);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[stripe webhook] failed to load image records', { message });
    }
  }

  const productImageMap = new Map<string, string>();
  for (const row of rows) {
    let resolved =
      resolveCandidateImageUrl(row.image_url || null, imageBaseUrl) ||
      resolveCandidateImageUrl(safeParseJsonArray(row.image_urls_json)[0] || null, imageBaseUrl);

    if (!resolved) {
      const candidates = [
        row.primary_image_id || null,
        ...safeParseJsonArray(row.image_ids_json),
      ].filter(Boolean) as string[];
      for (const id of candidates) {
        const imageRow = imageMap.get(id);
        if (!imageRow) continue;
        const resolvedUrl = resolvePublicImageUrl(
          imageRow.public_url || null,
          imageRow.storage_key || null,
          imageBaseUrl
        );
        if (resolvedUrl && /^https?:\/\//i.test(resolvedUrl)) {
          resolved = resolvedUrl;
          break;
        }
      }
    }

    if (resolved) {
      if (row.stripe_product_id) {
        productImageMap.set(row.stripe_product_id, resolved);
      }
      productImageMap.set(row.id, resolved);
    }
  }

  return productImageMap;
}

function resolveCandidateImageUrl(value: string | null, imageBaseUrl: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('shellandbrush/') || trimmed.startsWith('shell-and-brush/')) {
    return `${imageBaseUrl}/${trimmed}`;
  }
  return null;
}

function safeParseJsonArray(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item)).filter(Boolean);
    }
  } catch {
    return [];
  }
  return [];
}

async function handleCustomOrderPayment(args: {
  db: D1Database;
  env: Env;
  session: Stripe.Checkout.Session;
  paymentIntentId: string | null;
  customerEmail: string | null;
  shippingName: string | null;
  shippingAddress: Stripe.Address | Stripe.ShippingAddress | null;
  cardLast4: string | null;
  cardBrand: string | null;
  shippingCents: number;
}) {
  const {
    db,
    env,
    session,
    paymentIntentId,
    customerEmail,
    shippingName,
    shippingAddress,
    cardLast4,
    cardBrand,
    shippingCents,
  } = args;

  await ensureCustomOrdersSchema(db);
  const columns = await db.prepare(`PRAGMA table_info(custom_orders);`).all<{ name: string }>();
  const names = (columns.results || []).map((c) => c.name);
  const emailCol = names.includes('customer_email')
    ? 'customer_email'
    : names.includes('customer_email1')
    ? 'customer_email1'
    : null;

  const customOrderId = session.metadata?.customOrderId || null;
  if (!customOrderId) {
    console.warn('[custom order] metadata missing customOrderId');
    return;
  }

  const customOrder = await db
    .prepare(
      `SELECT id, display_custom_order_id, customer_name, ${
        emailCol ? `${emailCol} AS customer_email` : 'NULL AS customer_email'
      }, description, amount, shipping_cents, payment_link, stripe_session_id, stripe_payment_intent_id, image_url, paid_at,
         shipping_name, shipping_line1, shipping_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country, shipping_phone
       FROM custom_orders WHERE id = ?`
    )
    .bind(customOrderId)
    .first<{
      id: string;
      display_custom_order_id: string | null;
      customer_name: string | null;
      customer_email: string | null;
      description: string | null;
      amount: number | null;
      shipping_cents?: number | null;
      payment_link: string | null;
      stripe_session_id?: string | null;
      stripe_payment_intent_id?: string | null;
      image_url?: string | null;
      paid_at?: string | null;
    }>();

  if (!customOrder) {
    console.warn('[custom order] not found for webhook', { customOrderId });
    return;
  }

  // Idempotent: if already marked paid, stop after ensuring order exists.
  const displayId = customOrder.display_custom_order_id || session.metadata?.customOrderDisplayId || customOrder.id;
  const existingOrder = await db
    .prepare(`SELECT id FROM orders WHERE stripe_payment_intent_id = ? OR display_order_id = ?`)
    .bind(paymentIntentId, displayId)
    .first<{ id: string }>();

  const amount = customOrder.amount ?? 0;
  const shippingFromOrder = Number(customOrder.shipping_cents ?? null);
  const shippingCentsForCustomOrder = Number.isFinite(shippingFromOrder)
    ? Math.max(0, Math.round(shippingFromOrder))
    : shippingCents;
  const totalCents = session.amount_total ?? amount + shippingCentsForCustomOrder;
  const description = customOrder.description || 'Custom order payment';
  const paidAt = customOrder.paid_at || new Date().toISOString();
  const customOrderImageUrl = resolvePublicImageUrl(customOrder.image_url || null, env);
  const shippingPhone =
    session.customer_details?.phone ||
    (paymentIntent?.shipping as any)?.phone ||
    null;

  const debugStripeWebhook = !!(env.DEBUG_STRIPE_WEBHOOK || env.EMAIL_DEBUG);
  console.log('[custom order] processing checkout.session.completed', {
    sessionId: session.id,
    paymentIntentId,
    customOrderId,
    displayId,
  });
  if (debugStripeWebhook) {
    console.log('[custom order] shipping debug', {
      sessionId: session.id,
      customOrderId,
      amount,
      shippingFromOrder: Number.isFinite(shippingFromOrder) ? shippingCentsForCustomOrder : null,
      shippingFromSession: shippingCents,
      totalCents,
    });
  }

  // Update custom order status and stripe ids
  const update = await db
    .prepare(
      `UPDATE custom_orders
       SET status = 'paid',
           stripe_payment_intent_id = ?,
           stripe_session_id = COALESCE(stripe_session_id, ?),
           paid_at = COALESCE(paid_at, ?),
           shipping_name = ?,
           shipping_line1 = ?,
           shipping_line2 = ?,
           shipping_city = ?,
           shipping_state = ?,
           shipping_postal_code = ?,
           shipping_country = ?,
           shipping_phone = ?
       WHERE id = ?`
    )
    .bind(
      paymentIntentId,
      session.id,
      paidAt,
      shippingName,
      shippingAddress?.line1 || null,
      shippingAddress?.line2 || null,
      shippingAddress?.city || null,
      shippingAddress?.state || null,
      shippingAddress?.postal_code || null,
      shippingAddress?.country || null,
      shippingPhone,
      customOrder.id
    )
    .run();
  if (!update.success) {
    console.error('[custom order] failed to update status', update.error);
  }

  await upsertCustomOrderGalleryItem(db, {
    customOrderId: customOrder.id,
    displayId,
    imageUrl: customOrderImageUrl || null,
    soldAt: paidAt,
  });

  if (customOrder.stripe_payment_intent_id || existingOrder) {
    console.log('[custom order] already processed', { displayId, existingOrder: existingOrder?.id });
    return;
  }

  // Insert into orders/order_items if not already present
  const insertResult = await insertStandardOrderAndItems({
    db,
    session,
    paymentIntentId,
    customerEmail: customerEmail || customOrder.customer_email,
    shippingName,
    shippingAddress,
    cardLast4,
    cardBrand,
    shippingCents: shippingCentsForCustomOrder,
    productId: null,
    quantityFromMeta: 1,
    displayOrderIdOverride: displayId,
    orderType: 'custom',
    description,
    lineItemsOverride: [
      { productId: `custom_order:${customOrder.id}`, quantity: 1, priceCents: amount },
      { productId: 'shipping', quantity: 1, priceCents: shippingCentsForCustomOrder },
    ],
    totalCentsOverride: totalCents,
  });

  const confirmationCustomerEmail = customerEmail || customOrder.customer_email || null;
  const orderLabel = displayId || insertResult?.displayOrderId || insertResult?.orderId || displayId;
  const shippingAddressText = formatShippingAddress(shippingAddress);
  const billingAddressText = '';
  const paymentMethodLabel = formatPaymentMethodLabel(cardBrand, cardLast4);

  if (insertResult && confirmationCustomerEmail) {
    const siteUrlForConfirmation = resolveSiteUrl(env);
    const confirmationUrl = siteUrlForConfirmation
      ? `${siteUrlForConfirmation}/checkout/return?session_id=${session.id}`
      : `/checkout/return?session_id=${session.id}`;
    const orderDate = formatOrderDate(new Date());
    const totalsForEmail = {
      subtotalCents: Math.max(0, amount),
      shippingCents: shippingCentsForCustomOrder,
      totalCents,
    };
    console.log('[email totals raw]', {
      kind: 'custom_customer',
      orderId: insertResult.orderId,
      displayOrderId: insertResult.displayOrderId,
      subtotalCents: totalsForEmail.subtotalCents,
      shippingCents: totalsForEmail.shippingCents,
      totalCents: totalsForEmail.totalCents,
    });
    const confirmationItems: OrderConfirmationEmailItem[] = [
      {
        name: customOrder.description || 'Custom order',
        qty: 1,
        unitAmount: amount,
        lineTotal: amount,
        imageUrl: customOrderImageUrl || null,
      },
    ];

    try {
      const html = renderOrderConfirmationEmailHtml({
        brandName: 'Shell & Brush',
        orderNumber: orderLabel,
        orderDate,
        customerName: customOrder.customer_name || shippingName || session.customer_details?.name || null,
        customerEmail: confirmationCustomerEmail || undefined,
        shippingAddress: shippingAddressText || undefined,
        billingAddress: billingAddressText || undefined,
        paymentMethod: paymentMethodLabel,
        items: confirmationItems,
        subtotal: totalsForEmail.subtotalCents,
        shipping: totalsForEmail.shippingCents,
        total: totalsForEmail.totalCents,
        primaryCtaUrl: confirmationUrl,
        primaryCtaLabel: 'View Order Details',
      });
      const text = renderOrderConfirmationEmailText({
        brandName: 'Shell & Brush',
        orderNumber: orderLabel,
        orderDate,
        customerName: customOrder.customer_name || shippingName || session.customer_details?.name || null,
        customerEmail: confirmationCustomerEmail || undefined,
        shippingAddress: shippingAddressText || undefined,
        billingAddress: billingAddressText || undefined,
        paymentMethod: paymentMethodLabel,
        items: confirmationItems,
        subtotal: totalsForEmail.subtotalCents,
        shipping: totalsForEmail.shippingCents,
        total: totalsForEmail.totalCents,
        primaryCtaUrl: confirmationUrl,
        primaryCtaLabel: 'View Order Details',
      });

      const emailResult = await sendEmail(
        {
          to: confirmationCustomerEmail,
            subject: `Shell & Brush - Order Confirmed (${orderLabel})`,
          html,
          text,
        },
        env
      );
      if (!emailResult.ok) {
        console.error('[custom order] customer confirmation email failed', emailResult.error);
      }
    } catch (emailError) {
      console.error('[custom order] customer confirmation email error', emailError);
    }
  }

  const ownerTo = env.RESEND_OWNER_TO || env.EMAIL_OWNER_TO;
  if (!ownerTo) {
    console.warn('[custom order] owner email missing; skipping receipt email');
    return;
  }

  if (!insertResult) return;

  const adminLink = (env.PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL || '').replace(/\/+$/, '') + '/admin';
  const ownerItems: OwnerNewSaleItem[] = [
    {
      name: customOrder.description || 'Custom order',
      qtyLabel: '',
      lineTotal: formatMoney(amount),
      imageUrl: customOrderImageUrl || null,
    },
  ];
  const totalsForOwner = {
    subtotalCents: Math.max(0, amount),
    shippingCents: shippingCentsForCustomOrder,
    totalCents,
  };
  console.log('[email totals raw]', {
    kind: 'custom_owner',
    orderId: insertResult.orderId,
    displayOrderId: insertResult.displayOrderId,
    subtotalCents: totalsForOwner.subtotalCents,
    shippingCents: totalsForOwner.shippingCents,
    totalCents: totalsForOwner.totalCents,
  });
  const ownerTotals = {
    subtotal: formatMoney(totalsForOwner.subtotalCents),
    shipping: formatMoney(totalsForOwner.shippingCents),
    total: formatMoney(totalsForOwner.totalCents),
  };
  const orderDate = formatOrderDate(new Date());
  const stripeUrl = buildStripeDashboardUrl(paymentIntentId, session.id, env.STRIPE_SECRET_KEY);

  try {
    const html = renderOwnerNewSaleEmailHtml({
      orderNumber: orderLabel,
      orderDate,
      orderTypeLabel: 'Custom Order',
      statusLabel: 'PAID',
      customerName: customOrder.customer_name || shippingName || session.customer_details?.name || 'Customer',
      customerEmail: customerEmail || customOrder.customer_email || '',
      shippingAddress: shippingAddressText || undefined,
      billingAddress: billingAddressText || undefined,
      paymentMethod: paymentMethodLabel,
      items: ownerItems,
      subtotal: ownerTotals.subtotal,
      shipping: ownerTotals.shipping,
      total: ownerTotals.total,
      adminUrl: adminLink || '/admin',
      stripeUrl,
    });
    const text = renderOwnerNewSaleEmailText({
      orderNumber: orderLabel,
      orderDate,
      orderTypeLabel: 'Custom Order',
      statusLabel: 'PAID',
      customerName: customOrder.customer_name || shippingName || session.customer_details?.name || 'Customer',
      customerEmail: customerEmail || customOrder.customer_email || '',
      shippingAddress: shippingAddressText || undefined,
      billingAddress: billingAddressText || undefined,
      paymentMethod: paymentMethodLabel,
      items: ownerItems,
      subtotal: ownerTotals.subtotal,
      shipping: ownerTotals.shipping,
      total: ownerTotals.total,
      adminUrl: adminLink || '/admin',
      stripeUrl,
    });

    const emailResult = await sendEmail(
      {
        to: ownerTo,
        subject: `NEW SALE - Shell & Brush (${orderLabel})`,
        html,
        text,
      },
      env
    );
    if (!emailResult.ok) {
      console.error('[custom order] owner receipt email failed', emailResult.error);
    }
  } catch (emailError) {
    console.error('[custom order] owner receipt email error', emailError);
  }
}

async function insertStandardOrderAndItems(args: {
  db: D1Database;
  session: Stripe.Checkout.Session;
  paymentIntentId: string | null;
  customerEmail: string | null;
  shippingName: string | null;
  shippingAddress: Stripe.Address | Stripe.ShippingAddress | null;
  cardLast4: string | null;
  cardBrand: string | null;
  shippingCents: number;
  promoCode?: string | null;
  promoPercentOff?: number | null;
  promoFreeShipping?: number | null;
  promoSource?: string | null;
  productId?: string | null;
  quantityFromMeta?: number;
  displayOrderIdOverride?: string | null;
  orderType?: string | null;
  description?: string | null;
  lineItemsOverride?: { productId: string; quantity: number; priceCents: number }[];
  totalCentsOverride?: number;
}): Promise<{ orderId: string; displayOrderId: string } | null> {
  const {
    db,
    session,
    paymentIntentId,
    customerEmail,
    shippingName,
    shippingAddress,
    cardLast4,
    cardBrand,
    shippingCents,
    promoCode,
    promoPercentOff,
    promoFreeShipping,
    promoSource,
    productId,
    quantityFromMeta,
    displayOrderIdOverride,
    orderType,
    description,
    lineItemsOverride,
    totalCentsOverride,
  } = args;

  if (paymentIntentId) {
    const existing = await db
      .prepare(`SELECT id FROM orders WHERE stripe_payment_intent_id = ?`)
      .bind(paymentIntentId)
      .first<{ id: string }>();
    if (existing) {
      console.log('[orders] existing order found, skipping insert', { orderId: existing.id });
      return null;
    }
  }

  await assertOrdersTables(db);
  await ensureShippingColumn(db);
  await ensurePromoColumns(db);

  const orderId = crypto.randomUUID();
  const displayOrderId = displayOrderIdOverride || (await generateDisplayOrderId(db));
  const totalCents = totalCentsOverride ?? session.amount_total ?? 0;

  console.log('[stripe webhook] inserting order', {
    sessionId: session.id,
    paymentIntentId,
    hasLineItems: !!session.line_items?.data?.length,
    displayOrderId,
    orderType,
  });

  const insertWithCard = await db
    .prepare(
      `
        INSERT INTO orders (
          id, display_order_id, order_type, stripe_payment_intent_id, total_cents, customer_email, shipping_name, shipping_address_json, card_last4, card_brand, shipping_cents, description,
          promo_code, promo_percent_off, promo_free_shipping, promo_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `
    )
    .bind(
      orderId,
      displayOrderId,
      orderType ?? null,
      paymentIntentId,
      totalCents,
      customerEmail,
      shippingName,
      JSON.stringify(shippingAddress ?? null),
      cardLast4,
      cardBrand,
      shippingCents,
      description ?? null,
      promoCode ?? null,
      promoPercentOff ?? null,
      promoFreeShipping ?? null,
      promoSource ?? null
    )
    .run();

  let orderInsertSucceeded = insertWithCard.success;

  if (!insertWithCard.success && insertWithCard.error?.includes('no such column')) {
    const fallbackResult = await db
      .prepare(
        `
          INSERT INTO orders (
            id, display_order_id, stripe_payment_intent_id, total_cents, customer_email, shipping_name, shipping_address_json, shipping_cents
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        `
      )
      .bind(
        orderId,
        displayOrderId,
        paymentIntentId,
        totalCents,
        customerEmail,
        shippingName,
        JSON.stringify(shippingAddress ?? null),
        shippingCents
      )
      .run();
    orderInsertSucceeded = fallbackResult.success;
    console.log('[stripe webhook] order insert fallback', {
      orderId,
      displayOrderId,
      success: fallbackResult.success,
      error: fallbackResult.error,
    });
  }

  console.log('[stripe webhook] order insert result', {
    orderId,
    displayOrderId,
    success: orderInsertSucceeded,
    error: insertWithCard.error,
  });

  if (!orderInsertSucceeded) {
    throw new Error(`Order insert failed for session ${session.id}`);
  }

  const preparedLineItems =
    lineItemsOverride ||
    filterNonShippingLineItems(session.line_items?.data || []).map((line) => {
      const qty = line.quantity ?? 1;
      const priceCents = line.price?.unit_amount ?? 0;
      const productIdFromPrice =
        typeof line.price?.product === 'string'
          ? line.price.product
          : (line.price?.product as Stripe.Product | undefined)?.id;
      const resolvedProductId = productIdFromPrice || productId || line.price?.id || 'unknown';
      return { productId: resolvedProductId as string, quantity: qty, priceCents };
    });

  if (preparedLineItems.length) {
    for (const li of preparedLineItems) {
      const itemId = crypto.randomUUID();
      const itemResult = await db
        .prepare(
          `
            INSERT INTO order_items (id, order_id, product_id, quantity, price_cents)
            VALUES (?, ?, ?, ?, ?);
          `
        )
        .bind(itemId, orderId, li.productId, li.quantity ?? 1, li.priceCents ?? 0)
        .run();

      if (!itemResult.success) {
        console.error('Failed to insert order_items into D1', itemResult.error);
      }
    }
    console.log('[stripe webhook] inserted order and items', { orderId, displayOrderId, items: preparedLineItems.length });
  } else if (productId) {
    const itemId = crypto.randomUUID();
    const itemResult = await db
      .prepare(
        `
          INSERT INTO order_items (id, order_id, product_id, quantity, price_cents)
          VALUES (?, ?, ?, ?, ?);
        `
      )
      .bind(
        itemId,
        orderId,
        productId,
        quantityFromMeta || 1,
        session.amount_subtotal && (quantityFromMeta || 1) > 0
          ? Math.floor(session.amount_subtotal / (quantityFromMeta || 1))
          : 0
      )
      .run();

    if (!itemResult.success) {
      console.error('Failed to insert order_items into D1 (fallback)', itemResult.error);
    } else {
      console.log('[stripe webhook] inserted order with fallback item', { orderId, displayOrderId, productId });
    }
  } else {
    console.warn('[stripe webhook] no line items available to insert for session', { sessionId: session.id });
  }

  return { orderId, displayOrderId };
}

function formatOrderDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function formatShippingAddress(address: Stripe.Address | Stripe.ShippingAddress | null): string {
  if (!address) return '';
  const parts = [
    address.name,
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(', '),
    address.postal_code,
    address.country,
  ]
    .map((p) => (p || '').trim())
    .filter(Boolean);
  return parts.join(', ');
}

function formatPaymentMethodLabel(cardBrand: string | null, cardLast4: string | null): string {
  const brand = cardBrand ? cardBrand.toUpperCase() : '';
  if (brand && cardLast4) return `${brand} **** ${cardLast4}`;
  if (brand) return brand;
  if (cardLast4) return `Card **** ${cardLast4}`;
  return 'Card';
}

function resolveSiteUrl(env: {
  PUBLIC_SITE_URL?: string;
  VITE_PUBLIC_SITE_URL?: string;
}) {
  const raw = env.PUBLIC_SITE_URL || env.VITE_PUBLIC_SITE_URL || '';
  return raw ? raw.replace(/\/+$/, '') : '';
}

function formatShippingAddressLines(address: Stripe.Address | Stripe.ShippingAddress | null): {
  line1: string;
  line2: string;
} {
  if (!address) return { line1: '', line2: '' };
  const line1Parts = [address.name, address.line1].filter(Boolean).map((p) => (p || '').trim());
  const line2Parts = [
    address.line2,
    [address.city, address.state].filter(Boolean).join(', '),
    address.postal_code,
    address.country,
  ]
    .filter(Boolean)
    .map((p) => (p || '').trim());
  return {
    line1: line1Parts.join(' - '),
    line2: line2Parts.join(', '),
  };
}

function buildStripeDashboardUrl(
  paymentIntentId: string | null,
  sessionId: string,
  stripeSecret?: string
): string {
  const isTest = stripeSecret ? stripeSecret.startsWith('sk_test') : false;
  const base = isTest ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com';
  if (paymentIntentId) return `${base}/payments/${paymentIntentId}`;
  return `${base}/checkout/sessions/${sessionId}`;
}







