import React, { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { adminCreateCategory, adminDeleteCategory, adminFetchCategories, adminUpdateCategory } from '../../lib/api';
import type { Category } from '../../lib/types';

interface CategoryManagementModalProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  onCategoriesChange: (categories: Category[]) => void;
  onCategorySelected?: (name: string) => void;
}

const OTHER_ITEMS_CATEGORY = {
  slug: 'other-items',
  name: 'Featured Works',
};

const isOtherItemsCategory = (category: Category) =>
  (category.slug || '').toLowerCase() === OTHER_ITEMS_CATEGORY.slug ||
  (category.name || '').trim().toLowerCase() === OTHER_ITEMS_CATEGORY.name.toLowerCase() ||
  (category.name || '').trim().toLowerCase() === 'other items';

const normalizeCategoriesList = (items: Category[]): Category[] => {
  const map = new Map<string, Category>();
  items.forEach((cat) => {
    const key = cat.id || cat.name;
    if (!key) return;
    const normalized: Category = {
      ...cat,
      id: cat.id || key,
      name: isOtherItemsCategory(cat) ? OTHER_ITEMS_CATEGORY.name : cat.name,
      slug: isOtherItemsCategory(cat) ? OTHER_ITEMS_CATEGORY.slug : cat.slug,
    };
    map.set(key, normalized);
  });
  const ordered = Array.from(map.values()).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const otherItems = ordered.filter((cat) => isOtherItemsCategory(cat));
  const withoutOtherItems = ordered.filter((cat) => !isOtherItemsCategory(cat));
  return [...withoutOtherItems, ...otherItems];
};

export function CategoryManagementModal({
  open,
  onClose,
  categories,
  onCategoriesChange,
  onCategorySelected,
}: CategoryManagementModalProps) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [categoryMessage, setCategoryMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const apiCategories = await adminFetchCategories();
        onCategoriesChange(normalizeCategoriesList(apiCategories));
        setCategoryMessage('');
      } catch (error) {
        console.error('Failed to load categories', error);
        setCategoryMessage('Could not load categories.');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [open]);

  const handleAddCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    try {
      const created = await adminCreateCategory(trimmed, newCategoryDescription.trim());
      if (created) {
        const updated = normalizeCategoriesList([...categories, created]);
        onCategoriesChange(updated);
        onCategorySelected?.(created.name);
        setNewCategoryName('');
        setNewCategoryDescription('');
        setCategoryMessage('');
      }
    } catch (error) {
      console.error('Failed to create category', error);
      setCategoryMessage('Could not create category.');
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (isOtherItemsCategory(cat)) {
      setCategoryMessage('This category is required and cannot be deleted.');
      return;
    }
    const confirmed = window.confirm('Delete this category?');
    if (!confirmed) return;
    try {
      await adminDeleteCategory(cat.id);
      const updated = normalizeCategoriesList(categories.filter((c) => c.id !== cat.id));
      onCategoriesChange(updated);
    } catch (error) {
      console.error('Failed to delete category', error);
      setCategoryMessage('Could not delete category.');
    }
  };

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name || '');
    setEditDescription(cat.description || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
  };

  const handleSaveEdit = async (cat: Category) => {
    const name = editName.trim();
    if (!name) return;
    setIsSavingEdit(true);
    try {
      const updated = await adminUpdateCategory(cat.id, {
        name,
        description: editDescription.trim() || null,
      });
      if (updated) {
        const next = normalizeCategoriesList(
          categories.map((item) => (item.id === cat.id ? updated : item))
        );
        onCategoriesChange(next);
        onCategorySelected?.(updated.name);
      }
      handleCancelEdit();
      setCategoryMessage('');
    } catch (error) {
      console.error('Failed to update category', error);
      setCategoryMessage('Could not update category.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="relative max-w-lg">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
        >
          CLOSE
        </button>
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-center text-lg font-semibold tracking-[0.15em] uppercase text-slate-900">
            Category Management
          </DialogTitle>
          <p className="text-center text-sm text-slate-600">
            Add or delete categories available to products.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {categoryMessage && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {categoryMessage}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name"
              className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <input
              type="text"
              value={newCategoryDescription}
              onChange={(e) => setNewCategoryDescription(e.target.value)}
              placeholder="Category subtitle (optional)"
              className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <button
              type="button"
              onClick={handleAddCategory}
              disabled={!newCategoryName.trim()}
              className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              Add Category
            </button>
          </div>

          <div className="border border-slate-200 rounded-lg">
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-200">
              {isLoading ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : categories.length === 0 ? (
                <p className="px-3 py-2 text-sm text-slate-500">No categories yet.</p>
              ) : (
                categories.map((cat) => (
                  <div key={cat.id} className="px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-800">{cat.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-xs text-slate-500 hover:text-slate-800"
                          onClick={() => handleStartEdit(cat)}
                        >
                          Edit
                        </button>
                        {isOtherItemsCategory(cat) ? (
                          <span className="text-xs text-slate-400">Required</span>
                        ) : (
                          <button
                            type="button"
                            className="text-slate-500 hover:text-red-600"
                            onClick={() => handleDeleteCategory(cat)}
                            aria-label={`Delete ${cat.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    {editingId === cat.id && (
                      <div className="mt-3 space-y-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Category name"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        />
                        <input
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Category subtitle (optional)"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(cat)}
                            disabled={!editName.trim() || isSavingEdit}
                            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                          >
                            {isSavingEdit ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
