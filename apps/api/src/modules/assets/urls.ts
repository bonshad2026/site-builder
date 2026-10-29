import type pg from 'pg';
import type { StorageAdapter } from '../../storage/storage.js';

/**
 * Adds `imageUrl` to catalog rows that reference a public asset, and `gallery` (id and URL, in
 * order, missing ones left out) to rows with extra photos (`images`, a list of asset ids).
 */
export async function withImageUrls<T extends { imageAssetId?: string | null; images?: unknown }>(
  db: pg.Pool,
  storage: StorageAdapter,
  rows: T[],
): Promise<(T & { imageUrl: string | null; gallery?: { id: string; url: string }[] })[]> {
  const extra = (r: T) => (Array.isArray(r.images) ? r.images.filter((id): id is string => typeof id === 'string') : []);
  const ids = [...new Set(rows.flatMap((r) => [r.imageAssetId, ...extra(r)]).filter((id): id is string => !!id))];
  const keys = new Map<string, string>();
  if (ids.length) {
    const { rows: assets } = await db.query<{ id: string; storage_key: string }>(
      `SELECT id, storage_key FROM assets WHERE id = ANY($1::uuid[]) AND visibility = 'public' AND deleted_at IS NULL`,
      [ids],
    );
    for (const a of assets) keys.set(a.id, storage.publicUrl(a.storage_key));
  }
  return rows.map((r) => ({
    ...r,
    imageUrl: (r.imageAssetId && keys.get(r.imageAssetId)) || null,
    ...(Array.isArray(r.images) ? { gallery: extra(r).flatMap((id) => (keys.has(id) ? [{ id, url: keys.get(id)! }] : [])) } : {}),
  }));
}
