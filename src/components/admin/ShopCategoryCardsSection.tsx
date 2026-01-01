import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchShopCategoryTiles, saveShopCategoryTiles, adminUpdateCategory, adminUploadImage } from '../../lib/api';
import type { Category, ShopCategoryTile } from '../../lib/types';
import { AdminSectionHeader } from './AdminSectionHeader';

interface ShopCategoryCardsSectionProps {
  categories?: Category[];
  onCategoryUpdated?: (category: Category) => void;
}

const SLOT_COUNT = 4;
const isBlockedImageUrl = (value?: string) => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > 2000) return true;
  const lower = trimmed.toLowerCase();
  return lower.startsWith('data:') || lower.startsWith('blob:') || lower.includes(';base64,');
};

export function ShopCategoryCardsSection({ categories = [], onCategoryUpdated }: ShopCategoryCardsSectionProps) {
  const [tiles, setTiles] = useState<ShopCategoryTile[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success'>('idle');
  const [saveError, setSaveError] = useState<string>('');
  const [activeTileId, setActiveTileId] = useState<string | null>(null);
  const [categoryState, setCategoryState] = useState<Category[]>(categories);
  const [uploadingTiles, setUploadingTiles] = useState<Record<string, boolean>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadTiles();
  }, []);

  useEffect(() => {
    setCategoryState(categories);
  }, [categories]);

  // Ensure each tile is hydrated with a categoryId when a matching slug exists.
  useEffect(() => {
    if (!tiles.length || !categoryState.length) return;

    let changed = false;
    const hydrated = tiles.map((tile) => {
      if (tile.categoryId) return tile;
      const match = findCategoryBySlug(categoryState, tile.categorySlug);
      if (!match) return tile;
      changed = true;
      return {
        ...tile,
        categoryId: match.id,
        label: match.name || tile.label,
        ctaLabel: match.name ? `All ${match.name}` : tile.ctaLabel,
      };
    });

    if (changed) {
      setTiles(hydrated);
    }
  }, [tiles, categoryState]);

  const loadTiles = async () => {
    try {
      const loaded = await fetchShopCategoryTiles();
      const normalized = normalizeToFour(loaded).map((tile, index) => ({
        ...tile,
        slotIndex: tile.slotIndex ?? index,
      }));
      setTiles(normalized.slice(0, SLOT_COUNT));
    } catch (error) {
      console.error('Failed to load category tiles', error);
    }
  };

  const resolveCategoryForTile = (tile: ShopCategoryTile) => {
    if (!tile) return undefined;
    return (
      categoryOptions.find((c) => c.id === tile.categoryId) ||
      findCategoryBySlug(categoryOptions, tile.categorySlug)
    );
  };

  const handleTileImageSelect = async (file: File, tileId: string) => {
    const tile = tiles.find((t) => t.id === tileId);
    const resolvedCategory = tile ? resolveCategoryForTile(tile) : undefined;
    const categoryId = resolvedCategory?.id;
    if (!categoryId) {
      alert('Please select a category before uploading an image.');
      return;
    }

    setUploadingTiles((prev) => ({ ...prev, [tileId]: true }));
    setUploadErrors((prev) => ({ ...prev, [tileId]: '' }));
    const previewUrl = URL.createObjectURL(file);

    // Optimistically update local category hero image preview
    setCategoryState((prev) =>
      prev.map((cat) => (cat.id === categoryId ? { ...cat, heroImageUrl: previewUrl } : cat))
    );

    try {
      const result = await adminUploadImage(file, {
        scope: 'categories',
        entityType: 'category',
        entityId: categoryId,
        kind: 'hero',
      });
      URL.revokeObjectURL(previewUrl);
      const updated = await adminUpdateCategory(categoryId, { heroImageId: result.id, heroImageUrl: result.url });
      if (updated) {
        setCategoryState((prev) => prev.map((cat) => (cat.id === updated.id ? { ...cat, ...updated } : cat)));
        onCategoryUpdated?.(updated);
      }
    } catch (err) {
      console.error('Failed to update category hero image', err);
      setUploadErrors((prev) => ({
        ...prev,
        [tileId]: err instanceof Error ? err.message : 'Upload failed',
      }));
    } finally {
      setUploadingTiles((prev) => ({ ...prev, [tileId]: false }));
    }
  };

  const handleSave = async () => {
    setSaveState('saving');
    setSaveError('');
    try {
      const withSlots = tiles.map((tile, index) => {
        const category = categoryOptions.find((c) => c.id === tile.categoryId);
        return {
          ...tile,
          slotIndex: tile.slotIndex ?? index,
          imageUrl: category?.heroImageUrl || category?.imageUrl || tile.imageUrl || '',
        };
      });
      const hasBlocked = withSlots.some((tile) => isBlockedImageUrl(tile.imageUrl));
      if (hasBlocked) {
        setSaveState('idle');
        setSaveError('Upload category images before saving (no blob/data URLs).');
        return;
      }
      await saveShopCategoryTiles(withSlots);
      setTiles(withSlots.slice(0, SLOT_COUNT));
      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      console.error('Failed to save category tiles', err);
      setSaveState('idle');
    }
  };

  const categoryOptions = useMemo(() => categoryState, [categoryState]);

  const handleCategoryChange = (tileId: string, categoryId: string) => {
    const selected = categoryOptions.find((c) => c.id === categoryId);
    if (!selected) return;
    setTiles((prev) =>
      prev.map((tile) =>
        tile.id === tileId
          ? {
              ...tile,
              categoryId,
              label: selected.name,
              ctaLabel: selected.name ? `All ${selected.name}` : tile.ctaLabel,
              categorySlug: selected.slug || tile.categorySlug,
            }
          : tile
      )
    );
  };

  return (
    <div className="space-y-4 rounded-lg border bg-white p-4 shadow-sm">
      <div className="relative pb-1">
        <AdminSectionHeader
          title="Category Cards"
          subtitle="choose which categories appear on the homepage."
          className="text-center"
        />
        <div className="absolute right-0 top-0 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveState === 'saving'}
            className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {saveState === 'saving' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : saveState === 'success' ? (
              'Saved'
            ) : (
              'Save Category Cards'
            )}
          </button>
        </div>
        {saveError && <div className="mt-2 text-xs text-red-600">{saveError}</div>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.slice(0, SLOT_COUNT).map((tile, idx) => {
          const selectedCategory = resolveCategoryForTile(tile);
          const displayLabel = selectedCategory?.name || tile.label || `Category ${idx + 1}`;
          const pillText = `Shop ${displayLabel}`;
          const categoryImage = selectedCategory?.heroImageUrl || selectedCategory?.imageUrl;
          const inputId = `category-tile-${tile.id || idx}`;

          return (
            <div
              key={tile.id || idx}
              className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  setActiveTileId(tile.id);
                  handleTileImageSelect(file, tile.id);
                }
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <label className="sr-only" htmlFor={inputId}>
                    Category
                  </label>
                  <select
                    id={inputId}
                    aria-label="Select category"
                    value={selectedCategory?.id || ''}
                    onChange={(e) => handleCategoryChange(tile.id, e.target.value)}
                    className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    <option value="">Select category</option>
                    {categoryOptions.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  {categoryImage && (
                    <button
                      type="button"
                      onClick={() => {
                        const cleared = { ...tile, imageUrl: '', categoryId: tile.categoryId };
                        setTiles((prev) =>
                          prev.map((t) => (t.id === tile.id ? cleared : t))
                        );
                      }}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTileId(tile.id);
                      fileInputRef.current?.click();
                    }}
                    className="text-xs text-slate-700 underline hover:text-slate-900"
                  >
                    {categoryImage ? 'Replace' : 'Upload'}
                  </button>
                </div>
              </div>

                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-gray-100 aspect-[3/4]">
                  {categoryImage ? (
                    <img src={categoryImage} alt={displayLabel} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
                      No image uploaded
                    </div>
                  )}
                  {uploadingTiles[tile.id] && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white">
                      Uploading...
                    </div>
                  )}

                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
                  <div className="absolute inset-x-0 bottom-4 flex justify-center">
                    <span className="pointer-events-auto inline-flex items-center rounded-full bg-white px-5 py-2 text-xs font-medium text-gray-900 shadow-sm">
                      {pillText}
                    </span>
                  </div>
                </div>
                {uploadErrors[tile.id] && (
                  <div className="text-xs text-red-600">{uploadErrors[tile.id]}</div>
                )}
            </div>
          );
        })}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && activeTileId) {
            handleTileImageSelect(file, activeTileId);
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />
    </div>
  );
}

