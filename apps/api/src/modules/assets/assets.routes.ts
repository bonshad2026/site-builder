import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import multer from 'multer';
import { z } from 'zod';
import { AppError, badRequest, notFound } from '../../common/errors.js';
import { ApiRouter, idParam, pageMeta, paginationQuery } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import { requirePermission } from '../../middleware/tenant.js';
import type { Visibility } from '../../storage/storage.js';
import { auditTenant } from '../audit/audit.js';

/** Allowed types, identified from the file's actual bytes rather than its name or declared type. */
const ALLOWED: Record<string, { ext: string; kind: 'image' | 'document' }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/avif': { ext: 'avif', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'application/pdf': { ext: 'pdf', kind: 'document' },
};

const COLUMNS = `id, storage_key AS "storageKey", original_name AS "originalName", content_type AS "contentType",
  size_bytes::int AS "sizeBytes", visibility, kind, alt, created_at AS "createdAt"`;

const SIGNED_URL_SECONDS = 600;

export function assetsRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/sites/:siteId/assets', 'Assets', true);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: ctx.env.UPLOAD_MAX_BYTES, files: 1, fields: 5 } });

  async function withUrl<T extends { storageKey: string; visibility: Visibility }>(asset: T) {
    const url = asset.visibility === 'public' ? ctx.storage.publicUrl(asset.storageKey) : await ctx.storage.signedUrl(asset.storageKey, SIGNED_URL_SECONDS);
    return { ...asset, url };
  }

  r.route({ method: 'get', path: '/', summary: 'List files', query: paginationQuery }, async ({ req, query }) => {
    const { rows } = await req.tenant!.db.query(
      `SELECT ${COLUMNS}, count(*) OVER()::int AS total FROM assets WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [query.pageSize, (query.page - 1) * query.pageSize],
    );
    const data = await Promise.all(rows.map(({ total: _t, ...a }) => withUrl(a)));
    return { data, meta: pageMeta(query.page, query.pageSize, rows[0]?.total ?? 0) };
  });

  r.route(
    {
      method: 'post',
      path: '/',
      summary: 'Upload a file (multipart/form-data: file, visibility?, altEn?, altFa?)',
      status: 201,
      rawBody: true,
      middleware: [requirePermission('assets:write'), upload.single('file')],
    },
    async ({ req }) => {
      const file = req.file;
      if (!file) throw badRequest('Attach a file in the "file" field');
      const fields = z
        .object({ visibility: z.enum(['public', 'private']).default('public'), altEn: z.string().max(300).default(''), altFa: z.string().max(300).default('') })
        .safeParse(req.body ?? {});
      if (!fields.success) throw badRequest('Invalid upload fields');

      const detected = await fileTypeFromBuffer(file.buffer);
      const allowed = detected && ALLOWED[detected.mime];
      if (!allowed) throw new AppError(415, 'unsupported_file', 'Only JPEG, PNG, WebP, AVIF, GIF images and PDF documents are allowed');

      const now = new Date();
      const id = randomUUID();
      const visibility: Visibility = fields.data.visibility;
      const key = `${visibility}/tenants/${req.tenant!.id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${allowed.ext}`;

      await ctx.storage.put(key, file.buffer, detected.mime);
      try {
        const { rows } = await req.tenant!.db.query(
          `INSERT INTO assets (id, storage_key, original_name, content_type, size_bytes, visibility, kind, alt, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${COLUMNS}`,
          [id, key, file.originalname.slice(0, 200), detected.mime, file.size, visibility, allowed.kind, { en: fields.data.altEn, fa: fields.data.altFa }, req.auth!.user.id],
        );
        await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'asset.uploaded', target: id });
        return { data: await withUrl(rows[0]) };
      } catch (err) {
        await ctx.storage.delete(key).catch(() => {});
        throw err;
      }
    },
  );

  r.route({ method: 'get', path: '/:id', summary: 'Get a file (private files get a short-lived signed URL)', params: idParam }, async ({ req, params }) => {
    const { rows } = await req.tenant!.db.query(`SELECT ${COLUMNS} FROM assets WHERE id = $1 AND deleted_at IS NULL`, [params.id]);
    if (!rows[0]) throw notFound('File');
    return { data: await withUrl(rows[0]) };
  });

  r.route({ method: 'delete', path: '/:id', summary: 'Delete a file', params: idParam, middleware: [requirePermission('assets:write')] }, async ({ req, params }) => {
    const { rows } = await req.tenant!.db.query('DELETE FROM assets WHERE id = $1 RETURNING storage_key', [params.id]);
    if (!rows[0]) throw notFound('File');
    await ctx.storage.delete(rows[0].storage_key);
    await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'asset.deleted', target: params.id });
  });

  r.route(
    {
      method: 'post',
      path: '/cleanup',
      summary: 'Delete files older than a day that nothing references',
      middleware: [requirePermission('assets:write')],
      query: z.object({ dryRun: z.enum(['true', 'false']).default('true') }),
    },
    async ({ req, query }) => {
      // References: catalog image columns, the site logo, and asset ids inside page documents.
      const { rows } = await req.tenant!.db.query<{ id: string; storage_key: string }>(
        `SELECT a.id, a.storage_key FROM assets a
          WHERE a.created_at < now() - interval '1 day'
            AND NOT EXISTS (SELECT 1 FROM services s WHERE s.image_asset_id = a.id)
            AND NOT EXISTS (SELECT 1 FROM products p WHERE p.image_asset_id = a.id)
            AND NOT EXISTS (SELECT 1 FROM site_settings ss WHERE ss.settings->>'logoAssetId' = a.id::text)
            AND NOT EXISTS (SELECT 1 FROM pages pg WHERE pg.draft::text LIKE '%' || a.id::text || '%' OR coalesce(pg.published::text, '') LIKE '%' || a.id::text || '%')
            AND NOT EXISTS (SELECT 1 FROM page_versions v WHERE v.document::text LIKE '%' || a.id::text || '%')`,
      );
      if (query.dryRun === 'false') {
        for (const a of rows) {
          await ctx.storage.delete(a.storage_key);
          await req.tenant!.db.query('DELETE FROM assets WHERE id = $1', [a.id]);
        }
        await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'asset.cleanup', metadata: { deleted: rows.length } });
      }
      return { data: { unused: rows.map((a) => a.id), deleted: query.dryRun === 'false' ? rows.length : 0 } };
    },
  );

  return r.router;
}
