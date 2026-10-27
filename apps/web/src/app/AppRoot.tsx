import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { RouterProvider, type createBrowserRouter } from 'react-router';
import { basenameFor, localeFromPath, PreferencesProvider, stripLocale } from '../lib/preferences';
import type { Locale } from '../types/site';

type Router = ReturnType<typeof createBrowserRouter>;

/**
 * The language lives in the URL (/fa/... for Persian). Switching language
 * rebuilds the router with the new basename, keeping the current page.
 */
export function AppRoot({
  initialPath,
  makeRouter,
  replaceUrl,
  queryClient,
}: {
  initialPath: string;
  makeRouter: (basename: string | undefined, path: string) => Router;
  replaceUrl?: (url: string) => void;
  queryClient?: QueryClient;
}) {
  const [state, setState] = useState(() => ({ locale: localeFromPath(initialPath), path: stripLocale(initialPath) }));
  const [client] = useState(() => queryClient ?? new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } } }));
  const router = useMemo(() => makeRouter(basenameFor(state.locale), state.path), [makeRouter, state]);

  const changeLocale = useCallback(
    (next: Locale) => {
      const current = router.state.location;
      // Data routers keep the basename in location.pathname; remove it to get the page path.
      const path = stripLocale(current.pathname) + current.search;
      replaceUrl?.((next === 'fa' ? '/fa' : '') + (path === '/' && next === 'fa' ? '' : path));
      setState({ locale: next, path });
    },
    [router, replaceUrl],
  );

  return (
    <QueryClientProvider client={client}>
      <PreferencesProvider locale={state.locale} onLocaleChange={changeLocale}>
        {/* RouterProvider keeps its first router's state, so remount it when the router changes. */}
        <RouterProvider key={state.locale} router={router} />
      </PreferencesProvider>
    </QueryClientProvider>
  );
}
