import { adminFetch } from './adminAuth';
import type { PromoCodeAdmin } from './types';

const ADMIN_PROMO_CODES_PATH = '/api/admin/promo-codes';

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

export async function adminListPromoCodes(): Promise<PromoCodeAdmin[]> {
  const response = await adminFetch(ADMIN_PROMO_CODES_PATH, { headers: { Accept: 'application/json' } });
  const data = await handleResponse(response);
  return Array.isArray(data.promoCodes) ? (data.promoCodes as PromoCodeAdmin[]) : [];
}

export async function adminCreatePromoCode(input: PromoCodeAdmin): Promise<PromoCodeAdmin | null> {
  const response = await adminFetch(ADMIN_PROMO_CODES_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await handleResponse(response);
  return data.promoCode ?? null;
}

export async function adminUpdatePromoCode(id: string, input: PromoCodeAdmin): Promise<PromoCodeAdmin | null> {
  const response = await adminFetch(`${ADMIN_PROMO_CODES_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await handleResponse(response);
  return data.promoCode ?? null;
}

export async function adminDeletePromoCode(id: string): Promise<void> {
  const response = await adminFetch(`${ADMIN_PROMO_CODES_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  await handleResponse(response);
}
