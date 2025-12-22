import React, { useEffect, useState } from 'react';
import { CheckCircle, Loader2, Plus } from 'lucide-react';
import type { Category, CustomOrdersImage, HeroCollageImage } from '../../lib/types';
import { AdminSectionHeader } from './AdminSectionHeader';
import { adminFetchCategories } from '../../lib/api';
import { ShopCategoryCardsSection } from './ShopCategoryCardsSection';

export interface AdminHomeTabProps {
  heroImages: HeroCollageImage[];
  customOrdersImages: CustomOrdersImage[];
  onHeroChange: (images: HeroCollageImage[]) => void;
  onCustomOrdersChange: (images: CustomOrdersImage[]) => void;
  onSaveHeroConfig: () => Promise<void>;
  homeSaveState: 'idle' | 'saving' | 'success';
  heroRotationEnabled?: boolean;
  onHeroRotationToggle?: (enabled: boolean) => void;
}

const OTHER_ITEMS_CATEGORY = {
  slug: 'other-items',
  name: 'Other Items',
};

const isOtherItemsCategory = (category: Category) =>
  (category.slug || '').toLowerCase() === OTHER_ITEMS_CATEGORY.slug ||
  (category.name || '').trim().toLowerCase() === OTHER_ITEMS_CATEGORY.name.toLowerCase();

export function AdminHomeTab({
  heroImages,
  customOrdersImages,
  onHeroChange,
  onCustomOrdersChange,
  onSaveHeroConfig,
  homeSaveState,
  heroRotationEnabled = false,
  onHeroRotationToggle,
}: AdminHomeTabProps) {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const apiCategories = await adminFetchCategories();
        setCategories(normalizeCategoriesList(apiCategories));
      } catch (error) {
        console.error('Failed to load categories', error);
      }
    };
    loadCategories();
  }, []);

  return (
    <div className="space-y-12">
      <HeroCollageAdmin
        images={heroImages}
        onChange={onHeroChange}
        onSave={onSaveHeroConfig}
        saveState={homeSaveState}
        heroRotationEnabled={heroRotationEnabled}
        onHeroRotationToggle={onHeroRotationToggle}
      />

      <CustomOrdersImagesAdmin
        images={customOrdersImages}
        onChange={onCustomOrdersChange}
        onSave={onSaveHeroConfig}
        saveState={homeSaveState}
      />

      <ShopCategoryCardsSection
        categories={categories}
        onCategoryUpdated={(updated) => {
          setCategories((prev) => normalizeCategoriesList(prev.map((c) => (c.id === updated.id ? updated : c))));
        }}
      />
    </div>
  );
}

interface HeroCollageAdminProps {
  images: HeroCollageImage[];
  onChange: (images: HeroCollageImage[]) => void;
  onSave: () => Promise<void>;
  saveState: 'idle' | 'saving' | 'success';
  heroRotationEnabled?: boolean;
  onHeroRotationToggle?: (enabled: boolean) => void;
}

