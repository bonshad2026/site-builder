import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useSiteId, useSiteSettings } from '../../features/public-site/data';
import { cn } from '../../lib/cn';
import { Assistant } from './Assistant';
import { usePreferences } from '../../lib/preferences';
import { ButtonLink } from '../ui/Button';
import { SmartLink } from '../ui/SmartLink';

/**
 * Site-wide extras from the settings: the browser icon, the operator's own code in <head> and at
 * the end of <body> (analytics, trust badges, chat widgets), and the popup.
 */

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // Storage may be blocked; the visitor then sees it again next time.
  }
};
/** A short fingerprint of a text, so a changed bar or popup shows again. */
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7).toString(36);

/** Puts HTML (scripts run) into the page, replacing what this slot put there before. */
function useInjected(slot: 'head' | 'body', html: string) {
  useEffect(() => {
    const marker = `data-sb-${slot}`;
    document.querySelectorAll(`[${marker}]`).forEach((n) => n.remove());
    if (!html.trim()) return;
    // Prerendered pages already carry the head code (see scripts/prerender.mjs).
    if (slot === 'head' && document.head.innerHTML.includes('<!--sb-head-->')) return;
    const target = slot === 'head' ? document.head : document.body;
    const fragment = document.createRange().createContextualFragment(html);
    for (const node of Array.from(fragment.childNodes)) {
      if (node instanceof Element) node.setAttribute(marker, '');
      else if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) continue;
      target.appendChild(node);
    }
  }, [slot, html]);
}

export function SiteExtras() {
  const { data: settings } = useSiteSettings();
  const meta = settings?.meta;
  useInjected('head', meta?.headCode ?? '');
  useInjected('body', meta?.bodyCode ?? '');
  useEffect(() => {
    if (!meta?.faviconUrl) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = Object.assign(document.createElement('link'), { rel: 'icon' });
      document.head.appendChild(link);
    }
    link.href = meta.faviconUrl;
  }, [meta?.faviconUrl]);
  return (
    <>
      <Popup />
      <StickyActions />
      <Assistant />
    </>
  );
}

/**
 * Buttons that stay on screen while the visitor scrolls. A bottom bar sits above the mobile
 * bottom navigation; the page gets room for it through --sticky-h (see SiteLayout).
 */
