import { createPortal } from 'react-dom';
import { NavLink } from 'react-router';
import { useSiteSettings } from '../../features/public-site/data';
import { useCustomer } from '../../features/account/customerApi';
import { useCart } from '../../features/cart/cart';
import { usePreferences } from '../../lib/preferences';
import { cn } from '../../lib/cn';
import { SmartLink } from '../ui/SmartLink';

const paths: Record<string, string> = {
  home: 'm3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9',
  coffee: 'M4 8h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM17 9h2a3 3 0 0 1 0 6h-2M7 3v2m4-2v2m4-2v2',
  bag: 'M5 7h14l2 14H3ZM8 8V6a4 4 0 0 1 8 0v2',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21a8 8 0 0 1 16 0',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  receipt: 'M5 3h14v19l-3-2-4 2-4-2-3 2ZM8 8h8M8 12h8M8 16h4',
  phone: 'M7 3H3v4c0 8 6 14 14 14h4v-4l-5-2-2 2a14 14 0 0 1-7-7l2-2Z',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  more: 'M4 6h16M4 12h16M4 18h16',
};

export function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const { data: settings } = useSiteSettings();
  const { enabled } = useCustomer();
  const { count } = useCart();
  const { l, locale, formatNumber } = usePreferences();
  const fa = locale === 'fa';
  const h = settings?.header;
  const automatic = [
    { href: '/', label: { fa: 'خانه', en: 'Home' }, icon: 'home' },
    ...(settings?.modules.products ? [{ href: '/products', label: { fa: 'محصولات', en: 'Products' }, icon: 'grid' }] : []),
    ...(settings?.modules.orders && h?.showCart !== false ? [{ href: '/cart', label: { fa: 'سبد خرید', en: 'Cart' }, icon: 'bag' }] : []),
    ...(enabled && h?.showAccount !== false ? [{ href: '/account', label: { fa: 'حساب من', en: 'Account' }, icon: 'user' }] : []),
  ];
  const links = (h?.mobileLinks.length ? h.mobileLinks : automatic).filter(item => item.href && l(item.label));
  const base = 'relative flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-semibold transition-colors';
  const icon = (name: string) => <svg viewBox="0 0 24 24" className="size-[23px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.grid} /></svg>;
  return createPortal(<nav aria-label={fa ? 'ناوبری پایین موبایل' : 'Mobile bottom navigation'} dir={fa ? 'rtl' : 'ltr'} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-2 pt-1 text-ink shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl lg:hidden" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
    <div className="mx-auto flex max-w-lg gap-1">
      {links.map((item, i) => {
        const content = <><span className="relative">{icon(item.icon)}{item.href === '/cart' && count > 0 && <span className="absolute -end-3 -top-2 min-w-4 rounded-full bg-accent px-1 text-[10px] text-accent-ink">{formatNumber(count)}</span>}</span><span className="max-w-full truncate">{l(item.label)}</span></>;
        return item.href.startsWith('/') ? <NavLink key={i} to={item.href} end={item.href === '/'} className={({ isActive }) => cn(base, isActive ? 'bg-accent/10 text-accent' : 'text-ink-soft hover:bg-surface')} >{content}</NavLink> : <SmartLink key={i} href={item.href} className={cn(base, 'text-ink-soft')}>{content}</SmartLink>;
      })}
      <button data-mobile-more type="button" onClick={onMore} aria-haspopup="dialog" aria-controls="mobile-menu" className={cn(base, 'text-ink-soft hover:bg-surface')}>{icon('more')}<span>{fa ? 'بیشتر' : 'More'}</span></button>
    </div>
  </nav>, document.body);
}
