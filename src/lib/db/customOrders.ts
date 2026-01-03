import { adminFetch } from '../adminAuth';

export type AdminCustomOrder = {
  id: string;
  displayCustomOrderId: string;
  customerName: string;
  customerEmail: string;
  description: string;
  amount: number | null;
  shippingCents?: number | null;
  status: 'pending' | 'paid';
  paymentLink: string | null;
  createdAt: string | null;
  paidAt?: string | null;
  imageUrl?: string | null;
  imageKey?: string | null;
  imageUpdatedAt?: string | null;
  shippingName?: string | null;
  shippingAddress?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
    phone?: string | null;
    name?: string | null;
  } | null;
};

const ADMIN_CUSTOM_ORDERS_PATH = '/api/admin/custom-orders';

export async function getAdminCustomOrders(): Promise<AdminCustomOrder[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  const url = `${ADMIN_CUSTOM_ORDERS_PATH}?ts=${Date.now()}`;

  if (import.meta.env.DEV) {
    console.debug('[admin custom orders] fetching', { url });
  }

  const res = await adminFetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  const bodyText = await res.text();
  const preview = bodyText.slice(0, 500);

  if (import.meta.env.DEV) {
    console.debug('[admin custom orders] fetch response', { status: res.status, bodyPreview: preview });
  }

  if (!res.ok) {
    throw new Error(bodyText || `Failed to fetch admin custom orders (${res.status})`);
  }

  let data: any = {};
  try {
    data = bodyText ? JSON.parse(bodyText) : {};
  } catch (err) {
    console.error('Failed to parse admin custom orders response', err);
    throw new Error('Failed to parse admin custom orders response');
  }

  const orders = Array.isArray(data.orders) ? (data.orders as AdminCustomOrder[]) : [];
  if (import.meta.env.DEV) {
    console.debug('[admin custom orders] parsed orders', { count: orders.length, sample: orders.slice(0, 2), raw: data });
    if (orders.length === 0) {
      console.debug('[admin custom orders] empty orders array returned from /api/admin/custom-orders');
    }
  }
  return orders;
}

export async function createAdminCustomOrder(payload: {
  customerName: string;
  customerEmail: string;
  description: string;
  amount?: number;
  shippingCents?: number;
  messageId?: string | null;
}): Promise<AdminCustomOrder> {
  const res = await adminFetch(ADMIN_CUSTOM_ORDERS_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data && (data.error || data.detail)) ||
      `Failed to create custom order (${res.status})`;
    throw new Error(message);
  }

  if (data?.order) {
    return data.order as AdminCustomOrder;
  }

  // Fallback for older responses
  return {
    id: data.id as string,
    displayCustomOrderId: data.displayId as string,
    customerName: payload.customerName,
    customerEmail: payload.customerEmail,
    description: payload.description,
    amount: payload.amount ?? null,
    shippingCents: payload.shippingCents ?? 0,
    status: 'pending',
    paymentLink: payload.paymentLink ?? null,
    createdAt: data.createdAt as string,
    imageUrl: null,
    imageKey: null,
    imageUpdatedAt: null,
  };
}

export async function updateAdminCustomOrder(
  id: string,
  patch: Partial<{
    customerName: string;
    customerEmail: string;
    description: string;
    amount: number | null;
    shippingCents: number | null;
    status: 'pending' | 'paid';
    paymentLink: string | null;
    messageId: string | null;
  }>
): Promise<void> {
  const res = await adminFetch(`${ADMIN_CUSTOM_ORDERS_PATH}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message =
      (data && (data.error || data.detail)) ||
      `Failed to update custom order (${res.status})`;
    throw new Error(message);
  }
}

export async function uploadAdminCustomOrderImage(
  id: string,
  file: File
): Promise<{ imageUrl: string; imageKey?: string | null; imageUpdatedAt?: string | null }> {
  const form = new FormData();
  form.append('file', file, file.name || 'upload');

  const res = await adminFetch(`${ADMIN_CUSTOM_ORDERS_PATH}/${encodeURIComponent(id)}/image`, {
    method: 'POST',
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data && (data.error || data.detail)) ||
      `Failed to upload custom order image (${res.status})`;
    throw new Error(message);
  }

  return {
    imageUrl: data.imageUrl as string,
    imageKey: data.imageKey ?? null,
    imageUpdatedAt: data.imageUpdatedAt ?? null,
  };
}

export async function removeAdminCustomOrderImage(id: string): Promise<void> {
  const res = await adminFetch(`${ADMIN_CUSTOM_ORDERS_PATH}/${encodeURIComponent(id)}/image`, {
    method: 'DELETE',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data && (data.error || data.detail)) ||
      `Failed to remove custom order image (${res.status})`;
    throw new Error(message);
  }
}

export async function sendAdminCustomOrderPaymentLink(
  id: string
): Promise<{ paymentLink: string; sessionId: string; emailOk?: boolean }> {
  const res = await adminFetch(`${ADMIN_CUSTOM_ORDERS_PATH}/${encodeURIComponent(id)}/send-payment-link`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data && (data.error || data.detail)) ||
      `Failed to send payment link (${res.status})`;
    throw new Error(message);
  }

  return {
    paymentLink: data.paymentLink as string,
    sessionId: data.sessionId as string,
    emailOk: data.emailOk,
  };
}
