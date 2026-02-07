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
  fetchShopCategoryTiles as loadShopCategoryTiles,
  saveShopCategoryTiles as persistShopCategoryTiles,
} from './db/content';
import { getAdminOrders } from './db/orders';
import { getReviewsForProduct } from './db/reviews';
import { createEmbeddedCheckoutSession, fetchCheckoutSession } from './payments/checkout';
import { sendContactEmail } from './contact';
import { verifyAdminPassword } from './auth';
import { adminFetch, hasAdminPasswordInStorage } from './adminAuth';
import type { Category, EmailListSignup } from './types';
import { createWebpVariant } from './imageVariants';
import { debugUploadsEnabled, dlog, derr, truncate } from './debugUploads';
import { trace } from './uploadTrace';
import { recordUploadAttempt } from './uploadDebugStore';

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
export async function fetchHomeHeroConfig() {
  const response = await fetch('/api/site-config/home', { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    console.warn('Home config API responded with', response.status);
    return getHomeHeroConfig();
  }
  const data = await response.json().catch(() => null);
  return data?.config || getHomeHeroConfig();
}

export async function saveHomeHeroConfig(config: any) {
  const response = await adminFetch('/api/admin/site-config/home', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ config }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Save home config failed (${response.status})`);
  }
  const data = await response.json().catch(() => null);
  return data?.config ?? config;
}
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
    imageThumbUrl: img.imageThumbUrl || img.image_thumb_url || null,
    imageId: img.imageId || img.image_id || undefined,
    hidden: !!(img.hidden ?? img.is_active === 0),
    alt: img.alt || img.alt_text,
    title: img.title || img.alt || img.alt_text,
    position: typeof img.position === 'number' ? img.position : idx,
    createdAt: img.createdAt || img.created_at,
  }));
}

export async function fetchSoldGalleryItems() {
  const response = await fetch('/api/gallery-sold', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Gallery sold API responded with ${response.status}`);
  const data = await response.json().catch(() => ({}));
  const items = Array.isArray(data.items) ? data.items : [];
  return items.map((item: any, idx: number) => ({
    id: item.id || `gallery-sold-${idx}`,
    imageUrl: item.imageUrl || item.image_url || '',
    title: item.title || undefined,
    sourceType: item.sourceType || item.source_type || undefined,
    sourceId: item.sourceId || item.source_id || undefined,
    soldAt: item.soldAt || item.sold_at || undefined,
    createdAt: item.createdAt || item.created_at || undefined,
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
  const response = await adminFetch(ADMIN_CATEGORIES_PATH, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Admin categories fetch failed: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.categories) ? (data.categories as Category[]) : [];
}

export async function adminCreateCategory(
  name: string,
  description?: string | null,
  shippingCents?: number | null
): Promise<Category | null> {
  const response = await adminFetch(ADMIN_CATEGORIES_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name, description: description || null, shippingCents: shippingCents ?? null }),
  });
  if (!response.ok) throw new Error(`Create category failed: ${response.status}`);
  const data = await response.json();
  return (data as any).category ?? null;
}

