import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Loader2, Trash2 } from 'lucide-react';
import type { Category, Product } from '../../lib/types';
import type { ManagedImage, ProductFormState } from '../../pages/AdminPage';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { adminFetchCategories } from '../../lib/api';
import { AdminSectionHeader } from './AdminSectionHeader';
import { CategoryManagementModal } from './CategoryManagementModal';

interface ProductAdminCardProps {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete?: (id: string) => Promise<void> | void;
}

const OTHER_ITEMS_CATEGORY = {
  slug: 'other-items',
  name: 'Other Items',
};

const isOtherItemsCategory = (category: Category) =>
  (category.slug || '').toLowerCase() === OTHER_ITEMS_CATEGORY.slug ||
  (category.name || '').trim().toLowerCase() === OTHER_ITEMS_CATEGORY.name.toLowerCase();

const normalizeCategoriesList = (items: Category[]): Category[] => {
  const map = new Map<string, Category>();

  items.forEach((cat) => {
    const key = cat.id || cat.name;
    if (!key) return;
    const normalized: Category = {
      ...cat,
      id: cat.id || key,
    };
    map.set(key, normalized);
  });

  const ordered = Array.from(map.values()).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const otherItems = ordered.filter((cat) => isOtherItemsCategory(cat));
  const withoutOtherItems = ordered.filter((cat) => !isOtherItemsCategory(cat));
  return [...withoutOtherItems, ...otherItems];
};

