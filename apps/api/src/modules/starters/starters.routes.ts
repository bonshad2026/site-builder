import { collectionInputSchema, pageDocumentSchema } from '@site-builder/shared';
import { z } from 'zod';
import { notFound } from '../../common/errors.js';
import { ApiRouter, idParam } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import { auditPlatform } from '../audit/audit.js';

/**
 * The studio's own starting points (operators only): saved page layouts and table definitions,
 * kept in the control DB so any site can start a new page or table from one.
 */
const pageData = z.object({ document: pageDocumentSchema });
const tableData = collectionInputSchema;
const meta = { name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).default('') };
const starterInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page'), ...meta, data: pageData }),
  z.object({ kind: z.literal('table'), ...meta, data: tableData }),
]);
const COLUMNS = 'id, kind, name, description, data, created_at AS "createdAt", updated_at AS "updatedAt"';

export function starterRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/platform/starters', 'Starters', true);

  r.route({ method: 'get', path: '/', summary: 'Saved page and table starters', query: z.object({ kind: z.enum(['page', 'table']).optional() }) }, async ({ query }) => {
    const { rows } = await ctx.control.query(`SELECT ${COLUMNS} FROM starters WHERE $1::text IS NULL OR kind = $1 ORDER BY kind, name`, [query.kind ?? null]);
    return { data: rows };
  });

  r.route({ method: 'post', path: '/', summary: 'Save a page or table as a starter', status: 201, body: starterInput }, async ({ req, body }) => {
    const { rows } = await ctx.control.query(`INSERT INTO starters (kind, name, description, data) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`, [body.kind, body.name, body.description, body.data]);
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: 'starter.created', target: rows[0].id, metadata: { kind: body.kind } });
    return { data: rows[0] };
  });

  r.route({ method: 'patch', path: '/:id', summary: 'Rename a starter', params: idParam, body: z.object(meta) }, async ({ params, body }) => {
    const { rows } = await ctx.control.query(`UPDATE starters SET name = $2, description = $3, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`, [params.id, body.name, body.description]);
    if (!rows[0]) throw notFound('Starter');
    return { data: rows[0] };
  });

  r.route({ method: 'delete', path: '/:id', summary: 'Delete a starter', params: idParam }, async ({ req, params }) => {
    const { rowCount } = await ctx.control.query('DELETE FROM starters WHERE id = $1', [params.id]);
    if (!rowCount) throw notFound('Starter');
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: 'starter.deleted', target: params.id });
  });

  return r.router;
}
