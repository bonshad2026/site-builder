import {
  collectionInputSchema,
  packSummary,
  pageDocumentSchema,
  readStarterPack,
  starterApplySchema,
  starterPackSchema,
  starterSaveSchema,
  starterGroupSchema,
  starterSelectionSchema,
  STARTER_KINDS,
  type StarterKind,
} from '@site-builder/shared';
import { z } from 'zod';
import { notFound } from '../../common/errors.js';
import { ApiRouter, idParam } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import { auditPlatform, auditTenant } from '../audit/audit.js';
import { applyPack, buildPack, checkPack, deletePackPhotos, scanSelection } from './pack.service.js';

/**
 * The studio's own starting points (operators only): packs of pages and tables with what they
 * use, kept in the control DB so any site can start a new page or table from one.
 */
const pageData = z.object({ document: pageDocumentSchema });
const meta = { name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).default(''), group: starterGroupSchema };
const starterInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page'), ...meta, data: z.union([starterPackSchema, pageData]) }),
  z.object({ kind: z.literal('table'), ...meta, data: z.union([starterPackSchema, collectionInputSchema]) }),
  z.object({ kind: z.literal('header'), ...meta, data: starterPackSchema }),
  z.object({ kind: z.literal('footer'), ...meta, data: starterPackSchema }),
]);
const COLUMNS = 'id, kind, name, description, group_name AS "group", sample_key AS "sampleKey", data, created_at AS "createdAt", updated_at AS "updatedAt"';

type Row = { id: string; kind: StarterKind; name: string; description: string; group: string; sampleKey: string | null; data: unknown; createdAt: Date; updatedAt: Date };
/** A starter as the admin sees it: its pack (older starters converted) and short counts. */
const present = (row: Row) => {
  const pack = readStarterPack(row.kind, row.data);
  return { ...row, data: pack, summary: packSummary(pack) };
};

async function loadStarter(ctx: AppContext, id: string): Promise<Row> {
  const { rows } = await ctx.control.query<Row>(`SELECT ${COLUMNS} FROM starters WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound('Starter');
  return rows[0];
}

export function starterRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/platform/starters', 'Starters', true);

  r.route({ method: 'get', path: '/', summary: 'Saved starters (pages, tables, headers, footers) by group', query: z.object({ kind: z.enum(STARTER_KINDS).optional() }) }, async ({ query }) => {
    const { rows } = await ctx.control.query<Row>(`SELECT ${COLUMNS} FROM starters WHERE $1::text IS NULL OR kind = $1 ORDER BY kind, group_name, name`, [query.kind ?? null]);
    return { data: rows.map(present) };
  });

  r.route({ method: 'post', path: '/', summary: 'Save a page or table (or a whole pack) as a starter', status: 201, body: starterInput }, async ({ req, body }) => {
    const pack = readStarterPack(body.kind, body.data);
    const { rows } = await ctx.control.query<Row>(`INSERT INTO starters (kind, name, description, group_name, data) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`, [body.kind, body.name, body.description, body.group, pack]);
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: 'starter.created', target: rows[0].id, metadata: { kind: body.kind } });
    return { data: present(rows[0]) };
  });

  r.route({ method: 'patch', path: '/:id', summary: 'Rename a starter or move it to another group', params: idParam, body: z.object(meta) }, async ({ params, body }) => {
    const { rows } = await ctx.control.query<Row>(`UPDATE starters SET name = $2, description = $3, group_name = $4, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`, [params.id, body.name, body.description, body.group]);
    if (!rows[0]) throw notFound('Starter');
    return { data: present(rows[0]) };
  });

  r.route({ method: 'delete', path: '/:id', summary: 'Delete a starter and its photo copies', params: idParam }, async ({ req, params }) => {
    const row = await loadStarter(ctx, params.id);
    await ctx.control.query('DELETE FROM starters WHERE id = $1', [params.id]);
    await deletePackPhotos(ctx, readStarterPack(row.kind, row.data));
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: 'starter.deleted', target: params.id });
  });

  return r.router;
}

/**
 * Starters from a site's point of view (operators only): what a new starter would hold, saving
 * one (or replacing one's contents), and how a starter fits this site and using it here.
 */
export function siteStarterRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/sites/:siteId/starters', 'Starters', true);
  const kind = z.object({ kind: z.enum(STARTER_KINDS) });

  r.route({ method: 'post', path: '/scan', summary: 'What a starter made from these pages and tables would hold', body: starterSelectionSchema.merge(kind) }, async ({ req, body }) => {
    return { data: await scanSelection(req.tenant!.db, body, body.kind) };
  });

  r.route({ method: 'post', path: '/', summary: 'Save pages and tables with what they use as a starter', status: 201, body: starterSaveSchema }, async ({ req, body }) => {
    const pack = await buildPack(ctx, req.tenant!.db, body, body.kind);
    let row: Row;
    if (body.replace) {
      const old = await loadStarter(ctx, body.replace);
      row = (await ctx.control.query<Row>(`UPDATE starters SET kind = $2, name = $3, description = $4, group_name = $5, data = $6, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`, [body.replace, body.kind, body.name, body.description, body.group, pack])).rows[0];
      await deletePackPhotos(ctx, readStarterPack(old.kind, old.data));
    } else {
      row = (await ctx.control.query<Row>(`INSERT INTO starters (kind, name, description, group_name, data) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`, [body.kind, body.name, body.description, body.group, pack])).rows[0];
    }
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: body.replace ? 'starter.replaced' : 'starter.created', target: row.id, metadata: { kind: body.kind, site: req.tenant!.slug } });
    return { data: present(row) };
  });

  r.route({ method: 'get', path: '/:id/check', summary: 'How a starter fits this site: what exists, what is missing, what differs', params: idParam }, async ({ req, params }) => {
    const row = await loadStarter(ctx, params.id);
    return { data: await checkPack(req.tenant!.db, readStarterPack(row.kind, row.data)) };
  });

  r.route({ method: 'post', path: '/:id/apply', summary: 'Use a starter on this site (one transaction)', params: idParam, body: starterApplySchema }, async ({ req, params, body }) => {
    const row = await loadStarter(ctx, params.id);
    const result = await applyPack(ctx, req.tenant!.id, req.tenant!.db, readStarterPack(row.kind, row.data), body);
    await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'starter.applied', target: params.id, metadata: { ...result } });
    return { data: result };
  });

  return r.router;
}
