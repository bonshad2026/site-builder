import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://api.test'));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  document.cookie = 'sb_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

const me = {
  user: { id: 'u1', email: 'owner@example.com', phone: null, displayName: '', isPlatformAdmin: false, emailVerified: true, phoneVerified: false },
  sites: [{ siteId: 'atelier-navar', name: 'Atelier Navar', status: 'active', role: 'owner', permissions: [] }],
};

async function loadApp() {
  vi.resetModules();
  return (await import('./renderApp')).renderApp;
}

describe('admin panel access', () => {
  it('redirects to sign-in when there is no session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 'unauthorized', message: 'Authentication required' } }, { status: 401 })));
    const app = (await loadApp())('/admin/sites/atelier-navar/pages');
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(app.router().state.location.search).toContain('next=%2Fadmin%2Fsites%2Fatelier-navar%2Fpages');
  });

  it('signs in, sends the CSRF token on changes, and lands on the site dashboard', async () => {
    let signedIn = false;
    const calls: { path: string; method: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const path = new URL(String(input)).pathname.replace('/api/v1', '');
        calls.push({ path, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string> });
        if (path === '/auth/me') return signedIn ? Response.json({ data: me }) : Response.json({ error: { code: 'unauthorized', message: 'x' } }, { status: 401 });
        if (path === '/auth/login') {
          signedIn = true;
          document.cookie = 'sb_csrf=csrf-abc; path=/';
          return Response.json({ data: { user: me.user, csrfToken: 'csrf-abc' } });
        }
        if (path === '/sites/atelier-navar') return Response.json({ data: { siteId: 'atelier-navar', name: 'Atelier Navar', role: 'owner', permissions: ['leads:read', 'orders:read', 'site:write'] } });
        if (path === '/sites/atelier-navar/settings') return Response.json({ data: { modules: { leads: true, orders: true, products: true, services: true } } });
        if (path === '/sites/atelier-navar/overview')
          return Response.json({
            data: {
              content: { pages: 6, publishedPages: 6, pagesWithDrafts: 1, products: 8, services: 4, files: 20 },
              leads: { new: 3, total: 5, recent: [] },
              orders: { pending: 1, total: 2, paidRevenueMinor: '0', testRevenueMinor: '290000000', recent: [] },
            },
          });
        if (path === '/auth/logout') return new Response(null, { status: 204 });
        return Response.json({ data: [] });
      }),
    );

    (await loadApp())('/admin/login');
    await userEvent.type(await screen.findByLabelText(/email/i), 'owner@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'correct-horse-42');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/new customer requests/i)).toBeInTheDocument();
    expect(screen.getByText(/test payments \(not real money\)/i)).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: /sign out/i })[0]);
    await waitFor(() => expect(calls.some((c) => c.path === '/auth/logout')).toBe(true));
    const logout = calls.find((c) => c.path === '/auth/logout')!;
    expect(logout.headers['X-CSRF-Token']).toBe('csrf-abc');
  });
});
