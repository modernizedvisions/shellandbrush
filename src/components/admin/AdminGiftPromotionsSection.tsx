import { useEffect, useMemo, useState } from 'react';
import { adminCreateProduct, adminFetchProducts, adminUploadImage } from '../../lib/api';
import {
  adminCreateGiftPromotion,
  adminDeleteGiftPromotion,
  adminListGiftPromotions,
  adminUpdateGiftPromotion,
} from '../../lib/adminGiftPromotions';
import { debugUploadsEnabled, formatUploadDebugError } from '../../lib/debugUploads';
import type { GiftPromotionAdmin, Product } from '../../lib/types';

type GiftPromotionFormState = {
  name: string;
  enabled: boolean;
  startsAt: string;
  endsAt: string;
  thresholdSubtotalDollars: string;
  giftProductId: string;
  giftQuantity: number;
  bannerEnabled: boolean;
  bannerText: string;
  popupEnabled: boolean;
  popupHeadline: string;
  popupBody: string;
  popupCtaText: string;
  popupCtaHref: string;
  popupImageId: string | null;
  popupImageUrl: string;
  promoImageId: string | null;
  promoImageUrl: string;
};

type GiveawayProductDraft = {
  name: string;
  description: string;
  imageId: string | null;
  imageUrl: string;
};

const emptyForm: GiftPromotionFormState = {
  name: '',
  enabled: false,
  startsAt: '',
  endsAt: '',
  thresholdSubtotalDollars: '200.00',
  giftProductId: '',
  giftQuantity: 1,
  bannerEnabled: false,
  bannerText: '',
  popupEnabled: false,
  popupHeadline: '',
  popupBody: '',
  popupCtaText: '',
  popupCtaHref: '',
  popupImageId: null,
  popupImageUrl: '',
  promoImageId: null,
  promoImageUrl: '',
};

const emptyGiveawayDraft: GiveawayProductDraft = {
  name: '',
  description: '',
  imageId: null,
  imageUrl: '',
};

const toInputValue = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
};

const toIsoValue = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const centsFromDollars = (value: string) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 100);
};

const dollarsFromCents = (value: number) => ((value || 0) / 100).toFixed(2);

const buildPayload = (form: GiftPromotionFormState): GiftPromotionAdmin => ({
  id: '',
  name: form.name.trim(),
  enabled: form.enabled,
  status: 'Disabled',
  startsAt: toIsoValue(form.startsAt),
  endsAt: toIsoValue(form.endsAt),
  thresholdSubtotalCents: centsFromDollars(form.thresholdSubtotalDollars),
  giftProductId: form.giftProductId,
  giftQuantity: 1,
  bannerEnabled: form.bannerEnabled,
  bannerText: form.bannerText.trim(),
  popupEnabled: form.popupEnabled,
  popupHeadline: form.popupHeadline.trim(),
  popupBody: form.popupBody.trim(),
  popupCtaText: form.popupCtaText.trim(),
  popupCtaHref: form.popupCtaHref.trim(),
  popupImageId: form.popupImageId,
  popupImageUrl: form.popupImageUrl,
  promoImageId: form.promoImageId,
  promoImageUrl: form.promoImageUrl,
  previewImageUrl: form.promoImageUrl,
  giftProduct: null,
  createdAt: null,
  updatedAt: null,
});

