import { Outlet, Link, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { CartIcon } from '../components/cart/CartIcon';
import { CartDrawer } from '../components/cart/CartDrawer';
import { useUIStore } from '../store/uiStore';

export function SiteLayout() {
  const openCartOnLoad = useUIStore((state) => state.openCartOnLoad);
  const setOpenCartOnLoad = useUIStore((state) => state.setOpenCartOnLoad);
  const setCartDrawerOpen = useUIStore((state) => state.setCartDrawerOpen);
  const [isNavDrawerOpen, setNavDrawerOpen] = useState(false);
  const location = useLocation();

  const navLinks = useMemo(
    () => [
      { to: '/', label: 'Home' },
      { to: '/shop', label: 'Shop' },
      { to: '/gallery', label: 'Gallery' },
      { to: '/about', label: 'About' },
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNavDrawerOpen(false);
      }
    };
    if (isNavDrawerOpen) {
      document.addEventListener('keydown', onKeyDown);
    }
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isNavDrawerOpen]);

  useEffect(() => {
    setNavDrawerOpen(false);
  }, [location]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                type="button"
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Open navigation menu"
                onClick={() => setNavDrawerOpen(true)}
              >
                <Menu className="h-6 w-6 text-gray-900" />
              </button>
              <Link
                to="/"
                className="text-2xl font-serif font-semibold text-gray-900 flex-1 text-center md:text-left truncate whitespace-nowrap"
              >
                The Chesapeake Shell
              </Link>
            </div>
            <div className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors uppercase tracking-[0.12em]"
                >
                  {link.label}
                </Link>
              ))}
              <CartIcon />
            </div>
            <div className="md:hidden">
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
          <div className="fixed left-0 top-0 h-full w-full max-w-xs bg-white shadow-xl z-50 flex flex-col">
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

      <main className="flex-1 bg-white">
        <Outlet />
      </main>

      <footer className="bg-white border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-2">
              &copy; {new Date().getFullYear()} The Chesapeake Shell. All rights reserved.
            </p>
            <Link
              to="/admin"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Admin
            </Link>
          </div>
        </div>
      </footer>

      <CartDrawer />
    </div>
  );
}
