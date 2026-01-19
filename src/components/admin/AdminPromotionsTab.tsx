import { useEffect, useMemo, useState } from 'react';
import type { Category, PromotionAdmin, PromotionScope, PromoCodeAdmin, PromoCodeScope } from '../../lib/types';
import { adminFetchCategories } from '../../lib/api';
import {
  adminCreatePromotion,
  adminDeletePromotion,
  adminListPromotions,
  adminUpdatePromotion,
} from '../../lib/adminPromotions';
import {
  adminCreatePromoCode,
  adminDeletePromoCode,
  adminListPromoCodes,
  adminUpdatePromoCode,
} from '../../lib/adminPromoCodes';

type PromotionFormState = {
  name: string;
  percentOff: number;
  scope: PromotionScope;
  categorySlugs: string[];
  bannerEnabled: boolean;
  bannerText: string;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};

type PromoCodeFormState = {
  code: string;
  percentOff: number;
  freeShipping: boolean;
  scope: PromoCodeScope;
  categorySlugs: string[];
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};

const emptyForm: PromotionFormState = {
  name: '',
  percentOff: 20,
  scope: 'global',
  categorySlugs: [],
  bannerEnabled: false,
  bannerText: '',
  startsAt: '',
  endsAt: '',
  enabled: false,
};

