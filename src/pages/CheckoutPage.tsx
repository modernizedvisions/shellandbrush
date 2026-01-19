import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { loadStripe, type EmbeddedCheckout } from '@stripe/stripe-js';
import { BannerMessage } from '../components/BannerMessage';
import { createEmbeddedCheckoutSession, fetchCategories, fetchProductById } from '../lib/api';
import type { Category, Product } from '../lib/types';
import { getDiscountedCents, isPromotionEligible, usePromotion } from '../lib/promotions';
import { useCartStore } from '../store/cartStore';
import { calculateShippingCentsForCart } from '../lib/shipping';
import type { EmbeddedCheckoutSession } from '../lib/payments/checkout';

const SESSION_MAX_AGE_MS = 10 * 60 * 1000;
const sessionTimestampKey = (sessionId: string) => `checkout_session_created_at_${sessionId}`;

const isExpiredSessionError = (error: unknown) => {
  const code = (error as any)?.code || (error as any)?.type;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : typeof code === 'string'
      ? code
      : '';
  if (typeof code === 'string' && code.toLowerCase().includes('expired')) return true;
  if (message && /expired/i.test(message)) return true;
  return false;
};

export function CheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cartItems = useCartStore((state) => state.items);
  const cartSubtotal = useCartStore((state) => state.getSubtotal());
  const stripeContainerRef = useRef<HTMLDivElement | null>(null);
  const { promotion } = usePromotion();

  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMountingStripe, setIsMountingStripe] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoSummary, setPromoSummary] = useState<EmbeddedCheckoutSession['promo']>(null);
  const [promoFeedback, setPromoFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [promoApplying, setPromoApplying] = useState(false);
  const [sessionItems, setSessionItems] = useState<{ productId: string; quantity: number }[]>([]);
  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
  useEffect(() => {
    let isMounted = true;
    fetchCategories()
      .then((data) => {
        if (isMounted) setCategories(data);
      })
      .catch((error) => {
        console.error('checkout: failed to load categories for shipping', error);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const productIdFromUrl = searchParams.get('productId');
  const fallbackCartProduct = cartItems[0]?.productId;
  const targetProductId = useMemo(() => productIdFromUrl || fallbackCartProduct || null, [productIdFromUrl, fallbackCartProduct]);

  const clearSessionTimestamp = useCallback((id: string | null) => {
    if (!id || typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(sessionTimestampKey(id));
    } catch (storageError) {
      console.warn('checkout: failed to clear session timestamp', storageError);
    }
  }, []);

  const recordSessionTimestamp = useCallback((id: string) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(sessionTimestampKey(id), String(Date.now()));
    } catch (storageError) {
      console.warn('checkout: failed to store session timestamp', storageError);
    }
  }, []);

  const hasSessionExpired = useCallback(
    (id: string) => {
      if (typeof window === 'undefined') return false;
      try {
        const stored = window.localStorage.getItem(sessionTimestampKey(id));
        if (!stored) return false;
        const createdAt = Number(stored);
        if (!createdAt) return false;
        return Date.now() - createdAt > SESSION_MAX_AGE_MS;
      } catch (storageError) {
        console.warn('checkout: failed to read session timestamp', storageError);
        return false;
      }
    },
    []
  );

  const handleStaleSession = useCallback(
    (reason: string) => {
      console.warn('checkout: session expired; redirecting', { reason, sessionId });
      if (sessionId) {
        clearSessionTimestamp(sessionId);
      }
      setClientSecret(null);
      setSessionId(null);
      setError('Your checkout session expired. Please start again.');
      navigate('/shop', { replace: true });
    },
    [clearSessionTimestamp, navigate, sessionId]
  );

  const startSession = useCallback(async (items: { productId: string; quantity: number }[], promoCode?: string | null) => {
    const session = await createEmbeddedCheckoutSession(items, promoCode || null);
    setClientSecret(session.clientSecret);
    setSessionId(session.sessionId);
    setPromoSummary(session.promo ?? null);
    recordSessionTimestamp(session.sessionId);
    return session;
  }, [recordSessionTimestamp]);

  const formatPromoSummary = useCallback((summary: EmbeddedCheckoutSession['promo']) => {
    if (!summary) return '';
    const parts = [];
    if (summary.percentOff > 0) {
      parts.push(`${summary.percentOff}% off`);
    }
    if (summary.freeShippingApplied) {
      parts.push('Free shipping');
    }
    const detail = parts.length ? parts.join(' + ') : 'No discount';
    const codeLabel = summary.code ? summary.code.toUpperCase() : '';
    if (summary.source === 'auto+code') {
      return `Auto promo + code ${codeLabel} applied: ${detail}.`;
    }
    if (summary.source === 'code') {
      return `Code ${codeLabel} applied: ${detail}.`;
    }
    if (summary.source === 'auto') {
      return summary.code
        ? `Auto promotion applied; code ${codeLabel} saved (auto promo was better).`
        : `Auto promotion applied: ${detail}.`;
    }
    return '';
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      if (!publishableKey) {
        console.error('VITE_STRIPE_PUBLISHABLE_KEY is missing on the client');
        setError('Stripe is not configured');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        if (cartItems.length === 0 && !targetProductId) {
          throw new Error('No products in cart.');
        }

        let displayProduct: Product | null = null;
        if (targetProductId) {
          console.log('checkout: targetProductId', targetProductId);
          const found = await fetchProductById(targetProductId);
          console.log('checkout: fetched product', found);

          if (!found) {
            throw new Error('Product not found.');
          }
          if (found.isSold) {
            throw new Error('This piece has already been sold.');
          }
          if (!found.priceCents) {
            throw new Error('This product is missing pricing details.');
          }
          if (!found.stripePriceId) {
            throw new Error('This product has no Stripe price configured.');
          }
          displayProduct = found;
        } else {
          // No single target product; use first cart item for display only.
          displayProduct = cartItems[0] as any;
        }

        if (isCancelled) return;
        setProduct(displayProduct);

        const sessionItems = cartItems.length
          ? cartItems.map((ci) => ({ productId: ci.productId, quantity: ci.quantity }))
          : targetProductId
          ? [{ productId: targetProductId, quantity: 1 }]
          : [];
        setSessionItems(sessionItems);

        const session = await startSession(sessionItems);
        console.log('checkout: session response', session);
        if (isCancelled) return;
        if (session.promo) {
          setPromoFeedback({ type: 'success', message: formatPromoSummary(session.promo) || 'Promotion applied to your checkout.' });
        } else {
          setPromoFeedback(null);
        }
      } catch (err) {
        if (isCancelled) return;
        const message = err instanceof Error ? err.message : 'Unable to start checkout.';
        setError(message);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    load();
    return () => {
      isCancelled = true;
    };
  }, [cartItems, publishableKey, startSession, targetProductId, formatPromoSummary]);

  useEffect(() => {
    if (!clientSecret) return;
    if (!publishableKey) return;

    let checkout: EmbeddedCheckout | null = null;
    let isCancelled = false;

    const mount = async () => {
      try {
        setIsMountingStripe(true);
        const stripe = await loadStripe(publishableKey);
        if (!stripe) throw new Error('Failed to load Stripe.');

        if (isCancelled) return;

        checkout = await stripe.initEmbeddedCheckout({ clientSecret });
        checkout.mount('#embedded-checkout');
      } catch (err) {
        if (isCancelled) return;
        const message = err instanceof Error ? err.message : 'Unable to load checkout.';
        if (isExpiredSessionError(err)) {
          handleStaleSession('stripe-reported-expired');
          return;
        }
        setError(message);
      } finally {
        if (!isCancelled) setIsMountingStripe(false);
      }
    };

    mount();
    return () => {
      isCancelled = true;
      checkout?.destroy();
    };
  }, [clientSecret, handleStaleSession, publishableKey]);

  useEffect(() => {
    if (!sessionId) return;

    const checkExpiry = () => {
      if (hasSessionExpired(sessionId)) {
        handleStaleSession('age-limit');
      }
    };

    checkExpiry();
    const intervalId = window.setInterval(checkExpiry, 15000);
    return () => window.clearInterval(intervalId);
  }, [sessionId, hasSessionExpired, handleStaleSession]);

  const previewItems = useMemo(() => {
    if (cartItems.length) {
      return cartItems.map((item) => ({
        id: item.productId,
        name: item.name,
        collection: (item as any).collection,
        description: (item as any).description,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        priceCents: item.priceCents,
        category: item.category ?? null,
        categories: item.categories ?? null,
      }));
    }
    if (product) {
      return [
        {
          id: product.id ?? product.stripeProductId ?? 'product',
          name: product.name,
          collection: product.collection || product.type,
          description: product.description,
          imageUrl: (product as any).thumbnailUrl || (product as any).imageUrl || null,
          quantity: 1,
          priceCents: product.priceCents ?? 0,
          category: product.category ?? product.type ?? null,
          categories: product.categories ?? null,
        },
      ];
    }
    return [];
  }, [cartItems, product]);

  
  const shippingItems = useMemo(() => {
    if (cartItems.length) return cartItems;
    if (product) {
      const primaryCategory = product.category ?? product.type ?? null;
      const categoriesList = Array.isArray(product.categories)
        ? product.categories
        : primaryCategory
        ? [primaryCategory]
        : null;
      return [
        {
          productId: product.id ?? product.stripeProductId ?? 'product',
          name: product.name,
          priceCents: product.priceCents ?? 0,
          quantity: 1,
          category: primaryCategory,
          categories: categoriesList,
        },
      ];
    }
    return [];
  }, [cartItems, product]);
  const subtotalCents = useMemo(() => {
    if (cartItems.length) return cartSubtotal;
    return previewItems.reduce((sum, item) => sum + item.priceCents * (item.quantity || 1), 0);
  }, [cartItems.length, cartSubtotal, previewItems]);

  const discountedSubtotalCents = useMemo(() => {
    const promoCodePercent = promoSummary?.codePercentOff ?? 0;
    const promoCodeScope = promoSummary?.codeScope ?? null;
    const promoCodeSlugs = promoSummary?.codeCategorySlugs ?? [];
    const hasPromoCode = !!promoSummary?.code;
    const normalizedPromoSlugs = promoCodeSlugs.map((slug) => slug.trim().toLowerCase());
    const isPromoCodeEligible = (item: { category?: string | null; type?: string | null; categories?: string[] | null }) => {
      if (!hasPromoCode || !promoCodePercent) return false;
      if (promoCodeScope === 'global') return true;
      if (promoCodeScope !== 'categories') return false;
      const candidate = new Set<string>();
      const add = (value?: string | null) => {
        const normalized = (value || '').trim().toLowerCase();
        if (normalized) candidate.add(normalized);
      };
      add(item.category);
      add(item.type);
      if (Array.isArray(item.categories)) {
        item.categories.forEach((value) => add(value));
      }
      return Array.from(candidate).some((value) => normalizedPromoSlugs.includes(value));
    };

    if (!promotion && !hasPromoCode) return subtotalCents;
    if (cartItems.length) {
      return cartItems.reduce((sum, item) => {
        const autoEligible = promotion
          ? isPromotionEligible(promotion, {
              category: item.category ?? null,
              type: null,
              categories: item.categories ?? null,
            })
          : false;
        const codeEligible = isPromoCodeEligible({
          category: item.category ?? null,
          type: null,
          categories: item.categories ?? null,
        });
        const bestPercent = Math.max(
          autoEligible && promotion ? promotion.percentOff : 0,
          codeEligible ? promoCodePercent : 0
        );
        const discounted = bestPercent > 0 ? getDiscountedCents(item.priceCents, bestPercent) : item.priceCents;
        return sum + discounted * item.quantity;
      }, 0);
    }
    if (product) {
      const price = product.priceCents ?? 0;
      const autoEligible = promotion
        ? isPromotionEligible(promotion, {
            category: product.category ?? product.type ?? null,
            type: product.type ?? null,
            categories: product.categories ?? null,
          })
        : false;
      const codeEligible = isPromoCodeEligible({
        category: product.category ?? product.type ?? null,
        type: product.type ?? null,
        categories: product.categories ?? null,
      });
      const bestPercent = Math.max(
        autoEligible && promotion ? promotion.percentOff : 0,
        codeEligible ? promoCodePercent : 0
      );
      return bestPercent > 0 ? getDiscountedCents(price, bestPercent) : price;
    }
    return subtotalCents;
  }, [promotion, cartItems, product, subtotalCents, promoSummary]);

  const shippingCents = calculateShippingCentsForCart(shippingItems, categories);
  const effectiveShippingCents = promoSummary?.freeShippingApplied ? 0 : shippingCents;
  const totalCents = (discountedSubtotalCents || 0) + effectiveShippingCents;

  const formatMoney = (cents: number) => `$${((cents ?? 0) / 100).toFixed(2)}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <p className="text-gray-600">Preparing your checkout...</p>
      </div>
    );
  }

  const promoSummaryText = formatPromoSummary(promoSummary);

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Chesapeake Shell</p>
            <h1 className="text-3xl font-bold text-gray-900">Secure Checkout</h1>
            <p className="text-gray-600 mt-1">Complete your purchase safely and securely.</p>
          </div>
          <button
            onClick={() => navigate('/shop')}
            className="bg-white border border-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium hover:border-gray-400 transition-colors"
          >
            Back to Shop
          </button>
        </div>

        {error && <BannerMessage message={error} type="error" />}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Order Preview</p>
                <h2 className="text-base font-semibold text-gray-900">Items in your cart</h2>
              </div>

              <div className="space-y-3">
                {previewItems.length === 0 && (
                  <div className="text-sm text-gray-600">No items to display.</div>
                )}
                {previewItems.map((item) => {
                  const autoEligible =
                    !!promotion &&
                    isPromotionEligible(promotion, {
                      category: (item as any).category ?? null,
                      type: null,
                      categories: (item as any).categories ?? null,
                    });
                  const codeEligible = promoSummary?.code && promoSummary.codePercentOff
                    ? (() => {
                        const normalizedPromoSlugs = (promoSummary.codeCategorySlugs || []).map((slug) => slug.trim().toLowerCase());
                        if (promoSummary.codeScope === 'global') return true;
                        if (promoSummary.codeScope !== 'categories') return false;
                        const candidate = new Set<string>();
                        const add = (value?: string | null) => {
                          const normalized = (value || '').trim().toLowerCase();
                          if (normalized) candidate.add(normalized);
                        };
                        add((item as any).category ?? null);
                        add((item as any).type ?? null);
                        if (Array.isArray((item as any).categories)) {
                          (item as any).categories.forEach((value: string) => add(value));
                        }
                        return Array.from(candidate).some((value) => normalizedPromoSlugs.includes(value));
                      })()
                    : false;
                  const bestPercent = Math.max(
                    autoEligible && promotion ? promotion.percentOff : 0,
                    codeEligible ? promoSummary?.codePercentOff || 0 : 0
                  );
                  const unitPrice = bestPercent > 0
                    ? getDiscountedCents(item.priceCents ?? 0, bestPercent)
                    : (item.priceCents ?? 0);
                  const lineTotal = unitPrice * (item.quantity || 1);
                  return (
                    <div key={`${item.id}-${item.name}`} className="flex gap-3">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name || 'Item'}
                          className="w-14 h-14 rounded-md object-cover bg-gray-100 border border-gray-100"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-md bg-gray-100 border border-gray-100" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900 truncate">{item.name || 'Item'}</p>
                          <span className="text-sm font-serif font-semibold text-gray-900">{formatMoney(lineTotal)}</span>
                        </div>
                        {item.collection && (
                          <p className="text-[11px] uppercase tracking-wide text-gray-500">{item.collection}</p>
                        )}
                        {item.description && (
                          <p className="text-xs text-gray-600 line-clamp-2">{item.description}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5">
                          Qty: {item.quantity || 1}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-gray-200 pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-700">
                  <span>Subtotal</span>
                  <span className="font-serif font-medium">{formatMoney(discountedSubtotalCents || 0)}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Shipping</span>
                  <span className="font-serif font-medium">{formatMoney(effectiveShippingCents)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200 text-base font-semibold text-gray-900">
                  <span>Total</span>
                  <span className="font-serif">{formatMoney(totalCents)}</span>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-2 text-sm">
                <p className="text-xs uppercase tracking-wide text-gray-500">Promo code</p>
                <div className="flex gap-2">
                  <input
                    value={promoCodeInput}
                    onChange={(event) => setPromoCodeInput(event.target.value)}
                    placeholder="Enter code"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!sessionItems.length) return;
                      const trimmed = promoCodeInput.trim();
                      setPromoFeedback(null);
                      setPromoApplying(true);
                      try {
                        const session = await startSession(sessionItems, trimmed || null);
                        if (session.promo) {
                          const summaryText = formatPromoSummary(session.promo);
                          setPromoFeedback({ type: 'success', message: summaryText || 'Promo applied.' });
                        } else {
                          setPromoFeedback({ type: 'info', message: 'No promo applied to this checkout.' });
                        }
                      } catch (err) {
                        const message = err instanceof Error ? err.message : 'Unable to apply promo code.';
                        setPromoFeedback({ type: 'error', message });
                      } finally {
                        setPromoApplying(false);
                      }
                    }}
                    disabled={promoApplying}
                    className="rounded-lg bg-gray-900 text-white px-3 py-2 text-xs font-semibold disabled:opacity-60"
                  >
                    {promoApplying ? 'Applying...' : 'Apply'}
                  </button>
                </div>
                {promoFeedback && (
                  <p
                    className={
                      promoFeedback.type === 'error'
                        ? 'text-xs text-red-600'
                        : promoFeedback.type === 'success'
                        ? 'text-xs text-emerald-600'
                        : 'text-xs text-gray-600'
                    }
                  >
                    {promoFeedback.message}
                  </p>
                )}
                {promoSummaryText && !promoFeedback && (
                  <p className="text-xs text-emerald-600">{promoSummaryText}</p>
                )}
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Payment</h2>
                {isMountingStripe && <p className="text-sm text-gray-500">Loading Stripeâ€¦</p>}
              </div>
              <div
                id="embedded-checkout"
                ref={stripeContainerRef}
                className="rounded-lg border border-dashed border-gray-200 min-h-[360px]"
              />
              <p className="text-xs text-gray-500">
                Secure payment is handled by Stripe. Youâ€™ll receive a confirmation as soon as the purchase completes.
              </p>
            </div>
          </div>
        </div>

        {!product && !error && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center mt-6">
            <p className="text-gray-700">Select a product to begin checkout.</p>
            <Link to="/shop" className="text-gray-900 font-semibold underline">
              Back to Shop
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

