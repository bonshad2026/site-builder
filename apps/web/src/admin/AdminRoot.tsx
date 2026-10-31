import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { HOST_SITE_ID } from '../features/public-site/data';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
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

function NavItem({ to, children, end }: { to: string; children: ReactNode; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => cn('block rounded-md px-3 py-2 text-sm', isActive ? 'bg-ink text-bg' : 'text-ink-soft hover:bg-surface-2 hover:text-ink')}>
      {children}
    </NavLink>
  );
}

function SiteNav({ siteId }: { siteId: string }) {
  const t = useT();
  const { data: info } = useSiteInfo(siteId);
  const { data: settings } = useAdminSettings(siteId);
  const operator = isOperator(useMe().data);
  const { l } = usePreferences();
  const { data: tables = [] } = useAdminCollections(siteId);
  const can = (p: string) => !!info?.permissions.includes(p);
  const mod = (m: keyof SiteSettings['modules']) => !!settings?.modules[m];
  const base = `/admin/sites/${siteId}`;
  return (
    <nav aria-label={info?.name ?? siteId} className="flex flex-col gap-0.5">
      {operator && (
        <>
          <NavItem to={base} end>
            {t.dashboard}
          </NavItem>
          <NavItem to={`${base}/pages`}>{t.pages}</NavItem>
        </>
      )}
      {/* Clients edit the text and images of their pages; operators use the builder. */}
      {!operator && can('pages:write') && <NavItem to={`${base}/content`}>{t.content}</NavItem>}
      {mod('services') && <NavItem to={`${base}/services`}>{t.services}</NavItem>}
      {mod('products') && <NavItem to={`${base}/products`}>{t.products}</NavItem>}
      {tables.map((c) => (
        <NavItem key={c.id} to={`${base}/items/${c.id}`}>
          {l(c.name) || c.slug}
        </NavItem>
      ))}
      {operator && <NavItem to={`${base}/tables`}>{t.contentTables}</NavItem>}
      {mod('leads') && can('leads:read') && <NavItem to={`${base}/leads`}>{t.leads}</NavItem>}
      {mod('orders') && can('orders:read') && <NavItem to={`${base}/orders`}>{t.orders}</NavItem>}
      <NavItem to={`${base}/files`}>{t.files}</NavItem>
      {(info?.role === 'owner' || info?.role === 'platform_admin') && <NavItem to={`${base}/members`}>{t.members}</NavItem>}
      {can('site:write') && <NavItem to={`${base}/settings`}>{t.settings}</NavItem>}
      {can('payments:manage') && mod('orders') && <NavItem to={`${base}/payments`}>{t.payments}</NavItem>}
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
    <div className="flex h-full flex-col gap-6 p-4">
      <Link to="/admin" className="px-3 font-display text-2xl text-ink">
        {t.brand}
      </Link>
      {isOperator(me) && (
        <div>
          <p className="mb-1 px-3 text-xs font-medium text-ink-soft uppercase rtl:normal-case">{t.platform}</p>
          <nav aria-label={t.platform} className="flex flex-col gap-0.5">
            <NavItem to="/admin/platform/sites">{t.sites}</NavItem>
            <NavItem to="/admin/platform/users">{t.users}</NavItem>
            <NavItem to="/admin/platform/audit">{t.audit}</NavItem>
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
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-e border-line bg-surface lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <aside className={cn('absolute inset-y-0 w-72 bg-surface shadow-xl', dir === 'rtl' ? 'right-0' : 'left-0')} onClick={(e) => e.stopPropagation()}>
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

