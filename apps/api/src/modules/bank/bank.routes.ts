import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BUILT_IN_KINDS, bankEntryInputSchema, bankKeySchema, bankKindInputSchema, bankTypeInputSchema } from '@site-builder/shared';
import { fileTypeFromBuffer } from 'file-type';
import multer from 'multer';
import { z } from 'zod';
import { AppError, badRequest, conflict, notFound } from '../../common/errors.js';
import { ApiRouter, idParam } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import { auditPlatform } from '../audit/audit.js';
import { BANK_STORAGE_ID, builtInEntries, builtInPhotos, builtInRef, hiddenBuiltIns, listKinds, listTypes, type PhotoRef } from './bank.service.js';

const IMAGES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
const LOCAL_DIR = process.env.DEMO_IMAGES_DIR || path.resolve(process.cwd(), '../../var/demo-images');
const keyParam = z.object({ key: bankKeySchema });
const listQuery = z.object({ type: bankKeySchema, kind: z.string().max(40).default('') });

/** The studio's content bank: site types, content kinds, entries and photos (operators only). */
export function bankRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/platform/bank', 'Content bank', true);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: ctx.env.UPLOAD_MAX_BYTES, files: 30, fields: 5 } });

  const photoUrl = (p: PhotoRef) => ('ref' in p ? `/api/v1/platform/bank/builtin-photos/${encodeURIComponent(p.ref)}` : ctx.storage.publicUrl(p.key));

  async function removePhotos(where: string, values: unknown[]) {
    const { rows } = await ctx.control.query<{ storage_key: string }>(`DELETE FROM bank_photos WHERE ${where} RETURNING storage_key`, values);
    for (const p of rows) await ctx.storage.delete(p.storage_key).catch(() => undefined);
  }

  /* ----- types ----- */

  r.route({ method: 'get', path: '/types', summary: 'Site types with how many entries and photos each has' }, async () => {
    const { rows } = await ctx.control.query<{ type_key: string; entries: number; photos: number }>(
      `SELECT type_key, sum(e)::int AS entries, sum(p)::int AS photos FROM (
         SELECT type_key, 1 AS e, 0 AS p FROM bank_entries UNION ALL SELECT type_key, 0, 1 FROM bank_photos) x GROUP BY type_key`,
    );
    const counts = new Map(rows.map((x) => [x.type_key, x]));
    return { data: (await listTypes(ctx)).map((t) => ({ ...t, entries: counts.get(t.key)?.entries ?? 0, photos: counts.get(t.key)?.photos ?? 0 })) };
  });

  r.route({ method: 'post', path: '/types', summary: 'Add a site type', status: 201, body: bankTypeInputSchema }, async ({ req, body }) => {
    if ((await listTypes(ctx)).some((t) => t.key === body.key)) throw conflict('A type with this key already exists');
    await ctx.control.query('INSERT INTO bank_types (key, label) VALUES ($1, $2)', [body.key, body.label]);
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: 'bank.type_created', target: body.key });
    return { data: { ...body, builtIn: false, entries: 0, photos: 0 } };
  });

  r.route({ method: 'delete', path: '/types/:key', summary: 'Delete a site type with its entries and photos', params: keyParam }, async ({ req, params }) => {
    const { rowCount } = await ctx.control.query('DELETE FROM bank_types WHERE key = $1', [params.key]);
    if (!rowCount) throw badRequest('Only types added in the studio can be deleted');
    await ctx.control.query('DELETE FROM bank_entries WHERE type_key = $1', [params.key]);
    await removePhotos('type_key = $1', [params.key]);
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: 'bank.type_deleted', target: params.key });
  });

  /* ----- kinds ----- */

  r.route({ method: 'get', path: '/kinds', summary: 'Kinds of content (built-in and added)' }, async () => ({ data: await listKinds(ctx) }));

  r.route({ method: 'post', path: '/kinds', summary: 'Add a kind of content (its key matches a table key)', status: 201, body: bankKindInputSchema }, async ({ req, body }) => {
    if ((await listKinds(ctx)).some((k) => k.key === body.key)) throw conflict('A kind with this key already exists');
    if (!body.fields.some((f) => f.key === 'title')) body.fields.unshift({ key: 'title', type: 'text', label: { en: 'Title', fa: 'عنوان' } });
    await ctx.control.query('INSERT INTO bank_kinds (key, label, fields) VALUES ($1, $2, $3)', [body.key, body.label, JSON.stringify(body.fields)]);
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: 'bank.kind_created', target: body.key });
    return { data: { ...body, builtIn: false } };
  });

  r.route({ method: 'put', path: '/kinds/:key', summary: 'Change an added kind', params: keyParam, body: bankKindInputSchema.omit({ key: true }) }, async ({ params, body }) => {
    if (BUILT_IN_KINDS.some((k) => k.key === params.key)) throw badRequest('Built-in kinds cannot be changed');
    const { rowCount } = await ctx.control.query('UPDATE bank_kinds SET label = $2, fields = $3 WHERE key = $1', [params.key, body.label, JSON.stringify(body.fields)]);
    if (!rowCount) throw notFound('Kind');
    return { data: { key: params.key, ...body, builtIn: false } };
  });

  r.route({ method: 'delete', path: '/kinds/:key', summary: 'Delete an added kind with its entries and photos', params: keyParam }, async ({ req, params }) => {
    const { rowCount } = await ctx.control.query('DELETE FROM bank_kinds WHERE key = $1', [params.key]);
    if (!rowCount) throw badRequest('Only kinds added in the studio can be deleted');
    await ctx.control.query('DELETE FROM bank_entries WHERE kind = $1', [params.key]);
    await removePhotos('kind = $1', [params.key]);
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: 'bank.kind_deleted', target: params.key });
  });

  /* ----- entries ----- */

  r.route({ method: 'get', path: '/entries', summary: 'Entries of a type and kind (built-in ones are read-only)', query: listQuery }, async ({ query }) => {
    const { rows } = await ctx.control.query<{ id: string; data: Record<string, unknown>; photos: string[] }>(
      'SELECT id, data, photos FROM bank_entries WHERE type_key = $1 AND kind = $2 ORDER BY created_at',
      [query.type, query.kind],
    );
    const ids = rows.flatMap((x) => x.photos);
    const { rows: photos } = ids.length ? await ctx.control.query<{ id: string; storage_key: string }>('SELECT id, storage_key FROM bank_photos WHERE id = ANY($1)', [ids]) : { rows: [] };
    const url = new Map(photos.map((p) => [p.id, ctx.storage.publicUrl(p.storage_key)]));
    const shown = await hiddenBuiltIns(ctx, [query.type]);
    return {
      data: [
        ...rows.map((e) => ({ id: e.id, data: e.data, photos: e.photos.filter((p) => url.has(p)).map((p) => ({ id: p, url: url.get(p)! })), builtIn: false })),
        ...builtInEntries(query.type, query.kind)
          .filter(shown.entry)
          .map((e) => ({ id: null, ref: builtInRef(e), data: e.data, photos: e.photos.map((p) => ({ id: null, url: photoUrl(p) })), builtIn: true })),
      ],
    };
  });

  r.route({ method: 'post', path: '/entries', summary: 'Add entries (one or many, e.g. from a CSV file)', status: 201, body: z.object({ entries: z.array(bankEntryInputSchema).min(1).max(1000) }) }, async ({ req, body }) => {
    for (const e of body.entries) {
      await ctx.control.query('INSERT INTO bank_entries (type_key, kind, data, photos) VALUES ($1, $2, $3, $4)', [e.type, e.kind, e.data, JSON.stringify(e.photos)]);
    }
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: 'bank.entries_added', metadata: { count: body.entries.length } });
    return { data: { added: body.entries.length } };
  });

  r.route({ method: 'put', path: '/entries/:id', summary: 'Change an entry', params: idParam, body: bankEntryInputSchema.pick({ data: true, photos: true }) }, async ({ params, body }) => {
    const { rowCount } = await ctx.control.query('UPDATE bank_entries SET data = $2, photos = $3 WHERE id = $1', [params.id, body.data, JSON.stringify(body.photos)]);
    if (!rowCount) throw notFound('Entry');
  });

  r.route({ method: 'delete', path: '/entries/:id', summary: 'Delete an entry', params: idParam }, async ({ params }) => {
    const { rowCount } = await ctx.control.query('DELETE FROM bank_entries WHERE id = $1', [params.id]);
    if (!rowCount) throw notFound('Entry');
  });

  // Built-in entries and photos live in code: removing one hides it for the type (kind empty = a photo).
  const hiddenBody = z.object({ type: bankKeySchema, kind: z.string().max(40).default(''), ref: z.string().min(1).max(80) });
  r.route({ method: 'post', path: '/hidden', summary: 'Remove a built-in entry or photo', body: hiddenBody }, async ({ body }) => {
    await ctx.control.query('INSERT INTO bank_hidden (type_key, kind, ref) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [body.type, body.kind, body.ref]);
  });
  r.route({ method: 'delete', path: '/hidden', summary: 'Bring back the removed built-in entries and photos of a type', query: z.object({ type: bankKeySchema }) }, async ({ query }) => {
    const { rowCount } = await ctx.control.query('DELETE FROM bank_hidden WHERE type_key = $1', [query.type]);
    return { data: { restored: rowCount ?? 0 } };
  });

  /* ----- photos ----- */

  r.route(
    { method: 'get', path: '/counts', summary: 'How many entries and photos a type has for each kind (kind "" = photos for any kind)', query: z.object({ type: bankKeySchema }) },
    async ({ query }) => {
      const { rows } = await ctx.control.query<{ kind: string; entries: number; photos: number }>(
        `SELECT kind, sum(e)::int AS entries, sum(p)::int AS photos FROM (
           SELECT kind, 1 AS e, 0 AS p FROM bank_entries WHERE type_key = $1 UNION ALL SELECT kind, 0, 1 FROM bank_photos WHERE type_key = $1) x GROUP BY kind`,
        [query.type],
      );
      const shown = await hiddenBuiltIns(ctx, [query.type]);
      const out: Record<string, { entries: number; photos: number }> = { '': { entries: 0, photos: builtInPhotos(query.type).filter((p) => shown.photo(query.type, p)).length } };
      for (const k of await listKinds(ctx)) out[k.key] = { entries: builtInEntries(query.type, k.key).filter(shown.entry).length, photos: 0 };
      for (const x of rows) {
        const c = (out[x.kind] ??= { entries: 0, photos: 0 });
        c.entries += x.entries;
        c.photos += x.photos;
      }
      return { data: out };
    },
  );

  r.route({ method: 'get', path: '/photos', summary: 'Photos of a type (kind empty = photos for any kind)', query: listQuery }, async ({ query }) => {
    const { rows } = await ctx.control.query<{ id: string; storage_key: string; original_name: string }>(
      'SELECT id, storage_key, original_name FROM bank_photos WHERE type_key = $1 AND kind = $2 ORDER BY created_at DESC',
      [query.type, query.kind],
    );
    const shown = await hiddenBuiltIns(ctx, [query.type]);
    const builtIn = query.kind ? [] : builtInPhotos(query.type).filter((p) => shown.photo(query.type, p));
    return {
      data: [
        ...rows.map((p) => ({ id: p.id, url: ctx.storage.publicUrl(p.storage_key), name: p.original_name, builtIn: false })),
        ...builtIn.map((p) => ({ id: null, url: photoUrl(p), name: 'ref' in p ? p.ref : '', builtIn: true })),
      ],
    };
  });

  r.route(
    {
      method: 'post',
      path: '/photos',
      summary: 'Upload photos (multipart/form-data: files, type, kind?)',
      status: 201,
      rawBody: true,
      middleware: [upload.array('files', 30)],
    },
    async ({ req }) => {
      const fields = listQuery.safeParse(req.body ?? {});
      if (!fields.success) throw badRequest('Choose a site type');
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) throw badRequest('Attach photos in the "files" field');
      const added: { id: string; url: string }[] = [];
      for (const file of files) {
        const detected = await fileTypeFromBuffer(file.buffer);
        const ext = detected && IMAGES[detected.mime];
        if (!ext) throw new AppError(415, 'unsupported_file', 'Only JPEG, PNG, WebP and AVIF photos are allowed');
        const id = randomUUID();
        const now = new Date();
        const key = `public/tenants/${BANK_STORAGE_ID}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${ext}`;
        await ctx.storage.put(key, file.buffer, detected.mime);
        await ctx.control.query('INSERT INTO bank_photos (id, type_key, kind, storage_key, content_type, size_bytes, original_name) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
          id,
          fields.data.type,
          fields.data.kind,
          key,
          detected.mime,
          file.size,
          file.originalname.slice(0, 200),
        ]);
        added.push({ id, url: ctx.storage.publicUrl(key) });
      }
      return { data: added };
    },
  );

  r.route({ method: 'delete', path: '/photos/:id', summary: 'Delete a photo', params: idParam }, async ({ params }) => {
    await removePhotos('id = $1', [params.id]);
    await ctx.control.query(`UPDATE bank_entries SET photos = photos - $1::text WHERE photos ? $1::text`, [params.id]);
  });

  r.route({ method: 'get', path: '/builtin-photos/:ref', summary: 'A built-in template photo', params: z.object({ ref: z.string().regex(/^[A-Za-z0-9_-]{5,60}$/) }) }, async ({ res, params }) => {
    const file = path.join(LOCAL_DIR, `${params.ref}.jpg`);
    if (!existsSync(file)) throw notFound('Photo');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type('image/jpeg').send(readFileSync(file));
  });

  return r.router;
}
