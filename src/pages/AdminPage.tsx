import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchGalleryImages,
  fetchHomeHeroConfig,
  fetchOrders,
  fetchSoldProducts,
  saveGalleryImages,
  saveHomeHeroConfig,
  verifyAdminPassword,
  adminFetchProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminInitProductImageUpload,
  adminConfirmProductImageUpload,
  adminAbortProductImageUpload,
  adminDeleteImage,
} from '../lib/api';
import {
  clearStoredAdminPassword,
  getAdminAuthStatus,
  getStoredAdminPassword,
  setStoredAdminPassword,
} from '../lib/adminAuth';
import { GalleryImage, HeroCollageImage, HeroConfig, Product } from '../lib/types';
import type { AdminOrder } from '../lib/db/orders';
import { AdminOrdersTab } from '../components/admin/AdminOrdersTab';
import { AdminSoldTab } from '../components/admin/AdminSoldTab';
import { AdminGalleryTab } from '../components/admin/AdminGalleryTab';
import { AdminHomeTab } from '../components/admin/AdminHomeTab';
import { AdminMessagesTab } from '../components/admin/AdminMessagesTab';
import { AdminShopTab } from '../components/admin/AdminShopTab';
import { AdminCustomOrdersTab } from '../components/admin/AdminCustomOrdersTab';
import { AdminPromotionsTab } from '../components/admin/AdminPromotionsTab';
import { AdminEmailListTab } from '../components/admin/AdminEmailListTab';
import { AdminUploadDiagnosticsPanel } from '../components/admin/AdminUploadDiagnosticsPanel';
import { OrderDetailsModal } from '../components/admin/OrderDetailsModal';
import {
  getAdminCustomOrders,
  createAdminCustomOrder,
  sendAdminCustomOrderPaymentLink,
  archiveAdminCustomOrder,
} from '../lib/db/customOrders';
import type { AdminCustomOrder } from '../lib/db/customOrders';
import { debugUploadsEnabled, dlog, derr, formatUploadDebugError, truncate } from '../lib/debugUploads';
import { trace } from '../lib/uploadTrace';
import { recordProductUploadTrace } from '../lib/productUploadTrace';
import { probeFileReadable } from '../lib/fileReadiness';
import { isAllowedImageFile } from '../lib/fileTypes';
import { diag } from '../lib/uploadDiagnostics';

export type ProductFormState = {
  name: string;
  description: string;
  price: string;
  category: string;
  imageUrl: string;
  imageUrls: string;
  quantityAvailable: number;
  isOneOff: boolean;
  isActive: boolean;
  collection?: string;
  stripePriceId?: string;
  stripeProductId?: string;
};

export type UploadStatus = 'empty' | 'queued' | 'uploading' | 'uploaded' | 'error';

export type ShopImage = {
  id: string;
  url: string;
  file?: File;
  isPrimary: boolean;
  isNew?: boolean;
  uploading: boolean;
  status?: UploadStatus;
  uploadError?: string;
  uploadToken?: string;
  uploadId?: string;
  uploadStartedAt?: number;
  errorMessage?: string;
  imageId?: string;
  previewUrl?: string;
  needsMigration?: boolean;
  sortOrder?: number;
};

export type ManagedImage = ShopImage;

