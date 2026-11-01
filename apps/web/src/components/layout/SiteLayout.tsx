import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { CartProvider } from '../../features/cart/cart';
import { useSiteId, useSiteSettings } from '../../features/public-site/data';
import { usePreferences, useSiteDirection } from '../../lib/preferences';
import { SiteTexts, useSiteDesign } from '../../lib/siteLook';
import { Footer } from './Footer';
import { Header } from './Header';
import { AnnouncementBar, SiteExtras } from './SiteExtras';
import { useEffectiveTheme } from './PreferenceControls';

/** Applies the site's theme (or the visitor's choice), its own themes and fonts, and the brand accent to <html>. */
export function ThemeEffect() {
  const theme = useEffectiveTheme();
  const { data: settings } = useSiteSettings();
  useSiteDesign(settings);
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
  const { data: settings } = useSiteSettings();
  const { locale, setLocale } = usePreferences();
  useSiteDirection(settings?.direction);
  // A site in one language only opens in that language, whatever the address says.
  const locales = settings?.locales;
  useEffect(() => {
    if (locales?.length && !locales.includes(locale)) setLocale(locales[0]);
  }, [locales, locale, setLocale]);
  return (
    <SiteTexts settings={settings}>
      <SiteFrame />
    </SiteTexts>
  );
}

function SiteFrame() {
  const { m } = usePreferences();
  const { pathname } = useLocation();
  const siteId = useSiteId();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return (
    <CartProvider siteId={siteId}>
      <ThemeEffect />
      <SiteExtras />
      <AnnouncementBar />
      <div className="flex min-h-dvh flex-col overflow-x-clip" style={{ paddingTop: 'var(--bar-h, 0px)' }}>
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
