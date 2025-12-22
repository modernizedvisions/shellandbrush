import { ShoppingCart } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';
import { useUIStore } from '../../store/uiStore';

export function CartIcon() {
  const totalItems = useCartStore((state) => state.getTotalItems());
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);

  return (
    <button
      onClick={() => setCartDrawerOpen(true)}
      className="relative p-2 hover:bg-gray-100 rounded-full transition-colors"
      aria-label="Shopping cart"
    >
      <ShoppingCart className="w-6 h-6 text-gray-700" />
      {totalItems > 0 && (
        <span className="absolute -top-1 -right-1 bg-gray-900 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {totalItems}
        </span>
      )}
    </button>
  );
}
