import { Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { CartIcon } from '../components/cart/CartIcon';
import { CartDrawer } from '../components/cart/CartDrawer';
import { useUIStore } from '../store/uiStore';
import { PromotionProvider, usePromotion } from '../lib/promotions';

export function SiteLayout() {
  return (
    <PromotionProvider>
      <SiteLayoutContent />
    </PromotionProvider>
  );
}

function SiteLayoutContent() {
  const openCartOnLoad = useUIStore((state) => state.openCartOnLoad);
  const setOpenCartOnLoad = useUIStore((state) => state.setOpenCartOnLoad);
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);
  const [isNavDrawerOpen, setNavDrawerOpen] = useState(false);
  const [showGiftPopup, setShowGiftPopup] = useState(false);
  const navDrawerRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const { promotion, giftPromotion } = usePromotion();
  const isEmailList = location.pathname === '/join';
  const discountBannerText =
    promotion && promotion.bannerEnabled && promotion.bannerText.trim()
      ? promotion.bannerText.trim()
      : '';
  const giftBannerText =
    giftPromotion && giftPromotion.bannerEnabled && giftPromotion.bannerText.trim()
      ? giftPromotion.bannerText.trim()
      : '';
  const bannerText = discountBannerText || giftBannerText;

  const navLinks = useMemo(
    () => [
      { to: '/', label: 'Home' },
      { to: '/shop', label: 'Shop' },
      { to: '/gallery', label: 'Gallery' },
    ],
    []
  );

  useEffect(() => {
    if (openCartOnLoad) {
      setCartDrawerOpen(true);
      setOpenCartOnLoad(false);
    }
  }, [openCartOnLoad, setCartDrawerOpen, setOpenCartOnLoad]);

  useEffect(() => {
    if (!isNavDrawerOpen) return;

    const focusable = navDrawerRef.current?.querySelectorAll<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    const firstFocusable = focusable?.[0] ?? null;
    const lastFocusable = focusable && focusable.length ? focusable[focusable.length - 1] : null;

    firstFocusable?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNavDrawerOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !firstFocusable || !lastFocusable) return;
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        }
      } else if (activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isNavDrawerOpen]);

  useEffect(() => {
    setNavDrawerOpen(false);
  }, [location]);

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname !== '/') {
      setShowGiftPopup(false);
      return;
    }

    if (!giftPromotion || !giftPromotion.popupEnabled) {
      setShowGiftPopup(false);
      return;
    }

    const promotionId = (giftPromotion.id || '').trim();
    if (!promotionId) {
      setShowGiftPopup(false);
      return;
    }

    const sessionKey = `sb_gift_popup_seen_${promotionId}`;
    const dismissKey = `sb_gift_popup_dismissed_${promotionId}`;
    const dismissWindowMs = 24 * 60 * 60 * 1000;

    try {
      const seenInSession = window.sessionStorage.getItem(sessionKey) === '1';
      const dismissedAtRaw = window.localStorage.getItem(dismissKey);
      const dismissedAt = dismissedAtRaw ? Number(dismissedAtRaw) : 0;
      const recentlyDismissed = dismissedAt > 0 && Date.now() - dismissedAt < dismissWindowMs;

      if (seenInSession || recentlyDismissed) {
        setShowGiftPopup(false);
        return;
      }

      window.sessionStorage.setItem(sessionKey, '1');
      setShowGiftPopup(true);
    } catch {
      setShowGiftPopup(true);
    }
  }, [giftPromotion, location.pathname]);

  const dismissGiftPopup = () => {
    if (giftPromotion?.id) {
      try {
        window.localStorage.setItem(`sb_gift_popup_dismissed_${giftPromotion.id}`, String(Date.now()));
        window.sessionStorage.setItem(`sb_gift_popup_seen_${giftPromotion.id}`, '1');
      } catch {
        // ignore storage failures
      }
    }
    setShowGiftPopup(false);
  };

  const popupCtaHref =
    giftPromotion?.popupCtaHref && giftPromotion.popupCtaHref.trim()
      ? giftPromotion.popupCtaHref
      : '/shop';
  const popupCtaText =
    giftPromotion?.popupCtaText && giftPromotion.popupCtaText.trim()
      ? giftPromotion.popupCtaText
      : 'Shop Now';

  return (
    <div className={`min-h-screen flex flex-col ${isEmailList ? 'bg-[#F8F5F0]' : 'bg-white'}`}>
      {bannerText && (
        <div
          className="w-full text-center text-sm font-medium py-2 px-3"
          style={{ backgroundColor: '#85cdfa' }}
        >
          {bannerText}
        </div>
      )}
      <header className="bg-white/85 supports-[backdrop-filter]:bg-white/85 supports-[backdrop-filter]:backdrop-blur-md border-b border-black/10 sticky top-0 z-30">
        <nav className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-[48px_1fr_48px] items-center h-20 md:h-24">
            <button
              type="button"
              className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Open menu"
              aria-expanded={isNavDrawerOpen}
              aria-controls="main-menu"
              onClick={() => setNavDrawerOpen(true)}
            >
              <Menu className="h-6 w-6 text-gray-900" />
            </button>
            <Link
              to="/"
              className="justify-self-center text-[12px] md:text-[16px] font-sans font-semibold uppercase tracking-[0.18em] md:tracking-[0.25em] text-gray-900 whitespace-nowrap"
            >
              Shell &amp; Brush
            </Link>
            <div className="flex justify-end">
              <CartIcon />
            </div>
          </div>
        </nav>
      </header>

      {isNavDrawerOpen && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setNavDrawerOpen(false)}
          />
          <div
            id="main-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
            ref={navDrawerRef}
            className="fixed left-0 top-0 h-full w-full max-w-xs bg-white shadow-xl z-50 flex flex-col"
          >
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 uppercase tracking-[0.08em]">Menu</h2>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close navigation menu"
                onClick={() => setNavDrawerOpen(false)}
              >
                <X className="h-5 w-5 text-gray-700" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4 space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setNavDrawerOpen(false)}
                  className="block rounded-lg px-3 py-2 text-base font-semibold text-gray-800 hover:bg-gray-100 transition-colors uppercase tracking-[0.1em]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </>
      )}

      <main className={`flex-1 ${isEmailList ? 'bg-transparent' : 'bg-white'}`}>
        <Outlet />
      </main>

      {showGiftPopup && giftPromotion && location.pathname === '/' && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <button
              type="button"
              onClick={dismissGiftPopup}
              className="absolute right-3 top-3 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-white"
            >
              Close
            </button>
            <div className="grid grid-cols-1 md:grid-cols-2">
              {giftPromotion.popupImageUrl ? (
                <div className="h-56 md:h-full">
                  <img
                    src={giftPromotion.popupImageUrl}
                    alt={giftPromotion.name || 'Gift promotion'}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ) : null}
              <div className="space-y-3 p-6">
                <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Special offer</p>
                <h3 className="text-xl font-semibold text-gray-900">
                  {giftPromotion.popupHeadline || giftPromotion.name || 'Free gift available'}
                </h3>
                {giftPromotion.popupBody ? (
                  <p className="text-sm text-gray-600">{giftPromotion.popupBody}</p>
                ) : null}
                <a
                  href={popupCtaHref}
                  className="flex w-full items-center justify-center rounded-full px-4 py-2 text-center text-sm font-semibold text-gray-900"
                  style={{ backgroundColor: '#85cdfa' }}
                  onClick={() => {
                    dismissGiftPopup();
                  }}
                >
                  {popupCtaText}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="bg-white border-t border-gray-200 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-sm text-gray-500">© 2026 Shell &amp; Brush. All rights reserved.</p>
            <p className="text-sm text-gray-500">
              Built By <a href="https://modernizedvisions.agency" target="_blank" rel="noreferrer noopener" className="underline hover:text-gray-700">Modernized Visions</a>
            </p>
          </div>
        </div>
      </footer>

      <CartDrawer />
    </div>
  );
}

