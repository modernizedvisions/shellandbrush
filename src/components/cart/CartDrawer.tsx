import { useEffect, useMemo, useState } from 'react';
import { X, Minus, Plus, Trash2 } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';
import { useUIStore } from '../../store/uiStore';
import { useNavigate } from 'react-router-dom';
import { fetchCategories } from '../../lib/api';
import { calculateShippingCentsForCart } from '../../lib/shipping';
import type { Category } from '../../lib/types';
import { getDiscountedCents, isPromotionEligible, usePromotion } from '../../lib/promotions';

export function CartDrawer() {
  const isOpen = useUIStore((state) => state.isCartDrawerOpen);
  const [categories, setCategories] = useState<Category[]>([]);
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);
  const items = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const getSubtotal = useCartStore((state) => state.getSubtotal());
  const navigate = useNavigate();
  const { promotion } = usePromotion();
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    fetchCategories()
      .then((data) => {
        if (isMounted) setCategories(data);
      })
      .catch((error) => {
        console.error('Failed to load categories for shipping', error);
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const discountedSubtotal = useMemo(() => {
    if (!promotion) return getSubtotal;
    return items.reduce((sum, item) => {
      const eligible = isPromotionEligible(promotion, {
        category: item.category ?? null,
        type: null,
        categories: item.categories ?? null,
      });
      const unitPrice = eligible
        ? getDiscountedCents(item.priceCents, promotion.percentOff)
        : item.priceCents;
      return sum + unitPrice * item.quantity;
    }, 0);
  }, [getSubtotal, items, promotion]);

  if (!isOpen) return null;

  const shippingCents = calculateShippingCentsForCart(items, categories);
  const totalCents = discountedSubtotal + shippingCents;

  const handleCheckout = () => {
    if (!items.length) return;
    setCartDrawerOpen(false);
    const productId = items[0].productId;
    navigate(`/checkout?productId=${encodeURIComponent(productId)}`);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={() => setCartDrawerOpen(false)}
      />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold">Your Cart</h2>
          <button
            onClick={() => setCartDrawerOpen(false)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Your cart is empty</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.productId} className="flex gap-4 pb-4 border-b border-gray-200">
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-20 h-20 object-cover rounded"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{item.name}</h3>
                    {promotion &&
                    isPromotionEligible(promotion, {
                      category: item.category ?? null,
                      type: null,
                      categories: item.categories ?? null,
                    }) ? (
                      <div className="text-sm text-gray-600 font-serif">
                        <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 text-[10px] uppercase tracking-widest px-2 py-0.5 mb-1">
                          Sale
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-gray-400 line-through">
                            ${(item.priceCents / 100).toFixed(2)}
                          </span>
                          <span className="text-red-600">
                            ${(getDiscountedCents(item.priceCents, promotion.percentOff) / 100).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600 font-serif">
                        ${(item.priceCents / 100).toFixed(2)}
                      </p>
                    )}
                    {item.oneoff && (
                      <span className="inline-block mt-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        One-of-a-kind
                      </span>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                    {item.oneoff ? (
                      <span className="text-sm text-gray-500">Qty: 1</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          disabled={item.quantityAvailable !== null && item.quantityAvailable !== undefined && item.quantity >= item.quantityAvailable}
                          className="p-1 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                      <button
                        onClick={() => removeItem(item.productId)}
                        className="ml-auto p-1 hover:bg-red-50 text-red-600 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="p-4 border-t border-gray-200">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-serif font-semibold text-gray-900">${(discountedSubtotal / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping</span>
                <span className="font-serif font-semibold text-gray-900">${(shippingCents / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-200 text-base font-bold">
                <span>Total</span>
                <span className="font-serif">${(totalCents / 100).toFixed(2)}</span>
              </div>
            </div>
            <button
              onClick={handleCheckout}
              className="w-full bg-gray-900 text-white py-3 px-6 rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              Checkout
            </button>
          </div>
        )}
      </div>
    </>
  );
}


