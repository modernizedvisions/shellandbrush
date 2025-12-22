import type Stripe from 'stripe';
import { extractShippingCentsFromLineItems } from '../api/lib/shipping';

export type LineItemLike = Pick<Stripe.LineItem, 'description' | 'amount_total' | 'price'> & {
  price?: Stripe.Price | null;
};

type StandardTotalsArgs = {
  order?: {
    total_cents?: number | null;
    subtotal_cents?: number | null;
    amount_subtotal_cents?: number | null;
    shipping_cents?: number | null;
  } | null;
  session?: Stripe.Checkout.Session | null;
  lineItems?: LineItemLike[];
  shippingCentsFromContext?: number | null;
};

type CustomTotalsArgs = {
  order?: {
    total_cents?: number | null;
    amount_cents?: number | null;
    subtotal_cents?: number | null;
    shipping_cents?: number | null;
    shipping_amount?: number | null;
  } | null;
  session?: Stripe.Checkout.Session | null;
  shippingCentsFromContext?: number | null;
};

export function resolveStandardEmailTotals(args: StandardTotalsArgs) {
  const session = args.session;
  const lineItems = args.lineItems || [];
  const totalCents =
    coalesceCents([
      args.order?.total_cents,
      args.order?.amount_subtotal_cents && args.order?.shipping_cents
        ? (args.order?.amount_subtotal_cents as number) + (args.order?.shipping_cents as number)
        : null,
      session?.amount_total,
    ]) || 0;

  const shippingCents =
    coalesceCents([
      args.order?.shipping_cents,
      args.shippingCentsFromContext,
      (session?.total_details as any)?.amount_shipping,
      (session as any)?.shipping_cost?.amount_total,
      sumShippingLines(lineItems),
    ]) || 0;

  const subtotalCents =
    coalesceCents([args.order?.subtotal_cents, args.order?.amount_subtotal_cents]) ??
    Math.max(0, totalCents - shippingCents);

  return { subtotalCents, shippingCents, totalCents };
}

export function resolveCustomEmailTotals(args: CustomTotalsArgs) {
  const session = args.session;
  const totalCents =
    coalesceCents([
      args.order?.total_cents,
      args.order?.amount_cents,
      session?.amount_total,
    ]) || 0;

  const shippingCents =
    coalesceCents([
      args.order?.shipping_cents,
      args.order?.shipping_amount,
      args.shippingCentsFromContext,
      (session?.total_details as any)?.amount_shipping,
      (session as any)?.shipping_cost?.amount_total,
    ]) || 0;

  const subtotalCents =
    coalesceCents([args.order?.subtotal_cents]) ?? Math.max(0, totalCents - shippingCents);

  return { subtotalCents, shippingCents, totalCents };
}

function coalesceCents(values: Array<number | null | undefined>): number | null {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (Number.isFinite(Number(v))) return Math.round(Number(v));
  }
  return null;
}

function sumShippingLines(lineItems: LineItemLike[]): number | null {
  if (!lineItems.length) return null;
  const total = extractShippingCentsFromLineItems(lineItems);
  return Number.isFinite(total) ? total : null;
}