export function AdminGiftPromotionsSection() {
  const [giftPromotions, setGiftPromotions] = useState<GiftPromotionAdmin[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<GiftPromotionFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productSource, setProductSource] = useState<'existing' | 'create'>('existing');
  const [giveawayDraft, setGiveawayDraft] = useState<GiveawayProductDraft>(emptyGiveawayDraft);
  const [creatingGiveawayProduct, setCreatingGiveawayProduct] = useState(false);
  const [giveawayNotice, setGiveawayNotice] = useState<string | null>(null);
  const [uploadingPopupImage, setUploadingPopupImage] = useState(false);
  const [uploadingGiveawayImage, setUploadingGiveawayImage] = useState(false);

  const debugUploads = debugUploadsEnabled();

  const productOptions = useMemo(
    () =>
      [...products]
        .filter((product) => !!product.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products]
  );

  const selectedProduct = useMemo(
    () => productOptions.find((product) => product.id === form.giftProductId) || null,
    [form.giftProductId, productOptions]
  );

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [giftData, productData] = await Promise.all([
        adminListGiftPromotions(),
        adminFetchProducts(),
      ]);
      setGiftPromotions(giftData);
      setProducts(productData);
      if (!form.giftProductId && productData.length) {
        setForm((prev) => ({ ...prev, giftProductId: productData[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gift promotions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (productSource !== 'create') return;
    const promotionName = form.name.trim();
    if (!promotionName) return;
    setGiveawayDraft((prev) => (prev.name.trim() ? prev : { ...prev, name: promotionName }));
  }, [form.name, productSource]);

  const uploadImage = async (kind: 'popup' | 'giveawayProduct', file: File) => {
    try {
      if (kind === 'popup') setUploadingPopupImage(true);
      if (kind === 'giveawayProduct') setUploadingGiveawayImage(true);
      const result = await adminUploadImage(file, {
        scope: kind === 'popup' ? 'home' : 'products',
        entityType: kind === 'popup' ? 'gift_promotion' : 'product',
        entityId: kind === 'popup' ? editingId || 'new' : 'new-giveaway',
        kind: kind === 'popup' ? 'gift_popup' : 'product_primary',
        isPrimary: kind === 'giveawayProduct' ? true : undefined,
        sortOrder: kind === 'giveawayProduct' ? 0 : undefined,
      });
      if (kind === 'popup') {
        setForm((prev) => ({
          ...prev,
          popupImageId: result.id,
          popupImageUrl: result.url,
        }));
      } else {
        setGiveawayDraft((prev) => ({
          ...prev,
          imageId: result.id,
          imageUrl: result.url,
        }));
      }
    } catch (err) {
      const message = debugUploads
        ? formatUploadDebugError(err)
        : err instanceof Error
        ? err.message
        : 'Upload failed';
      setError(message);
    } finally {
      if (kind === 'popup') setUploadingPopupImage(false);
      if (kind === 'giveawayProduct') setUploadingGiveawayImage(false);
    }
  };

  const handleEdit = (promotion: GiftPromotionAdmin) => {
    setEditingId(promotion.id);
    setProductSource('existing');
    setGiveawayDraft(emptyGiveawayDraft);
    setGiveawayNotice(null);
    setForm({
      name: promotion.name,
      enabled: promotion.enabled,
      startsAt: toInputValue(promotion.startsAt),
      endsAt: toInputValue(promotion.endsAt),
      thresholdSubtotalDollars: dollarsFromCents(promotion.thresholdSubtotalCents),
      giftProductId: promotion.giftProductId,
      giftQuantity: 1,
      bannerEnabled: promotion.bannerEnabled,
      bannerText: promotion.bannerText || '',
      popupEnabled: promotion.popupEnabled,
      popupHeadline: promotion.popupHeadline || '',
      popupBody: promotion.popupBody || '',
      popupCtaText: promotion.popupCtaText || '',
      popupCtaHref: promotion.popupCtaHref || '',
      popupImageId: promotion.popupImageId,
      popupImageUrl: promotion.popupImageUrl || '',
      promoImageId: promotion.promoImageId,
      promoImageUrl: promotion.promoImageUrl || '',
    });
  };

  const handleProductSourceChange = (source: 'existing' | 'create') => {
    setProductSource(source);
    setGiveawayNotice(null);

    if (source === 'existing') {
      setForm((prev) => ({
        ...prev,
        giftProductId: prev.giftProductId || productOptions[0]?.id || '',
      }));
      return;
    }

    setForm((prev) => ({ ...prev, giftProductId: '' }));
    setGiveawayDraft((prev) => {
      if (prev.name.trim()) return prev;
      const promotionName = form.name.trim();
      return promotionName ? { ...prev, name: promotionName } : prev;
    });
  };

  const handleCreateGiveawayProduct = async () => {
    const name = giveawayDraft.name.trim();
    const description = giveawayDraft.description.trim();

    if (!name) {
      setError('Giveaway Item Name is required to create a giveaway product.');
      return;
    }
    if (!description) {
      setError('Description is required to create a giveaway product.');
      return;
    }
    if (!giveawayDraft.imageId && !giveawayDraft.imageUrl) {
      setError('Upload Product Image is required to create a giveaway product.');
      return;
    }

    setError(null);
    setGiveawayNotice(null);
    setCreatingGiveawayProduct(true);
    try {
      const created = await adminCreateProduct({
        name,
        description,
        priceCents: 0,
        category: 'Giveaway',
        imageUrl: giveawayDraft.imageUrl,
        imageUrls: giveawayDraft.imageUrl ? [giveawayDraft.imageUrl] : [],
        primaryImageId: giveawayDraft.imageId || undefined,
        imageIds: giveawayDraft.imageId ? [giveawayDraft.imageId] : undefined,
        quantityAvailable: 1,
        isOneOff: true,
        isActive: false,
      });

      if (!created?.id) {
        throw new Error('Failed to create giveaway product.');
      }

      const refreshedProducts = await adminFetchProducts();
      setProducts(refreshedProducts);
      setForm((prev) => ({ ...prev, giftProductId: created.id }));
      setProductSource('existing');
      setGiveawayDraft(emptyGiveawayDraft);
      setGiveawayNotice(`Giveaway product created: ${created.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create giveaway product');
    } finally {
      setCreatingGiveawayProduct(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.giftProductId) {
      setError('Select a giveaway product before saving this promotion.');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload(form);
      if (editingId) {
        await adminUpdateGiftPromotion(editingId, payload);
      } else {
        await adminCreateGiftPromotion(payload);
      }
      await loadAll();
      setEditingId(null);
      setProductSource('existing');
      setGiveawayDraft(emptyGiveawayDraft);
      setGiveawayNotice(null);
      setForm((prev) => ({
        ...emptyForm,
        giftProductId: prev.giftProductId || productOptions[0]?.id || '',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save gift promotion');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (promotionId: string) => {
    if (!window.confirm('Delete this gift promotion?')) return;
    setError(null);
    try {
      await adminDeleteGiftPromotion(promotionId);
      await loadAll();
      if (editingId === promotionId) {
        setEditingId(null);
        setProductSource('existing');
        setGiveawayDraft(emptyGiveawayDraft);
        setGiveawayNotice(null);
        setForm(emptyForm);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete gift promotion');
    }
  };

  const toggleEnabled = async (promotion: GiftPromotionAdmin) => {
    setError(null);
    try {
      await adminUpdateGiftPromotion(promotion.id, {
        ...promotion,
        enabled: !promotion.enabled,
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update gift promotion');
    }
  };

  const submitDisabled =
    saving ||
    uploadingPopupImage ||
    uploadingGiveawayImage ||
    creatingGiveawayProduct ||
    !form.giftProductId;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Gift Promotions</h2>
          <p className="text-sm text-gray-600">Build a simple spend-and-get-a-free-item promotion.</p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setProductSource('existing');
            setGiveawayDraft(emptyGiveawayDraft);
            setGiveawayNotice(null);
            setForm((prev) => ({ ...emptyForm, giftProductId: prev.giftProductId || productOptions[0]?.id || '' }));
          }}
          className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm"
        >
          New Gift Promotion
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {giveawayNotice && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {giveawayNotice}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-5 md:p-6 space-y-8">
        <section className="space-y-4 rounded-lg border border-gray-200 p-4 md:p-5">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-gray-900">Promotion Basics</h3>
            <p className="text-sm text-gray-600">
              Set the name, spend requirement, and optional schedule for this giveaway.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-gray-700">Promotion Name</span>
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Spend $200, free coasters"
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-gray-700">Minimum Cart Amount ($)</span>
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={form.thresholdSubtotalDollars}
                onChange={(event) => setForm((prev) => ({ ...prev, thresholdSubtotalDollars: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
              <p className="text-xs text-gray-500">
                Customers must spend at least this amount before shipping and tax to receive the free item.
              </p>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-gray-700">Starts At</span>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-gray-700">Ends At</span>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => setForm((prev) => ({ ...prev, endsAt: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-gray-200 p-4 md:p-5">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-gray-900">Giveaway Product</h3>
            <p className="text-sm text-gray-600">
              Choose an existing item or create a simple new giveaway item.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                productSource === 'existing' ? 'border-gray-900 bg-gray-50' : 'border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="giveaway-product-source"
                checked={productSource === 'existing'}
                onChange={() => handleProductSourceChange('existing')}
              />
              <span className="text-sm font-medium text-gray-800">Use Existing Product</span>
            </label>
            <label
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                productSource === 'create' ? 'border-gray-900 bg-gray-50' : 'border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="giveaway-product-source"
                checked={productSource === 'create'}
                onChange={() => handleProductSourceChange('create')}
              />
              <span className="text-sm font-medium text-gray-800">Create New Giveaway Product</span>
            </label>
          </div>
          {productSource === 'existing' ? (
            <div className="space-y-3">
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Select Giveaway Product</span>
                <select
                  value={form.giftProductId}
                  onChange={(event) => setForm((prev) => ({ ...prev, giftProductId: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select Giveaway Product</option>
                  {productOptions.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} {!product.visible ? '(Inactive)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">Inactive products can still be used for giveaways.</p>
              </label>
              {selectedProduct?.imageUrl && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Giveaway Product Image</p>
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.name}
                    className="h-24 w-24 rounded border object-cover"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-gray-100 bg-gray-50/50 p-4">
              <p className="text-xs text-gray-500">New giveaway products are saved as hidden Giveaway items.</p>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Giveaway Item Name</span>
                <input
                  value={giveawayDraft.name}
                  onChange={(event) => setGiveawayDraft((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Free shell brush"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Description</span>
                <textarea
                  value={giveawayDraft.description}
                  onChange={(event) => setGiveawayDraft((prev) => ({ ...prev, description: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  rows={3}
                />
              </label>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Upload Product Image</p>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage('giveawayProduct', file);
                      event.currentTarget.value = '';
                    }}
                    className="text-sm"
                  />
                  {uploadingGiveawayImage && <span className="text-xs text-gray-500">Uploading...</span>}
                  {giveawayDraft.imageId && (
                    <button
                      type="button"
                      className="text-xs text-red-600"
                      onClick={() => setGiveawayDraft((prev) => ({ ...prev, imageId: null, imageUrl: '' }))}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {giveawayDraft.imageUrl && (
                  <img
                    src={giveawayDraft.imageUrl}
                    alt="Giveaway product preview"
                    className="h-24 w-24 rounded border object-cover"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleCreateGiveawayProduct()}
                disabled={creatingGiveawayProduct || uploadingGiveawayImage}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-800 disabled:opacity-50"
              >
                {creatingGiveawayProduct ? 'Creating Giveaway Product...' : 'Create Giveaway Product'}
              </button>
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-gray-200 p-4 md:p-5">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-gray-900">Banner</h3>
            <p className="text-sm text-gray-600">
              Optionally advertise this gift promotion in the site banner.
            </p>
          </div>
          <label className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.bannerEnabled}
                onChange={(event) => setForm((prev) => ({ ...prev, bannerEnabled: event.target.checked }))}
              />
              <span className="text-sm font-medium text-gray-700">Show Banner</span>
            </div>
            <p className="text-xs text-gray-500">
              Your banner will appear when no discount promotion banner is already active.
            </p>
          </label>
          {form.bannerEnabled && (
            <label className="space-y-1">
              <span className="text-sm font-medium text-gray-700">Banner Text</span>
              <input
                value={form.bannerText}
                onChange={(event) => setForm((prev) => ({ ...prev, bannerText: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Spend $200, get a free shell brush"
              />
            </label>
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-gray-200 p-4 md:p-5">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-gray-900">Homepage Popup</h3>
            <p className="text-sm text-gray-600">
              Optionally show a homepage popup for this promotion.
            </p>
          </div>
          <label className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.popupEnabled}
                onChange={(event) => setForm((prev) => ({ ...prev, popupEnabled: event.target.checked }))}
              />
              <span className="text-sm font-medium text-gray-700">Show Homepage Popup</span>
            </div>
          </label>
          {form.popupEnabled && (
            <div className="space-y-4">
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Popup Title</span>
                <input
                  value={form.popupHeadline}
                  onChange={(event) => setForm((prev) => ({ ...prev, popupHeadline: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700">Popup Description</span>
                <textarea
                  value={form.popupBody}
                  onChange={(event) => setForm((prev) => ({ ...prev, popupBody: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  rows={3}
                />
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Button Text</span>
                  <input
                    value={form.popupCtaText}
                    onChange={(event) => setForm((prev) => ({ ...prev, popupCtaText: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Page Redirect</span>
                  <input
                    value={form.popupCtaHref}
                    onChange={(event) => setForm((prev) => ({ ...prev, popupCtaHref: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="/shop or /custom-orders"
                  />
                  <p className="text-xs text-gray-500">Use a relative page path like /shop or /custom-orders.</p>
                </label>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Popup Image</p>
                <p className="text-xs text-gray-500">
                  Dedicated marketing image for the popup, separate from the giveaway product image.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage('popup', file);
                      event.currentTarget.value = '';
                    }}
                    className="text-sm"
                  />
                  {uploadingPopupImage && <span className="text-xs text-gray-500">Uploading...</span>}
                  {form.popupImageId && (
                    <button
                      type="button"
                      className="text-xs text-red-600"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          popupImageId: null,
                          popupImageUrl: '',
                        }))
                      }
                    >
                      Clear
                    </button>
                  )}
                </div>
                {form.popupImageUrl && (
                  <img src={form.popupImageUrl} alt="Popup preview" className="h-24 w-24 rounded border object-cover" />
                )}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-gray-200 p-4 md:p-5">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-gray-900">Publish</h3>
            <p className="text-sm text-gray-600">
              Turn this promotion on when everything looks ready.
            </p>
          </div>
          <label className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              <span className="text-sm font-medium text-gray-700">Make This Gift Promotion Active</span>
            </div>
          </label>
          {productSource === 'create' && !form.giftProductId && (
            <p className="text-sm text-amber-700">
              Create the giveaway product in Section 2 before saving this promotion.
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={submitDisabled}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-50"
            >
              {editingId ? 'Update Gift Promotion' : 'Create Gift Promotion'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setProductSource('existing');
                  setGiveawayDraft(emptyGiveawayDraft);
                  setGiveawayNotice(null);
                  setForm((prev) => ({ ...emptyForm, giftProductId: prev.giftProductId || productOptions[0]?.id || '' }));
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </section>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Existing Gift Promotions</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Loading gift promotions...</p>
        ) : giftPromotions.length === 0 ? (
          <p className="text-sm text-gray-500">No gift promotions yet.</p>
        ) : (
          <div className="space-y-3">
            {giftPromotions.map((promotion) => (
              <div
                key={promotion.id}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-gray-100 rounded-lg p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{promotion.name}</p>
                  <p className="text-xs text-gray-600">
                    Spend ${(promotion.thresholdSubtotalCents / 100).toFixed(2)} - {promotion.status}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    Gift: {promotion.giftProduct?.name || promotion.giftProductId}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {(promotion.giftProduct?.imageUrl || promotion.previewImageUrl) && (
                    <img
                      src={promotion.giftProduct?.imageUrl || promotion.previewImageUrl || ''}
                      alt={promotion.giftProduct?.name || promotion.name}
                      className="h-12 w-12 rounded border object-cover"
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleEdit(promotion)}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleEnabled(promotion)}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700"
                    >
                      {promotion.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleDelete(promotion.id)}
                      className="px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
