import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { AppRoot } from '../app/AppRoot';
import { routes } from '../app/routes';

/** Renders the whole app at `path` (use /fa/... for Persian), with a fresh cache and in-memory router. */
export function renderApp(path = '/') {
  let current: ReturnType<typeof createMemoryRouter> | null = null;
  const makeRouter = (basename: string | undefined, p: string) => {
    current = createMemoryRouter(routes, { initialEntries: [`${basename ?? ''}${p === '/' && basename ? '' : p}`], basename });
    return current;
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const result = render(<AppRoot initialPath={path} makeRouter={makeRouter} queryClient={queryClient} />);
  return { ...result, router: () => current! };
}
