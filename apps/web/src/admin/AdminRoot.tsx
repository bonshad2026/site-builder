import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import { HOST_SITE_ID } from '../features/public-site/data';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import type { SiteSettings } from '@site-builder/shared';
import { LanguageSwitch } from '../components/layout/PreferenceControls';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { usePreferences, useSiteDirection } from '../lib/preferences';
import { ForgotPasswordPage, isOperator, LoginPage, OPERATOR_UI, RequireAuth, useLogout, useMe, type Me } from './auth';
import { useT } from './i18n';
import { Spinner, ToastProvider } from './ui';
import { useAdminCollections } from './collections/api';

// Operator-only code is not even bundled into client builds.
const Platform = OPERATOR_UI ? lazy(() => import('./pages/PlatformPages')) : null;
const SitePages = lazy(() => import('./pages/SitePages'));
const Builder = OPERATOR_UI ? lazy(() => import('./builder/BuilderPage')) : null;

export interface SiteInfo {
  siteId: string;
  name: string;
  role: 'owner' | 'staff' | 'platform_admin';
  permissions: string[];
}

export function useSiteInfo(siteId: string) {
  return useQuery({ queryKey: ['site', siteId], queryFn: () => api.get<SiteInfo>(`/sites/${siteId}`) });
}

export function useAdminSettings(siteId: string) {
  return useQuery({ queryKey: ['site', siteId, 'settings'], queryFn: () => api.get<SiteSettings>(`/sites/${siteId}/settings`) });
}

/** The admin always uses the calm ivory palette, whatever the public site's theme. */
function useAdminTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.dataset.theme;
    root.dataset.theme = 'ivory';
    document.title = 'Site Builder — Admin';
    root.style.removeProperty('--accent');
    return () => {
      if (prev) root.dataset.theme = prev;
    };
  }, []);
}

/** Sites whose panel language was already applied this visit, so the user can still switch afterwards. */
const appliedLanguage = new Set<string>();

/**
 * The current site's panel language and direction: the site in the address (/admin/sites/:id),
 * or the site this address belongs to (a client's own /admin, also on the sign-in page).
 */
function AdminSiteLook() {
  const routeSite = useLocation().pathname.match(/^\/admin\/sites\/([^/]+)/)?.[1];
  const siteId = routeSite ?? HOST_SITE_ID;
  const { locale, setLocale } = usePreferences();
  const { data } = useQuery({
    queryKey: ['admin-look', siteId],
    queryFn: () => api.get<Pick<SiteSettings, 'adminDirection' | 'adminLanguage'>>(`/public/sites/${siteId}/settings`),
    enabled: !!siteId,
    staleTime: 60_000,
  });
  useSiteDirection(siteId ? data?.adminDirection : undefined);
  useEffect(() => {
    const lang = data?.adminLanguage;
    if (!siteId || (lang !== 'fa' && lang !== 'en')) return;
    const key = `${siteId}:${lang}`;
    if (appliedLanguage.has(key)) return;
    appliedLanguage.add(key);
    if (lang !== locale) setLocale(lang);
  }, [siteId, data?.adminLanguage, locale, setLocale]);
  return null;
}

export default function AdminRoot() {
  useAdminTheme();
  return (
    <ToastProvider>
      <AdminSiteLook />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route path="forgot" element={<ForgotPasswordPage />} />
          {Builder && (
            <Route
              path="sites/:siteId/pages/:pageId/builder"
              element={<RequireAuth>{(me) => (isOperator(me) ? <Builder /> : <Navigate to="/admin" replace />)}</RequireAuth>}
            />
          )}
          <Route element={<RequireAuth>{(me) => <AdminLayout me={me} />}</RequireAuth>}>
            <Route index element={<AdminHome />} />
            {Platform && <Route path="platform/*" element={<RequireAuth>{(me) => (isOperator(me) ? <Platform /> : <Navigate to="/admin" replace />)}</RequireAuth>} />}
            <Route path="sites/:siteId/*" element={<SitePages />} />
            <Route path="account" element={<SitePages account />} />
          </Route>
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    </ToastProvider>
  );
}

