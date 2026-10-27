import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useCart } from '../../features/cart/cart';
import { useSiteSettings } from '../../features/public-site/data';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../lib/preferences';
import { ButtonLink } from '../ui/Button';
import { Container } from '../ui/Layout';
import { MobileMenu } from './MobileMenu';
import { LanguageSwitch, ThemeSwitch } from './PreferenceControls';
import { useNavItems } from './nav';

export function CartLink({ className }: { className?: string }) {
  const { m, formatNumber } = usePreferences();
  const { count } = useCart();
  return (
    <Link to="/cart" className={cn('relative inline-flex items-center gap-1.5 py-2 text-sm', className)} aria-label={`${m.shop.cart} (${count})`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M5 7h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 7Z" />
        <path d="M9 7V6a3 3 0 0 1 6 0v1" />
      </svg>
      {count > 0 && <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] leading-5 text-accent-ink">{formatNumber(count)}</span>}
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
  const shop = !!settings?.modules.products && !!settings.modules.orders;

  // Over the home hero the header is transparent until the visitor scrolls.
  const overHero = pathname === '/' && !scrolled;

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

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-[background-color,color,box-shadow,padding] duration-500 ease-(--ease-soft)',
        overHero ? 'bg-transparent py-6 text-white' : 'bg-bg/90 py-4 text-ink shadow-[0_1px_0_var(--line)] backdrop-blur-md',
      )}
    >
      <Container className="flex items-center justify-between gap-6">
        <Link to="/" className="font-display text-2xl tracking-wide whitespace-nowrap" aria-label={`${l(settings?.name)} — ${m.nav.home}`}>
          {l(settings?.name)}
        </Link>

        <nav aria-label={m.nav.primary} className="hidden lg:block">
          <ul className="flex items-center gap-8 text-sm">
            {nav.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn('relative py-2 transition-opacity hover:opacity-100', isActive ? 'opacity-100 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:bg-current' : 'opacity-75')
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-5">
          <ThemeSwitch className="hidden sm:flex" />
          <LanguageSwitch className="hidden sm:flex" />
          {shop && <CartLink />}
          <span className="hidden md:block">
            <ButtonLink to="/contact" size="sm" variant={overHero ? 'light' : 'primary'}>
              {m.common.bookConsultation}
            </ButtonLink>
          </span>
          <button ref={menuButton} type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="mobile-menu" className="flex items-center gap-2 py-2 text-sm lg:hidden">
            <span className="flex w-6 flex-col gap-1.5" aria-hidden="true">
              <span className="h-px w-full bg-current" />
              <span className="h-px w-2/3 bg-current" />
            </span>
            {m.nav.menu}
          </button>
        </div>
      </Container>

      <MobileMenu open={menuOpen} onClose={closeMenu} />
    </header>
  );
}
