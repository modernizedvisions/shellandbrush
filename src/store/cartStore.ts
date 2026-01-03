import { create } from 'zustand';
import { CartItem, CartItemLegacy } from '../lib/types';

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  isOneOffInCart: (productId: string) => boolean;
  isProductInCart: (productId: string) => boolean;
  getQuantityForProduct: (productId: string) => number;
  getTotalItems: () => number;
  getSubtotal: () => number;
}

const CART_STORAGE_KEY = 'artist-cart';

const getStorage = () => {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
};

const loadCartFromStorage = (): CartItem[] => {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const stored = storage.getItem(CART_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Array<CartItem | CartItemLegacy>;
    return Array.isArray(parsed)
      ? parsed.map((item) => ({
          productId: (item as CartItem).productId || (item as CartItemLegacy).stripeProductId,
          name: item.name,
          priceCents: item.priceCents,
          quantity: item.quantity,
          imageUrl: item.imageUrl,
          category: (item as CartItem).category ?? null,
          categories: (item as CartItem).categories ?? null,
          oneoff: item.oneoff,
          quantityAvailable: (item as CartItem).quantityAvailable ?? null,
          stripeProductId: (item as CartItem).stripeProductId ?? (item as CartItemLegacy).stripeProductId ?? null,
          stripePriceId: (item as CartItem).stripePriceId ?? (item as CartItemLegacy).stripePriceId ?? null,
        }))
      : [];
  } catch (error) {
    console.error('Error loading cart from storage:', error);
    return [];
  }
};

const saveCartToStorage = (items: CartItem[]) => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('Error saving cart to storage:', error);
  }
};

export const useCartStore = create<CartStore>((set, get) => ({
  items: loadCartFromStorage(),

  addItem: (item: CartItem) => {
    set((state) => {
      if (item.oneoff && state.items.some((i) => i.productId === item.productId)) {
        return state;
      }

      const existingIndex = state.items.findIndex((i) => i.productId === item.productId);

      let newItems: CartItem[];

      if (existingIndex >= 0) {
        newItems = [...state.items];
        if (!item.oneoff) {
          const max = newItems[existingIndex].quantityAvailable ?? null;
          const desired = newItems[existingIndex].quantity + item.quantity;
          const clamped = max !== null ? Math.min(desired, max) : desired;
          if (clamped === newItems[existingIndex].quantity && max !== null) {
            if (typeof window !== 'undefined') {
              alert(`Only ${max} available.`);
            }
            saveCartToStorage(newItems);
            return { items: newItems };
          }
          newItems[existingIndex] = {
            ...newItems[existingIndex],
            quantity: clamped,
          };
        }
      } else {
        newItems = [...state.items, item];
      }

      saveCartToStorage(newItems);
      return { items: newItems };
    });
  },

  removeItem: (productId: string) => {
    set((state) => {
      const newItems = state.items.filter((i) => i.productId !== productId);
      saveCartToStorage(newItems);
      return { items: newItems };
    });
  },

  updateQuantity: (productId: string, quantity: number) => {
    set((state) => {
      const item = state.items.find((i) => i.productId === productId);

      if (item?.oneoff) {
        return state;
      }

      if (quantity <= 0) {
        const newItems = state.items.filter((i) => i.productId !== productId);
        saveCartToStorage(newItems);
        return { items: newItems };
      }

      const max = item?.quantityAvailable ?? null;
      const clamped = max !== null ? Math.min(quantity, max) : quantity;
      if (max !== null && clamped < quantity && typeof window !== 'undefined') {
        alert(`Only ${max} available.`);
      }

      const newItems = state.items.map((i) => (i.productId === productId ? { ...i, quantity: clamped } : i));

      saveCartToStorage(newItems);
      return { items: newItems };
    });
  },

  clearCart: () => {
    saveCartToStorage([]);
    set({ items: [] });
  },

  isOneOffInCart: (productId: string) => {
    const items = get().items;
    return items.some((item) => item.productId === productId && item.oneoff);
  },

  isProductInCart: (productId: string) => {
    return get().items.some((item) => item.productId === productId);
  },

  getQuantityForProduct: (productId: string) => {
    return get().items.find((item) => item.productId === productId)?.quantity ?? 0;
  },

  getTotalItems: () => {
    return get().items.reduce((total, item) => total + item.quantity, 0);
  },

  getSubtotal: () => {
    return get().items.reduce((total, item) => total + (item.priceCents * item.quantity), 0);
  },
}));