const ProductAdminCard: React.FC<ProductAdminCardProps> = ({ product, onEdit, onDelete }) => {
  const primaryImageUrl = Array.isArray((product as any).images) && (product as any).images.length > 0
    ? (product as any).images[0]
    : (product as any).imageUrls?.[0] ?? (product as any).imageUrl ?? null;
  const categoryLabel =
    (product as any).category ||
    product.type ||
    ((product as any).categories && Array.isArray((product as any).categories) ? (product as any).categories[0] : null);

  const quantity =
    ('quantity' in product && (product as any).quantity !== undefined)
      ? (product as any).quantity
      : product.quantityAvailable;
  const isOneOff = ('oneOff' in product ? (product as any).oneOff : (product as any).oneOff) ?? product.oneoff;
  const isActive = ('active' in product ? (product as any).active : (product as any).active) ?? product.visible;

  const priceLabel =
    (product as any).formattedPrice ??
    (product as any).priceFormatted ??
    (product as any).displayPrice ??
    (product as any).price ??
    (product.priceCents !== undefined ? formatPriceDisplay(product.priceCents) : '');

  return (
    <div className="flex flex-col rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow relative">
      {onDelete && (
        <button
          type="button"
          onClick={() => {
            if (!product.id) return;
            onDelete(product.id);
          }}
          className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-1.5 text-slate-600 shadow hover:text-red-600 hover:shadow-md"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <div className="aspect-[4/5] w-full overflow-hidden rounded-t-xl bg-slate-100">
        {primaryImageUrl ? (
          <img
            src={primaryImageUrl}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
            No image
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 p-4">
        {categoryLabel && (
          <div className="text-xs text-slate-500">
            {categoryLabel}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-slate-900 truncate">
            {product.name}
          </h3>
          <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">
            {priceLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {isActive !== undefined && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {isActive ? 'Active' : 'Inactive'}
            </span>
          )}
        </div>

        <button
          type="button"
          className="mt-2 w-full rounded-lg border border-slate-200 py-2 text-sm font-medium hover:bg-slate-50"
          onClick={() => onEdit(product)}
        >
          Edit product
        </button>
      </div>
    </div>
  );
};

export interface AdminShopTabProps {
  productStatus: { type: 'success' | 'error' | null; message: string };
  productForm: ProductFormState;
  productImages: ManagedImage[];
  editProductImages: ManagedImage[];
  adminProducts: Product[];
  editProductId: string | null;
  editProductForm: ProductFormState | null;
  productSaveState: 'idle' | 'saving' | 'success' | 'error';
  editProductSaveState: 'idle' | 'saving' | 'success' | 'error';
  isLoadingProducts: boolean;
  productImageFileInputRef: React.RefObject<HTMLInputElement>;
  editProductImageFileInputRef: React.RefObject<HTMLInputElement>;
  onCreateProduct: (e: React.FormEvent) => void | Promise<void>;
  onProductFormChange: (field: keyof ProductFormState, value: string | number | boolean) => void;
  onResetProductForm: () => void;
  onAddProductImages: (files: File[], slotIndex?: number) => void;
  onSetPrimaryProductImage: (id: string) => void;
  onRemoveProductImage: (id: string) => void;
  onAddEditProductImages: (files: File[], slotIndex?: number) => void;
  onSetPrimaryEditImage: (id: string) => void;
  onMoveEditImage: (id: string, direction: 'up' | 'down') => void;
  onRemoveEditImage: (id: string) => void;
  onEditFormChange: (field: keyof ProductFormState, value: string | number | boolean) => void;
  onUpdateProduct: (e: React.FormEvent) => Promise<boolean | void>;
  onCancelEditProduct: () => void;
  onStartEditProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void | Promise<void>;
}

export const AdminShopTab: React.FC<AdminShopTabProps> = ({
  productStatus,
  productForm,
  productImages,
  editProductImages,
  adminProducts,
  editProductId,
  editProductForm,
  productSaveState,
  editProductSaveState,
  isLoadingProducts,
  productImageFileInputRef,
  editProductImageFileInputRef,
  onCreateProduct,
  onProductFormChange,
  onResetProductForm,
  onAddProductImages,
  onSetPrimaryProductImage,
  onRemoveProductImage,
  onAddEditProductImages,
  onSetPrimaryEditImage,
  onMoveEditImage,
  onRemoveEditImage,
  onEditFormChange,
  onUpdateProduct,
  onCancelEditProduct,
  onStartEditProduct,
  onDeleteProduct,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editImages, setEditImages] = useState<ManagedImage[]>([]);
  const [activeProductSlot, setActiveProductSlot] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const maxModalImages = 4;
  const isUploading = productImages.some((img) => img.uploading);
  const missingUrlCount = productImages.filter(
    (img) => !img.uploading && !img.uploadError && !!img.previewUrl && !img.url
  ).length;
  const failedCount = productImages.filter((img) => img.uploadError).length;

  useEffect(() => {
    console.debug('[shop save] disable check', {
      isUploading,
      uploadingCount: productImages.filter((img) => img.uploading).length,
      missingUrlCount,
      failedCount,
      imageCount: productImages.length,
    });
  }, [failedCount, isUploading, missingUrlCount, productImages]);

  const normalizeCategory = (value: string | undefined | null) => (value || '').trim().toLowerCase();
  const getProductCategories = (product: Product): string[] => {
    const names = new Set<string>();
    const add = (name?: string | null) => {
      const trimmed = (name || '').trim();
      if (trimmed) names.add(trimmed);
    };
    add((product as any).category);
    add(product.type);
    if (Array.isArray((product as any).categories)) {
      (product as any).categories.forEach((c: unknown) => {
        if (typeof c === 'string') add(c);
      });
    }
    return Array.from(names);
  };

  useEffect(() => {
    let cancelled = false;
    const loadCategories = async () => {
      try {
        const apiCategories = await adminFetchCategories();
        const normalized = normalizeCategoriesList(apiCategories);
        if (cancelled) return;
        setCategories(normalized);
      } catch (error) {
        console.error('Failed to load categories', error);
      } finally {
      }
    };
    loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const names = categories.map((c) => c.name).filter(Boolean);
    const firstAvailable = names[0] || '';

    if (names.length === 0) {
      if (productForm.category) onProductFormChange('category', '');
      if (editProductForm?.category) onEditFormChange('category', '');
      if (selectedCategory !== 'All') setSelectedCategory('All');
      return;
    }

    if (!productForm.category || !names.includes(productForm.category)) {
      onProductFormChange('category', firstAvailable);
    }

    if (editProductForm && (!editProductForm.category || !names.includes(editProductForm.category))) {
      onEditFormChange('category', firstAvailable);
    }

    if (selectedCategory !== 'All' && !names.includes(selectedCategory)) {
      setSelectedCategory('All');
    }
  }, [categories, editProductForm, onEditFormChange, onProductFormChange, productForm.category, selectedCategory]);

  const handleModalFileSelect = (files: FileList | null) => {
    const list = Array.from(files ?? []);
    onAddEditProductImages(list);
  };

  const handleSetPrimaryModalImage = (id: string) => {
    onSetPrimaryEditImage(id);
    setEditImages((prev) => prev.map((img) => ({ ...img, isPrimary: img.id === id })));
  };

  const handleRemoveModalImage = (id: string) => {
    onRemoveEditImage(id);
    setEditImages((prev) => {
      const filtered = prev.filter((img) => img.id !== id);
      if (filtered.length > 0 && !filtered.some((img) => img.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      return filtered;
    });
  };

  const filteredProducts = useMemo(() => {
    const all = adminProducts.filter((product) => {
      const isSoldFlag =
        (product as any).isSold === true ||
        (product as any).is_sold === 1;
      const quantity = (product as any).quantityAvailable ?? (product as any).quantity_available;
      const soldOutByQuantity = typeof quantity === 'number' && quantity <= 0;
      return !isSoldFlag && !soldOutByQuantity;
    });

    return all.filter((product) => {
      const name = (product.name ?? '').toLowerCase();
      const desc = ((product as any).description ?? '').toLowerCase();
      const term = searchTerm.toLowerCase();
      const productCategories = getProductCategories(product).map((c) => normalizeCategory(c));

      const matchSearch = !term || name.includes(term) || desc.includes(term);
      const matchCat =
        selectedCategory === 'All' ||
        productCategories.includes(normalizeCategory(selectedCategory));

      return matchSearch && matchCat;
    });
  }, [adminProducts, searchTerm, selectedCategory]);

  useEffect(() => {
    if (isEditModalOpen) {
      const imgs = editProductImages.length && !editProductImages.some((img) => img.isPrimary)
        ? [{ ...editProductImages[0], isPrimary: true }, ...editProductImages.slice(1)]
        : editProductImages;
      setEditImages(imgs);
    }
  }, [isEditModalOpen, editProductImages, editProductId]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <AdminSectionHeader
          title="Add Products"
          subtitle="Add, edit, and manage all products shown in the storefront."
        />

        <div className="relative">
        <form onSubmit={onCreateProduct} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)] gap-8">
            <section className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                <input
                  required
                  value={productForm.name}
                  onChange={(e) => onProductFormChange('name', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  required
                  value={productForm.description}
                  onChange={(e) => onProductFormChange('description', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 md:gap-6">
                <div className="flex flex-col gap-4 h-full">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={productForm.price}
                        onChange={(e) => onProductFormChange('price', e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={productForm.quantityAvailable}
                        onChange={(e) => onProductFormChange('quantityAvailable', Number(e.target.value))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        disabled={productForm.isOneOff}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 items-center">
                    <ToggleSwitch
                      label="One-off piece"
                      checked={productForm.isOneOff}
                      onChange={(val) => onProductFormChange('isOneOff', val)}
                    />
                    <ToggleSwitch
                      label="Active (visible)"
                      checked={productForm.isActive}
                      onChange={(val) => onProductFormChange('isActive', val)}
                    />
                  </div>

                  <div className="flex gap-3 pt-2 md:mt-auto">
                    <button
                      type="submit"
                      disabled={productSaveState === 'saving' || isUploading || failedCount > 0 || missingUrlCount > 0}
                      className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                      {productSaveState === 'saving' ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-gray-200" />
                          <span>Saving...</span>
                        </span>
                      ) : (
                        'Save Product'
                      )}
                    </button>
                    {(isUploading || failedCount > 0 || missingUrlCount > 0) && (
                      <span className="text-xs text-slate-500 self-center">
                        {isUploading && 'Uploading images...'}
                        {!isUploading && failedCount > 0 && 'Fix failed uploads (remove/retry) before saving.'}
                        {!isUploading && failedCount === 0 && missingUrlCount > 0 && 'Some images didn’t finish uploading. Retry or remove.'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={onResetProductForm}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:border-gray-400"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-slate-700">
                      Categories
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCategoryModalOpen(true)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-800 underline"
                    >
                      Edit Categories
                    </button>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 max-h-40 overflow-y-auto">
                    {categories.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-500">No categories. Create one above.</p>
                    ) : (
                      categories.map((cat, idx) => {
                        const catName = cat.name || '';
                        const key = cat.id || (cat as any).slug || `${catName || 'category'}-${idx}`;
                        return (
                        <label
                          key={key}
                          className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-slate-100 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={productForm.category === catName}
                            onChange={() => onProductFormChange('category', catName)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className="text-slate-800">{catName || 'Unnamed category'}</span>
                        </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">Product Images</h4>
                <button
                  type="button"
                  onClick={() => productImageFileInputRef.current?.click()}
                  className="text-xs font-medium text-slate-700 border border-slate-300 rounded-full px-3 py-1 hover:bg-slate-50"
                >
                  Upload Images
                </button>
                <input
                  ref={productImageFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    console.debug('[shop images] handler fired', {
                      time: new Date().toISOString(),
                      hasEvent: !!e,
                      hasFiles: !!e?.target?.files,
                      filesLen: e?.target?.files?.length ?? 0,
                    });
                    const fileList = e?.target?.files;
                    const files = fileList ? Array.from(fileList) : [];
                    console.debug(
                      '[shop images] files extracted',
                      files.map((f) => ({ name: f.name, size: f.size, type: f.type }))
                    );
                    if (files.length === 0) {
                      console.warn('[shop images] no files found; aborting upload');
                      if (e?.target) e.target.value = '';
                      return;
                    }
                    onAddProductImages(files, activeProductSlot ?? undefined);
                    setActiveProductSlot(null);
                    if (e?.target) e.target.value = '';
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, index) => {
                  const image = productImages[index];
                  if (image) {
                    return (
                      <div
                        key={image.id}
                        className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fileList = e.dataTransfer?.files;
                        const files = Array.from(fileList ?? []);
                        console.debug(
                          '[shop images] drop files extracted',
                          files.map((f) => ({ name: f.name, size: f.size, type: f.type }))
                        );
                        if (files.length === 0) {
                          console.warn('[shop images] no files found; aborting upload');
                          return;
                        }
                        onAddProductImages(files, index);
                      }}
                        onClick={() => {
                          setActiveProductSlot(index);
                          productImageFileInputRef.current?.click();
                        }}
                      >
                        <img src={image.previewUrl ?? image.url} alt={`Product image ${index + 1}`} className="h-full w-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/40 px-2 py-1 text-xs text-white">
                          <button
                            type="button"
                            onClick={() => onSetPrimaryProductImage(image.id)}
                            className={`px-2 py-1 rounded ${image.isPrimary ? 'bg-white text-slate-900' : 'bg-black/30 text-white'}`}
                          >
                            {image.isPrimary ? 'Primary' : 'Set primary'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveProductImage(image.id)}
                            className="text-red-100 hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-center aspect-square rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400 cursor-pointer"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fileList = e.dataTransfer?.files;
                        const files = fileList ? Array.from(fileList) : [];
                        console.debug(
                          '[shop images] drop files extracted',
                          files.map((f) => ({ name: f.name, size: f.size, type: f.type }))
                        );
                        if (files.length === 0) {
                          console.warn('[shop images] no files found; aborting upload');
                          return;
                        }
                        onAddProductImages(files, index);
                      }}
                      onClick={() => {
                        setActiveProductSlot(index);
                        productImageFileInputRef.current?.click();
                      }}
                    >
                      Empty slot
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        </form>
      </div>
    </div>

      <CategoryManagementModal
        open={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        onCategoriesChange={(updated) => setCategories(normalizeCategoriesList(updated))}
        onCategorySelected={(name) => onProductFormChange('category', name)}
      />

      <div className="mt-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900 tracking-[0.08em] uppercase">
            Edit Current Products
          </h3>
          <div className="hidden" />
        </div>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search products..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
          />

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
          >
            <option value="All">All types</option>
            {categories.map((c, idx) => {
              const name = c.name || '';
              const key = c.id || (c as any).slug || `${name || 'category'}-${idx}`;
              return (
                <option key={key} value={name}>
                  {name || 'Unnamed category'}
                </option>
              );
            })}
          </select>
        </div>

        {isLoadingProducts && (
          <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        )}

        {filteredProducts.length === 0 ? (
          <div className="text-center text-gray-500 py-8 border border-dashed border-gray-200 rounded-lg">
            No active products
          </div>
        ) : (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => (
              <ProductAdminCard
                key={product.id}
                product={product}
                onEdit={(p) => {
                  setIsEditModalOpen(true);
                  onStartEditProduct(p);
                }}
                onDelete={async (id) => {
                  await onDeleteProduct(id);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="relative">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await onUpdateProduct(e);
              if (ok) {
                setIsEditModalOpen(false);
              }
            }}
            className="space-y-4"
          >
            <div className="absolute right-3 top-3 flex items-center gap-2">
              {editProductId && (
                <button
                  type="button"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  className="text-slate-500 hover:text-red-600 transition-colors"
                  aria-label="Delete product"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                CLOSE
              </button>
              <button
                type="submit"
                disabled={editProductSaveState === 'saving'}
                className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {editProductSaveState === 'saving' ? 'Saving...' : 'Save'}
              </button>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    value={editProductForm?.name || ''}
                    onChange={(e) => onEditFormChange('name', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editProductForm?.price || ''}
                      onChange={(e) => onEditFormChange('price', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={editProductForm?.quantityAvailable ?? 1}
                      onChange={(e) => onEditFormChange('quantityAvailable', Number(e.target.value))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      disabled={editProductForm?.isOneOff}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={editProductForm?.description || ''}
                    onChange={(e) => onEditFormChange('description', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={editProductForm?.category}
                      onChange={(e) => onEditFormChange('category', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      {categories.length === 0 ? (
                        <option value="">No categories available</option>
                      ) : (
                        categories.map((option, idx) => {
                          const name = option.name || '';
                          const key = option.id || (option as any).slug || `${name || 'category'}-${idx}`;
                          return (
                            <option key={key} value={name}>
                              {name || 'Unnamed category'}
                            </option>
                          );
                        })
                      )}
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700">One-off</label>
                    <input
                      type="checkbox"
                      checked={!!editProductForm?.isOneOff}
                      onChange={(e) => onEditFormChange('isOneOff', e.target.checked)}
                      className="h-4 w-4"
                    />
                    <label className="text-sm font-medium text-gray-700">Active</label>
                    <input
                      type="checkbox"
                      checked={!!editProductForm?.isActive}
                      onChange={(e) => onEditFormChange('isActive', e.target.checked)}
                      className="h-4 w-4"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Product Images (max 4)</h3>
                  <button
                    type="button"
                    onClick={() => editProductImageFileInputRef.current?.click()}
                    className="text-xs font-medium text-slate-700 border border-slate-300 rounded-full px-3 py-1 hover:bg-slate-50"
                  >
                    Upload
                  </button>
                  <input
                    ref={editProductImageFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                  onChange={(e) => {
                      console.debug('[shop images] handler fired', {
                        time: new Date().toISOString(),
                        hasEvent: !!e,
                        hasFiles: !!e?.target?.files,
                        filesLen: e?.target?.files?.length ?? 0,
                      });
                      const fileList = e?.target?.files;
                      const files = fileList ? Array.from(fileList) : [];
                      console.debug(
                        '[shop images] files extracted',
                        files.map((f) => ({ name: f.name, size: f.size, type: f.type }))
                      );
                      if (files.length === 0) {
                        console.warn('[shop images] no files found; aborting upload');
                        if (e?.target) e.target.value = '';
                        return;
                      }
                      handleModalFileSelect(fileList);
                      if (editProductImageFileInputRef.current) editProductImageFileInputRef.current.value = '';
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {console.debug('[edit modal] render images', editImages)}
                  {Array.from({ length: maxModalImages }).map((_, idx) => {
                    const image = editImages[idx];
                    if (image) {
                      return (
                        <div key={image.id} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                          <img src={image.previewUrl ?? image.url} alt={`Edit image ${idx + 1}`} className="h-full w-full object-cover" />
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/40 px-2 py-1 text-xs text-white">
                            <button
                              type="button"
                              onClick={() => handleSetPrimaryModalImage(image.id)}
                              className={`px-2 py-1 rounded ${image.isPrimary ? 'bg-white text-slate-900' : 'bg-black/30 text-white'}`}
                            >
                              {image.isPrimary ? 'Primary' : 'Set primary'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveModalImage(image.id)}
                              className="text-red-100 hover:text-red-300"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => editProductImageFileInputRef.current?.click()}
                        className="flex items-center justify-center aspect-square rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400"
                      >
                        Upload
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={isDeleteConfirmOpen}
        title="Are you sure?"
        description="This will permanently delete this product."
        confirmText={isDeleting ? 'Deleting...' : 'Confirm'}
        cancelText="Cancel"
        confirmVariant="danger"
        confirmDisabled={isDeleting}
        cancelDisabled={isDeleting}
        onCancel={() => {
          if (!isDeleting) setIsDeleteConfirmOpen(false);
        }}
        onConfirm={async () => {
          if (!editProductId) return;
          setIsDeleting(true);
          try {
            await onDeleteProduct(editProductId);
            setIsDeleteConfirmOpen(false);
            setIsEditModalOpen(false);
          } catch (err) {
            console.error('Delete product failed', err);
          } finally {
            setIsDeleting(false);
          }
        }}
      />
      {productStatus.type && (
        <div className="pointer-events-none absolute left-1/2 bottom-4 z-20 -translate-x-1/2">
          <div
            className={`pointer-events-auto rounded-full px-4 py-2 text-sm shadow-md ${
              productStatus.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {productStatus.message}
          </div>
        </div>
      )}
    </div>
  );
};

function formatPriceDisplay(priceCents?: number) {
  if (priceCents === undefined || priceCents === null) return '$0.00';
  return `$${(priceCents / 100).toFixed(2)}`;
}

interface ToggleSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function ToggleSwitch({ label, description, checked, onChange }: ToggleSwitchProps) {
  const trackClasses = checked ? 'bg-slate-900 border-slate-900' : 'bg-slate-200 border-slate-300';
  const thumbClasses = checked ? 'translate-x-5' : 'translate-x-1';

  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3">
      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${trackClasses}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${thumbClasses}`}
        />
      </span>
      <div className="flex flex-col text-left">
        <span className="text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="text-xs text-slate-500">{description}</span>}
      </div>
    </button>
  );
}

function ManagedImagesList({
  images,
  onSetPrimary,
  onMove,
  onRemove,
}: {
  images: ManagedImage[];
  onSetPrimary: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onRemove: (id: string) => void;
}) {
  if (!images.length) {
    return <div className="text-sm text-gray-500 border border-gray-200 rounded-lg p-3">No images yet. Upload to add.</div>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {images.map((img, idx) => (
        <div key={img.id} className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="aspect-square bg-gray-100 overflow-hidden">
            <img src={img.previewUrl ?? img.url} alt={`upload-${idx}`} className="w-full h-full object-cover" />
          </div>
          <div className="p-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => onSetPrimary(img.id)}
                className={`rounded px-2 py-1 ${img.isPrimary ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                {img.isPrimary ? 'Primary' : 'Set primary'}
              </button>
              <button
                type="button"
                onClick={() => onRemove(img.id)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onMove(img.id, 'up')}
                className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded hover:border-gray-400"
              >
                Up
              </button>
              <button
                type="button"
                onClick={() => onMove(img.id, 'down')}
                className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded hover:border-gray-400"
              >
                Down
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
