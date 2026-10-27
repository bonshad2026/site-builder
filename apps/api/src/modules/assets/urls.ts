import type pg from 'pg';
import type { StorageAdapter } from '../../storage/storage.js';

/** Adds `imageUrl` to catalog rows that reference a public asset. */
export async function withImageUrls<T extends { imageAssetId?: string | null }>(db: pg.Pool, storage: StorageAdapter, rows: T[]): Promise<(T & { imageUrl: string | null })[]> {
  const ids = [...new Set(rows.map((r) => r.imageAssetId).filter((id): id is string => !!id))];
  const keys = new Map<string, string>();
  if (ids.length) {
    const { rows: assets } = await db.query<{ id: string; storage_key: string }>(
      `SELECT id, storage_key FROM assets WHERE id = ANY($1::uuid[]) AND visibility = 'public' AND deleted_at IS NULL`,
      [ids],
    );
    for (const a of assets) keys.set(a.id, storage.publicUrl(a.storage_key));
  }
  return rows.map((r) => ({ ...r, imageUrl: (r.imageAssetId && keys.get(r.imageAssetId)) || null }));
}
