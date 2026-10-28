import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router';
import { useSiteSettings } from '../../features/public-site/data';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../lib/preferences';
import { LanguageSwitch, ThemeSwitch } from './PreferenceControls';
import { useNavItems } from './nav';

export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { m, l } = usePreferences();
  const nav = useNavItems();
  const { data: settings } = useSiteSettings();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('button, a')?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Keep keyboard focus inside the open dialog.
      if (e.key === 'Tab' && panel.current) {
        const focusables = panel.current.querySelectorAll<HTMLElement>('a, button');
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Portalled to <body>: the header's backdrop-filter would otherwise trap position:fixed.
  return createPortal(
    <div
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label={m.nav.menu}
      ref={panel}
      className="fixed inset-0 z-50 flex h-dvh flex-col bg-bg text-ink lg:hidden"
    >
      <div className="flex items-center justify-between px-5 py-5 sm:px-8">
        <span className="font-display text-2xl">{l(settings?.name)}</span>
        <button type="button" onClick={onClose} className="flex items-center gap-2 py-2 text-sm">
          {m.nav.close}
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <nav aria-label={m.nav.primary} className="flex-1 overflow-y-auto px-5 pt-6 sm:px-8">
        <ul className="flex flex-col">
          {[{ to: '/', label: m.nav.home }, ...nav, ...(nav.some((n) => n.to === '/contact') ? [] : [{ to: '/contact', label: m.nav.contact }])].map((item, i) => (
            <li key={item.to} className="reveal border-b border-line" style={{ animationDelay: `${i * 40}ms` }}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                onClick={onClose}
                className={({ isActive }) => cn('block py-4 font-display text-3xl transition-colors', isActive ? 'text-accent' : 'hover:text-accent')}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex items-center justify-between border-t border-line px-5 py-6 sm:px-8">
        <ThemeSwitch />
        <LanguageSwitch />
      </div>
    </div>,
    document.body,
  );
}
