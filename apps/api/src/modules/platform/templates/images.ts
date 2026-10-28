import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import type pg from 'pg';
import type { AppContext } from '../../../context.js';

/**
 * Template photos come from Unsplash (free licence). A reference is either a long photo id
 * ("1555041469-a586c61ea9bc") or a short one from a photo page ("NnsqpLjiA94").
 * Order of preference: a local copy in var/demo-images/<ref>.jpg, the network, then a
 * soft gradient placeholder in the template's colours (so a site works offline too).
 */
const LOCAL_DIR = process.env.DEMO_IMAGES_DIR || path.resolve(process.cwd(), '../../var/demo-images');

const sourceUrl = (ref: string) =>
  /^\d{9,}-[0-9a-f]+$/.test(ref)
    ? `https://images.unsplash.com/photo-${ref}?auto=format&fm=jpg&q=78&w=1800`
    : `https://unsplash.com/photos/${ref}/download?force=true&w=1800`;

/** Vertical gradient PNG (small; the browser scales it). */
function gradientPng(from: string, to: string) {
  const [w, h] = [64, 80];
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [a, b] = [rgb(from), rgb(to)];
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const px = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    rows.push(Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => px).flat())]));
  }
  const chunk = (type: string, data: Buffer) => {
    const td = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Swaps a site's placeholder template photos for real ones that have since been placed in
 * var/demo-images: new file, same asset id, and links in pages and settings updated.
 * Returns how many photos were replaced and how many are still missing.
 */
export async function refreshTemplatePhotos(ctx: AppContext, db: pg.Pool) {
  const { rows } = await db.query<{ id: string; storage_key: string; original_name: string }>(
    `SELECT id, storage_key, original_name FROM assets WHERE original_name LIKE 'unsplash-%.png'`,
  );
  let replaced = 0;
  const missing: string[] = [];
  for (const a of rows) {
    const ref = a.original_name.slice('unsplash-'.length, -'.png'.length);
    const local = path.join(LOCAL_DIR, `${ref}.jpg`);
    if (!existsSync(local)) {
      missing.push(ref);
      continue;
    }
    const body = readFileSync(local);
    const key = a.storage_key.replace(/\.png$/, '.jpg');
    await ctx.storage.put(key, body, 'image/jpeg');
    const [oldUrl, newUrl] = [ctx.storage.publicUrl(a.storage_key), ctx.storage.publicUrl(key)];
    await db.query(`UPDATE assets SET storage_key = $2, original_name = $3, content_type = 'image/jpeg', size_bytes = $4 WHERE id = $1`, [a.id, key, `unsplash-${ref}.jpg`, body.length]);
    await db.query(`UPDATE pages SET draft = replace(draft::text, $1, $2)::jsonb, published = replace(published::text, $1, $2)::jsonb WHERE draft::text LIKE '%' || $1 || '%' OR published::text LIKE '%' || $1 || '%'`, [oldUrl, newUrl]);
    await db.query(`UPDATE page_versions SET document = replace(document::text, $1, $2)::jsonb WHERE document::text LIKE '%' || $1 || '%'`, [oldUrl, newUrl]);
    await db.query(`UPDATE site_settings SET settings = replace(settings::text, $1, $2)::jsonb WHERE settings::text LIKE '%' || $1 || '%'`, [oldUrl, newUrl]);
    await ctx.storage.delete(a.storage_key).catch(() => undefined);
    replaced++;
  }
  return { replaced, missing: [...new Set(missing)] };
}

export interface StoredImage {
  id: string;
  url: string;
}

/** Stores template photos as the site's own assets; one download per photo per run. */
export function templateImageStore(ctx: AppContext, db: pg.Pool, tenantId: string, palette: [string, string]) {
  const cache = new Map<string, StoredImage>();
  let offline = false;

  return async function store(ref: string): Promise<StoredImage> {
    const hit = cache.get(ref);
    if (hit) return hit;
    let body: Buffer | null = null;
    let [ext, contentType] = ['jpg', 'image/jpeg'];
    const local = path.join(LOCAL_DIR, `${ref}.jpg`);
    if (existsSync(local)) body = readFileSync(local);
    if (!body && !offline) {
      try {
        const res = await (ctx.httpFetch ?? fetch)(sourceUrl(ref), { signal: AbortSignal.timeout(15000) });
        if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) throw new Error(`HTTP ${res.status}`);
        body = Buffer.from(await res.arrayBuffer());
      } catch (err) {
        offline = true;
        ctx.log.warn(`template photos unavailable (${(err as Error).message}); using placeholders`);
      }
    }
    if (!body) {
      body = gradientPng(...palette);
      [ext, contentType] = ['png', 'image/png'];
    }
    const id = randomUUID();
    const now = new Date();
    const key = `public/tenants/${tenantId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${ext}`;
    await ctx.storage.put(key, body, contentType);
    await db.query(`INSERT INTO assets (id, storage_key, original_name, content_type, size_bytes, visibility, kind) VALUES ($1, $2, $3, $4, $5, 'public', 'image')`, [
      id,
      key,
      `unsplash-${ref}.${ext}`,
      contentType,
      body.length,
    ]);
    const stored = { id, url: ctx.storage.publicUrl(key) };
    cache.set(ref, stored);
    return stored;
  };
}
