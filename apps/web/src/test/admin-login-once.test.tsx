import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const me = { user: { id: 'u1', email: 'owner', phone: null, displayName: '', isPlatformAdmin: false, emailVerified: true, phoneVerified: false }, sites: [] };

it('opens the panel after one sign-in when the signed-out session was already cached', async () => {
  vi.stubEnv('VITE_API_URL', 'http://api.test');
  vi.resetModules();
  const { LoginPage, RequireAuth } = await import('../admin/auth');
  const { PreferencesProvider } = await import('../lib/preferences');
  let signedIn = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/auth/login')) {
        signedIn = true;
        return Response.json({ data: { user: me.user, csrfToken: 'x' } });
      }
      return signedIn ? Response.json({ data: me }) : Response.json({ error: { code: 'unauthorized', message: 'x' } }, { status: 401 });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PreferencesProvider locale="en" onLocaleChange={() => {}}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin/login" element={<LoginPage />} />
          <Route path="/admin" element={<RequireAuth>{() => <h1>Panel</h1>}</RequireAuth>} />
        </Routes>
      </MemoryRouter>
      </PreferencesProvider>
    </QueryClientProvider>,
  );
  // The guard caches "signed out" and sends the visitor to sign in.
  const name = await screen.findByLabelText(/email|ایمیل/i);
  await userEvent.type(name, 'owner');
  await userEvent.type(screen.getByLabelText(/password|رمز/i), 'secret-pass-1');
  await userEvent.click(screen.getByRole('button', { name: /^(sign in|ورود)$/i }));
  expect(await screen.findByRole('heading', { name: 'Panel' })).toBeInTheDocument();
});
