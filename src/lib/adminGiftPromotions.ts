import { adminFetch } from './adminAuth';
import type { GiftPromotionAdmin } from './types';

const ADMIN_GIFT_PROMOTIONS_PATH = '/api/admin/gift-promotions';

const handleResponse = async (response: Response) => {
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error || data?.detail || text || `Request failed with status ${response.status}`;
    const trimmed = typeof message === 'string' && message.length > 500 ? `${message.slice(0, 500)}...` : message;
    throw new Error(typeof trimmed === 'string' ? trimmed : `Request failed with status ${response.status}`);
  }

  return data ?? {};
};

export async function adminListGiftPromotions(): Promise<GiftPromotionAdmin[]> {
  const response = await adminFetch(ADMIN_GIFT_PROMOTIONS_PATH, { headers: { Accept: 'application/json' } });
  const data = await handleResponse(response);
  return Array.isArray(data.giftPromotions) ? (data.giftPromotions as GiftPromotionAdmin[]) : [];
}

export async function adminCreateGiftPromotion(
  input: GiftPromotionAdmin
): Promise<GiftPromotionAdmin | null> {
  const response = await adminFetch(ADMIN_GIFT_PROMOTIONS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await handleResponse(response);
  return data.giftPromotion ?? null;
}

export async function adminUpdateGiftPromotion(
  id: string,
  input: GiftPromotionAdmin
): Promise<GiftPromotionAdmin | null> {
  const response = await adminFetch(`${ADMIN_GIFT_PROMOTIONS_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await handleResponse(response);
  return data.giftPromotion ?? null;
}

export async function adminDeleteGiftPromotion(id: string): Promise<void> {
  const response = await adminFetch(`${ADMIN_GIFT_PROMOTIONS_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  await handleResponse(response);
}
