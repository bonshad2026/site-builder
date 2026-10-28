import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router';
import { SiteLayout } from '../components/layout/SiteLayout';
import { CartPage, CheckoutPage, CheckoutResultPage } from '../features/cart/CartPages';
import { NotFoundPage } from '../features/public-site/pages/NotFoundPage';
import { ProductDetailPage, ProductsPage } from '../features/public-site/pages/ProductsPages';
import { ServiceDetailPage, ServicesPage } from '../features/public-site/pages/ServicesPages';
import { SitePage } from '../features/public-site/pages/SitePage';

// The admin panel and builder are loaded only when visited, keeping the public site light.
const AdminRoot = lazy(() => import('../admin/AdminRoot'));
// The builder's preview frame; client builds (VITE_ADMIN_SCOPE=client) have no builder.
const PreviewFrame = import.meta.env.VITE_ADMIN_SCOPE !== 'client' ? lazy(() => import('../admin/builder/PreviewFrame')) : null;
const ResetPassword = lazy(() => import('../admin/auth').then((m) => ({ default: m.ResetPasswordPage })));
const VerifyEmail = lazy(() => import('../admin/auth').then((m) => ({ default: m.VerifyEmailPage })));

const loading = <div role="status" aria-label="Loading" className="min-h-screen bg-bg" />;
const lazyEl = (el: React.ReactNode) => <Suspense fallback={loading}>{el}</Suspense>;

export const routes: RouteObject[] = [
  { path: 'admin/*', element: lazyEl(<AdminRoot />) },
  // Links in account emails point here.
  { path: 'reset-password', element: lazyEl(<ResetPassword />) },
  { path: 'verify-email', element: lazyEl(<VerifyEmail />) },
  ...(PreviewFrame ? [{ path: '__preview', element: lazyEl(<PreviewFrame />) }] : []),
  {
    element: <SiteLayout />,
    children: [
      { index: true, element: <SitePage home /> },
      { path: 'services', element: <ServicesPage /> },
      { path: 'services/:slug', element: <ServiceDetailPage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'products/:slug', element: <ProductDetailPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'checkout/result', element: <CheckoutResultPage /> },
      { path: ':slug', element: <SitePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
