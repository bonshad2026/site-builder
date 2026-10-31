import type { CollectionFilter, PublicCollection, PublicItem, SavedCard } from '@site-builder/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { api, apiAvailable, ApiError } from '../../lib/api';
import { useSiteId } from '../public-site/data';

/** Tables of the site (definitions) plus the shop's products as a source. */
export function useCollections() {
  const site = useSiteId();
  return useQuery({
    queryKey: ['public', site, 'collections'],
    queryFn: () => (apiAvailable() ? api.get<PublicCollection[]>(`/public/sites/${site}/collections`) : Promise.resolve([])),
    staleTime: 60_000,
  });
}

export function useCollection(slug: string) {
  const { data, ...rest } = useCollections();
  return { ...rest, data: data?.find((c) => c.slug === slug) };
}

export interface ItemsQuery {
  filters: CollectionFilter[];
  choices: Record<string, string>;
  /** Visitor's filters (ranges, several choices, availability…). */
  visitor?: CollectionFilter[];
  q: string;
  sort: string;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
  current?: string;
}

export function useCollectionItems(source: string, query: ItemsQuery, enabled = true) {
  const site = useSiteId();
  return useQuery({
    queryKey: ['public', site, 'items', source, query],
    queryFn: async () => {
      if (!apiAvailable()) return { data: [] as PublicItem[], total: 0 };
      const qs = new URLSearchParams({
        filters: JSON.stringify(query.filters),
        choices: JSON.stringify(query.choices),
        visitor: JSON.stringify(query.visitor ?? []),
        q: query.q,
        sort: query.sort,
        dir: query.dir,
        page: String(query.page),
        pageSize: String(query.pageSize),
        ...(query.current ? { current: query.current } : {}),
      });
      const res = await api.page<PublicItem[]>(`/public/sites/${site}/collections/${source}/items?${qs}`);
      return { data: res.data, total: Number(res.meta?.total ?? res.data.length) };
    },
    enabled: enabled && !!source,
    placeholderData: keepPreviousData,
  });
}

/** Smallest and largest value of a number or date field (slider bounds). */
export function useFieldRange(source: string, field: string, enabled = true) {
  const site = useSiteId();
  return useQuery({
    queryKey: ['public', site, 'range', source, field],
    queryFn: () => api.get<{ min: number | string | null; max: number | string | null }>(`/public/sites/${site}/collections/${source}/range?field=${encodeURIComponent(field)}`),
    enabled: enabled && apiAvailable() && !!source && !!field,
    staleTime: 60_000,
  });
}

/** Days with items between two days (calendar marks). */
export function useItemDays(source: string, field: string, from: string, to: string) {
  const site = useSiteId();
  return useQuery({
    queryKey: ['public', site, 'days', source, field, from, to],
    queryFn: () => api.get<string[]>(`/public/sites/${site}/collections/${source}/days?field=${encodeURIComponent(field)}&from=${from}&to=${to}`),
    enabled: apiAvailable() && !!source && !!field && !!from && !!to,
    staleTime: 60_000,
  });
}

export function useCollectionItem(collection: string, slug: string) {
  const site = useSiteId();
  return useQuery({
    queryKey: ['public', site, 'item', collection, slug],
    queryFn: () => api.get<PublicItem>(`/public/sites/${site}/collections/${collection}/items/${encodeURIComponent(slug)}`),
    enabled: apiAvailable() && !!collection && !!slug,
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
}

/** The item whose page is shown (a table's template page), for `{{field}}` texts and related lists. */
export const CurrentItemContext = createContext<{ item: PublicItem; collection: PublicCollection } | null>(null);
export const useCurrentItem = () => useContext(CurrentItemContext);

/** Shared box designs given directly (the builder's preview); null = the site settings' ones. */
export const CardDesignsContext = createContext<SavedCard[] | null>(null);

/** Address of an item's page. */
export const itemHref = (item: Pick<PublicItem, 'collection' | 'slug'>) => (item.collection === 'products' ? `/products/${item.slug}` : `/${item.collection}/${item.slug}`);
