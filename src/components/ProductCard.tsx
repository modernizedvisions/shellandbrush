import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../lib/types';
import { useCartStore } from '../store/cartStore';
import { useUIStore } from '../store/uiStore';
import { getDiscountedCents, isPromotionEligible, usePromotion } from '../lib/promotions';

interface ProductCardProps {
  product: Product;
  showEditOverlay?: boolean;
  children?: React.ReactNode;
}

const formatPrice = (priceCents?: number) => {
  if (priceCents === undefined || priceCents === null) return '';
  return `$${(priceCents / 100).toFixed(2)}`;
};

export function ProductCard({ product, showEditOverlay = false, children }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const items = useCartStore((state) => state.items);
  const isOneOffInCart = useCartStore((state) => state.isOneOffInCart);
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);
  const { promotion } = usePromotion();

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const thumbSrc = product.imageThumbUrls?.[0] ?? null;
  const imageSrc = (thumbSrc ?? product.imageUrl) || product.imageUrls?.[0] || '';
  const showFallback = !imageSrc || imageError;

  const qtyInCart = items.find((item) => item.productId === product.id)?.quantity ?? 0;
  const maxQty = product.quantityAvailable ?? null;
  const isSold = product.isSold || (product.quantityAvailable !== undefined && product.quantityAvailable <= 0);
  const hasPrice = product.priceCents !== undefined && product.priceCents !== null;

  const isOneOff = !!product.oneoff;
  const cannotAddMore = isOneOff && qtyInCart > 0;
  const isAtMax = maxQty !== null && qtyInCart >= maxQty;
  const canBuy = hasPrice && !isSold;
  const isEligibleForPromo =
    hasPrice &&
    isPromotionEligible(promotion, {
      category: product.category ?? product.type,
      type: product.type,
      categories: product.categories ?? null,
    });
  const discountedCents =
    isEligibleForPromo && promotion && product.priceCents !== undefined && product.priceCents !== null
      ? getDiscountedCents(product.priceCents, promotion.percentOff)
      : null;

  const handleAddToCart = () => {
    if (!canBuy || cannotAddMore || isAtMax) return;
    if (product.oneoff && isOneOffInCart(product.id)) return;
    if (maxQty !== null && qtyInCart >= maxQty) {
      if (typeof window !== 'undefined') {
        alert(`Only ${maxQty} available.`);
      }
      return;
    }

    addItem({
      productId: product.id,
      name: product.name,
      priceCents: product.priceCents ?? 0,
      quantity: 1,
      imageUrl: (thumbSrc ?? product.thumbnailUrl) || product.imageUrl,
      category: product.category ?? product.type,
      categories: product.categories ?? (product.category || product.type ? [product.category ?? product.type] : null),
      oneoff: product.oneoff,
      quantityAvailable: product.quantityAvailable ?? null,
      stripeProductId: product.stripeProductId ?? null,
      stripePriceId: product.stripePriceId ?? null,
    });
    setCartDrawerOpen(true);
  };

  return (
    <div className="group relative bg-white rounded-2xl shadow-sm overflow-hidden border border-black/5 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
      <span className="sr-only" data-card-version="v2" />
      {children && (
        <div
          className={`absolute inset-0 z-10 ${
            showEditOverlay ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'
          } transition-opacity duration-200`}
        >
          {children}
        </div>
      )}

      <div className="relative aspect-square bg-gray-100">
        {!showFallback && !imageLoaded && (
          <div className="absolute inset-0 animate-pulse bg-gray-200" />
        )}

        {showFallback && (
          <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-[#F7F7F5] to-[#EFEFEA]" />
        )}

        {imageSrc && !imageError && (
          <img
            src={imageSrc}
            alt={product.name}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            loading="lazy"
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageError(true);
              setImageLoaded(false);
            }}
          />
        )}
      </div>

      {isSold && (
        <div className="absolute top-3 left-3 z-20">
          <span className="inline-block uppercase text-[10px] tracking-widest bg-black/80 text-white px-2 py-1 rounded-full font-medium">
            Sold
          </span>
        </div>
      )}
      {isEligibleForPromo && discountedCents !== null && !isSold && (
        <div className="absolute top-3 left-3 z-20">
          <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 text-[10px] uppercase tracking-widest px-2 py-0.5">
            Sale
          </span>
        </div>
      )}

      <div className="p-2 sm:p-3 md:p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="mt-1 text-xs sm:text-sm md:text-base font-medium text-gray-900 line-clamp-2 break-words normal-case tracking-normal">
            {product.name}
          </h3>
        </div>

        <div className="mt-2">
          {hasPrice ? (
            <div className="text-xs sm:text-sm md:text-base text-gray-800 font-serif font-semibold">
              {isEligibleForPromo && discountedCents !== null ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-gray-400 line-through">{formatPrice(product.priceCents)}</span>
                  <span className="text-red-600">{formatPrice(discountedCents)}</span>
                </div>
              ) : (
                formatPrice(product.priceCents)
              )}
            </div>
          ) : (
            <span className="text-xs sm:text-sm text-gray-500">?</span>
          )}


          <div className="product-actions mt-2 sm:mt-3 grid grid-cols-2 gap-1.5 sm:gap-2">
            <button
              type="button"
              className="w-full min-w-0 h-8 sm:h-9 md:h-10 text-[10px] sm:text-xs md:text-sm uppercase rounded-lg px-1.5 sm:px-2 border border-gray-300 text-gray-800 hover:border-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleAddToCart}
              disabled={!canBuy || cannotAddMore || isAtMax}
            >
              {isSold ? (
                <span className="truncate">Sold</span>
              ) : cannotAddMore ? (
                <>
                  <span className="md:hidden truncate">In Cart</span>
                  <span className="hidden md:inline">In Cart</span>
                </>
              ) : (
                <>
                  <span className="md:hidden truncate">Add</span>
                  <span className="hidden md:inline">Add to Cart</span>
                </>
              )}
            </button>

            <Link
              to={`/product/${product.id}`}
              className="inline-flex items-center justify-center w-full min-w-0 h-8 sm:h-9 md:h-10 text-[10px] sm:text-xs md:text-sm uppercase rounded-lg px-1.5 sm:px-2 bg-gray-900 text-white hover:bg-gray-800 transition"
            >
              View
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