const emptyPromoCodeForm: PromoCodeFormState = {
  code: '',
  percentOff: 0,
  freeShipping: false,
  scope: 'global',
  categorySlugs: [],
  startsAt: '',
  endsAt: '',
  enabled: false,
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

const normalize = (value: string) => value.trim().toLowerCase();

const getStatus = (promotion: PromotionAdmin) => {
  if (!promotion.enabled) return 'Disabled';
  const now = Date.now();
  const startsAt = promotion.startsAt ? Date.parse(promotion.startsAt) : null;
  const endsAt = promotion.endsAt ? Date.parse(promotion.endsAt) : null;
  if (startsAt && Number.isFinite(startsAt) && now < startsAt) return 'Scheduled';
  if (endsAt && Number.isFinite(endsAt) && now > endsAt) return 'Expired';
  return 'Active';
};

const getPromoCodeStatus = (promo: PromoCodeAdmin) => {
  if (!promo.enabled) return 'Disabled';
  const now = Date.now();
  const startsAt = promo.startsAt ? Date.parse(promo.startsAt) : null;
  const endsAt = promo.endsAt ? Date.parse(promo.endsAt) : null;
  if (startsAt && Number.isFinite(startsAt) && now < startsAt) return 'Scheduled';
  if (endsAt && Number.isFinite(endsAt) && now > endsAt) return 'Expired';
  return 'Active';
};

const buildPayload = (form: PromotionFormState): PromotionAdmin => ({
  id: '',
  name: form.name.trim(),
  percentOff: Math.round(Number(form.percentOff)),
  scope: form.scope,
  categorySlugs: form.scope === 'categories' ? form.categorySlugs : [],
  bannerEnabled: form.bannerEnabled,
  bannerText: form.bannerText.trim(),
  startsAt: toIsoValue(form.startsAt),
  endsAt: toIsoValue(form.endsAt),
  enabled: form.enabled,
  createdAt: null,
  updatedAt: null,
});

export function AdminPromotionsTab() {
  const [promotions, setPromotions] = useState<PromotionAdmin[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCodeAdmin[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<PromotionFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [promoForm, setPromoForm] = useState<PromoCodeFormState>(emptyPromoCodeForm);
  const [promoEditingId, setPromoEditingId] = useState<string | null>(null);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [promoData, promoCodeData, categoryData] = await Promise.all([
        adminListPromotions(),
        adminListPromoCodes(),
        adminFetchCategories(),
      ]);
      setPromotions(promoData);
      setPromoCodes(promoCodeData);
      setCategories(categoryData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load promotions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleEdit = (promotion: PromotionAdmin) => {
    setEditingId(promotion.id);
    setForm({
      name: promotion.name,
      percentOff: promotion.percentOff,
      scope: promotion.scope,
      categorySlugs: promotion.categorySlugs || [],
      bannerEnabled: promotion.bannerEnabled,
      bannerText: promotion.bannerText || '',
      startsAt: toInputValue(promotion.startsAt),
      endsAt: toInputValue(promotion.endsAt),
      enabled: promotion.enabled,
    });
  };

  const handleDelete = async (promotionId: string) => {
    if (!window.confirm('Delete this promotion?')) return;
    try {
      await adminDeletePromotion(promotionId);
      await loadAll();
      if (editingId === promotionId) {
        setEditingId(null);
        setForm(emptyForm);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete promotion');
    }
  };

  const handlePromoEdit = (promo: PromoCodeAdmin) => {
    setPromoEditingId(promo.id);
    setPromoForm({
      code: promo.code,
      percentOff: promo.percentOff ?? 0,
      freeShipping: promo.freeShipping,
      scope: promo.scope,
      categorySlugs: promo.categorySlugs || [],
      startsAt: toInputValue(promo.startsAt),
      endsAt: toInputValue(promo.endsAt),
      enabled: promo.enabled,
    });
  };

  const handlePromoDelete = async (promoId: string) => {
    if (!window.confirm('Delete this promo code?')) return;
    try {
      await adminDeletePromoCode(promoId);
      await loadAll();
      if (promoEditingId === promoId) {
        setPromoEditingId(null);
        setPromoForm(emptyPromoCodeForm);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete promo code');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const payload = buildPayload(form);
      if (editingId) {
        const updated = await adminUpdatePromotion(editingId, payload);
        if (updated) {
          await loadAll();
          setEditingId(null);
          setForm(emptyForm);
        }
      } else {
        const created = await adminCreatePromotion(payload);
        if (created) {
          await loadAll();
          setForm(emptyForm);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save promotion');
    }
  };

  const handlePromoSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const payload: PromoCodeAdmin = {
        id: '',
        code: promoForm.code.trim(),
        percentOff: Number(promoForm.percentOff) || 0,
        freeShipping: promoForm.freeShipping,
        scope: promoForm.scope,
        categorySlugs: promoForm.scope === 'categories' ? promoForm.categorySlugs : [],
        startsAt: toIsoValue(promoForm.startsAt),
        endsAt: toIsoValue(promoForm.endsAt),
        enabled: promoForm.enabled,
        createdAt: null,
        updatedAt: null,
      };
      if (promoEditingId) {
        const updated = await adminUpdatePromoCode(promoEditingId, payload);
        if (updated) {
          await loadAll();
          setPromoEditingId(null);
          setPromoForm(emptyPromoCodeForm);
        }
      } else {
        const created = await adminCreatePromoCode(payload);
        if (created) {
          await loadAll();
          setPromoForm(emptyPromoCodeForm);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save promo code');
    }
  };

  const togglePromoEnabled = async (promo: PromoCodeAdmin) => {
    setError(null);
    try {
      const payload: PromoCodeAdmin = {
        ...promo,
        enabled: !promo.enabled,
      };
      await adminUpdatePromoCode(promo.id, payload);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update promo code');
    }
  };

  const toggleEnabled = async (promotion: PromotionAdmin) => {
    setError(null);
    try {
      const payload: PromotionAdmin = {
        ...promotion,
        enabled: !promotion.enabled,
      };
      await adminUpdatePromotion(promotion.id, payload);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update promotion');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Promotions</h2>
          <p className="text-sm text-gray-600">Create one active promotion at a time.</p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setForm(emptyForm);
          }}
          className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm"
        >
          New Promotion
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
              placeholder="Summer Sale"
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Percent Off</span>
            <input
              type="number"
              min={1}
              max={90}
              value={form.percentOff}
              onChange={(event) => setForm((prev) => ({ ...prev, percentOff: Number(event.target.value) }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Scope</span>
            <select
              value={form.scope}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  scope: event.target.value as PromotionScope,
                  categorySlugs: event.target.value === 'global' ? [] : prev.categorySlugs,
                }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="global">Global</option>
              <option value="categories">Categories</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Enabled</span>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              <span className="text-sm text-gray-600">Make this promotion active</span>
            </div>
          </label>
        </div>

        {form.scope === 'categories' && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Eligible Categories</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {sortedCategories.map((category) => {
                const normalized = normalize(category.slug);
                const checked = form.categorySlugs.map(normalize).includes(normalized);
                return (
                  <label key={category.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setForm((prev) => {
                          const next = new Set(prev.categorySlugs.map(normalize));
                          if (event.target.checked) {
                            next.add(normalized);
                          } else {
                            next.delete(normalized);
                          }
                          return { ...prev, categorySlugs: Array.from(next) };
                        });
                      }}
                    />
                    {category.name}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <span className="text-sm text-gray-600">Show banner across site</span>
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Banner Text</span>
            <input
              value={form.bannerText}
              onChange={(event) => setForm((prev) => ({ ...prev, bannerText: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="20% off this week"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-50"
          >
            {editingId ? 'Update Promotion' : 'Create Promotion'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Existing Promotions</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Loading promotions...</p>
        ) : promotions.length === 0 ? (
          <p className="text-sm text-gray-500">No promotions yet.</p>
        ) : (
          <div className="space-y-3">
            {promotions.map((promotion) => (
              <div key={promotion.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border border-gray-100 rounded-lg p-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{promotion.name}</p>
                  <p className="text-xs text-gray-600">
                    {promotion.percentOff}% off · {promotion.scope === 'global' ? 'Global' : 'Categories'} · {getStatus(promotion)}
                  </p>
                </div>
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
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Promo Codes</h2>
          <p className="text-sm text-gray-600">Customer-entered codes for percent off and/or free shipping.</p>
        </div>
        <button
          onClick={() => {
            setPromoEditingId(null);
            setPromoForm(emptyPromoCodeForm);
          }}
          className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm"
        >
          New Promo Code
        </button>
      </div>

      <form onSubmit={handlePromoSubmit} className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Code</span>
            <input
              value={promoForm.code}
              onChange={(event) => setPromoForm((prev) => ({ ...prev, code: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="LOCALPICKUP"
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Percent Off</span>
            <input
              type="number"
              min={0}
              max={90}
              value={promoForm.percentOff}
              onChange={(event) => setPromoForm((prev) => ({ ...prev, percentOff: Number(event.target.value) }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="0"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Scope</span>
            <select
              value={promoForm.scope}
              onChange={(event) =>
                setPromoForm((prev) => ({
                  ...prev,
                  scope: event.target.value as PromoCodeScope,
                  categorySlugs: event.target.value === 'global' ? [] : prev.categorySlugs,
                }))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="global">Global</option>
              <option value="categories">Categories</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Enabled</span>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={promoForm.enabled}
                onChange={(event) => setPromoForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              <span className="text-sm text-gray-600">Make this promo code active</span>
            </div>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Free Shipping</span>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={promoForm.freeShipping}
                onChange={(event) => setPromoForm((prev) => ({ ...prev, freeShipping: event.target.checked }))}
              />
              <span className="text-sm text-gray-600">Override shipping to $0</span>
            </div>
          </label>
        </div>

        {promoForm.scope === 'categories' && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Eligible Categories</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {sortedCategories.map((category) => {
                const normalized = normalize(category.slug);
                const checked = promoForm.categorySlugs.map(normalize).includes(normalized);
                return (
                  <label key={category.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setPromoForm((prev) => {
                          const next = new Set(prev.categorySlugs.map(normalize));
                          if (event.target.checked) {
                            next.add(normalized);
                          } else {
                            next.delete(normalized);
                          }
                          return { ...prev, categorySlugs: Array.from(next) };
                        });
                      }}
                    />
                    {category.name}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Starts At</span>
            <input
              type="datetime-local"
              value={promoForm.startsAt}
              onChange={(event) => setPromoForm((prev) => ({ ...prev, startsAt: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-gray-700">Ends At</span>
            <input
              type="datetime-local"
              value={promoForm.endsAt}
              onChange={(event) => setPromoForm((prev) => ({ ...prev, endsAt: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-50"
          >
            {promoEditingId ? 'Update Promo Code' : 'Create Promo Code'}
          </button>
          {promoEditingId && (
            <button
              type="button"
              onClick={() => {
                setPromoEditingId(null);
                setPromoForm(emptyPromoCodeForm);
              }}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Existing Promo Codes</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Loading promo codes...</p>
        ) : promoCodes.length === 0 ? (
          <p className="text-sm text-gray-500">No promo codes yet.</p>
        ) : (
          <div className="space-y-3">
            {promoCodes.map((promo) => (
              <div key={promo.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border border-gray-100 rounded-lg p-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{promo.code.toUpperCase()}</p>
                  <p className="text-xs text-gray-600">
                    {promo.percentOff ? `${promo.percentOff}% off` : 'No percent'} · {promo.freeShipping ? 'Free shipping' : 'Shipping unchanged'} · {promo.scope === 'global' ? 'Global' : 'Categories'} · {getPromoCodeStatus(promo)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handlePromoEdit(promo)}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => togglePromoEnabled(promo)}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700"
                  >
                    {promo.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handlePromoDelete(promo.id)}
                    className="px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
