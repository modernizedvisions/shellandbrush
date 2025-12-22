import React, { useRef, useState } from 'react';
import type { Category } from '../../lib/types';
import { Loader2, Trash2 } from 'lucide-react';

interface CategoryCardEditorProps {
  category: Category;
  onUpdate: (id: string, updates: Partial<Category>) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  isBusy?: boolean;
}

const OTHER_ITEMS_CATEGORY = {
  slug: 'other-items',
  name: 'Other Items',
};

const isOtherItemsCategory = (category: Category) =>
  (category.slug || '').toLowerCase() === OTHER_ITEMS_CATEGORY.slug ||
  (category.name || '').trim().toLowerCase() === OTHER_ITEMS_CATEGORY.name.toLowerCase();

export function CategoryCardEditor({ category, onUpdate, onDelete, isBusy }: CategoryCardEditorProps) {
  const [name, setName] = useState(category.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUpdatingImage, setIsUpdatingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === category.name) return;
    setIsSavingName(true);
    try {
      await onUpdate(category.id, { name: trimmed, slug: undefined });
    } finally {
      setIsSavingName(false);
    }
  };

  const handleToggleHome = async () => {
    await onUpdate(category.id, { showOnHomePage: !category.showOnHomePage });
  };

  const handleDelete = async () => {
    if (isOtherItemsCategory(category)) return;
    const confirmed = window.confirm(`Delete category "${category.name}"?`);
    if (!confirmed) return;
    await onDelete(category.id);
  };

  const handleImageSelected = async (file: File) => {
    setIsUpdatingImage(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await onUpdate(category.id, { imageUrl: dataUrl });
    } finally {
      setIsUpdatingImage(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="relative aspect-[3/4] bg-gray-50">
        {category.imageUrl ? (
          <img src={category.imageUrl} alt={category.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">No image</div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="pointer-events-auto rounded-full bg-white/90 px-4 py-1.5 text-xs font-medium text-gray-900 shadow hover:bg-white"
            disabled={isBusy || isUpdatingImage}
          >
            {isUpdatingImage ? 'Saving...' : 'Edit Image'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageSelected(file);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <label className="text-xs uppercase tracking-wide text-gray-500">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveName}
            disabled={isBusy || isSavingName || name.trim() === category.name || !name.trim()}
            className="self-end rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isSavingName ? 'Saving...' : 'Rename'}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={!!category.showOnHomePage}
              onChange={handleToggleHome}
              disabled={isBusy}
              className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
            />
            Show on Home Page
          </label>

          {isOtherItemsCategory(category) ? (
            <span className="text-xs text-gray-500">Required</span>
          ) : (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isBusy}
              className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read file'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

export function CategoryCardSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden animate-pulse">
      <div className="aspect-[3/4] bg-gray-100" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-gray-100 rounded w-2/3" />
        <div className="h-4 bg-gray-100 rounded w-1/3" />
        <div className="h-8 bg-gray-100 rounded w-full" />
      </div>
    </div>
  );
}
