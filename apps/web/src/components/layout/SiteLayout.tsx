import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { CartProvider } from '../../features/cart/cart';
import { useSiteId, useSiteSettings } from '../../features/public-site/data';
import { usePreferences } from '../../lib/preferences';
import { Footer } from './Footer';
import { Header } from './Header';
import { useEffectiveTheme } from './PreferenceControls';

/** Applies the site's theme (or the visitor's choice) and optional brand accent to <html>. */
export function ThemeEffect() {
  const theme = useEffectiveTheme();
  const { data: settings } = useSiteSettings();
  const accent = settings?.accentColor ?? null;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    if (accent) root.style.setProperty('--accent', accent);
    else root.style.removeProperty('--accent');
  }, [theme, accent]);
  return null;
}

export function SiteLayout() {
  const { m } = usePreferences();
  const { pathname } = useLocation();
  const siteId = useSiteId();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return (
    <CartProvider siteId={siteId}>
      <ThemeEffect />
      <div className="flex min-h-dvh flex-col overflow-x-clip">
        <a href="#main" className="sr-only z-50 bg-ink px-4 py-2 text-bg focus:not-sr-only focus:fixed focus:start-4 focus:top-4">
          {m.nav.skip}
        </a>
        <Header />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          <Outlet />
        </main>
        <Footer />
      </div>
    </CartProvider>
  );
}
