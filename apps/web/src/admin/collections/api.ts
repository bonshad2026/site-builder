import { PRODUCT_SOURCE, PRODUCT_SOURCE_FIELDS, type Collection, type CollectionField, type PublicItem } from '@site-builder/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type AdminCollection = Collection & { itemCount: number };

export interface AdminItem {
  id: string;
  collectionId: string;
  slug: string;
  title: { en: string; fa: string };
  data: Record<string, unknown>;
  status: 'draft' | 'published';
  position: number;
  imageUrl: string | null;
  availability?: PublicItem['availability'];
  /** Values with image URLs and referenced items (for previews in the editor). */
  previewData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function useAdminCollections(siteId: string) {
  return useQuery({
    queryKey: ['site', siteId, 'collections'],
    queryFn: () => api.get<AdminCollection[]>(`/sites/${siteId}/collections`),
  });
}

/** Sources a list section can use: the site's tables plus the shop's products. */
export function useListSources(siteId: string) {
  const { data: tables = [], ...rest } = useAdminCollections(siteId);
  const sources: { slug: string; name: { en: string; fa: string }; fields: CollectionField[]; requestType?: string }[] = [
    ...tables.map((t) => ({ slug: t.slug, name: t.name, fields: t.fields, requestType: t.requestType })),
    { slug: PRODUCT_SOURCE, name: { en: 'Products (shop)', fa: 'محصولات (فروشگاه)' }, fields: PRODUCT_SOURCE_FIELDS },
  ];
  return { ...rest, data: sources, tables };
}

/** A few items of a source in the public shape (drafts included, with their status), for previews in the builder. */
export function usePreviewItems(siteId: string, source: string) {
  return useQuery({
    queryKey: ['site', siteId, 'collections', 'preview', source],
    queryFn: () => api.get<(PublicItem & { status?: 'draft' | 'published' })[]>(`/sites/${siteId}/collections/preview/${source}`),
    enabled: !!source,
  });
}

export function useAdminItems(siteId: string, collectionId: string, q = '', page = 1) {
  return useQuery({
    queryKey: ['site', siteId, 'collections', collectionId, 'items', q, page],
    queryFn: () => api.page<AdminItem[]>(`/sites/${siteId}/collections/${collectionId}/items?q=${encodeURIComponent(q)}&page=${page}&pageSize=50`),
    enabled: !!collectionId,
  });
}
