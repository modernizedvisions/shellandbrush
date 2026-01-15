import { adminFetch } from './adminAuth';
import type { PromotionAdmin } from './types';

const ADMIN_PROMOTIONS_PATH = '/api/admin/promotions';

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

export async function adminListPromotions(): Promise<PromotionAdmin[]> {
  const response = await adminFetch(ADMIN_PROMOTIONS_PATH, { headers: { Accept: 'application/json' } });
  const data = await handleResponse(response);
  return Array.isArray(data.promotions) ? (data.promotions as PromotionAdmin[]) : [];
}

export async function adminCreatePromotion(input: PromotionAdmin): Promise<PromotionAdmin | null> {
  const response = await adminFetch(ADMIN_PROMOTIONS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await handleResponse(response);
  return data.promotion ?? null;
}

export async function adminUpdatePromotion(id: string, input: PromotionAdmin): Promise<PromotionAdmin | null> {
  const response = await adminFetch(`${ADMIN_PROMOTIONS_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await handleResponse(response);
  return data.promotion ?? null;
}

export async function adminDeletePromotion(id: string): Promise<void> {
  const response = await adminFetch(`${ADMIN_PROMOTIONS_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  await handleResponse(response);
}
