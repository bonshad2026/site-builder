import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useCart } from '../../features/cart/cart';
import { useSiteSettings } from '../../features/public-site/data';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../lib/preferences';
import { ButtonLink } from '../ui/Button';
import { SmartLink } from '../ui/SmartLink';
import { Container } from '../ui/Layout';
import { MobileMenu } from './MobileMenu';
import { LanguageSwitch, ThemeSwitch } from './PreferenceControls';
import { useNavItems } from './nav';

export function CartLink({ className }: { className?: string }) {
  const { m, formatNumber } = usePreferences();
  const { count } = useCart();
  return (
    <Link
      to="/cart"
      className={cn('group relative inline-flex flex-col items-center gap-0.5 px-1 py-1 text-[11px] leading-none transition-opacity hover:opacity-80', className)}
      aria-label={`${m.shop.cart} (${count})`}
    >
      <span className="relative">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 3.5h2.2l2.4 11.3a1.6 1.6 0 0 0 1.6 1.3h8.7a1.6 1.6 0 0 0 1.6-1.2l1.6-7.1H5.6" />
          <circle cx="9.2" cy="20" r="1.3" />
          <circle cx="17.2" cy="20" r="1.3" />
        </svg>
        {count > 0 && (
          <span aria-hidden="true" className="absolute -top-1.5 -end-2 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] leading-[18px] font-medium text-accent-ink shadow-sm">
            {formatNumber(count)}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="hidden whitespace-nowrap sm:block">
        {m.shop.cart}
      </span>
    </Link>
  );
}

export function Header() {
  const { l, m } = usePreferences();
  const { data: settings } = useSiteSettings();
  const nav = useNavItems();
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const h = settings?.header;
  const shop = !!settings?.modules.products && !!settings.modules.orders && h?.showCart !== false;

  // Over the home hero the header is transparent until the visitor scrolls (unless turned off).
  const overHero = pathname === '/' && !scrolled && h?.transparentOverHero !== false;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuButton.current?.focus();
  }, []);

  const size = h?.size ?? 'normal';
  const pad = overHero ? { compact: 'py-3', normal: 'py-6', large: 'py-8' }[size] : { compact: 'py-2', normal: 'py-4', large: 'py-6' }[size];
  const logo = settings?.logoUrl;
  const brandMode = h?.brand ?? 'auto';
  const showLogo = !!logo && brandMode !== 'name';
  const showName = brandMode === 'name' || brandMode === 'both' || !logo;
  const logoHeight = { compact: 'h-7', normal: 'h-9', large: 'h-12' }[size];
  // Header buttons: the list from the settings, else the single header button.
  const buttons =
    h?.buttons?.length
      ? h.buttons.filter((b) => l(b.label) && b.href)
      : [{ label: settings?.headerCta ? settings.headerCta.label : { en: m.common.bookConsultation, fa: m.common.bookConsultation }, href: settings?.headerCta?.href ?? '/contact', style: 'primary' as const, newTab: false }];
  const layout = h?.layout ?? 'standard';

  const brand = (
    <Link to="/" className={cn('flex items-center gap-3 font-display tracking-wide whitespace-nowrap', size === 'large' ? 'text-3xl' : size === 'compact' ? 'text-xl' : 'text-2xl')} aria-label={`${l(settings?.name)} — ${m.nav.home}`}>
      {showLogo && <img src={logo!} alt="" className={cn(logoHeight, 'w-auto max-w-[180px] object-contain')} />}
      {showName && l(settings?.name)}
    </Link>
  );

  const menu = h?.showMenu !== false && (
    <nav aria-label={m.nav.primary} className="hidden lg:block">
      <ul className="flex items-center gap-8 text-sm">
        {nav.map((item) => (
          <li key={item.to}>
            {item.to.startsWith('/') ? (
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn('relative py-2 transition-opacity hover:opacity-100', isActive ? 'opacity-100 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:bg-current' : 'opacity-75')
                }
              >
                {item.label}
              </NavLink>
            ) : (
              <SmartLink href={item.to} className="py-2 opacity-75 transition-opacity hover:opacity-100">
                {item.label}
              </SmartLink>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );

  const tools = (
    <div className="flex items-center gap-5">
      {h?.showTheme !== false && <ThemeSwitch className="hidden sm:flex" />}
      {h?.showLanguage !== false && <LanguageSwitch className="hidden sm:flex" />}
      {shop && <CartLink />}
      {h?.showButton !== false &&
        buttons.map((b, i) => (
          <span key={i} className="hidden md:block">
            {b.href.startsWith('/') && !b.newTab ? (
              <ButtonLink to={b.href} size="sm" variant={b.style === 'primary' ? (overHero ? 'light' : 'primary') : 'outline'}>
                {l(b.label)}
              </ButtonLink>
            ) : (
              <SmartLink href={b.href} newTab={b.newTab} className="text-sm underline-offset-4 hover:underline">
                {l(b.label)}
              </SmartLink>
            )}
          </span>
        ))}
      <button ref={menuButton} type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="mobile-menu" className="flex items-center gap-2 py-2 text-sm lg:hidden">
        <span className="flex w-6 flex-col gap-1.5" aria-hidden="true">
          <span className="h-px w-full bg-current" />
          <span className="h-px w-2/3 bg-current" />
        </span>
        {m.nav.menu}
      </button>
    </div>
  );

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-[background-color,color,box-shadow,padding] duration-500 ease-(--ease-soft)',
        pad,
        overHero ? 'bg-transparent text-white' : 'bg-bg/90 text-ink shadow-[0_1px_0_var(--line)] backdrop-blur-md',
      )}
    >
      {layout === 'centered' ? (
        <Container className="flex flex-col items-center gap-3">
          <div className="flex w-full items-center justify-between gap-6">
            <span className="w-1/3" />
            <div className="flex w-1/3 justify-center">{brand}</div>
            <div className="flex w-1/3 justify-end">{tools}</div>
          </div>
          {menu}
        </Container>
      ) : layout === 'menu-start' ? (
        <Container className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-10">
            {brand}
            {menu}
          </div>
          {tools}
        </Container>
      ) : (
        <Container className="flex items-center justify-between gap-6">
          {brand}
          {menu}
          {tools}
        </Container>
      )}

      <MobileMenu open={menuOpen} onClose={closeMenu} />
    </header>
  );
}
