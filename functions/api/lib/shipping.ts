import type Stripe from 'stripe';

type LineItemLike = Pick<Stripe.LineItem, 'description' | 'amount_total' | 'quantity' | 'price'> & {
  price?: Stripe.Price | null;
  metadata?: Record<string, string> | null;
};

const normalizeLabel = (value?: string | null) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const isExactShippingLabel = (value?: string | null) => normalizeLabel(value) === 'shipping';

const containsShippingLabel = (value?: string | null) =>
  normalizeLabel(value).includes('shipping');

const getProductName = (line: LineItemLike): string => {
  const price = line.price as Stripe.Price | null | undefined;
  const productObj =
    price?.product && typeof price.product !== 'string'
      ? (price.product as Stripe.Product)
      : null;
  return (
    (price as any)?.product_data?.name ||
    productObj?.name ||
    ''
  );
};

const hasShippingMetadata = (line: LineItemLike): boolean => {
  const lineMeta = line.metadata || {};
  if (isExactShippingLabel(lineMeta.mv_line_type)) return true;
  const priceMeta = (line.price as any)?.metadata || {};
  if (isExactShippingLabel(priceMeta.mv_line_type)) return true;
  const productMeta =
    line.price?.product && typeof line.price.product !== 'string'
      ? (line.price.product as Stripe.Product).metadata || {}
      : {};
  return isExactShippingLabel(productMeta?.mv_line_type);
};

export const isShippingLineItem = (line: LineItemLike): boolean => {
  if (hasShippingMetadata(line)) return true;
  if (containsShippingLabel(line.description || '')) return true;
  const priceNickname = (line.price as any)?.nickname;
  if (containsShippingLabel(priceNickname)) return true;
  const productName = getProductName(line);
  if (isExactShippingLabel(productName)) return true;
  const productDataName = (line.price as any)?.product_data?.name;
  if (isExactShippingLabel(productDataName)) return true;
  return false;
};

export const extractShippingCentsFromLineItems = (lineItems: LineItemLike[]): number => {
  if (!lineItems.length) return 0;
  return lineItems
    .filter(isShippingLineItem)
    .reduce((sum, line) => {
      const quantity = line.quantity ?? 1;
      const lineTotal =
        line.amount_total ??
        ((line.price?.unit_amount ?? 0) * quantity);
      return sum + Math.round(Number(lineTotal || 0));
    }, 0);
};

export const filterNonShippingLineItems = <T extends LineItemLike>(lineItems: T[]): T[] =>
  lineItems.filter((line) => !isShippingLineItem(line));