function StickyActions() {
  const { l } = usePreferences();
  const { pathname } = useLocation();
  const { data: settings } = useSiteSettings();
  const s = settings?.stickyActions;
  const shownButtons = (s?.buttons ?? []).filter((b) => l(b.label) && b.href);
  const here = s?.pages === 'all' || pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!s?.afterScroll) return;
    const check = () => setScrolled(window.scrollY > window.innerHeight * 0.6);
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, [s?.afterScroll]);
  const shown = !!s?.enabled && here && shownButtons.length > 0 && (!s.afterScroll || scrolled);
  const ref = useRef<HTMLDivElement>(null);
  const side = s?.position === 'side';
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!shown || !el) {
      root.style.setProperty('--sticky-h', '0px');
      return;
    }
    // A side column needs no room at the bottom on wide screens; it is a bottom bar on phones.
    const sync = () => root.style.setProperty('--sticky-h', side && window.innerWidth >= 1024 ? '0px' : `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
      root.style.setProperty('--sticky-h', '0px');
    };
  }, [shown, side]);
  if (!shown) return null;
  const bottomNav = settings?.header.mobileNavigation === 'bottom';
  return (
    <div
      ref={ref}
      data-sticky-actions=""
      className={cn(
        'fixed inset-x-0 z-40 flex gap-2 border-t border-line bg-surface/95 p-2 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur',
        bottomNav ? 'bottom-[calc(76px+env(safe-area-inset-bottom))] lg:bottom-0' : 'bottom-0 pb-[calc(0.5rem+env(safe-area-inset-bottom))]',
        side && 'lg:inset-x-auto lg:end-4 lg:bottom-auto lg:top-1/2 lg:w-56 lg:-translate-y-1/2 lg:flex-col lg:rounded-lg lg:border lg:p-3 lg:shadow-lg',
        !side && 'lg:justify-center',
      )}
    >
      {shownButtons.map((b, i) => (
        <SmartLink
          key={i}
          href={b.href}
          newTab={b.newTab}
          className={cn(
            'flex flex-1 items-center justify-center rounded-md px-4 py-3 text-center text-sm font-medium transition lg:flex-none lg:px-6',
            b.style === 'primary' ? 'bg-accent text-accent-ink hover:opacity-90' : 'border border-line bg-bg text-ink hover:border-ink',
          )}
        >
          {l(b.label)}
        </SmartLink>
      ))}
    </div>
  );
}

/** The strip above the header; visitors may close it (until its text changes). */
export function AnnouncementBar() {
  const { l } = usePreferences();
  const site = useSiteId();
  const { data: settings } = useSiteSettings();
  const a = settings?.announcement;
  const text = a?.enabled ? l(a.text) : '';
  const key = `sb_bar_${site}`;
  const [closed, setClosed] = useState(() => read(key));
  const shown = !!text && !(a!.dismissible && closed === hash(text));
  const ref = useRef<HTMLDivElement>(null);
  // The fixed header and the page move down by the bar's height (--bar-h).
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!shown || !el) {
      root.style.setProperty('--bar-h', '0px');
      return;
    }
    const sync = () => root.style.setProperty('--bar-h', `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--bar-h', '0px');
    };
  }, [shown]);
  if (!shown) return null;
  const style = { background: a!.background || 'var(--accent)', color: a!.textColor || 'var(--accent-ink, #fff)' };
  return (
    <div ref={ref} className="fixed inset-x-0 top-0 z-[41] px-10 py-2 text-center text-sm" style={style}>
      {a!.href ? (
        <SmartLink href={a!.href} className="underline-offset-4 hover:underline">
          {text}
        </SmartLink>
      ) : (
        text
      )}
      {a!.dismissible && (
        <button
          type="button"
          aria-label="×"
          onClick={() => {
            write(key, hash(text));
            setClosed(hash(text));
          }}
          className="absolute end-3 top-1/2 -translate-y-1/2 px-2 opacity-80 hover:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  );
}

function Popup() {
  const { l, m } = usePreferences();
  const site = useSiteId();
  const { pathname } = useLocation();
  const { data: settings } = useSiteSettings();
  const p = settings?.popup;
  const title = p?.enabled ? l(p.title) : '';
  const text = p?.enabled ? l(p.text) : '';
  const key = `sb_popup_${site}`;
  const sig = hash(`${title}|${text}`);
  const [open, setOpen] = useState(false);
  const here = p?.pages === 'all' || pathname === '/';
  useEffect(() => {
    if (!p?.enabled || !(title || text) || !here) return;
    if (p.once && read(key) === sig) return;
    const timer = setTimeout(() => setOpen(true), p.delay * 1000);
    return () => clearTimeout(timer);
  }, [p, title, text, here, key, sig]);
  if (!open || !p) return null;
  const close = () => {
    if (p.once) write(key, sig);
    setOpen(false);
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={title || text} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div className="relative w-full max-w-md overflow-hidden rounded-lg bg-surface text-ink shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label={m.nav.close} onClick={close} className="absolute end-3 top-3 z-10 rounded-full bg-bg/80 px-2 text-lg">
          ×
        </button>
        {p.imageUrl && <img src={p.imageUrl} alt="" className="aspect-video w-full object-cover" />}
        <div className="flex flex-col gap-3 p-6">
          {title && <h2 className="font-display text-2xl">{title}</h2>}
          {text && <p className="whitespace-pre-line text-ink-soft">{text}</p>}
          {p.buttonHref && l(p.buttonLabel) && (
            <span className="mt-2 w-fit" onClick={close}>
              <ButtonLink to={p.buttonHref}>{l(p.buttonLabel)}</ButtonLink>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
