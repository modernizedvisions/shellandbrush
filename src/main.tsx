import React, { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SiteLayout } from './layout/SiteLayout';
import { HomePage } from './pages/HomePage';
import { ShopPage } from './pages/ShopPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RouteFallback } from './components/RouteFallback';
import { Toaster } from 'sonner';
import './index.css';

const ProductDetailPage = lazy(() =>
  import('./pages/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage }))
);
const GalleryPage = lazy(() =>
  import('./pages/GalleryPage').then((m) => ({ default: m.GalleryPage }))
);
const AboutPage = lazy(() =>
  import('./pages/AboutPage').then((m) => ({ default: m.AboutPage }))
);
const CheckoutPage = lazy(() =>
  import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage }))
);
const CheckoutReturnPage = lazy(() =>
  import('./pages/CheckoutReturnPage').then((m) => ({ default: m.CheckoutReturnPage }))
);
const EmailListPage = lazy(() =>
  import('./pages/EmailListPage').then((m) => ({ default: m.EmailListPage }))
);
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage }))
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          <Route
            path="shop"
            element={
              <ErrorBoundary>
                <ShopPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="product/:productId"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ProductDetailPage />
              </Suspense>
            }
          />
          <Route
            path="gallery"
            element={
              <Suspense fallback={<RouteFallback />}>
                <GalleryPage />
              </Suspense>
            }
          />
          <Route
            path="about"
            element={
              <Suspense fallback={<RouteFallback />}>
                <AboutPage />
              </Suspense>
            }
          />
          <Route
            path="checkout"
            element={
              <Suspense fallback={<RouteFallback />}>
                <CheckoutPage />
              </Suspense>
            }
          />
          <Route
            path="checkout/return"
            element={
              <Suspense fallback={<RouteFallback />}>
                <CheckoutReturnPage />
              </Suspense>
            }
          />
          <Route
            path="join"
            element={
              <Suspense fallback={<RouteFallback />}>
                <EmailListPage />
              </Suspense>
            }
          />
          <Route
            path="admin"
            element={
              <Suspense fallback={<RouteFallback />}>
                <AdminPage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
    <Toaster richColors position="top-center" />
  </StrictMode>
);