function HeroCollageAdmin({
  images,
  onChange,
  onSave,
  saveState,
  heroRotationEnabled = false,
  onHeroRotationToggle,
}: HeroCollageAdminProps) {
  const slots = [0, 1, 2];

  const handleFileSelect = (index: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      onChange(
        slots
          .map((slotIndex) => {
            if (slotIndex !== index) return images[slotIndex];
            const existing = images[slotIndex];
            return {
              id: existing?.id || `hero-${slotIndex}-${crypto.randomUUID?.() || Date.now()}`,
              imageUrl: dataUrl,
              alt: existing?.alt,
              createdAt: existing?.createdAt || new Date().toISOString(),
            };
          })
          .filter((img): img is HeroCollageImage => Boolean(img && img.imageUrl))
      );
    };
    reader.readAsDataURL(file);
  };

  const handleAltChange = (index: number, alt: string) => {
    const existing = images[index];
    if (!existing) return;
    const next = [...images];
    next[index] = { ...existing, alt };
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <section className="space-y-4 rounded-lg border bg-white p-4 shadow-sm">
      <div className="space-y-2">
        <AdminSectionHeader
          title="Hero Images"
          subtitle="main images on your site"
        />
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div>
            <p className="text-sm font-medium text-slate-900">Rotate Hero Images</p>
            <p className="text-xs text-slate-600">
              ON: rotate through all hero images. OFF: show only the first image.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-slate-900"
              checked={!!heroRotationEnabled}
              onChange={(e) => onHeroRotationToggle?.(e.target.checked)}
            />
            <span>{heroRotationEnabled ? 'On' : 'Off'}</span>
          </label>
        </div>
        <div className="flex justify-center sm:justify-end">
          <button
            onClick={onSave}
            disabled={saveState === 'saving'}
            className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {saveState === 'saving' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : saveState === 'success' ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-200" />
                Saved
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((slot) => {
          const image = images[slot];
          const inputId = `hero-collage-${slot}`;
          return (
            <div
              key={slot}
              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm space-y-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelect(slot, file);
              }}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800">Hero Image {slot + 1}</div>
                <div className="flex items-center gap-2">
                  {image && (
                    <button type="button" onClick={() => handleRemove(slot)} className="text-xs text-red-600 hover:text-red-700">
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => document.getElementById(inputId)?.click()}
                    className="text-xs text-slate-700 underline hover:text-slate-900"
                  >
                    {image ? 'Replace' : 'Upload'}
                  </button>
                </div>
              </div>

              <div className="aspect-[3/4] rounded-md border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
                {image?.imageUrl ? (
                  <img src={image.imageUrl} alt={image.alt || `Hero image ${slot + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center text-slate-500 text-sm">
                    <Plus className="h-6 w-6 mb-1" />
                    <span>Drop or upload</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor={`${inputId}-alt`} className="text-xs font-medium text-slate-700">
                  Alt text / description
                </label>
                <input
                  id={`${inputId}-alt`}
                  type="text"
                  value={image?.alt || ''}
                  onChange={(e) => handleAltChange(slot, e.target.value)}
                  placeholder="Optional description"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <input
                id={inputId}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(slot, file);
                  (e.target as HTMLInputElement).value = '';
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface CustomOrdersImagesAdminProps {
  images: CustomOrdersImage[];
  onChange: (images: CustomOrdersImage[]) => void;
  onSave: () => Promise<void>;
  saveState: 'idle' | 'saving' | 'success';
}

const normalizeCategoriesList = (items: Category[]): Category[] => {
  const map = new Map<string, Category>();
  items.forEach((cat) => {
    const key = cat.id || cat.name;
    if (!key) return;
    const normalized: Category = { ...cat, id: cat.id || key };
    map.set(key, normalized);
  });
  const ordered = Array.from(map.values()).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const otherItems = ordered.filter((cat) => isOtherItemsCategory(cat));
  const withoutOtherItems = ordered.filter((cat) => !isOtherItemsCategory(cat));
  return [...withoutOtherItems, ...otherItems];
};

function CustomOrdersImagesAdmin({ images, onChange, onSave, saveState }: CustomOrdersImagesAdminProps) {
  const slots = [0, 1, 2, 3];

  const handleFileSelect = (index: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const next = [...images];
      next[index] = { ...(next[index] || {}), imageUrl: dataUrl };
      onChange(next.slice(0, 4));
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = (index: number) => {
    const next = [...images];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <section className="space-y-4 rounded-lg border bg-white p-4 shadow-sm">
      <div className="space-y-2">
        <AdminSectionHeader
          title="Custom Orders"
          subtitle="images shown beside the custom orders section."
        />
        <div className="flex justify-center sm:justify-end">
          <button
            onClick={onSave}
            disabled={saveState === 'saving'}
            className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {saveState === 'saving' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : saveState === 'success' ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-200" />
                Saved
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {slots.map((slot) => {
          const image = images[slot];
          const inputId = `custom-orders-${slot}`;
          return (
            <div
              key={slot}
              className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelect(slot, file);
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">Image {slot + 1}</span>
                <div className="flex items-center gap-2">
                  {image?.imageUrl && (
                    <button type="button" onClick={() => handleRemove(slot)} className="text-xs text-red-600 hover:text-red-700">
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => document.getElementById(inputId)?.click()}
                    className="text-xs text-slate-700 underline hover:text-slate-900"
                  >
                    {image?.imageUrl ? 'Replace' : 'Upload'}
                  </button>
                </div>
              </div>

              <div className="aspect-[3/4] rounded-md border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
                {image?.imageUrl ? (
                  <img src={image.imageUrl} alt={image.alt || `Custom orders ${slot + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center text-slate-500 text-sm">
                    <Plus className="h-6 w-6 mb-1" />
                    <span>Drop or upload</span>
                  </div>
                )}
              </div>

              <input
                id={inputId}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(slot, file);
                  (e.target as HTMLInputElement).value = '';
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