const normalizeCategoryValue = (value: string | undefined | null) => (value || '').trim();
const createUploadToken = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `upload_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};
const UPLOAD_TIMEOUT_MS = 60_000;

type QueuedUpload = {
  id: string;
  file: File;
  previewUrl: string;
  uploadToken: string;
  uploadStartedAt: number;
  normalizedMime?: string;
  setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>;
  getImages: () => ManagedImage[];
  source: 'create' | 'edit';
};

const initialProductForm: ProductFormState = {
  name: '',
  description: '',
  price: '',
  category: '',
  imageUrl: '',
  imageUrls: '',
  quantityAvailable: 1,
  isOneOff: true,
  isActive: true,
  collection: '',
  stripePriceId: '',
  stripeProductId: '',
};

export function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [adminAuthNotice, setAdminAuthNotice] = useState('');
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [soldProducts, setSoldProducts] = useState<Product[]>([]);
  const [adminProducts, setAdminProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [heroConfig, setHeroConfig] = useState<HeroConfig>({
    heroImages: [],
    heroRotationEnabled: false,
  });
  const [activeTab, setActiveTab] = useState<'orders' | 'shop' | 'messages' | 'emailList' | 'customOrders' | 'images' | 'sold' | 'promotions'>('orders');
  const [gallerySaveState, setGallerySaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [homeSaveState, setHomeSaveState] = useState<'idle' | 'saving' | 'success'>('idle');
  const [gallerySaveError, setGallerySaveError] = useState('');
  const [homeSaveError, setHomeSaveError] = useState('');
  const [productSaveState, setProductSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [editProductSaveState, setEditProductSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [productStatus, setProductStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [productForm, setProductForm] = useState<ProductFormState>(initialProductForm);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [editProductForm, setEditProductForm] = useState<ProductFormState | null>(null);
  const [productImages, setProductImages] = useState<ManagedImage[]>([]);
  const [editProductImages, setEditProductImages] = useState<ManagedImage[]>([]);
  const [productUploadNotice, setProductUploadNotice] = useState('');
  const [editProductUploadNotice, setEditProductUploadNotice] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const productImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const editProductImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const [messages] = useState<any[]>([]);
  const [customOrders, setCustomOrders] = useState<AdminCustomOrder[]>([]);
  const [customOrderDraft, setCustomOrderDraft] = useState<any>(null);
  const [customOrdersError, setCustomOrdersError] = useState<string | null>(null);
  const [isLoadingCustomOrders, setIsLoadingCustomOrders] = useState(false);
  const debugUploads = debugUploadsEnabled();
  const logUploadDebug = (...args: unknown[]) => {
    if (debugUploads) console.debug(...args);
  };
  const uploadQueueRef = useRef<QueuedUpload[]>([]);
  const uploadProcessingRef = useRef(false);
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  const uploadTimeoutsRef = useRef(new Map<string, number>());
  const productImagesRef = useRef<ManagedImage[]>([]);
  const editProductImagesRef = useRef<ManagedImage[]>([]);
  const uploadNoticeTimeoutsRef = useRef<{ create?: number; edit?: number }>({});

  useEffect(() => {
    productImagesRef.current = productImages;
  }, [productImages]);

  useEffect(() => {
    editProductImagesRef.current = editProductImages;
  }, [editProductImages]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orders;

    return orders.filter((order) => {
      const idMatch =
        (order.displayOrderId || order.id || '').toLowerCase().includes(q);
      const nameMatch = (order.customerName ?? '').toLowerCase().includes(q);
      const emailMatch = (order.customerEmail ?? '').toLowerCase().includes(q);
      const productMatch = order.items?.some((item) =>
        (item.productName ?? '').toLowerCase().includes(q)
      );
      return idMatch || nameMatch || emailMatch || productMatch;
    });
  }, [orders, searchQuery]);

  const formatCurrency = (cents: number, currency: string = 'usd') => {
    const amount = (cents ?? 0) / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  const handleSaveHeroConfig = async () => {
    setHomeSaveState('saving');
    setHomeSaveError('');
    try {
      const hasUploads =
        (heroConfig.heroImages || []).some((img) => img?.uploading);
      const hasErrors =
        (heroConfig.heroImages || []).some((img) => img?.uploadError);
      if (hasUploads) {
        setHomeSaveState('idle');
        console.error('Cannot save while hero images are uploading.');
        return;
      }
      if (hasErrors) {
        setHomeSaveState('idle');
        console.error('Cannot save due to upload errors.');
        return;
      }
      const configToSave: HeroConfig = {
        heroImages: (heroConfig.heroImages || []).filter((img) => !!img?.imageUrl).slice(0, 1),
        heroRotationEnabled: !!heroConfig.heroRotationEnabled,
      };
      await saveHomeHeroConfig(configToSave);
      setHomeSaveState('success');
      setTimeout(() => setHomeSaveState('idle'), 1500);
    } catch (err) {
      console.error('Failed to save home hero images', err);
      setHomeSaveError(err instanceof Error ? err.message : 'Save failed.');
      setHomeSaveState('idle');
    }
  };

  useEffect(() => {
    const stored = getStoredAdminPassword();
    if (!stored) return;

    const verifyStored = async () => {
      setIsLoading(true);
      try {
        const status = await getAdminAuthStatus(stored);
        if (status.matches) {
          setIsAuthenticated(true);
          setAuthNotice('');
          loadAdminData();
        } else {
          clearStoredAdminPassword();
          setIsAuthenticated(false);
          setAuthNotice('Admin password incorrect — update it.');
        }
      } catch (err) {
        setAuthNotice('Unable to verify admin password. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    void verifyStored();
  }, []);

  useEffect(() => {
    const handler = () => {
      setAdminAuthNotice('Admin auth failed. Check /api/admin/debug-auth.');
    };
    window.addEventListener('admin-auth-failed', handler as EventListener);
    return () => {
      window.removeEventListener('admin-auth-failed', handler as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === 'shop' || activeTab === 'sold') {
      loadAdminProducts();
      refreshSoldProducts();
    }
  }, [activeTab, isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setAuthNotice('');

    try {
      const result = await verifyAdminPassword(password);
      if (result) {
        localStorage.setItem('admin_password', password);
        setIsAuthenticated(true);
        loadAdminData();
      } else {
        setError('Invalid password');
      }
    } catch (err) {
      setError('Error verifying password');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAdminData = async () => {
    // Fetch orders first with explicit loading/error handling so UI never shows stale empty data.
    setIsLoadingOrders(true);
    try {
      const ordersData = await fetchOrders();
      setOrders(ordersData);
      setOrdersError(null);
      if (import.meta.env.DEV) {
        console.debug('[admin] fetched orders', { count: ordersData.length });
      }
    } catch (err) {
      console.error('Failed to load admin orders', err);
      setOrdersError(err instanceof Error ? err.message : 'Failed to load orders');
      setOrders([]);
    } finally {
      setIsLoadingOrders(false);
    }

    // Fetch other admin data in parallel; failures here should not hide orders.
    try {
      const [soldData, galleryData, heroData] = await Promise.all([
        fetchSoldProducts().catch((err) => {
          console.error('Failed to load sold products', err);
          return [];
        }),
        fetchGalleryImages().catch((err) => {
          console.error('Failed to load gallery images', err);
          return [];
        }),
        fetchHomeHeroConfig().catch((err) => {
          console.error('Failed to load home hero config', err);
          return { heroImages: [] };
        }),
      ]);
      setSoldProducts(soldData);
      setGalleryImages(galleryData);
      setHeroConfig({
        heroImages: (heroData.heroImages || []).slice(0, 1),
        heroRotationEnabled: !!heroData.heroRotationEnabled,
      });
    } catch (err) {
      // Already logged per-call; avoid throwing to keep orders visible.
    }

    await loadAdminProducts();
    await loadCustomOrders();
  };

  const loadCustomOrders = async () => {
    setIsLoadingCustomOrders(true);
    if (import.meta.env.DEV) {
      console.debug('[custom orders] fetching');
    }
    try {
      const orders = await getAdminCustomOrders();
      setCustomOrders(orders);
      setCustomOrdersError(null);
      if (import.meta.env.DEV) {
        console.debug('[custom orders] fetched', { count: orders.length, first: orders[0] });
      }
    } catch (err) {
      console.error('Failed to load custom orders', err);
      setCustomOrders([]);
      setCustomOrdersError(err instanceof Error ? err.message : 'Failed to load custom orders');
    } finally {
      setIsLoadingCustomOrders(false);
      if (import.meta.env.DEV) {
        console.debug('[custom orders] state set (post-load)');
      }
    }
  };

  const handleLogout = () => {
    clearStoredAdminPassword();
    setIsAuthenticated(false);
    setPassword('');
  };

  const refreshSoldProducts = async () => {
    try {
      const data = await fetchSoldProducts();
      setSoldProducts(data);
    } catch (err) {
      console.error('Failed to refresh sold products', err);
    }
  };

  const loadAdminProducts = async () => {
    setIsLoadingProducts(true);
    try {
      const data = await adminFetchProducts();
      setAdminProducts(data);
    } catch (err) {
      console.error('Failed to load admin products', err);
      setProductStatus({ type: 'error', message: 'Could not load products.' });
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const handleProductFormChange = (field: keyof ProductFormState, value: string | number | boolean) => {
    setProductForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditFormChange = (field: keyof ProductFormState, value: string | number | boolean) => {
    setEditProductForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const resetProductForm = () => {
    setProductForm({ ...initialProductForm });
    setProductImages([]);
    productImagesRef.current = [];
    setProductUploadNotice('');
  };

  const setUploadNotice = (source: 'create' | 'edit', message: string) => {
    const setter = source === 'create' ? setProductUploadNotice : setEditProductUploadNotice;
    setter(message);
    const key = source === 'create' ? 'create' : 'edit';
    const existingTimeout = uploadNoticeTimeoutsRef.current[key];
    if (existingTimeout) clearTimeout(existingTimeout);
    if (typeof window !== 'undefined' && message) {
      uploadNoticeTimeoutsRef.current[key] = window.setTimeout(() => {
        setter('');
        uploadNoticeTimeoutsRef.current[key] = undefined;
      }, 4500);
    }
  };

  const formatPreflightMessage = (message: string, code?: string) =>
    code ? `${message} (code: ${code})` : message;

  const classifyUploadError = (err: unknown, stage: 'init' | 'put' | 'confirm' | 'unknown') => {
    const errorName = err instanceof Error ? err.name : 'Error';
    const rawMessage = err instanceof Error ? err.message : String(err);
    const normalized = (rawMessage || '').toLowerCase();

    if (errorName === 'AbortError') {
      return { code: 'UPLOAD_ABORTED', message: 'Upload was cancelled.' };
    }
    if (normalized.includes('timed out') || normalized.includes('timeout')) {
      return { code: 'UPLOAD_TIMEOUT', message: 'Upload timed out. Please retry.' };
    }
    if (
      normalized.includes('failed to fetch') ||
      normalized.includes('networkerror') ||
      normalized.includes('network error')
    ) {
      return { code: 'NETWORK_ERROR', message: 'Network error while uploading. Check your connection and retry.' };
    }

    const trimmed = truncate(rawMessage || 'Upload failed.', 140);
    if (stage === 'init') {
      return { code: 'INIT_FAILED', message: `Init failed: ${trimmed}` };
    }
    if (stage === 'put') {
      return { code: 'PUT_FAILED', message: `Upload failed while sending file: ${trimmed}` };
    }
    if (stage === 'confirm') {
      return { code: 'CONFIRM_FAILED', message: `Upload confirm failed: ${trimmed}` };
    }
    return { code: 'UPLOAD_FAILED', message: `Upload failed: ${trimmed}` };
  };

  const cancelUploadToken = (token?: string, uploadId?: string) => {
    if (token) {
      uploadQueueRef.current = uploadQueueRef.current.filter((entry) => entry.uploadToken !== token);
      const controller = uploadControllersRef.current.get(token);
      if (controller) {
        controller.abort();
        uploadControllersRef.current.delete(token);
      }
      const timeoutId = uploadTimeoutsRef.current.get(token);
      if (timeoutId) {
        clearTimeout(timeoutId);
        uploadTimeoutsRef.current.delete(token);
      }
    }
    if (uploadId) {
      void adminAbortProductImageUpload(uploadId).catch((err) => {
        if (debugUploads) console.warn('[shop images] abort failed', err);
      });
    }
  };

  const processUploadQueue = async () => {
    if (uploadProcessingRef.current) return;
    uploadProcessingRef.current = true;
    while (uploadQueueRef.current.length > 0) {
      const next = uploadQueueRef.current.shift();
      if (!next) break;
      await runQueuedUpload(next);
    }
    uploadProcessingRef.current = false;
  };

  const enqueueUploads = (entries: QueuedUpload[]) => {
    if (!entries.length) return;
    uploadQueueRef.current.push(...entries);
    void processUploadQueue();
  };

  const runQueuedUpload = async (entry: QueuedUpload) => {
    const { id, file, previewUrl, uploadToken, uploadStartedAt, setImages, getImages, source } = entry;
    let stage: 'init' | 'put' | 'confirm' | 'unknown' = 'unknown';
    const isCurrent = () => {
      const current = getImages().find((img) => img.id === id);
      return !!current && current.uploadToken === uploadToken;
    };
    const updateIfCurrent = (patch: Partial<ManagedImage>) => {
      setImages((prev) =>
        prev.map((img) =>
          img.id === id && img.uploadToken === uploadToken
            ? {
                ...img,
                ...patch,
              }
            : img
        )
      );
    };

    if (!isCurrent()) {
      recordProductUploadTrace('skip', { id, reason: 'stale' });
      diag('early_return', { reasonCode: 'STALE_TOKEN', source, id });
      return;
    }

    const fileMeta = {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    };
    recordProductUploadTrace('init start', { id, source, ...fileMeta });
    dlog('product upload start', { id, source, ...fileMeta });
    trace('product upload start', { id, source, ...fileMeta });

    const readiness = await probeFileReadable(file);
    if (!readiness.ok) {
      const message = formatPreflightMessage(readiness.message, readiness.code);
      recordProductUploadTrace('probe_failed', { id, source, code: readiness.code, ...fileMeta });
      diag('probe_failed', {
        id,
        source,
        code: readiness.code,
        file: { name: file.name, size: file.size, type: file.type || '' },
        debug: readiness.debug,
      });
      diag('early_return', {
        id,
        source,
        reasonCode: readiness.code,
      });
      updateIfCurrent({
        uploading: false,
        status: 'error',
        uploadError: message,
        errorMessage: debugUploads ? readiness.debug : undefined,
      });
      return;
    }

    const typeCheck = isAllowedImageFile(file);
    if (!typeCheck.ok) {
      const message = formatPreflightMessage(typeCheck.reason || 'Unsupported file type.', typeCheck.code || 'FILE_TYPE_BLOCKED');
      recordProductUploadTrace('type_blocked', { id, source, code: typeCheck.code, ...fileMeta });
      diag('type_blocked', {
        id,
        source,
        code: typeCheck.code || 'FILE_TYPE_BLOCKED',
        reason: typeCheck.reason,
        file: { name: file.name, size: file.size, type: file.type || '' },
      });
      diag('early_return', {
        id,
        source,
        reasonCode: typeCheck.code || 'FILE_TYPE_BLOCKED',
      });
      updateIfCurrent({
        uploading: false,
        status: 'error',
        uploadError: message,
      });
      return;
    }

    const normalizedMime = entry.normalizedMime || typeCheck.normalizedMime;

    updateIfCurrent({
      uploading: true,
      status: 'uploading',
      uploadError: undefined,
      errorMessage: undefined,
      uploadStartedAt,
    });

    const controller = new AbortController();
    uploadControllersRef.current.set(uploadToken, controller);
    let uploadId: string | null = null;

    const timeoutId = setTimeout(() => {
      if (!isCurrent()) return;
      recordProductUploadTrace('timeout', { id, uploadId, source });
      controller.abort();
      const timedMessage = formatPreflightMessage('Upload timed out. Please retry.', 'UPLOAD_TIMEOUT');
      updateIfCurrent({
        uploading: false,
        status: 'error',
        uploadError: timedMessage,
        errorMessage: debugUploads ? 'Upload timed out.' : undefined,
      });
      if (uploadId) {
        void adminAbortProductImageUpload(uploadId).catch((err) => {
          if (debugUploads) console.warn('[shop images] abort failed', err);
        });
      }
    }, UPLOAD_TIMEOUT_MS);
    uploadTimeoutsRef.current.set(uploadToken, timeoutId);

    try {
      stage = 'init';
      const init = await adminInitProductImageUpload(file, normalizedMime);
      uploadId = init.uploadId;
      recordProductUploadTrace('init ok', { id, uploadId, source, expiresIn: init.expiresInSeconds });
      if (!isCurrent()) {
        if (uploadId) {
          void adminAbortProductImageUpload(uploadId).catch((err) => {
            if (debugUploads) console.warn('[shop images] abort failed', err);
          });
        }
        return;
      }
      updateIfCurrent({ uploadId });

      stage = 'put';
      recordProductUploadTrace('put start', { id, uploadId, source });
      const putResponse = await fetch(init.putUrl, {
        method: 'PUT',
        body: file,
        signal: controller.signal,
      });
      const putText = await putResponse.text().catch(() => '');
      if (!putResponse.ok) {
        throw new Error(putText || `Upload failed (${putResponse.status}).`);
      }
      recordProductUploadTrace('put ok', { id, uploadId, source, status: putResponse.status });

      if (!isCurrent()) {
        if (uploadId) {
          void adminAbortProductImageUpload(uploadId).catch((err) => {
            if (debugUploads) console.warn('[shop images] abort failed', err);
          });
        }
        return;
      }

      stage = 'confirm';
      recordProductUploadTrace('confirm start', { id, uploadId, source });
      const confirmed = await adminConfirmProductImageUpload(uploadId);
      recordProductUploadTrace('confirm ok', { id, uploadId, source, imageId: confirmed.id });
      if (!isCurrent()) return;

      URL.revokeObjectURL(previewUrl);
      updateIfCurrent({
        url: confirmed.url,
        imageId: confirmed.id,
        file: undefined,
        previewUrl: undefined,
        uploading: false,
        status: 'uploaded',
        uploadError: undefined,
        errorMessage: undefined,
        uploadId: undefined,
      });
    } catch (err) {
      const errorName = err instanceof Error ? err.name : 'Error';
      const errorMessage = err instanceof Error ? err.message : String(err);
      const classification = classifyUploadError(err, stage);
      const userMessage = formatPreflightMessage(classification.message, classification.code);
      recordProductUploadTrace('error', {
        id,
        uploadId,
        source,
        errorName,
        errorMessage,
        code: classification.code,
        stage,
      });
      diag(
        'upload_error',
        {
          id,
          uploadId,
          source,
          stage,
          code: classification.code,
          message: classification.message,
        },
        'error'
      );
      dlog('product upload error', { id, errorName, errorMessage, code: classification.code, stage });
      trace('product upload error', { id, errorName, errorMessage, code: classification.code, stage });
      if (uploadId && errorName !== 'AbortError') {
        void adminAbortProductImageUpload(uploadId).catch((abortErr) => {
          if (debugUploads) console.warn('[shop images] abort failed', abortErr);
        });
      }
      if (isCurrent()) {
        const message = userMessage;
        const detailMessage = debugUploads ? formatUploadDebugError(err) : truncate(errorMessage);
        updateIfCurrent({
          uploading: false,
          status: 'error',
          uploadError: message,
          ...(detailMessage ? { errorMessage: detailMessage } : {}),
        });
      }
    } finally {
      const pendingTimeout = uploadTimeoutsRef.current.get(uploadToken);
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        uploadTimeoutsRef.current.delete(uploadToken);
      }
      uploadControllersRef.current.delete(uploadToken);
      setImages((prev) =>
        prev.map((img) =>
          img.id === id && img.uploadToken === uploadToken && img.uploading
            ? {
                ...img,
                uploading: false,
              }
            : img
        )
      );
      recordProductUploadTrace('settled', { id, uploadId, source });
    }
  };

  const addImages = async (
    files: File[],
    setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>,
    source: 'create' | 'edit',
    slotIndex?: number
  ) => {
    const runAddImages = async () => {
      if (!files.length) {
        dlog('addImages blocked: no files');
        trace('addImages blocked', { reason: 'no-files' });
        diag('no_files_selected', { source, slotIndex: slotIndex ?? null });
        diag('early_return', { reasonCode: 'NO_FILES', source });
        setUploadNotice(source, formatPreflightMessage('No file selected.', 'NO_FILES'));
        return;
      }

      const incoming = [...files];
      const uploads: QueuedUpload[] = [];
      const previewsToRevoke: string[] = [];
      const tokensToCancel: Array<{ token?: string; uploadId?: string }> = [];
      const maxSlots = 4;
      const current = source === 'create' ? productImagesRef.current : editProductImagesRef.current;
      let result = [...current];

      dlog('addImages start', { count: incoming.length, slotIndex });
      trace('addImages start', { count: incoming.length, slotIndex });
      diag('add_images_start', { source, count: incoming.length, slotIndex: slotIndex ?? null });
      logUploadDebug('[shop images] batch start', { count: incoming.length, slotIndex });

      const addErrorEntry = (file: File, message: string, errorMessage?: string) => {
        return {
          id: crypto.randomUUID(),
          url: '',
          previewUrl: undefined,
          file,
          isPrimary: false,
          isNew: true,
          uploading: false,
          status: 'error' as UploadStatus,
          uploadError: message,
          errorMessage,
          uploadToken: undefined,
          uploadId: undefined,
          uploadStartedAt: undefined,
        } as ManagedImage;
      };

      const processFile = async (file: File, position: number) => {
        const existing = result[position];
        if (existing?.previewUrl) previewsToRevoke.push(existing.previewUrl);
        if (existing?.uploadToken || existing?.uploadId) {
          tokensToCancel.push({ token: existing.uploadToken, uploadId: existing.uploadId });
        }

        const fileMeta = {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        };
        const readiness = await probeFileReadable(file);
        if (!readiness.ok) {
          const message = formatPreflightMessage(readiness.message, readiness.code);
          diag('probe_failed', {
            source,
            code: readiness.code,
            file: { name: file.name, size: file.size, type: file.type || '' },
            debug: readiness.debug,
          }, 'error');
          diag('early_return', { reasonCode: readiness.code, source }, 'error');
          recordProductUploadTrace('probe_failed', { source, code: readiness.code, ...fileMeta });
          return addErrorEntry(file, message, debugUploads ? readiness.debug : undefined);
        }

        const typeCheck = isAllowedImageFile(file);
        if (!typeCheck.ok) {
          const code = typeCheck.code || 'FILE_TYPE_BLOCKED';
          const message = formatPreflightMessage(typeCheck.reason || 'Unsupported file type.', code);
          diag('type_blocked', {
            source,
            code,
            reason: typeCheck.reason,
            file: { name: file.name, size: file.size, type: file.type || '' },
          }, 'error');
          diag('early_return', { reasonCode: code, source }, 'error');
          recordProductUploadTrace('type_blocked', { source, code, ...fileMeta });
          return addErrorEntry(file, message);
        }

        dlog('addImages createObjectURL', fileMeta);
        trace('addImages createObjectURL', fileMeta);
        const previewUrl = URL.createObjectURL(file);
        dlog('addImages blob created', { previewUrl });
        trace('addImages blob created', { previewUrl });
        const id = crypto.randomUUID();
        const uploadToken = createUploadToken();
        const uploadStartedAt = Date.now();
        uploads.push({
          id,
          file,
          previewUrl,
          uploadToken,
          uploadStartedAt,
          normalizedMime: typeCheck.normalizedMime,
          setImages,
          getImages: () => (source === 'create' ? productImagesRef.current : editProductImagesRef.current),
          source,
        });
        return {
          id,
          url: previewUrl,
          previewUrl,
          file,
          isPrimary: false,
          isNew: true,
          uploading: true,
          status: 'queued' as UploadStatus,
          uploadError: undefined,
          errorMessage: undefined,
          uploadToken,
          uploadId: undefined,
          uploadStartedAt,
        } as ManagedImage;
      };

      if (slotIndex !== undefined && slotIndex !== null && slotIndex >= 0) {
        const start = Math.min(slotIndex, maxSlots - 1);
        const available = Math.max(0, maxSlots - start);
        if (available === 0) {
          dlog('addImages blocked: max 4 images', { currentCount: result.length });
          trace('addImages blocked', { reason: 'max-slots', currentCount: result.length });
          diag('early_return', { reasonCode: 'MAX_IMAGES', source });
          setUploadNotice(source, formatPreflightMessage('Upload blocked: maximum images reached.', 'MAX_IMAGES'));
          return;
        }
        const selected = incoming.slice(0, available);
        for (let offset = 0; offset < selected.length; offset += 1) {
          const pos = start + offset;
          result[pos] = await processFile(selected[offset], pos);
        }
      } else {
        const remaining = Math.max(0, maxSlots - result.length);
        if (remaining === 0) {
          dlog('addImages blocked: max 4 images', { currentCount: result.length });
          trace('addImages blocked', { reason: 'max-slots', currentCount: result.length });
          diag('early_return', { reasonCode: 'MAX_IMAGES', source });
          setUploadNotice(source, formatPreflightMessage('Upload blocked: maximum images reached.', 'MAX_IMAGES'));
          return;
        }
        const selected = incoming.slice(0, remaining);
        const toAdd: ManagedImage[] = [];
        for (let idx = 0; idx < selected.length; idx += 1) {
          const entry = await processFile(selected[idx], result.length + idx);
          toAdd.push(entry);
        }
        result = [...result, ...toAdd];
      }

      result = result.slice(0, maxSlots);

      if (!result.some((img) => img?.isPrimary) && result.length > 0) {
        result[0].isPrimary = true;
      }

      if (source === 'create') {
        productImagesRef.current = result;
      } else {
        editProductImagesRef.current = result;
      }
      setImages(result);

      previewsToRevoke.forEach((url) => URL.revokeObjectURL(url));
      tokensToCancel.forEach(({ token, uploadId }) => cancelUploadToken(token, uploadId));

      dlog('addImages batch slots', {
        count: uploads.length,
        ids: uploads.map((u) => u.id),
        names: uploads.map((u) => u.file.name),
      });
      trace('addImages batch slots', {
        count: uploads.length,
        ids: uploads.map((u) => u.id),
        names: uploads.map((u) => u.file.name),
      });

      logUploadDebug('[shop images] batch slots', {
        count: uploads.length,
        ids: uploads.map((u) => u.id),
        names: uploads.map((u) => u.file.name),
      });
      uploads.forEach((upload) => {
        recordProductUploadTrace('queued', {
          id: upload.id,
          source: upload.source,
          name: upload.file.name,
          size: upload.file.size,
          type: upload.file.type,
        });
      });
      enqueueUploads(uploads);
    };

    if (!debugUploads) {
      await runAddImages();
      return;
    }

    try {
      await runAddImages();
    } catch (err) {
      const errorName = err instanceof Error ? err.name : 'Error';
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error && err.stack ? truncate(err.stack) : undefined;
      derr('addImages threw', errorName, errorMessage, errorStack);
      trace('addImages threw', { errorName, errorMessage, errorStack });
      throw err;
    }
  };

  const setPrimaryImage = (
    id: string,
    setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>
  ) => {
    setImages((prev) => prev.map((img) => ({ ...img, isPrimary: img.id === id })));
  };

  const moveImage = (
    id: string,
    direction: 'up' | 'down',
    setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>
  ) => {
    setImages((prev) => {
      const idx = prev.findIndex((img) => img.id === id);
      if (idx === -1) return prev;
      const swapWith = direction === 'up' ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= prev.length) return prev;
      const newOrder = [...prev];
      [newOrder[idx], newOrder[swapWith]] = [newOrder[swapWith], newOrder[idx]];
      return newOrder;
    });
  };

  const removeImage = async (
    id: string,
    setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>,
    source: 'create' | 'edit'
  ) => {
    let imageIdToDelete: string | undefined;
    let previewToRevoke: string | undefined;
    let tokenToCancel: string | undefined;
    let uploadIdToAbort: string | undefined;
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target?.isNew && target.imageId) {
        imageIdToDelete = target.imageId;
      }
      if (target?.previewUrl) {
        previewToRevoke = target.previewUrl;
      }
      if (target?.uploadToken) {
        tokenToCancel = target.uploadToken;
      }
      if (target?.uploadId) {
        uploadIdToAbort = target.uploadId;
      }
      const filtered = prev.filter((img) => img.id !== id);
      if (filtered.length > 0 && !filtered.some((img) => img.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      if (source === 'create') {
        productImagesRef.current = filtered;
      } else {
        editProductImagesRef.current = filtered;
      }
      return filtered;
    });
    if (previewToRevoke) {
      URL.revokeObjectURL(previewToRevoke);
    }
    if (tokenToCancel || uploadIdToAbort) {
      cancelUploadToken(tokenToCancel, uploadIdToAbort);
    }
    if (imageIdToDelete) {
      try {
        await adminDeleteImage(imageIdToDelete);
      } catch (err) {
        console.error('Failed to delete image', err);
      }
    }
  };

  const retryImage = (
    id: string,
    setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>,
    source: 'create' | 'edit'
  ) => {
    let entry: QueuedUpload | null = null;
    let oldToken: string | undefined;
    let oldUploadId: string | undefined;
    setImages((prev) => {
      const next = prev.map((img) => {
        if (img.id !== id) return img;
        if (!img.file) return img;
        oldToken = img.uploadToken;
        oldUploadId = img.uploadId;
        const uploadToken = createUploadToken();
        const uploadStartedAt = Date.now();
        const previewUrl = img.previewUrl || URL.createObjectURL(img.file);
        entry = {
          id,
          file: img.file,
          previewUrl,
          uploadToken,
          uploadStartedAt,
          setImages,
          getImages: () => (source === 'create' ? productImagesRef.current : editProductImagesRef.current),
          source,
        };
        return {
          ...img,
          url: previewUrl,
          previewUrl,
          uploading: true,
          status: 'queued',
          uploadError: undefined,
          errorMessage: undefined,
          uploadToken,
          uploadId: undefined,
          uploadStartedAt,
        };
      });
      if (source === 'create') {
        productImagesRef.current = next;
      } else {
        editProductImagesRef.current = next;
      }
      return next;
    });
    if (oldToken || oldUploadId) {
      cancelUploadToken(oldToken, oldUploadId);
    }
    if (entry) {
      recordProductUploadTrace('queued', {
        id: entry.id,
        source: entry.source,
        retry: true,
        name: entry.file.name,
        size: entry.file.size,
        type: entry.file.type,
      });
      enqueueUploads([entry]);
    }
  };

  const normalizeImageOrder = (images: ManagedImage[]): ManagedImage[] => {
    if (!images.length) return images;
    const primary = images.find((i) => i.isPrimary) || images[0];
    return [primary, ...images.filter((i) => i.id !== primary.id)];
  };

  const deriveImagePayload = (
    images: ManagedImage[]
  ): { imageUrl: string; imageUrls: string[]; primaryImageId: string; imageIds: string[] } => {
    const normalized = normalizeImageOrder(images);
    const urls = normalized
      .filter((img) => !img.uploading && !img.uploadError)
      .map((img) => img.url)
      .filter((url) => !!url && !isBlockedImageUrl(url));
    const unique = Array.from(new Set(urls));
    const primary = unique[0] || '';
    const rest = primary ? unique.filter((url) => url !== primary) : unique;
    const orderedIds = normalized
      .filter((img) => !img.uploading && !img.uploadError)
      .map((img) => img.imageId || '')
      .filter(Boolean);
    const primaryImageId = normalized[0]?.imageId || '';
    const uniqueIds = Array.from(new Set(orderedIds));
    const imageIds = primaryImageId ? uniqueIds.filter((id) => id !== primaryImageId) : uniqueIds;
    return { imageUrl: primary, imageUrls: rest, primaryImageId, imageIds };
  };

  const startEditProduct = (product: Product) => {
    console.debug('[edit modal] open', {
      productId: product?.id,
      image_url: (product as any)?.image_url ?? (product as any)?.imageUrl,
      image_urls_json: (product as any)?.image_urls_json ?? (product as any)?.imageUrlsJson,
      imageUrls: (product as any)?.imageUrls,
    });
    setEditProductId(product.id);
    setEditProductForm(productToFormState(product));
    const urls = product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls : (product.imageUrl ? [product.imageUrl] : []);
    const imageIds = [
      product.primaryImageId || '',
      ...((product.imageIds || []) as string[]),
    ].filter(Boolean);
    const managed: ManagedImage[] = urls.map((url, idx) => ({
      id: `${product.id}-${idx}`,
      url,
      imageId: imageIds[idx],
      isPrimary: idx === 0,
      isNew: false,
      uploading: false,
      status: 'uploaded',
      uploadError: undefined,
      errorMessage: undefined,
      uploadToken: undefined,
      uploadId: undefined,
      uploadStartedAt: undefined,
      needsMigration: isBlockedImageUrl(url),
    }));
    console.debug('[edit modal] images hydrated', managed);
    setEditProductImages(managed);
  };

  const cancelEditProduct = () => {
    setEditProductId(null);
    setEditProductForm(null);
    setEditProductImages([]);
    editProductImagesRef.current = [];
    setEditProductUploadNotice('');
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const uploadingCount = productImages.filter((img) => img.uploading).length;
    const missingUrlCount = productImages.filter(
      (img) => !img.uploading && !img.uploadError && !!img.previewUrl && !img.url
    ).length;
    const failedCount = productImages.filter((img) => img.uploadError).length;
    const isAnyUploading = productImages.some((img) => img.uploading);
    const hasAnyErrors = productImages.some((img) => img.uploadError);
    const hasAnyBlobUrls = productImages.some((img) => img.url?.startsWith('blob:'));
    console.debug('[shop save] clicked', {
      mode: 'new',
      name: productForm.name,
      price: productForm.price,
      qty: productForm.quantityAvailable,
      categoryCount: productForm.category ? 1 : 0,
      imageCount: productImages.length,
      imageKinds: describeImageKinds(productImages),
      uploadingCount,
      missingUrlCount,
      failedCount,
      hasAnyBlobUrls,
    });
    setProductSaveState('saving');
    setProductStatus({ type: null, message: '' });

    try {
      if (isAnyUploading) {
        console.debug('[shop save] blocked', { uploadingCount, missingUrlCount, failedCount });
        setProductStatus({ type: 'error', message: 'Please wait for images to finish uploading.' });
        setProductSaveState('error');
        setTimeout(() => setProductSaveState('idle'), 1500);
        return;
      }
      if (hasAnyErrors) {
        console.debug('[shop save] blocked', { uploadingCount, missingUrlCount, failedCount });
        setProductStatus({ type: 'error', message: 'One or more images failed to upload.' });
        setProductSaveState('error');
        setTimeout(() => setProductSaveState('idle'), 1500);
        return;
      }
      if (hasAnyBlobUrls || missingUrlCount > 0) {
        console.debug('[shop save] blocked', { uploadingCount, missingUrlCount, failedCount });
        setProductStatus({ type: 'error', message: 'Please wait for images to finish uploading.' });
        setProductSaveState('error');
        setTimeout(() => setProductSaveState('idle'), 1500);
        return;
      }

      const manualUrls = mergeManualImages(productForm);
      const base64Urls = findBase64Urls([...manualUrls.imageUrls, ...productImages.map((img) => img.url)]);
      const needsMigration = productImages.some((img) => img.needsMigration);
      if (needsMigration || base64Urls.length > 0) {
        console.error('[shop save] blocked: invalid image URLs detected. Re-upload images using Cloudflare upload.', {
          base64Count: base64Urls.length,
        });
        throw new Error('Images must be uploaded first (no blob/data URLs).');
      }
      const uploaded = deriveImagePayload(productImages);
      const mergedImages = mergeImages(
        { imageUrl: uploaded.imageUrl, imageUrls: uploaded.imageUrls },
        manualUrls
      );

      const payload = {
        ...formStateToPayload(productForm),
        imageUrl: mergedImages.imageUrl,
        imageUrls: mergedImages.imageUrls,
        primaryImageId: uploaded.primaryImageId || undefined,
        imageIds: uploaded.imageIds.length ? uploaded.imageIds : undefined,
      };

      const payloadBytes = new Blob([JSON.stringify(payload)]).size;
      console.debug('[shop save] request', { url: '/api/admin/products', method: 'POST', bytes: payloadBytes });
      if (payloadBytes > 900 * 1024) {
        console.warn('[shop save] blocked: payload too large', { bytes: payloadBytes });
        throw new Error('Payload too large (likely base64).');
      }

      const created = await adminCreateProduct(payload);
      console.debug('[shop save] success', {
        mode: 'new',
        productId: created?.id ?? null,
      });
      if (created) {
        setProductStatus({ type: 'success', message: 'Product saved successfully.' });
        resetProductForm();
        setProductImages([]);
        await loadAdminProducts();
        setProductSaveState('success');
        setTimeout(() => setProductSaveState('idle'), 1500);
      } else {
        setProductSaveState('error');
        setProductStatus({ type: 'error', message: 'Please fill out all required fields.' });
      }
    } catch (err) {
      console.error('Create product failed', err);
      setProductStatus({ type: 'error', message: err instanceof Error ? err.message : 'Create product failed.' });
      setProductSaveState('error');
      setTimeout(() => setProductSaveState('idle'), 1500);
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();
    if (!editProductId || !editProductForm) return false;
    const isAnyUploading = editProductImages.some((img) => img.uploading);
    const hasAnyErrors = editProductImages.some((img) => img.uploadError);
    const hasAnyBlobUrls = editProductImages.some((img) => img.url?.startsWith('blob:'));
    console.debug('[shop save] clicked', {
      mode: 'edit',
      name: editProductForm.name,
      price: editProductForm.price,
      qty: editProductForm.quantityAvailable,
      categoryCount: editProductForm.category ? 1 : 0,
      imageCount: editProductImages.length,
      imageKinds: describeImageKinds(editProductImages),
      hasAnyBlobUrls,
    });
    setEditProductSaveState('saving');
    setProductStatus({ type: null, message: '' });

    try {
      if (isAnyUploading) {
        console.debug('[shop save] blocked', { reason: 'images-uploading' });
        setProductStatus({ type: 'error', message: 'Please wait for images to finish uploading.' });
        setEditProductSaveState('error');
        setTimeout(() => setEditProductSaveState('idle'), 1500);
        return false;
      }
      if (hasAnyErrors) {
        console.debug('[shop save] blocked', { reason: 'image-upload-error' });
        setProductStatus({ type: 'error', message: 'One or more images failed to upload.' });
        setEditProductSaveState('error');
        setTimeout(() => setEditProductSaveState('idle'), 1500);
        return false;
      }
      if (hasAnyBlobUrls) {
        console.debug('[shop save] blocked', { reason: 'blob-urls-present' });
        setProductStatus({ type: 'error', message: 'Please wait for images to finish uploading.' });
        setEditProductSaveState('error');
        setTimeout(() => setEditProductSaveState('idle'), 1500);
        return false;
      }

      const base64Urls = findBase64Urls([...editProductImages.map((img) => img.url)]);
      const needsMigration = editProductImages.some((img) => img.needsMigration);
      if (needsMigration || base64Urls.length > 0) {
        console.error('[shop save] blocked: invalid image URLs detected. Re-upload images using Cloudflare upload.', {
          base64Count: base64Urls.length,
        });
        throw new Error('Images must be uploaded first (no blob/data URLs).');
      }
      const mergedImages = deriveImagePayload(editProductImages);

      const payload = {
        ...formStateToPayload(editProductForm),
        imageUrl: mergedImages.imageUrl || '',
        imageUrls: mergedImages.imageUrls,
        primaryImageId: mergedImages.primaryImageId || undefined,
        imageIds: mergedImages.imageIds.length ? mergedImages.imageIds : undefined,
      };

      const payloadBytes = new Blob([JSON.stringify(payload)]).size;
      console.debug('[shop save] request', { url: `/api/admin/products/${editProductId}`, method: 'PUT', bytes: payloadBytes });
      if (payloadBytes > 900 * 1024) {
        console.warn('[shop save] blocked: payload too large', { bytes: payloadBytes });
        throw new Error('Payload too large (likely base64).');
      }

      const updated = await adminUpdateProduct(editProductId, payload);
      console.debug('[shop save] success', {
        mode: 'edit',
        productId: updated?.id ?? null,
      });
      if (updated) {
        setProductStatus({ type: 'success', message: 'Product updated.' });
        setEditProductId(null);
        setEditProductForm(null);
        setEditProductImages([]);
        await loadAdminProducts();
        setEditProductSaveState('success');
        setTimeout(() => setEditProductSaveState('idle'), 1500);
        return true;
      } else {
        setProductStatus({ type: 'error', message: 'Update failed. Please try again.' });
        setEditProductSaveState('error');
        setTimeout(() => setEditProductSaveState('idle'), 1500);
        return false;
      }
    } catch (err) {
      console.error('Update product failed', err);
      setProductStatus({ type: 'error', message: err instanceof Error ? err.message : 'Update failed. Please try again.' });
      setEditProductSaveState('error');
      setTimeout(() => setEditProductSaveState('idle'), 1500);
      return false;
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await adminDeleteProduct(id);
      await loadAdminProducts();
    } catch (err) {
      console.error('Delete product failed', err);
      setProductStatus({ type: 'error', message: 'Delete failed.' });
    }
  };

  useEffect(() => {
    if (!productStatus.type) return;
    const timeout = setTimeout(() => {
      setProductStatus({ type: null, message: '' });
    }, 3000);
    return () => clearTimeout(timeout);
  }, [productStatus]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Admin Login
          </h2>
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                required
              />
            </div>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                {error}
              </div>
            )}
            {authNotice && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                {authNotice}
              </div>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gray-900 text-white py-3 px-6 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-gray-50 py-12 overflow-x-hidden">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Logout
          </button>
        </div>
        {adminAuthNotice && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {adminAuthNotice}
          </div>
        )}

        <div className="mb-6 border-b border-gray-200">
          <nav className="flex gap-4 justify-start md:justify-center overflow-x-auto whitespace-nowrap -mx-4 px-4 md:mx-0 md:px-0">
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === 'orders'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Orders
            </button>
            <button
              onClick={() => setActiveTab('shop')}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === 'shop'
                  ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Shop
            </button>
            <button
              onClick={() => setActiveTab('messages')}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === 'messages'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Messages
            </button>
            <button
              onClick={() => setActiveTab('emailList')}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === 'emailList'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Email List
            </button>
            <button
              onClick={() => setActiveTab('promotions')}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === 'promotions'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Promotions
            </button>
            <button
              onClick={() => setActiveTab('customOrders')}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === 'customOrders'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Custom Orders
          </button>
          <button
            onClick={() => setActiveTab('images')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === 'images'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            >
              Images
            </button>
            <button
              onClick={() => setActiveTab('sold')}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === 'sold'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Sold Products
            </button>
          </nav>
        </div>

        {activeTab === 'orders' && (
          <AdminOrdersTab
            searchQuery={searchQuery}
            filteredOrders={filteredOrders}
            onSearchChange={setSearchQuery}
            onSelectOrder={setSelectedOrder}
            loading={isLoadingOrders}
            error={ordersError}
          />
        )}

        {activeTab === 'sold' && <AdminSoldTab soldProducts={soldProducts} />}

        {activeTab === 'shop' && (
          <AdminShopTab
            productStatus={productStatus}
            productForm={productForm}
            productImages={productImages}
            editProductImages={editProductImages}
            productUploadNotice={productUploadNotice}
            editUploadNotice={editProductUploadNotice}
            adminProducts={adminProducts}
            editProductId={editProductId}
            editProductForm={editProductForm}
            productSaveState={productSaveState}
            editProductSaveState={editProductSaveState}
            isLoadingProducts={isLoadingProducts}
            productImageFileInputRef={productImageFileInputRef}
            editProductImageFileInputRef={editProductImageFileInputRef}
            onCreateProduct={handleCreateProduct}
            onProductFormChange={handleProductFormChange}
            onResetProductForm={resetProductForm}
            onAddProductImages={(files, slotIndex) => addImages(files, setProductImages, 'create', slotIndex)}
            onSetPrimaryProductImage={(id) => setPrimaryImage(id, setProductImages)}
            onRemoveProductImage={(id) => removeImage(id, setProductImages, 'create')}
            onRetryProductImage={(id) => retryImage(id, setProductImages, 'create')}
            onAddEditProductImages={(files, slotIndex) => addImages(files, setEditProductImages, 'edit', slotIndex)}
            onSetPrimaryEditImage={(id) => setPrimaryImage(id, setEditProductImages)}
            onMoveEditImage={(id, dir) => moveImage(id, dir, setEditProductImages)}
            onRemoveEditImage={(id) => removeImage(id, setEditProductImages, 'edit')}
            onRetryEditImage={(id) => retryImage(id, setEditProductImages, 'edit')}
            onEditFormChange={handleEditFormChange}
            onUpdateProduct={handleUpdateProduct}
            onCancelEditProduct={cancelEditProduct}
            onStartEditProduct={startEditProduct}
            onDeleteProduct={handleDeleteProduct}
          />
        )}

        {activeTab === 'messages' && (
          <AdminMessagesTab
            messages={messages}
            onCreateCustomOrderFromMessage={(draft) => {
              setCustomOrderDraft(draft);
              setActiveTab('customOrders');
            }}
          />
        )}

        {activeTab === 'emailList' && <AdminEmailListTab />}

        {activeTab === 'promotions' && <AdminPromotionsTab />}

        {activeTab === 'customOrders' && (
          <AdminCustomOrdersTab
            allCustomOrders={customOrders}
            onCreateOrder={async (order) => {
              // Previously we set the global loading flag and refetched the table, causing a full-table flicker.
              // We now append the created order locally for a seamless UX.
              try {
                setCustomOrdersError(null);
                const created = await createAdminCustomOrder({
                  customerName: order.customerName,
                  customerEmail: order.customerEmail,
                  description: order.description,
                  amount: order.amount ? Math.round(Number(order.amount) * 100) : undefined,
                  shippingCents: order.shipping ? Math.round(Number(order.shipping) * 100) : 0,
                  messageId: order.messageId ?? null,
                });
                setCustomOrders((prev) => {
                  if (prev.some((o) => o.id === created.id)) return prev;
                  return [created, ...prev];
                });
                setCustomOrderDraft(null);
                return created;
              } catch (err) {
                console.error('Failed to create custom order', err);
                setCustomOrdersError(err instanceof Error ? err.message : 'Failed to create custom order');
                return null;
              }
            }}
            initialDraft={customOrderDraft}
            onDraftConsumed={() => setCustomOrderDraft(null)}
            isLoading={isLoadingCustomOrders}
            error={customOrdersError}
            onReloadOrders={loadCustomOrders}
            onSendPaymentLink={async (orderId: string) => {
              try {
                setCustomOrdersError(null);
                setIsLoadingCustomOrders(true);
                await sendAdminCustomOrderPaymentLink(orderId);
                await loadCustomOrders();
              } catch (err) {
                console.error('Failed to send payment link', err);
                setCustomOrdersError(err instanceof Error ? err.message : 'Failed to send payment link');
              } finally {
                setIsLoadingCustomOrders(false);
              }
            }}
            onArchiveCustomOrder={async (orderId: string) => {
              try {
                setCustomOrdersError(null);
                await archiveAdminCustomOrder(orderId);
                setCustomOrders((prev) => prev.filter((order) => order.id !== orderId));
              } catch (err) {
                console.error('Failed to archive custom order', err);
                setCustomOrdersError(err instanceof Error ? err.message : 'Failed to archive custom order');
                throw err;
              }
            }}
          />
        )}

        {activeTab === 'images' && (
          <div className="space-y-10">
            <AdminHomeTab
              heroImages={heroConfig.heroImages || []}
              onHeroChange={(images) => setHeroConfig((prev) => ({ ...prev, heroImages: images }))}
              onSaveHeroConfig={handleSaveHeroConfig}
              homeSaveState={homeSaveState}
              homeSaveError={homeSaveError}
            />

            <AdminGalleryTab
              images={galleryImages}
              onChange={setGalleryImages}
              onSave={async () => {
                setGallerySaveState('saving');
                try {
                  setGallerySaveError('');
                  const normalized = galleryImages.map((img, idx) => ({
                    ...img,
                    position: idx,
                    hidden: !!img.hidden,
                  }));
                  if (import.meta.env.DEV) {
                    console.debug('[admin gallery] saving', {
                      count: normalized.length,
                      first: normalized[0],
                      payloadBytes: JSON.stringify({ images: normalized }).length,
                    });
                  }
                  const saved = await saveGalleryImages(normalized);
                  setGalleryImages(saved);
                  setGallerySaveState('success');
                  setTimeout(() => setGallerySaveState('idle'), 1500);
                } catch (err) {
                  console.error('Failed to save gallery images', err);
                  setGallerySaveError(err instanceof Error ? err.message : 'Save failed.');
                  setGallerySaveState('error');
                }
              }}
              saveState={gallerySaveState}
              saveError={gallerySaveError}
              fileInputRef={fileInputRef}
              title="Gallery Management"
              description="Add, hide, or remove gallery images."
            />
          </div>
        )}

        <AdminUploadDiagnosticsPanel />
      </div>
    </div>

        {selectedOrder && (
        <OrderDetailsModal
          open={!!selectedOrder}
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
        )}
    </>
  );
}

function productToFormState(product: Product): ProductFormState {
  return {
    name: product.name,
    description: product.description,
    price: product.priceCents ? (product.priceCents / 100).toFixed(2) : '',
    category: normalizeCategoryValue(product.type || (product as any).category) || '',
    imageUrl: product.imageUrl,
    imageUrls: product.imageUrls ? product.imageUrls.join(',') : '',
    quantityAvailable: product.quantityAvailable ?? 1,
    isOneOff: product.oneoff,
    isActive: product.visible,
    collection: product.collection || '',
    stripePriceId: product.stripePriceId || '',
    stripeProductId: product.stripeProductId || '',
  };
}

function formStateToPayload(state: ProductFormState) {
  const priceNumber = Number(state.price || 0);
  const parsedImages = parseImageUrls(state.imageUrls);
  const quantityAvailable = state.isOneOff ? 1 : Math.max(1, Number(state.quantityAvailable) || 1);
  const category = normalizeCategoryValue(state.category);

  return {
    name: state.name.trim(),
    description: state.description.trim(),
    priceCents: Math.round(priceNumber * 100),
    category,
    categories: category ? [category] : undefined,
    imageUrl: state.imageUrl.trim(),
    imageUrls: parsedImages,
    quantityAvailable,
    isOneOff: state.isOneOff,
    isActive: state.isActive,
    collection: state.collection?.trim() || undefined,
    stripePriceId: state.stripePriceId?.trim() || undefined,
    stripeProductId: state.stripeProductId?.trim() || undefined,
  };
}

function parseImageUrls(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function mergeManualImages(state: ProductFormState): { imageUrl: string; imageUrls: string[] } {
  const extra = parseImageUrls(state.imageUrls);
  const combined = [state.imageUrl, ...extra].filter(Boolean);
  return {
    imageUrl: combined[0] || '',
    imageUrls: combined,
  };
}

function mergeImages(
  primarySet: { imageUrl: string; imageUrls: string[] },
  secondary: { imageUrl: string; imageUrls: string[] }
): { imageUrl: string; imageUrls: string[] } {
  const merged = [...(primarySet.imageUrls || [])];
  for (const url of secondary.imageUrls || []) {
    if (!merged.includes(url)) merged.push(url);
  }
  const imageUrl = primarySet.imageUrl || secondary.imageUrl || merged[0] || '';
  if (imageUrl && !merged.includes(imageUrl)) {
    merged.unshift(imageUrl);
  }
  return { imageUrl, imageUrls: merged };
}

function isBlockedImageUrl(value?: string) {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > 2000) return true;
  const lower = trimmed.toLowerCase();
  return lower.startsWith('data:') || lower.startsWith('blob:') || lower.includes(';base64,');
}

function describeImageKinds(images: ManagedImage[]) {
  return images.map((img) => ({
    isDataUrl: isBlockedImageUrl(img.url),
    urlPrefix: typeof img.url === 'string' ? img.url.slice(0, 30) : null,
    previewPrefix: img.previewUrl ? img.previewUrl.slice(0, 30) : null,
    needsMigration: !!img.needsMigration,
  }));
}

function findBase64Urls(urls: string[]) {
  return urls.filter((url) => isBlockedImageUrl(url));
}