const normalizeToFour = (tiles: ShopCategoryTile[]): ShopCategoryTile[] => {
  const result = [...tiles];
  const defaults = [
    {
      id: 'slot-1',
      label: 'Ring Dishes',
      ctaLabel: 'All Ring Dishes',
      categorySlug: 'ring-dish',
      imageUrl: '',
      slotIndex: 0,
    },
    {
      id: 'slot-2',
      label: 'Ornaments',
      ctaLabel: 'All Ornaments',
      categorySlug: 'ornament',
      imageUrl: '',
      slotIndex: 1,
    },
    {
      id: 'slot-3',
      label: 'Decor',
      ctaLabel: 'All Decor',
      categorySlug: 'decor',
      imageUrl: '',
      slotIndex: 2,
    },
    {
      id: 'slot-4',
      label: 'Wine Stoppers',
      ctaLabel: 'All Wine Stoppers',
      categorySlug: 'wine-stopper',
      imageUrl: '',
      slotIndex: 3,
    },
  ];
  for (let i = 0; i < SLOT_COUNT; i++) {
    if (!result[i]) result[i] = defaults[i] as ShopCategoryTile;
  }
  return result.slice(0, SLOT_COUNT);
};

const findCategoryBySlug = (categories: Category[], slug?: string) => {
  if (!slug) return undefined;
  return categories.find((c) => (c.slug || '').toLowerCase() === slug.toLowerCase());
};
