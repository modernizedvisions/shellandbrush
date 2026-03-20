import { useEffect, useMemo, useState } from 'react';
import { adminFetchProducts, adminUploadImage } from '../../lib/api';
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
  giftQuantity: Math.max(1, Math.round(Number(form.giftQuantity) || 1)),
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
  const [uploadingPopupImage, setUploadingPopupImage] = useState(false);
  const [uploadingPromoImage, setUploadingPromoImage] = useState(false);

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

  const uploadImage = async (kind: 'popup' | 'promo', file: File) => {
    try {
      if (kind === 'popup') setUploadingPopupImage(true);
      if (kind === 'promo') setUploadingPromoImage(true);
      const result = await adminUploadImage(file, {
        scope: 'home',
        entityType: 'gift_promotion',
        entityId: editingId || 'new',
        kind: kind === 'popup' ? 'gift_popup' : 'gift_preview',
      });
      setForm((prev) =>
        kind === 'popup'
          ? {
              ...prev,
              popupImageId: result.id,
              popupImageUrl: result.url,
            }
          : {
              ...prev,
              promoImageId: result.id,
              promoImageUrl: result.url,
            }
      );
    } catch (err) {
      const message = debugUploads
        ? formatUploadDebugError(err)
        : err instanceof Error
        ? err.message
        : 'Upload failed';
      setError(message);
    } finally {
      if (kind === 'popup') setUploadingPopupImage(false);
      if (kind === 'promo') setUploadingPromoImage(false);
    }
  };

  const handleEdit = (promotion: GiftPromotionAdmin) => {
    setEditingId(promotion.id);
    setForm({
      name: promotion.name,
      enabled: promotion.enabled,
      startsAt: toInputValue(promotion.startsAt),
      endsAt: toInputValue(promotion.endsAt),
      thresholdSubtotalDollars: dollarsFromCents(promotion.thresholdSubtotalCents),
      giftProductId: promotion.giftProductId,
      giftQuantity: promotion.giftQuantity,
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
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

  const previewImageUrl = form.promoImageUrl || selectedProduct?.imageUrl || '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Gift Promotions</h2>
          <p className="text-sm text-gray-600">Spend over a subtotal and automatically include a free product.</p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
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

      <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Spend $200, free coasters"
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Enabled</span>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              <span className="text-sm text-gray-600">Make this gift promotion active</span>
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Threshold Subtotal ($)</span>
            <input
              type="number"
              min={0.01}
              step="0.01"
              value={form.thresholdSubtotalDollars}
              onChange={(event) => setForm((prev) => ({ ...prev, thresholdSubtotalDollars: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Gift Quantity</span>
            <input
              type="number"
              min={1}
              max={25}
              value={form.giftQuantity}
              onChange={(event) => setForm((prev) => ({ ...prev, giftQuantity: Number(event.target.value) || 1 }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Gift Product (includes inactive products)</span>
            <select
              value={form.giftProductId}
              onChange={(event) => setForm((prev) => ({ ...prev, giftProductId: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Select a gift product</option>
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} {!product.visible ? '(Inactive)' : ''}
                </option>
              ))}
            </select>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Banner Enabled</span>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.bannerEnabled}
                onChange={(event) => setForm((prev) => ({ ...prev, bannerEnabled: event.target.checked }))}
              />
              <span className="text-sm text-gray-600">Use banner slot when no discount banner is active</span>
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Banner Text</span>
            <input
              value={form.bannerText}
              onChange={(event) => setForm((prev) => ({ ...prev, bannerText: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Spend $200, get free coasters"
            />
          </label>
        </div>

        <div className="rounded-lg border border-gray-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Popup Controls (Homepage Only)</p>
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Popup Enabled</span>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.popupEnabled}
                onChange={(event) => setForm((prev) => ({ ...prev, popupEnabled: event.target.checked }))}
              />
              <span className="text-sm text-gray-600">Show popup on homepage only</span>
            </div>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-sm font-medium text-gray-700">Popup Headline</span>
              <input
                value={form.popupHeadline}
                onChange={(event) => setForm((prev) => ({ ...prev, popupHeadline: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-gray-700">Popup CTA Text</span>
              <input
                value={form.popupCtaText}
                onChange={(event) => setForm((prev) => ({ ...prev, popupCtaText: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-gray-700">Popup Body</span>
              <textarea
                value={form.popupBody}
                onChange={(event) => setForm((prev) => ({ ...prev, popupBody: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                rows={3}
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-gray-700">Popup CTA Href</span>
              <input
                value={form.popupCtaHref}
                onChange={(event) => setForm((prev) => ({ ...prev, popupCtaHref: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="/shop"
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Dedicated Popup Image (uploaded marketing asset, separate from reward product image)
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

        <div className="rounded-lg border border-gray-200 p-4 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Promo Preview Image (optional override for cart/checkout reward preview)
          </p>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage('promo', file);
                event.currentTarget.value = '';
              }}
              className="text-sm"
            />
            {uploadingPromoImage && <span className="text-xs text-gray-500">Uploading...</span>}
            {form.promoImageId && (
              <button
                type="button"
                className="text-xs text-red-600"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    promoImageId: null,
                    promoImageUrl: '',
                  }))
                }
              >
                Clear
              </button>
            )}
          </div>
          {previewImageUrl && (
            <img src={previewImageUrl} alt="Gift preview" className="h-24 w-24 rounded border object-cover" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={saving || uploadingPopupImage || uploadingPromoImage}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-50"
          >
            {editingId ? 'Update Gift Promotion' : 'Create Gift Promotion'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm((prev) => ({ ...emptyForm, giftProductId: prev.giftProductId || productOptions[0]?.id || '' }));
              }}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
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
                    Spend ${(promotion.thresholdSubtotalCents / 100).toFixed(2)} · Free qty {promotion.giftQuantity} · {promotion.status}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    Gift: {promotion.giftProduct?.name || promotion.giftProductId}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {(promotion.previewImageUrl || promotion.giftProduct?.imageUrl) && (
                    <img
                      src={promotion.previewImageUrl || promotion.giftProduct?.imageUrl || ''}
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