export async function adminUpdateCategory(id: string, updates: Partial<Category>): Promise<Category | null> {
  const response = await adminFetch(`${ADMIN_CATEGORIES_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error(`Update category failed: ${response.status}`);
  const data = await response.json();
  return (data as any).category ?? null;
}

export async function adminDeleteCategory(id: string): Promise<void> {
  const response = await adminFetch(`${ADMIN_CATEGORIES_PATH}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Delete category failed: ${response.status}`);
}

export type ProductUploadInitResponse = {
  uploadId: string;
  putUrl: string;
  expiresInSeconds: number;
  objectKey?: string;
};

export async function adminInitProductImageUpload(
  file: File,
  mimeOverride?: string
): Promise<ProductUploadInitResponse> {
  const normalizedMime = typeof mimeOverride === 'string' ? mimeOverride.trim() : '';
  const mimeValue = normalizedMime || file.type || undefined;
  const response = await adminFetch('/api/admin/products/images/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      filename: file.name || 'upload',
      size: file.size,
      mime: mimeValue || undefined,
    }),
  });
  const text = await response.text().catch(() => '');
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = data?.error || text || `Init upload failed (${response.status}).`;
    throw new Error(message);
  }
  const uploadId = typeof data?.uploadId === 'string' ? data.uploadId : '';
  const putUrl = typeof data?.putUrl === 'string' ? data.putUrl : '';
  if (!uploadId || !putUrl) {
    throw new Error('Init upload response missing uploadId/putUrl.');
  }
  return {
    uploadId,
    putUrl,
    expiresInSeconds: Number(data?.expiresInSeconds) || 900,
    objectKey: typeof data?.objectKey === 'string' ? data.objectKey : undefined,
  };
}

export async function adminConfirmProductImageUpload(uploadId: string): Promise<{ id: string; url: string }> {
  const response = await adminFetch('/api/admin/products/images/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ uploadId }),
  });
  const text = await response.text().catch(() => '');
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = data?.error || text || `Confirm upload failed (${response.status}).`;
    throw new Error(message);
  }
  const id =
    (typeof data?.id === 'string' && data.id) ||
    (typeof data?.image?.id === 'string' && data.image.id) ||
    '';
  const url =
    (typeof data?.url === 'string' && data.url) ||
    (typeof data?.image?.publicUrl === 'string' && data.image.publicUrl) ||
    '';
  if (!id || !url) {
    throw new Error('Confirm upload response missing id/url.');
  }
  return { id, url };
}

export async function adminAbortProductImageUpload(uploadId: string): Promise<void> {
  const response = await adminFetch('/api/admin/products/images/abort', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ uploadId }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Abort upload failed (${response.status}).`);
  }
}

export type AdminUploadOptions = {
  scope?: 'products' | 'gallery' | 'home' | 'categories';
  entityType?: string;
  entityId?: string;
  kind?: string;
  isPrimary?: boolean;
  sortOrder?: number;
};

type PreflightProbeResult = {
  attempted: boolean;
  status?: number | null;
  ok?: boolean | null;
  responseText?: string | null;
  error?: string | null;
};

let uploadPreflightProbeDone = false;
let uploadPreflightProbeResult: PreflightProbeResult | null = null;

