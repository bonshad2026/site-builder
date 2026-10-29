import { withSettingDefaults } from '@site-builder/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { siteConfig } from '../../config/site';
import { fallbackPages, fallbackProducts, fallbackServices, fallbackSettings } from '../../content/fallback';
import { api, apiAvailable, ApiError } from '../../lib/api';
import type { ProductDto, PublishedPage, ServiceDto, SiteSettings } from '../../types/api';

/** Studio previews: <site>.preview.<host> shows that site from one shared build. */
const previewSite = typeof window !== 'undefined' ? /^([a-z0-9][a-z0-9-]*)\.preview\./.exec(window.location.hostname)?.[1] : undefined;

/** Which client site this front end shows: the preview host, else VITE_SITE_ID (one build per client domain). */
export const DEFAULT_SITE_ID = previewSite || (import.meta.env.VITE_SITE_ID as string | undefined) || siteConfig.id;

export const SiteIdContext = createContext<string>(DEFAULT_SITE_ID);
export const useSiteId = () => useContext(SiteIdContext);

const notFound = () => new ApiError(404, 'not_found', 'Not found');

export function useSiteSettings() {
  const site = useSiteId();
  return useQuery({
    queryKey: ['public', site, 'settings'],
    // Options a site never set get their defaults, so older sites keep their look.
    queryFn: () => (apiAvailable() ? api.get<SiteSettings>(`/public/sites/${site}/settings`).then(withSettingDefaults) : Promise.resolve(fallbackSettings)),
    staleTime: 60_000,
  });
}

export function usePublishedPage(slug: string) {
  const site = useSiteId();
  return useQuery({
    queryKey: ['public', site, 'page', slug],
    queryFn: async () => {
      if (apiAvailable()) return api.get<PublishedPage>(`/public/sites/${site}/pages/${slug}`);
      const page = fallbackPages.find((p) => p.slug === slug || (slug === 'home' && p.isHome));
      if (!page) throw notFound();
      return page;
    },
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
}

export function useServices(enabled = true) {
  const site = useSiteId();
  return useQuery({
    queryKey: ['public', site, 'services'],
    queryFn: () => (apiAvailable() ? api.get<ServiceDto[]>(`/public/sites/${site}/services`) : Promise.resolve(fallbackServices)),
    enabled,
  });
}

export function useService(slug: string) {
  const site = useSiteId();
  return useQuery({
    queryKey: ['public', site, 'service', slug],
    queryFn: async () => {
      if (apiAvailable()) return api.get<ServiceDto>(`/public/sites/${site}/services/${slug}`);
      const s = fallbackServices.find((x) => x.slug === slug);
      if (!s) throw notFound();
      return s;
    },
    retry: false,
  });
}

/** All published products (catalog sizes are small; filtering happens client-side for instant UI). */
export function useProducts(enabled = true) {
  const site = useSiteId();
  return useQuery({
    queryKey: ['public', site, 'products'],
    queryFn: () => (apiAvailable() ? api.get<ProductDto[]>(`/public/sites/${site}/products?pageSize=100`) : Promise.resolve(fallbackProducts)),
    enabled,
  });
}

export function useProduct(slug: string) {
  const site = useSiteId();
  return useQuery({
    queryKey: ['public', site, 'product', slug],
    queryFn: async () => {
      if (apiAvailable()) return api.get<ProductDto>(`/public/sites/${site}/products/${slug}`);
      const p = fallbackProducts.find((x) => x.slug === slug);
      if (!p) throw notFound();
      return p;
    },
    retry: false,
  });
}

export function usePaymentMethods(enabled: boolean) {
  const site = useSiteId();
  return useQuery({
    queryKey: ['public', site, 'payment-methods'],
    queryFn: () =>
      apiAvailable()
        ? api.get<{ online: boolean; cod: boolean; provider: string | null; isTest: boolean }>(`/public/sites/${site}/payment-methods`)
        : Promise.resolve({ online: false, cod: false, provider: null, isTest: false }),
    enabled,
  });
}

export const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;
