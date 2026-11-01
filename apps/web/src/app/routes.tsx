import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router';
import { SiteLayout } from '../components/layout/SiteLayout';
import { CartPage, CheckoutPage, CheckoutResultPage } from '../features/cart/CartPages';
import { NotFoundPage } from '../features/public-site/pages/NotFoundPage';
import { ProductDetailPage, ProductsPage } from '../features/public-site/pages/ProductsPages';
import { ServiceDetailPage, ServicesPage } from '../features/public-site/pages/ServicesPages';
import { SitePage } from '../features/public-site/pages/SitePage';
import { CollectionItemPage } from '../features/collections/CollectionItemPage';
import { AccountPage, CasePage, TrackPage } from '../features/account/AccountPages';
import { BuiltInPage, registerSystemPages } from '../sections/BuiltInPage';
import { WishlistPage } from '../features/wishlist/wishlist';

// The built-in content a builder page can show in its "Built-in content" section.
registerSystemPages({
  products: ProductsPage,
  productDetail: ProductDetailPage,
  services: ServicesPage,
  serviceDetail: ServiceDetailPage,
  cart: CartPage,
  checkout: CheckoutPage,
  checkoutResult: CheckoutResultPage,
  account: AccountPage,
  track: TrackPage,
  notFound: NotFoundPage,
});

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
      { path: 'services', element: <BuiltInPage page="services"><ServicesPage /></BuiltInPage> },
      { path: 'services/:slug', element: <BuiltInPage page="serviceDetail"><ServiceDetailPage /></BuiltInPage> },
      { path: 'products', element: <BuiltInPage page="products"><ProductsPage /></BuiltInPage> },
      { path: 'products/:slug', element: <BuiltInPage page="productDetail"><ProductDetailPage /></BuiltInPage> },
      { path: 'cart', element: <BuiltInPage page="cart"><CartPage /></BuiltInPage> },
      { path: 'checkout', element: <BuiltInPage page="checkout"><CheckoutPage /></BuiltInPage> },
      { path: 'checkout/result', element: <BuiltInPage page="checkoutResult"><CheckoutResultPage /></BuiltInPage> },
      { path: 'account', element: <BuiltInPage page="account"><AccountPage /></BuiltInPage> },
      { path: 'track', element: <BuiltInPage page="track"><TrackPage /></BuiltInPage> },
      { path: 'wishlist', element: <WishlistPage /> },
      { path: 'track/:code', element: <CasePage /> },
      { path: ':slug', element: <SitePage /> },
      // An item of a content table: /classes/hydrant.
      { path: ':collection/:item', element: <CollectionItemPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