function AdminHome() {
  const { data: me } = useMe();
  const t = useT();
  if (!me) return null;
  if (isOperator(me)) return <Navigate to="/admin/platform/sites" replace />;
  if (me.sites.length === 1) return <Navigate to={`/admin/sites/${me.sites[0].siteId}`} replace />;
  return (
    <div className="max-w-xl">
      <h1 className="mb-6 font-display text-3xl">{t.chooseSite}</h1>
      {me.sites.length === 0 ? (
        <p className="text-ink-soft">{t.noSites}</p>
      ) : (
        <ul className="divide-y divide-line border border-line bg-surface">
          {me.sites.map((s) => (
            <li key={s.siteId}>
              <Link to={`/admin/sites/${s.siteId}`} className="flex items-center justify-between px-5 py-4 hover:bg-surface-2">
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-ink-soft">{s.role}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface MenuItem {
  to: string;
  label: string;
  /** A section of the settings page (?tab=). */
  tab?: string;
  end?: boolean;
  badge?: number;
  show?: boolean;
}

/** Whether a menu entry is the page being shown (settings sections compare their ?tab=). */
function useIsCurrent() {
  const { pathname, search } = useLocation();
  const current = new URLSearchParams(search).get('tab') ?? 'brand';
  return (item: MenuItem) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)) && (!item.tab || item.tab === current);
}

const Count = ({ n }: { n?: number }) => (n ? <span className="ms-2 rounded-full bg-accent px-1.5 text-[11px] text-accent-ink">{n}</span> : null);

function NavItem({ item, nested }: { item: MenuItem; nested?: boolean }) {
  const isCurrent = useIsCurrent();
  const active = isCurrent(item);
  return (
    <Link
      to={item.tab ? `${item.to}?tab=${item.tab}` : item.to}
      aria-current={active ? 'page' : undefined}
      className={cn('flex items-center justify-between rounded-md py-2 text-sm', nested ? 'ps-6 pe-3' : 'px-3', active ? 'bg-ink text-bg' : 'text-ink-soft hover:bg-surface-2 hover:text-ink')}
    >
      {item.label}
      <Count n={item.badge} />
    </Link>
  );
}

const CLOSED_KEY = 'sb_nav_closed';
const readClosed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};

/**
 * A collapsible group of the menu, hidden when empty. It opens by itself when one of its pages is
 * opened, and can still be closed while that page is shown.
 */
function NavGroup({ id, title, items, badge }: { id: string; title: string; items: MenuItem[]; badge?: number }) {
  const isCurrent = useIsCurrent();
  const shown = items.filter((i) => i.show !== false);
  const [closed, setClosed] = useState(() => readClosed().includes(id));
  const current = shown.find(isCurrent);
  const currentKey = current ? `${current.to}${current.tab ?? ''}` : '';
  useEffect(() => {
    if (currentKey) setClosed(false);
  }, [currentKey]);
  if (!shown.length) return null;
  const open = !closed;
  const toggle = () => {
    const next = !closed;
    setClosed(next);
    try {
      const list = readClosed().filter((x) => x !== id);
      localStorage.setItem(CLOSED_KEY, JSON.stringify(next ? [...list, id] : list));
    } catch {
      // Storage may be unavailable; the group still toggles for this visit.
    }
  };
  return (
    <div className="mt-2 flex flex-col gap-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          'flex items-center justify-between rounded-md px-3 py-1.5 text-start text-xs font-semibold text-ink hover:bg-surface-2',
          // Closed while one of its pages is open: the group shows it holds the current page, and which.
          !open && current && 'border-s-2 border-accent bg-surface-2',
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center">
            {title}
            {!open && <Count n={badge} />}
          </span>
          {!open && current && <span className="truncate text-[11px] font-normal text-ink-soft">{current.label}</span>}
        </span>
        <span aria-hidden="true" className={cn('text-ink-soft transition-transform', open ? 'rotate-90' : 'rtl:rotate-180')}>
          ›
        </span>
      </button>
      {open && shown.map((item) => <NavItem key={`${item.to}${item.tab ?? ''}`} item={item} nested />)}
    </div>
  );
}

/**
 * The site menu in standard groups: requests, shop, customers, tables, content, look and settings.
 * Each settings section has its own entry where it belongs (shop rules under Shop, sign-up under
 * Customers). Groups and entries a person cannot use are hidden.
 */
function SiteNav({ siteId }: { siteId: string }) {
  const t = useT();
  const { data: info } = useSiteInfo(siteId);
  const { data: settings } = useAdminSettings(siteId);
  const operator = isOperator(useMe().data);
  const { l } = usePreferences();
  const { data: tables = [] } = useAdminCollections(siteId);
  const can = (p: string) => !!info?.permissions.includes(p);
  const mod = (m: keyof SiteSettings['modules']) => !!settings?.modules[m];
  const L = (en: string, fa: string) => l({ en, fa });
  // New requests and customer replies; refreshed every minute while the panel is open.
  const summary = useQuery({
    queryKey: ['site', siteId, 'leads', 'summary'],
    queryFn: () => api.get<{ unread: number }>(`/sites/${siteId}/leads/summary`),
    enabled: mod('leads') && can('leads:read'),
    refetchInterval: 60_000,
  });
  const base = `/admin/sites/${siteId}`;
  const settingsUrl = `${base}/settings`;
  const site = can('site:write');
  const owner = info?.role === 'owner' || info?.role === 'platform_admin';
  const shop = mod('products') || mod('orders');
  return (
    <nav aria-label={info?.name ?? siteId} className="flex flex-col">
      {operator && <NavItem item={{ to: base, end: true, label: t.dashboard }} />}
      <NavGroup
        id="requests"
        title={L('Requests', 'درخواست‌ها')}
        badge={summary.data?.unread}
        items={[
          { to: `${base}/leads`, label: L('All requests', 'همه‌ی درخواست‌ها'), badge: summary.data?.unread, show: mod('leads') && can('leads:read') },
          { to: settingsUrl, tab: 'requests', label: L('Forms & workflows', 'فرم‌ها و روال پیگیری'), show: site && mod('leads') },
        ]}
      />
      <NavGroup
        id="shop"
        title={L('Orders', 'سفارش‌ها')}
        items={[
          { to: `${base}/orders`, label: t.orders, show: mod('orders') && can('orders:read') },
          { to: `${base}/coupons`, label: t.sx.coupons, show: mod('orders') && can('orders:read') },
          { to: settingsUrl, tab: 'shop', label: L('Sales rules, checkout & shipping', 'قوانین فروش، تسویه و ارسال'), show: site && mod('products') },
        ]}
      />
      <NavGroup
        id="customers"
        title={L('Customers', 'مشتریان')}
        items={[
          { to: `${base}/customers`, label: L('Customer list', 'فهرست مشتریان'), show: can('leads:read') && (!!settings?.accounts?.enabled || operator) },
          { to: settingsUrl, tab: 'accounts', label: L('Sign-up & sign-in', 'ثبت‌نام و ورود مشتری'), show: site && operator },
          { to: `${base}/reviews`, label: t.sx.reviews, show: mod('products') && can('catalog:write') },
          { to: `${base}/subscribers`, label: t.sx.subscribers, show: can('leads:read') },
        ]}
      />
      {/* Everything the site's people add items to: products, services, categories and the content tables. */}
      <NavGroup
        id="tables"
        title={L('Tables', 'جدول‌ها')}
        items={[
          { to: `${base}/products`, label: t.products, show: mod('products') },
          { to: settingsUrl, tab: 'categories', label: L('Product categories', 'دسته‌بندی محصولات'), show: site && mod('products') },
          { to: `${base}/services`, label: t.services, show: mod('services') },
          ...tables.map((c) => ({ to: `${base}/items/${c.id}`, label: l(c.name) || c.slug })),
          { to: `${base}/tables`, label: L('Manage tables', 'مدیریت جدول‌ها'), show: operator },
        ]}
      />
      <NavGroup
        id="content"
        title={L('Pages', 'صفحه‌ها')}
        items={[
          { to: `${base}/pages`, label: t.pages, show: operator },
          // Clients edit the text and images of their pages; operators use the builder.
          { to: `${base}/content`, label: t.content, show: !operator && can('pages:write') },
          { to: settingsUrl, tab: 'shopPage', label: L('Shop page', 'صفحه‌ی فروشگاه'), show: site && operator && mod('products') },
          { to: settingsUrl, tab: 'systemPages', label: L('Built-in pages (cart, 404…)', 'صفحه‌های آماده (سبد خرید، ۴۰۴…)'), show: site && operator },
          { to: `${base}/files`, label: t.files },
          { to: settingsUrl, tab: 'texts', label: L('Site texts', 'متن‌های سایت'), show: site },
        ]}
      />
      <NavGroup
        id="look"
        title={L('Site look', 'ظاهر سایت')}
        items={[
          { to: settingsUrl, tab: 'design', label: L('Design & theme', 'طراحی و تم'), show: site && operator },
          { to: settingsUrl, tab: 'menu', label: L('Menu', 'منوی سایت'), show: site && operator },
          { to: settingsUrl, tab: 'header', label: L('Header', 'سربرگ'), show: site && operator },
          { to: settingsUrl, tab: 'footer', label: L('Footer', 'پاورقی'), show: site },
          { to: settingsUrl, tab: 'extras', label: L('Page code, icon, bar & popup', 'کد صفحه، آیکون، اعلان و پاپ‌آپ'), show: site },
        ]}
      />
      <NavGroup
        id="settings"
        title={t.settings}
        items={[
          { to: settingsUrl, tab: 'brand', label: L('General', 'عمومی'), show: site },
          { to: settingsUrl, tab: 'contact', label: L('Contact details', 'اطلاعات تماس'), show: site },
          { to: settingsUrl, tab: 'notifications', label: L('Staff notifications', 'اطلاع‌رسانی به کارکنان'), show: site },
          { to: settingsUrl, tab: 'seo', label: L('SEO', 'سئو'), show: site && operator },
          { to: settingsUrl, tab: 'modules', label: L('Modules', 'ماژول‌ها'), show: site && operator },
          { to: `${base}/payments`, label: L('Payment gateway', 'درگاه پرداخت'), show: can('payments:manage') && (shop || mod('leads')) },
          { to: `${base}/messaging`, label: t.su.messaging, show: operator },
          { to: `${base}/members`, label: t.members, show: owner },
        ]}
      />
    </nav>
  );
}

function AdminLayout({ me }: { me: Me }) {
  const t = useT();
  const { dir } = usePreferences();
  // The layout sits above the site routes, so read the site id from the URL.
  const siteId = useLocation().pathname.match(/^\/admin\/sites\/([^/]+)/)?.[1];
  const navigate = useNavigate();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const sites = me.sites;

  const sidebar = (
    <div className="flex min-h-full flex-col gap-6 p-4">
      <Link to="/admin" className="px-3 font-display text-2xl text-ink">
        {t.brand}
      </Link>
      {isOperator(me) && (
        <div>
          <p className="mb-1 px-3 text-xs font-medium text-ink-soft uppercase rtl:normal-case">{t.platform}</p>
          <nav aria-label={t.platform} className="flex flex-col gap-0.5">
            <NavItem item={{ to: "/admin/platform/sites", label: t.sites }} />
            <NavItem item={{ to: "/admin/platform/users", label: t.users }} />
            <NavItem item={{ to: "/admin/platform/bank", label: t.bk.nav }} />
            <NavGroup
              id="starters"
              title={t.sr.nav}
              items={[
                { to: '/admin/platform/starters/pages', label: t.sr.pages },
                { to: '/admin/platform/starters/tables', label: t.sr.tables },
                { to: '/admin/platform/starters/headers', label: t.sr.headers },
                { to: '/admin/platform/starters/footers', label: t.sr.footers },
              ]}
            />
            <NavItem item={{ to: "/admin/platform/messaging", label: t.su.messaging }} />
            <NavItem item={{ to: "/admin/platform/audit", label: t.audit }} />
            {/* Studio deploy service (served next to the admin by the edge proxy). */}
            <a href="/deploy/" className="block rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-surface-2 hover:text-ink">
              {t.deploy}
            </a>
          </nav>
        </div>
      )}
      {(sites.length > 1 || isOperator(me)) && (
        <label className="flex flex-col gap-1 px-3 text-xs text-ink-soft">
          {t.chooseSite}
          <SiteSwitcher current={siteId} me={me} onChange={(id) => navigate(`/admin/sites/${id}`)} />
        </label>
      )}
      {siteId && <SiteNav siteId={siteId} />}
      <div className="mt-auto flex flex-col gap-3 border-t border-line px-3 pt-4 text-sm">
        <Link to="/admin/account" className="truncate text-ink-soft hover:text-ink">
          {me.user.email ?? me.user.phone}
        </Link>
        <div className="flex items-center justify-between">
          <LanguageSwitch />
          <button type="button" onClick={() => logout.mutate()} className="text-ink-soft hover:text-danger">
            {t.signOut}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-bg text-ink">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 overflow-y-auto overscroll-contain border-e border-line bg-surface lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <aside className={cn('absolute inset-y-0 w-72 overflow-y-auto bg-surface shadow-xl', dir === 'rtl' ? 'right-0' : 'left-0')} onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
          <button type="button" onClick={() => setOpen(true)} className="text-sm" aria-expanded={open}>
            ☰ {t.brand}
          </button>
          <Link to="/" className="text-sm text-ink-soft">
            {t.viewSite}
          </Link>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8" onClick={() => open && setOpen(false)}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SiteSwitcher({ current, me, onChange }: { current?: string; me: Me; onChange: (id: string) => void }) {
  const { data: all } = useQuery({
    queryKey: ['platform', 'tenants', 'switcher'],
    queryFn: () => api.get<{ slug: string; name: string; status: string }[]>('/platform/tenants?pageSize=100'),
    enabled: me.user.isPlatformAdmin,
  });
  const options = me.user.isPlatformAdmin ? (all ?? []).filter((s) => s.status === 'active').map((s) => ({ id: s.slug, name: s.name })) : me.sites.map((s) => ({ id: s.siteId, name: s.name }));
  return (
    <select value={current ?? ''} onChange={(e) => e.target.value && onChange(e.target.value)} className="rounded-md border border-line bg-bg px-2 py-2 text-sm text-ink">
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

