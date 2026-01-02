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
  adminUploadImage,
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
import { OrderDetailsModal } from '../components/admin/OrderDetailsModal';
import {
  getAdminCustomOrders,
  createAdminCustomOrder,
  sendAdminCustomOrderPaymentLink,
} from '../lib/db/customOrders';
import type { AdminCustomOrder } from '../lib/db/customOrders';

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

export type ShopImage = {
  id: string;
  url: string;
  file?: File;
  isPrimary: boolean;
  isNew?: boolean;
  uploading?: boolean;
  uploadError?: string;
  imageId?: string;
  previewUrl?: string;
  needsMigration?: boolean;
  sortOrder?: number;
};

export type ManagedImage = ShopImage;

const normalizeCategoryValue = (value: string | undefined | null) => (value || '').trim();

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
  const [activeTab, setActiveTab] = useState<'orders' | 'shop' | 'messages' | 'customOrders' | 'images' | 'sold'>('orders');
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const productImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const editProductImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const [messages] = useState<any[]>([]);
  const [customOrders, setCustomOrders] = useState<AdminCustomOrder[]>([]);
  const [customOrderDraft, setCustomOrderDraft] = useState<any>(null);
  const [customOrdersError, setCustomOrdersError] = useState<string | null>(null);
  const [isLoadingCustomOrders, setIsLoadingCustomOrders] = useState(false);

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
  };

  const uploadManagedImage = async (
    id: string,
    file: File,
    previewUrl: string,
    setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>
  ) => {
    console.debug('[shop images] upload start', {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
    });
    setImages((prev) =>
      prev.map((img) =>
        img.id === id
          ? {
              ...img,
              uploading: true,
              uploadError: undefined,
            }
          : img
      )
    );
    try {
      const result = await adminUploadImage(file, { scope: 'products', entityType: 'product' });
      URL.revokeObjectURL(previewUrl);
      setImages((prev) =>
        prev.map((img) =>
          img.id === id
            ? {
                ...img,
                url: result.url,
                imageId: result.id,
                file: undefined,
                uploading: false,
                uploadError: undefined,
                previewUrl: undefined,
              }
            : img
        )
      );
      console.debug('[shop images] upload success', {
        id,
        name: file.name,
        url: result.url,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setImages((prev) =>
        prev.map((img) =>
          img.id === id
            ? {
                ...img,
                uploading: false,
                uploadError: message,
              }
            : img
        )
      );
      console.debug('[shop images] upload failure', {
        id,
        name: file.name,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      setImages((prev) =>
        prev.map((img) =>
          img.id === id && img.uploading
            ? {
                ...img,
                uploading: false,
              }
            : img
        )
      );
      console.debug('[shop images] upload finally', { id, name: file.name });
    }
  };

  const addImages = async (
    files: File[],
    setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>,
    slotIndex?: number
  ) => {
    if (!files.length) return;
    const incoming = [...files];
    const uploads: Array<{ id: string; file: File; previewUrl: string }> = [];

    console.debug('[shop images] batch start', { count: incoming.length, slotIndex });

    setImages((prev) => {
      const maxSlots = 4;
      const selected = incoming.slice(0, maxSlots);
      let result = [...prev];

      // If a slot index is provided, replace starting at that slot.
      if (slotIndex !== undefined && slotIndex !== null && slotIndex >= 0) {
        const start = Math.min(slotIndex, maxSlots - 1);
        selected.forEach((file, offset) => {
          const pos = Math.min(start + offset, maxSlots - 1);
          const previewUrl = URL.createObjectURL(file);
          const id = crypto.randomUUID();
          uploads.push({ id, file, previewUrl });
          const newEntry: ManagedImage = {
            id,
            url: previewUrl,
            previewUrl,
            file,
            isPrimary: false,
            isNew: true,
            uploading: true,
          };
          result[pos] = newEntry;
        });
      } else {
        // Default behavior: append into remaining slots
        const remaining = Math.max(0, maxSlots - result.length);
        if (remaining === 0) return result;
        const toAdd = selected.slice(0, remaining).map((file) => {
          const previewUrl = URL.createObjectURL(file);
          const id = crypto.randomUUID();
          uploads.push({ id, file, previewUrl });
          return {
            id,
            url: previewUrl,
            previewUrl,
            file,
            isPrimary: false,
            isNew: true,
            uploading: true,
          } as ManagedImage;
        });
        result = [...result, ...toAdd];
      }

      // Limit to 4 slots
      result = result.slice(0, maxSlots);

      // Ensure there is a primary image
      if (!result.some((img) => img?.isPrimary) && result.length > 0) {
        result[0].isPrimary = true;
      }

      return result;
    });

    console.debug('[shop images] batch slots', {
      count: uploads.length,
      ids: uploads.map((u) => u.id),
      names: uploads.map((u) => u.file.name),
    });

    const runUploads = async () => {
      let attempted = 0;
      let succeeded = 0;
      let failed = 0;

      for (const { id, file, previewUrl } of uploads) {
        attempted += 1;
        console.debug('[shop images] uploading', {
          attempted,
          name: file.name,
          size: file.size,
          type: file.type,
        });
        try {
          const result = await uploadManagedImage(id, file, previewUrl, setImages);
          console.debug('[shop images] upload success', {
            name: file.name,
            id: result.id,
            url: result.url,
          });
          console.debug('[shop images] settled', { name: file.name, ok: true, urlOrError: result.url });
          succeeded += 1;
        } catch (err) {
          failed += 1;
          console.error('[shop images] upload error', { name: file.name, err });
          console.debug('[shop images] settled', {
            name: file.name,
            ok: false,
            urlOrError: err instanceof Error ? err.message : String(err),
          });
        }
      }

      let uploadingCountAfter = 0;
      setImages((prev) => {
        const next = prev.map((img) => {
          if (!img.uploading) return img;
  const hasFinalUrl = !!img.url && !isBlockedImageUrl(img.url);
          const hasError = !!img.uploadError;
          if (!hasFinalUrl && !hasError) {
            return {
              ...img,
              uploading: false,
              uploadError: 'Upload did not complete. Please retry or remove.',
            };
          }
          return { ...img, uploading: false };
        });
        uploadingCountAfter = next.filter((img) => img.uploading).length;
        console.log(
          '[shop images] post-reconcile',
          next.map((img) => ({
            id: img.id,
            uploading: img.uploading,
            hasFile: !!img.file,
            hasUrl: !!img.url,
            hasError: !!img.uploadError,
            urlPrefix: img.url?.slice(0, 40),
          }))
        );
        return next;
      });
      console.debug('[shop images] batch done', { attempted, succeeded, failed, uploadingCountAfter });
    };

    void runUploads();
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
    setImages: React.Dispatch<React.SetStateAction<ManagedImage[]>>
  ) => {
    let imageIdToDelete: string | undefined;
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target?.isNew && target.imageId) {
        imageIdToDelete = target.imageId;
      }
      const filtered = prev.filter((img) => img.id !== id);
      if (filtered.length > 0 && !filtered.some((img) => img.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      return filtered;
    });
    if (imageIdToDelete) {
      try {
        await adminDeleteImage(imageIdToDelete);
      } catch (err) {
        console.error('Failed to delete image', err);
      }
    }
  };

  const normalizeImageOrder = (images: ManagedImage[]): ManagedImage[] => {
    if (!images.length) return images;
    const primary = images.find((i) => i.isPrimary) || images[0];
    return [primary, ...images.filter((i) => i.id !== primary.id)];
  };

  const uploadImage = async (file: File): Promise<{ id: string; url: string }> => {
    const result = await adminUploadImage(file, { scope: 'products', entityType: 'product' });
    return { id: result.id, url: result.url };
  };

  const resolveImageUrls = async (
    images: ManagedImage[]
  ): Promise<{ imageUrl: string; imageUrls: string[]; primaryImageId: string; imageIds: string[] }> => {
    const ordered = normalizeImageOrder(images);
    const urls: string[] = [];

    for (const img of ordered) {
      if (img.file) {
        const uploaded = await uploadImage(img.file);
        urls.push(uploaded.url);
      } else if (img.url) {
        urls.push(img.url);
      }
    }

    const primary = urls[0] || '';
    const primaryImageId = ordered[0]?.imageId || '';
    const orderedIds = ordered.map((img) => img.imageId || '').filter(Boolean);
    const imageIds = primaryImageId ? orderedIds.filter((id) => id !== primaryImageId) : orderedIds;
    return { imageUrl: primary, imageUrls: urls, primaryImageId, imageIds };
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

  const hasPendingUploads = (images: ManagedImage[]) => images.some((img) => img.uploading);
  const hasUploadErrors = (images: ManagedImage[]) => images.some((img) => img.uploadError);

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
      needsMigration: isBlockedImageUrl(url),
    }));
    console.debug('[edit modal] images hydrated', managed);
    setEditProductImages(managed);
  };

  const cancelEditProduct = () => {
    setEditProductId(null);
    setEditProductForm(null);
    setEditProductImages([]);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const uploadingCount = productImages.filter((img) => img.uploading).length;
    const missingUrlCount = productImages.filter(
      (img) => !img.uploading && !img.uploadError && !!img.previewUrl && !img.url
    ).length;
    const failedCount = productImages.filter((img) => img.uploadError).length;
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
    });
    setProductSaveState('saving');
    setProductStatus({ type: null, message: '' });

    try {
      if (uploadingCount > 0) {
        console.debug('[shop save] blocked', { uploadingCount, missingUrlCount, failedCount });
        setProductStatus({ type: 'error', message: 'Images are still uploading. Please wait.' });
        setProductSaveState('error');
        setTimeout(() => setProductSaveState('idle'), 1500);
        return;
      }
      if (missingUrlCount > 0) {
        console.debug('[shop save] blocked', { uploadingCount, missingUrlCount, failedCount });
        setProductStatus({ type: 'error', message: 'Some images were not uploaded yet.' });
        setProductSaveState('error');
        setTimeout(() => setProductSaveState('idle'), 1500);
        return;
      }
      if (failedCount > 0) {
        console.debug('[shop save] blocked', { uploadingCount, missingUrlCount, failedCount });
        setProductStatus({ type: 'error', message: 'One or more images failed to upload.' });
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
      const uploaded = await resolveImageUrls(productImages);
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
    console.debug('[shop save] clicked', {
      mode: 'edit',
      name: editProductForm.name,
      price: editProductForm.price,
      qty: editProductForm.quantityAvailable,
      categoryCount: editProductForm.category ? 1 : 0,
      imageCount: editProductImages.length,
      imageKinds: describeImageKinds(editProductImages),
    });
    setEditProductSaveState('saving');
    setProductStatus({ type: null, message: '' });

    try {
      if (hasPendingUploads(editProductImages)) {
        console.debug('[shop save] blocked', { reason: 'images-uploading' });
        setProductStatus({ type: 'error', message: 'Images are still uploading. Please wait.' });
        setEditProductSaveState('error');
        setTimeout(() => setEditProductSaveState('idle'), 1500);
        return false;
      }
      if (hasUploadErrors(editProductImages)) {
        console.debug('[shop save] blocked', { reason: 'image-upload-error' });
        setProductStatus({ type: 'error', message: 'One or more images failed to upload.' });
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
            onAddProductImages={(files, slotIndex) => addImages(files, setProductImages, slotIndex)}
            onSetPrimaryProductImage={(id) => setPrimaryImage(id, setProductImages)}
            onRemoveProductImage={(id) => removeImage(id, setProductImages)}
            onAddEditProductImages={(files, slotIndex) => addImages(files, setEditProductImages, slotIndex)}
            onSetPrimaryEditImage={(id) => setPrimaryImage(id, setEditProductImages)}
            onMoveEditImage={(id, dir) => moveImage(id, dir, setEditProductImages)}
            onRemoveEditImage={(id) => removeImage(id, setEditProductImages)}
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
                  messageId: order.messageId ?? null,
                });
                setCustomOrders((prev) => {
                  if (prev.some((o) => o.id === created.id)) return prev;
                  return [created, ...prev];
                });
                setCustomOrderDraft(null);
              } catch (err) {
                console.error('Failed to create custom order', err);
                setCustomOrdersError(err instanceof Error ? err.message : 'Failed to create custom order');
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
