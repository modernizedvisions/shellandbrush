import { adminFetch } from '../adminAuth';

export type AdminOrderItem = {
  productId: string;
  productName: string | null;
  quantity: number;
  priceCents: number;
  productImageUrl?: string | null;
};

export type AdminOrder = {
  id: string;
  displayOrderId?: string | null;
  createdAt: string;
  totalCents: number;
  customerEmail: string | null;
  shippingName: string | null;
  customerName: string | null;
  shippingAddress: Record<string, any> | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  paymentMethodType?: string | null;
  paymentMethodLabel?: string | null;
  shippingCents?: number | null;
  promoCode?: string | null;
  promoPercentOff?: number | null;
  promoFreeShipping?: number | null;
  promoSource?: string | null;
  items: AdminOrderItem[];
};

export async function getAdminOrders(): Promise<AdminOrder[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  const res = await adminFetch('/api/admin/orders', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  const bodyText = await res.text();
  const preview = bodyText.slice(0, 500);

  if (import.meta.env.DEV) {
    console.debug('[admin orders] fetch response', { status: res.status, bodyPreview: preview });
  }

  if (!res.ok) {
    throw new Error(bodyText || `Failed to fetch admin orders (${res.status})`);
  }

  let data: any = {};
  try {
    data = bodyText ? JSON.parse(bodyText) : {};
  } catch (err) {
    console.error('Failed to parse admin orders response', err);
    throw new Error('Failed to parse admin orders response');
  }

  const orders = Array.isArray(data.orders) ? (data.orders as AdminOrder[]) : [];
  if (import.meta.env.DEV) {
    console.debug('[admin orders] parsed orders', { count: orders.length, sample: orders.slice(0, 2), raw: data });
    if (orders.length === 0) {
      console.debug('[admin orders] empty orders array returned from /api/admin/orders');
    }
  }
  return orders;
}
