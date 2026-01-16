import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';
import { fetchProductById, fetchRelatedProducts } from '../lib/api';
import { Product } from '../lib/types';
import { useCartStore } from '../store/cartStore';
import { useUIStore } from '../store/uiStore';
import { ProductReviews } from '@/components/product/ProductReviews';
import { getDiscountedCents, isPromotionEligible, usePromotion } from '../lib/promotions';

export function ProductDetailPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const addItem = useCartStore((state) => state.addItem);
  const isOneOffInCart = useCartStore((state) => state.isOneOffInCart);
  const isProductInCart = useCartStore((state) => state.isProductInCart);
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);
  const { promotion } = usePromotion();

  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const relatedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!productId) return;
      setLoadingProduct(true);
      const found = await fetchProductById(productId);
      setProduct(found);
      setLoadingProduct(false);

      if (found) {
        setLoadingRelated(true);
        fetchRelatedProducts(found.type, found.id).then((items) => {
          setRelated(items);
          setLoadingRelated(false);
        });
      }
    };
    load();
  }, [productId]);

  const images = useMemo(() => {
    if (!product) return [];
    if (product.imageUrls && product.imageUrls.length > 0) return product.imageUrls;
    return product.imageUrl ? [product.imageUrl] : [];
  }, [product]);
  const imageThumbs = useMemo(() => {
    if (!product?.imageThumbUrls || !product.imageThumbUrls.length) return [];
    return product.imageThumbUrls;
  }, [product]);
  const imageMediums = useMemo(() => {
    if (!product?.imageMediumUrls || !product.imageMediumUrls.length) return [];
    return product.imageMediumUrls;
  }, [product]);

  useEffect(() => {
    setCurrentIndex(0);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [productId]);

  const handlePrev = () => {
    if (!images.length) return;
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = () => {
    if (!images.length) return;
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const hasPrice = product?.priceCents !== undefined && product?.priceCents !== null;
  const isSold = product?.isSold || (product?.quantityAvailable !== undefined && (product.quantityAvailable ?? 0) <= 0);
  const canPurchase = !!product && hasPrice && !isSold;
  const isEligibleForPromo =
    hasPrice &&
    isPromotionEligible(promotion, {
      category: product?.category ?? product?.type ?? null,
      type: product?.type ?? null,
      categories: product?.categories ?? null,
    });
  const discountedCents =
    isEligibleForPromo && promotion && product?.priceCents !== undefined && product?.priceCents !== null
      ? getDiscountedCents(product.priceCents, promotion.percentOff)
      : null;

  const handleAddToCart = () => {
    if (!product || !hasPrice || isSold) return;
    if (product.oneoff && isOneOffInCart(product.id)) return;
    addItem({
      productId: product.id,
      name: product.name,
      priceCents: product.priceCents ?? 0,
      quantity: 1,
      imageUrl: (product.imageThumbUrls?.[0] ?? product.thumbnailUrl) || product.imageUrl,
      category: product.category ?? product.type,
      categories: product.categories ?? (product.category || product.type ? [product.category ?? product.type] : null),
      oneoff: product.oneoff,
      stripeProductId: product.stripeProductId ?? null,
      stripePriceId: product.stripePriceId ?? null,
    });
    setCartDrawerOpen(true);
  };

  const formatPrice = (priceCents?: number) => (priceCents || priceCents === 0 ? `$${(priceCents / 100).toFixed(2)}` : '');

  if (!loadingProduct && !product) {
    return (
      <div className="py-16 bg-gray-50 min-h-screen">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <h1 className="text-3xl font-semibold text-gray-900">Product not found</h1>
          <Link to="/shop" className="text-gray-700 underline">
            Back to Shop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      <section className="py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <button onClick={() => navigate(-1)} className="text-sm text-gray-600 hover:text-gray-900">
              Back
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
            <div>
              <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
                {loadingProduct ? (
                  <div className="w-full h-full animate-pulse bg-gray-200" />
                ) : images.length ? (
                  <>
                    <img
                      src={imageMediums[currentIndex] ?? images[currentIndex]}
                      alt={product?.name || 'Product'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    {images.length > 1 && (
                      <>
                        <button
                          onClick={handlePrev}
                          className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur rounded-full p-2 shadow hover:bg-white"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          onClick={handleNext}
                          className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur rounded-full p-2 shadow hover:bg-white"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">No image</div>
                )}
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto">
                {images.map((url, idx) => (
                  <button
                    key={url}
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-20 h-20 rounded-md overflow-hidden border ${idx === currentIndex ? 'border-gray-900' : 'border-gray-200'}`}
                  >
                    <img
                      src={imageThumbs[idx] ?? url}
                      alt={`${product?.name}-thumb-${idx}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h1 className="text-3xl font-semibold text-gray-900">{loadingProduct ? 'Loading...' : product?.name}</h1>
              {product?.priceCents !== undefined && product?.priceCents !== null && (
                <div className="text-sm font-serif font-medium text-slate-800">
                  {isEligibleForPromo && discountedCents !== null ? (
                    <div>
                      <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 text-[10px] uppercase tracking-widest px-2 py-0.5 mb-1">
                        Sale
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-gray-400 line-through">{formatPrice(product.priceCents)}</span>
                        <span className="text-red-600">{formatPrice(discountedCents)}</span>
                      </div>
                    </div>
                  ) : (
                    formatPrice(product.priceCents)
                  )}
                </div>
              )}
              <p className="text-gray-700 leading-relaxed">{product?.description}</p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAddToCart}
                  disabled={!canPurchase || (product?.oneoff && isOneOffInCart(product.id))}
                  className="flex-1 bg-white border border-gray-300 text-gray-800 py-3 rounded-lg font-semibold hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {!loadingRelated && related.length > 0 && (
        <section className="py-10 bg-gray-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-gray-900">More from this collection</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => relatedRef.current?.scrollBy({ left: -260, behavior: 'smooth' })}
                  className="p-2 rounded-full border border-gray-300 bg-white hover:border-gray-400"
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => relatedRef.current?.scrollBy({ left: 260, behavior: 'smooth' })}
                  className="p-2 rounded-full border border-gray-300 bg-white hover:border-gray-400"
                  aria-label="Scroll right"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div ref={relatedRef} className="flex gap-4 overflow-x-auto pb-2">
              {related.map((item) => {
                const relatedThumb = item.imageThumbUrls?.[0] ?? null;
                const relatedEligible =
                  item.priceCents !== undefined &&
                  item.priceCents !== null &&
                  isPromotionEligible(promotion, {
                    category: item.category ?? item.type,
                    type: item.type,
                    categories: item.categories ?? null,
                  });
                const relatedDiscounted =
                  relatedEligible && promotion && item.priceCents !== undefined && item.priceCents !== null
                    ? getDiscountedCents(item.priceCents, promotion.percentOff)
                    : null;
                return (
                  <div key={item.id} className="w-64 flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                  <div className="aspect-square bg-gray-100 overflow-hidden">
                    <img
                      src={(relatedThumb ?? item.imageUrl) || item.imageUrls?.[0]}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="p-4 space-y-2">
                    <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
                    {item.priceCents !== undefined && item.priceCents !== null && (
                      <div className="text-sm font-serif font-bold text-gray-900">
                        {relatedEligible && relatedDiscounted !== null ? (
                          <div>
                            <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 text-[10px] uppercase tracking-widest px-2 py-0.5 mb-1">
                              Sale
                            </span>
                            <div className="flex items-baseline gap-2">
                              <span className="text-gray-400 line-through">{formatPrice(item.priceCents)}</span>
                              <span className="text-red-600">{formatPrice(relatedDiscounted)}</span>
                            </div>
                          </div>
                        ) : (
                          formatPrice(item.priceCents)
                        )}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/product/${item.id}`)}
                        className="flex-1 bg-gray-900 text-white py-2 rounded-md text-sm hover:bg-gray-800 transition-colors"
                      >
                        View
                      </button>
                      <button
                        onClick={() => {
                          if (!item.priceCents || item.isSold) return;
                          if (item.oneoff && isOneOffInCart(item.id)) return;
                          addItem({
                            productId: item.id,
                            name: item.name,
                            priceCents: item.priceCents,
                            quantity: 1,
                            imageUrl: (relatedThumb ?? item.thumbnailUrl) || item.imageUrl,
                            category: item.category ?? item.type,
                            categories: item.categories ?? (item.category || item.type ? [item.category ?? item.type] : null),
                            oneoff: item.oneoff,
                            stripeProductId: item.stripeProductId ?? null,
                            stripePriceId: item.stripePriceId ?? null,
                          });
                          setCartDrawerOpen(true);
                        }}
                        disabled={
                          !item.priceCents ||
                          item.isSold ||
                          (item.oneoff && isOneOffInCart(item.id))
                        }
                        className="flex-1 flex items-center justify-center bg-white border border-gray-300 text-gray-700 py-2 rounded-md hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ShoppingCart className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )})}
            </div>
          </div>
        </section>
      )}

      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <ProductReviews />
        </div>
      </section>
    </div>
  );
}

