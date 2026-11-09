import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCustomer } from '../features/account/customerApi';

vi.mock('../features/public-site/data', () => ({
  useSiteId: () => 'firefighter',
  useSiteSettings: () => ({ data: { accounts: { enabled: true } } }),
}));
vi.mock('../lib/api', () => ({
  API_URL: '', apiAvailable: () => true, mockedRequest: async () => undefined,
  ApiError: class extends Error {},
}));
afterEach(() => { cleanup(); focusManager.setFocused(undefined); vi.unstubAllGlobals(); });

it('rechecks a cached signed-out session on mount and when returning after login in another tab', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  const key = ['public', 'firefighter', 'customer'];
  client.setQueryData(key, null);
  let customer: { id: string; name: string } | null = { id: 'customer-1', name: 'Customer' };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: customer }) })));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useCustomer(), { wrapper });
  // Background revalidation must not unmount/remount the authentication form.
  expect(result.current.loading).toBe(false);
  await waitFor(() => expect(result.current.customer?.id).toBe('customer-1'));
  act(() => focusManager.setFocused(false));
  customer = null;
  act(() => focusManager.setFocused(true));
  await waitFor(() => expect(result.current.customer).toBeNull());
  client.clear();
});