export async function adminUploadImage(
  file: File,
  options: AdminUploadOptions = {}
): Promise<{
  id: string;
  url: string;
}> {
  const debugUploads = debugUploadsEnabled();
  const rid = crypto.randomUUID();
  const fileMeta = {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  };
  dlog('adminUploadImage start', { rid, scope: options.scope || 'products', ...fileMeta });
  trace('adminUploadImage start', { rid, scope: options.scope || 'products', ...fileMeta });
  const query = new URLSearchParams({ rid });
  if (options.scope) query.set('scope', options.scope);
  if (debugUploads) query.set('debug', '1');
  const url = `/api/admin/images/upload?${query.toString()}`;
  const parsedUrl = typeof window !== 'undefined'
    ? new URL(url, window.location.origin)
    : null;
  const requestUrl = parsedUrl ? parsedUrl.toString() : url;
  const requestPath = parsedUrl ? `${parsedUrl.pathname}${parsedUrl.search}` : url;
  const method = 'POST';
  const adminHeaderPresent = hasAdminPasswordInStorage();
  const logDebug = (...args: unknown[]) => {
    if (debugUploads) console.debug(...args);
  };
  const logWarn = (...args: unknown[]) => {
    if (debugUploads) console.warn(...args);
  };

  if (debugUploads && !uploadPreflightProbeDone) {
    uploadPreflightProbeDone = true;
    try {
      const probeResponse = await fetch(url, { method: 'OPTIONS' });
      const probeText = await probeResponse.text().catch(() => '');
      uploadPreflightProbeResult = {
        attempted: true,
        status: probeResponse.status,
        ok: probeResponse.ok,
        responseText: truncate(probeText),
      };
      logDebug('[admin image upload] preflight probe', {
        status: probeResponse.status,
        ok: probeResponse.ok,
      });
    } catch (err) {
      uploadPreflightProbeResult = {
        attempted: true,
        status: null,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
      logWarn('[admin image upload] preflight probe failed', uploadPreflightProbeResult.error);
    }
  }

  const uploadSingle = async (
    uploadFile: File,
    extraFields: Record<string, string>,
    includeMeta: boolean
  ): Promise<{ id: string; url: string }> => {
    const uploadMeta = {
      name: uploadFile.name,
      size: uploadFile.size,
      type: uploadFile.type,
      lastModified: uploadFile.lastModified,
      variant: extraFields.variant || 'original',
    };
    dlog('adminUploadImage build formdata', { rid, ...uploadMeta });
    trace('adminUploadImage build formdata', { rid, ...uploadMeta });
    const form = new FormData();
    form.append('file', uploadFile, uploadFile.name || 'upload');
    if (includeMeta) {
      if (options.entityType) form.append('entityType', options.entityType);
      if (options.entityId) form.append('entityId', options.entityId);
      if (options.kind) form.append('kind', options.kind);
      if (options.isPrimary !== undefined) form.append('isPrimary', options.isPrimary ? '1' : '0');
      if (options.sortOrder !== undefined) form.append('sortOrder', String(options.sortOrder));
    } else {
      if (options.entityType) form.append('entityType', options.entityType);
      if (options.entityId) form.append('entityId', options.entityId);
      if (options.kind) form.append('kind', options.kind);
    }
    Object.entries(extraFields).forEach(([key, value]) => form.append(key, value));

    logDebug('[admin image upload] request', {
      rid,
      scope: options.scope || 'products',
      url,
      method,
      adminHeaderPresent,
      bodyIsFormData: form instanceof FormData,
      fileCount: 1,
      fileSizes: [uploadFile.size],
      fileName: uploadFile.name,
      fileType: uploadFile.type,
      variant: extraFields.variant || null,
      sourceImageId: extraFields.sourceImageId || null,
    });

    let response: Response;
    try {
      dlog('adminUploadImage about to fetch', { rid, url, method, variant: extraFields.variant || 'original' });
      trace('adminUploadImage about to fetch', { rid, url, method, variant: extraFields.variant || 'original' });
      response = await adminFetch(url, {
        method,
        headers: { 'X-Upload-Request-Id': rid },
        body: form,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorName = err instanceof Error ? err.name : null;
      const messageWithHint = errorName === 'AbortError' ? `AbortError: ${message}` : message;
      const errorStack = err instanceof Error && err.stack ? truncate(err.stack) : undefined;
      derr('adminUploadImage fetch threw', errorName, message, errorStack);
      trace('adminUploadImage fetch threw', { rid, errorName, message, errorStack });
      logDebug('[admin image upload] fetch error', {
        rid,
        url,
        adminHeaderPresent,
        fileName: uploadFile.name,
        fileSize: uploadFile.size,
        fileType: uploadFile.type,
        error: message,
      });
      const error = err instanceof Error ? err : new Error(message);
      (error as Error & { debug?: Record<string, unknown> }).debug = {
        status: null,
        statusText: null,
        responseText: null,
        url,
        adminHeaderPresent,
        fileName: uploadFile.name,
        fileSize: uploadFile.size,
        fileType: uploadFile.type,
      };
      if (extraFields.variant === 'original') {
        recordUploadAttempt({
          requestId: rid,
          timestamp: new Date().toISOString(),
          fileName: uploadFile.name,
          fileSize: uploadFile.size,
          fileType: uploadFile.type || '',
          requestPath,
          requestUrl,
          adminHeaderAttached: adminHeaderPresent,
          responseStatus: null,
          responseText: null,
          errorName,
          errorMessage: truncate(messageWithHint),
          preflight: uploadPreflightProbeResult || { attempted: false },
        });
      }
      throw error;
    }

    const responseText = await response.text().catch(() => '');
    const responseSnippet = truncate(responseText);
    dlog('adminUploadImage response', { rid, status: response.status, ok: response.ok });
    trace('adminUploadImage response', { rid, status: response.status, ok: response.ok });
    logDebug('[admin image upload] response', {
      rid,
      status: response.status,
      statusText: response.statusText,
      bodySnippet: responseSnippet,
    });

    if (!response.ok) {
      derr('adminUploadImage non-2xx', {
        rid,
        status: response.status,
        statusText: response.statusText,
        response: responseSnippet,
      });
      trace('adminUploadImage non-2xx', {
        rid,
        status: response.status,
        statusText: response.statusText,
        response: responseSnippet,
      });
      const error = new Error(
        debugUploads
          ? `Upload failed (${response.status} ${response.statusText || 'Error'}).`
          : `Upload failed (${response.status}).`
      );
      (error as Error & { debug?: Record<string, unknown> }).debug = {
        status: response.status,
        statusText: response.statusText,
        responseText: responseSnippet,
        url,
        adminHeaderPresent,
        fileName: uploadFile.name,
        fileSize: uploadFile.size,
        fileType: uploadFile.type,
      };
      logDebug('[admin image upload] non-2xx', {
        status: response.status,
        statusText: response.statusText,
        url,
        adminHeaderPresent,
        bodySnippet: responseSnippet,
      });
      if (extraFields.variant === 'original') {
        recordUploadAttempt({
          requestId: rid,
          timestamp: new Date().toISOString(),
          fileName: uploadFile.name,
          fileSize: uploadFile.size,
          fileType: uploadFile.type || '',
          requestPath,
          requestUrl,
          adminHeaderAttached: adminHeaderPresent,
          responseStatus: response.status,
          responseText: responseSnippet,
          errorName: 'HttpError',
          errorMessage: truncate(error.message),
          preflight: uploadPreflightProbeResult || { attempted: false },
        });
      }
      throw error;
    }

    let data: any = null;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch (err) {
      derr('adminUploadImage invalid json', {
        rid,
        status: response.status,
        response: responseSnippet,
      });
      trace('adminUploadImage invalid json', {
        rid,
        status: response.status,
        response: responseSnippet,
      });
      logDebug('[admin image upload] invalid json', { status: response.status, url });
      if (extraFields.variant === 'original') {
        recordUploadAttempt({
          requestId: rid,
          timestamp: new Date().toISOString(),
          fileName: uploadFile.name,
          fileSize: uploadFile.size,
          fileType: uploadFile.type || '',
          requestPath,
          requestUrl,
          adminHeaderAttached: adminHeaderPresent,
          responseStatus: response.status,
          responseText: responseSnippet,
          errorName: err instanceof Error ? err.name : 'InvalidJson',
          errorMessage: truncate(err instanceof Error ? err.message : 'Invalid JSON'),
          preflight: uploadPreflightProbeResult || { attempted: false },
        });
      }
      const error = new Error(
        debugUploads
          ? `Upload failed (${response.status}). Server: invalid-json.`
          : `Upload failed (${response.status}).`
      );
      (error as Error & { debug?: Record<string, unknown> }).debug = {
        status: response.status,
        statusText: response.statusText,
        responseText: responseSnippet,
        url,
        adminHeaderPresent,
        fileName: uploadFile.name,
        fileSize: uploadFile.size,
        fileType: uploadFile.type,
      };
      throw error;
    }
    const normalizedId =
      (typeof data?.image?.id === 'string' && data.image.id) ||
      (typeof data?.id === 'string' && data.id) ||
      (typeof data?.image?.storageKey === 'string' && data.image.storageKey) ||
      '';
    const normalizedUrl =
      (typeof data?.image?.publicUrl === 'string' && data.image.publicUrl) ||
      (typeof data?.url === 'string' && data.url) ||
      '';

    if (!normalizedId || !normalizedUrl) {
      derr('adminUploadImage missing fields', {
        rid,
        status: response.status,
        response: responseSnippet,
      });
      trace('adminUploadImage missing fields', {
        rid,
        status: response.status,
        response: responseSnippet,
      });
      if (extraFields.variant === 'original') {
        recordUploadAttempt({
          requestId: rid,
          timestamp: new Date().toISOString(),
          fileName: uploadFile.name,
          fileSize: uploadFile.size,
          fileType: uploadFile.type || '',
          requestPath,
          requestUrl,
          adminHeaderAttached: adminHeaderPresent,
          responseStatus: response.status,
          responseText: responseSnippet,
          errorName: 'MissingFields',
          errorMessage: truncate('Upload succeeded but response missing id/url'),
          preflight: uploadPreflightProbeResult || { attempted: false },
        });
      }
      const error = new Error(`Image upload failed rid=${rid} status=${response.status} body=missing-fields`);
      (error as Error & { debug?: Record<string, unknown> }).debug = {
        status: response.status,
        statusText: response.statusText,
        responseText: responseSnippet,
        url,
        adminHeaderPresent,
        fileName: uploadFile.name,
        fileSize: uploadFile.size,
        fileType: uploadFile.type,
      };
      throw error;
    }
    const topKeys = data && typeof data === 'object' ? Object.keys(data) : [];
    const imageKeys =
      data && typeof data === 'object' && data.image && typeof data.image === 'object'
        ? Object.keys(data.image)
        : [];
    dlog('adminUploadImage response json', {
      rid,
      status: response.status,
      keys: topKeys,
      imageKeys,
    });
    trace('adminUploadImage response json', {
      rid,
      status: response.status,
      keys: topKeys,
      imageKeys,
    });
    if (extraFields.variant === 'original') {
      recordUploadAttempt({
        requestId: rid,
        timestamp: new Date().toISOString(),
        fileName: uploadFile.name,
        fileSize: uploadFile.size,
        fileType: uploadFile.type || '',
        requestPath,
        requestUrl,
        adminHeaderAttached: adminHeaderPresent,
        responseStatus: response.status,
        responseText: responseSnippet,
        preflight: uploadPreflightProbeResult || { attempted: false },
      });
    }
    return {
      id: normalizedId,
      url: normalizedUrl,
    };
  };

  const original = await uploadSingle(file, { variant: 'original' }, true);

  const uploadVariant = async (variantFile: File, variant: 'thumb' | 'medium') => {
    try {
      await uploadSingle(variantFile, { variant, sourceImageId: original.id }, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logWarn(`[admin image upload] ${variant} variant upload failed`, message);
    }
  };

  try {
    const thumb = await createWebpVariant(file, 512, 0.72);
    void uploadVariant(thumb, 'thumb');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logWarn('[admin image upload] thumb variant generation failed', message);
  }

  try {
    const medium = await createWebpVariant(file, 1280, 0.78);
    void uploadVariant(medium, 'medium');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logWarn('[admin image upload] medium variant generation failed', message);
  }

  return original;
}

export async function adminDeleteImage(id: string): Promise<void> {
  const response = await adminFetch(`/api/admin/images/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();
  if (!response.ok) {
    const trimmed = text.length > 500 ? `${text.slice(0, 500)}...` : text;
    throw new Error(trimmed || `Delete image failed (${response.status})`);
  }
}

export async function adminDeleteMessage(id: string): Promise<void> {
  const response = await adminFetch(`/api/admin/messages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();
  if (!response.ok) {
    const trimmed = text.length > 500 ? `${text.slice(0, 500)}...` : text;
    throw new Error(trimmed || `Delete message failed (${response.status})`);
  }
}

export async function subscribeToEmailList(email: string): Promise<{
  signup: EmailListSignup;
  alreadySubscribed: boolean;
}> {
  const response = await fetch('/api/email-list/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    const message = data?.error || `Email signup failed (${response.status})`;
    throw new Error(message);
  }
  return {
    signup: {
      id: data.signup?.id || '',
      email: data.signup?.email || email,
      createdAt: data.signup?.createdAt || '',
    },
    alreadySubscribed: !!data?.alreadySubscribed,
  };
}

export async function adminFetchEmailList(): Promise<EmailListSignup[]> {
  const response = await adminFetch('/api/admin/email-list', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Admin email list fetch failed: ${response.status}`);
  const data = await response.json().catch(() => ({}));
  const signups = Array.isArray(data?.signups) ? data.signups : [];
  return signups.map((row: any) => ({
    id: row.id || '',
    email: row.email || '',
    createdAt: row.createdAt || row.created_at || '',
  }));
}

