import {
  getActiveProducts,
  getProductById,
  getRelatedProducts,
  getSoldProducts,
} from './db/products';
import {
  fetchAdminProducts,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
} from './db/adminProducts';
import {
  getHomeHeroConfig,
  saveHomeHeroConfig as persistHomeHeroConfig,
  fetchShopCategoryTiles as loadShopCategoryTiles,
  saveShopCategoryTiles as persistShopCategoryTiles,
} from './db/content';
import { getAdminOrders } from './db/orders';
import { getReviewsForProduct } from './db/reviews';
import { createEmbeddedCheckoutSession, fetchCheckoutSession } from './payments/checkout';
import { sendContactEmail } from './contact';
import { verifyAdminPassword } from './auth';
import type { Category } from './types';

// Aggregates the mock data layer and stubs so the UI can continue working while we
// prepare for Cloudflare D1 + Stripe with the site/admin as the source of truth.

export const fetchProducts = getActiveProducts;
export const fetchProductById = getProductById;
export const fetchRelatedProducts = getRelatedProducts;
export const fetchOrders = getAdminOrders;
export const fetchSoldProducts = getSoldProducts;
export const adminFetchProducts = fetchAdminProducts;
export const adminCreateProduct = createAdminProduct;
export const adminUpdateProduct = updateAdminProduct;
export const adminDeleteProduct = deleteAdminProduct;
export const fetchHomeHeroConfig = getHomeHeroConfig;
export const saveHomeHeroConfig = persistHomeHeroConfig;
export const fetchShopCategoryTiles = loadShopCategoryTiles;
export const saveShopCategoryTiles = persistShopCategoryTiles;
export const fetchReviewsForProduct = getReviewsForProduct;
// validateCart is no longer exported here (orders/cart validation will be wired separately if needed)

export { createEmbeddedCheckoutSession, fetchCheckoutSession, sendContactEmail, verifyAdminPassword };

export async function fetchGalleryImages() {
  const response = await fetch('/api/gallery', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Gallery API responded with ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data.images)) return [];
  return data.images.map((img: any, idx: number) => ({
    id: img.id || `gallery-${idx}`,
    imageUrl: img.imageUrl || img.image_url || '',
    hidden: !!(img.hidden ?? img.is_active === 0),
    alt: img.alt || img.alt_text,
    title: img.title || img.alt || img.alt_text,
    position: typeof img.position === 'number' ? img.position : idx,
    createdAt: img.createdAt || img.created_at,
  }));
}

export async function saveGalleryImages(images: any[]) {
  const response = await fetch('/api/gallery', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ images }),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data?.detail || data?.error || '';
    } catch {
      detail = '';
    }
    throw new Error(`Save gallery API responded with ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  const data = await response.json();
  return Array.isArray(data.images) ? data.images : [];
}

export async function fetchCategories(): Promise<Category[]> {
  try {
    const response = await fetch('/api/categories', { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Categories API responded with ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data.categories) ? (data.categories as Category[]) : [];
  } catch (error) {
    console.error('Failed to load categories from API', error);
    return [];
  }
}

const ADMIN_CATEGORIES_PATH = '/api/admin/categories';

export async function adminFetchCategories(): Promise<Category[]> {
  const response = await fetch(ADMIN_CATEGORIES_PATH, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Admin categories fetch failed: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.categories) ? (data.categories as Category[]) : [];
}

export async function adminCreateCategory(name: string): Promise<Category | null> {
  const response = await fetch(ADMIN_CATEGORIES_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(`Create category failed: ${response.status}`);
  const data = await response.json();
  return (data as any).category ?? null;
}

export async function adminUpdateCategory(id: string, updates: Partial<Category>): Promise<Category | null> {
  const response = await fetch(`${ADMIN_CATEGORIES_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error(`Update category failed: ${response.status}`);
  const data = await response.json();
  return (data as any).category ?? null;
}

export async function adminDeleteCategory(id: string): Promise<void> {
  const response = await fetch(`${ADMIN_CATEGORIES_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Delete category failed: ${response.status}`);
}

export async function adminUploadImage(file: File): Promise<{ id: string; url: string }> {
  const form = new FormData();
  form.append('file', file, file.name || 'upload');

  const rid = crypto.randomUUID();
  const url = `/api/admin/images/upload?rid=${encodeURIComponent(rid)}`;
  const method = 'POST';

  console.debug('[admin image upload] request', {
    rid,
    url,
    method,
    bodyIsFormData: form instanceof FormData,
    fileCount: 1,
    fileSizes: [file.size],
    fileName: file.name,
    fileType: file.type,
  });

  const response = await fetch(url, {
    method,
    headers: { 'X-Upload-Request-Id': rid },
    body: form,
  });

  const responseText = await response.text();
  console.debug('[admin image upload] response', {
    rid,
    status: response.status,
    body: responseText,
  });

  if (!response.ok) {
    const trimmed = responseText.length > 500 ? `${responseText.slice(0, 500)}...` : responseText;
    throw new Error(`Image upload failed rid=${rid} status=${response.status} body=${trimmed}`);
  }

  let data: any = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch (err) {
    throw new Error(`Image upload failed rid=${rid} status=${response.status} body=invalid-json`);
  }
  if (!data?.id || !data?.url) {
    throw new Error(`Image upload failed rid=${rid} status=${response.status} body=missing-fields`);
  }
  return { id: data.id, url: data.url };
}

export async function adminDeleteMessage(id: string): Promise<void> {
  const response = await fetch(`/api/admin/messages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();
  if (!response.ok) {
    const trimmed = text.length > 500 ? `${text.slice(0, 500)}...` : text;
    throw new Error(trimmed || `Delete message failed (${response.status})`);
  }
}
