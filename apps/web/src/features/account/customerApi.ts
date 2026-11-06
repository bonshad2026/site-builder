import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_URL, ApiError, apiAvailable, mockedRequest } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { useSiteId, useSiteSettings } from '../public-site/data';

export interface Customer {
  addresses: {id:string; label:string; address:string}[];
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  hasPassword: boolean;
}

/** The customer session's CSRF token: a readable cookie per site, echoed in a header. */
function customerCsrf(site: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)sb_cc_${site}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** A request to this site's public API as the signed-in customer (if any). */
export async function customerRequest<T>(site: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const mocked = await mockedRequest(method, `/public/sites/${site}${path}`, init.body);
  if (mocked !== undefined) return mocked.data as T;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const token = customerCsrf(site);
    if (token) headers['X-Customer-CSRF'] = token;
  }
  const res = await fetch(`${API_URL}/api/v1/public/sites/${site}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as { data: T; error?: { code: string; message: string; details?: ApiError['details'] } } | null;
  if (!res.ok || !json) throw new ApiError(res.status, json?.error?.code ?? 'network_error', json?.error?.message ?? `Request failed (${res.status})`, json?.error?.details);
  return json.data;
}

/** Calls to the site's public API for the visitor (account, tracking, their requests). */
export function useCustomerApi() {
  const site = useSiteId();
  return {
    site,
    get: <T>(path: string) => customerRequest<T>(site, path),
    post: <T>(path: string, body: unknown = {}) => customerRequest<T>(site, path, { method: 'POST', body }),
    patch: <T>(path: string, body: unknown) => customerRequest<T>(site, path, { method: 'PATCH', body }),
  };
}

/** Whether this site offers accounts, and the signed-in customer (null when signed out). */
export function useCustomer() {
  const site = useSiteId();
  const { data: settings } = useSiteSettings();
  const enabled = apiAvailable() && !!settings?.accounts?.enabled;
  const me = useQuery({
    queryKey: ['public', site, 'customer'],
    queryFn: () => customerRequest<Customer | null>(site, '/customer/me'),
    enabled,
    staleTime: 60_000,
  });
  return { enabled, accounts: settings?.accounts, customer: me.data ?? null, loading: enabled && me.isLoading };
}

export function useRefreshCustomer() {
  const qc = useQueryClient();
  const site = useSiteId();
  return () => qc.invalidateQueries({ queryKey: ['public', site] });
}

/** Two texts, one per language: the visitor's language picks. */
export type Lbl = { en: string; fa: string };
export const L = (en: string, fa: string): Lbl => ({ en, fa });
export function useText() {
  const { locale } = usePreferences();
  return (x: Lbl) => x[locale];
}
