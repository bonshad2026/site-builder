import { collectionInputSchema, itemInputSchema, listQuerySchema, PRODUCT_SOURCE, type Collection } from '@site-builder/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { badRequest, fromPgError, notFound } from '../../common/errors.js';
import { ApiRouter, issueDetail, pageMeta } from '../../common/http.js';
import { requirePermission } from '../../middleware/tenant.js';
import type { StorageAdapter } from '../../storage/storage.js';
import { auditTenant } from '../audit/audit.js';
import {
  cleanItemData,
  COLLECTION_COLUMNS,
  fieldRange,
  findItemById,
  itemDays,
  ITEM_COLUMNS,
  listItems,
  listProductsAsItems,
  loadCollection,
  loadCollections,
  productFieldRange,
  productSourceCollection,
  publicCollection,
  toPublicItems,
} from './collections.service.js';

const toRow = (c: z.output<typeof collectionInputSchema>) => [c.slug, c.name, c.itemName, JSON.stringify(c.fields), c.detailPage, c.imageField, c.commerce, c.requestType, c.position];

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw fromPgError(err) ?? err;
  }
}

/**
 * Admin routes for content tables. Defining tables is building the site (operator only on a
 * client's server); adding and editing items is content, like products (catalog:write).
 */
export function collectionsRoutes(storage: StorageAdapter, operatorOnly: RequestHandler) {
  const r = new ApiRouter('/api/v1/sites/:siteId/collections', 'Content tables', true);
  const structure = [operatorOnly, requirePermission('site:write')];
  const write = requirePermission('catalog:write');
  const collectionParam = z.object({ collectionId: z.string().uuid() });
  const itemParam = collectionParam.extend({ itemId: z.string().uuid() });

  r.route({ method: 'get', path: '/', summary: 'Content tables of the site' }, async ({ req }) => {
    const db = req.tenant!.db;
    const tables = await loadCollections(db);
    const { rows } = await db.query<{ id: string; n: number }>(`SELECT collection_id AS id, count(*)::int AS n FROM collection_items GROUP BY collection_id`);
    const counts = new Map(rows.map((x) => [x.id, x.n]));
    return { data: tables.map((t) => ({ ...t, itemCount: counts.get(t.id) ?? 0 })) };
  });

  r.route({ method: 'post', path: '/', summary: 'Create a content table', status: 201, body: collectionInputSchema, middleware: structure }, async ({ req, body }) => {
    const { rows } = await run(() =>
      req.tenant!.db.query(
        `INSERT INTO collections (slug, name, item_name, fields, detail_page, image_field, commerce, request_type, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${COLLECTION_COLUMNS}`,
        toRow(body),
      ),
    );
    await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'collection.created', target: rows[0].id });
    return { data: rows[0] };
  });

  r.route({ method: 'get', path: '/:collectionId', summary: 'A content table', params: collectionParam }, async ({ req, params }) => {
    return { data: await loadCollection(req.tenant!.db, params.collectionId) };
  });

  r.route(
    { method: 'put', path: '/:collectionId', summary: 'Change a content table (its slug cannot change)', params: collectionParam, body: collectionInputSchema, middleware: structure },
    async ({ req, params, body }) => {
      const current = await loadCollection(req.tenant!.db, params.collectionId);
      // Links, references and saved pages use the slug.
      if (body.slug !== current.slug) throw badRequest('The address (slug) of a table cannot be changed');
      const { rows } = await run(() =>
        req.tenant!.db.query(
          `UPDATE collections SET name = $2, item_name = $3, fields = $4, detail_page = $5, image_field = $6, commerce = $7, request_type = $8, position = $9, updated_at = now()
            WHERE id = $1 RETURNING ${COLLECTION_COLUMNS}`,
          [params.collectionId, ...toRow(body).slice(1)],
        ),
      );
      await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'collection.updated', target: params.collectionId });
      return { data: rows[0] };
    },
  );

  r.route({ method: 'delete', path: '/:collectionId', summary: 'Delete a content table and its items', params: collectionParam, middleware: structure }, async ({ req, params }) => {
    const { rowCount } = await req.tenant!.db.query('DELETE FROM collections WHERE id = $1', [params.collectionId]);
    if (!rowCount) throw notFound('Table');
    await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'collection.deleted', target: params.collectionId });
  });

  /* ---------- items ---------- */

  r.route(
    {
      method: 'get',
      path: '/:collectionId/items',
      summary: 'Items of a table (all statuses)',
      params: collectionParam,
      query: z.object({
        q: z.string().max(100).default(''),
        status: z.enum(['draft', 'published']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
      }),
    },
    async ({ req, params, query }) => {
      const db = req.tenant!.db;
      const table = await loadCollection(db, params.collectionId);
      const { rows: list, total } = await listItems(db, table, listQuerySchema.parse({ q: query.q, page: query.page, pageSize: Math.min(query.pageSize, 60) }), {
        publishedOnly: false,
        status: query.status,
      });
      const preview = await toPublicItems(db, storage, table, list);
      return {
        // `previewData`: the same values with image URLs and referenced items, for the editor.
        data: list.map((row, i) => ({ ...row, imageUrl: preview[i]?.imageUrl ?? null, availability: preview[i]?.availability, previewData: preview[i]?.data ?? {} })),
        meta: pageMeta(query.page, Math.min(query.pageSize, 60), total),
      };
    },
  );

  r.route({ method: 'post', path: '/:collectionId/items', summary: 'Add an item', status: 201, params: collectionParam, body: itemInputSchema, middleware: [write] }, async ({ req, params, body }) => {
    const db = req.tenant!.db;
    const table = await loadCollection(db, params.collectionId);
    const data = cleanItemData(table, body.data);
    const { rows } = await run(() =>
      db.query(
        `INSERT INTO collection_items (collection_id, slug, title, data, status, position) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${ITEM_COLUMNS}`,
        [table.id, body.slug, body.title, data, body.status, body.position],
      ),
    );
    await auditTenant(db, { actorUserId: req.auth!.user.id, action: 'item.created', target: rows[0].id, metadata: { collection: table.slug } });
    return { data: rows[0] };
  });

  r.route({ method: 'get', path: '/:collectionId/items/:itemId', summary: 'An item', params: itemParam }, async ({ req, params }) => {
    const item = await findItemById(req.tenant!.db, params.itemId);
    if (!item || item.collectionId !== params.collectionId) throw notFound('Item');
    return { data: item };
  });

  r.route(
    { method: 'put', path: '/:collectionId/items/:itemId', summary: 'Change an item', params: itemParam, body: itemInputSchema, middleware: [write] },
    async ({ req, params, body }) => {
      const db = req.tenant!.db;
      const table = await loadCollection(db, params.collectionId);
      const data = cleanItemData(table, body.data);
      const { rows } = await run(() =>
        db.query(
          `UPDATE collection_items SET slug = $3, title = $4, data = $5, status = $6, position = $7, updated_at = now()
            WHERE id = $1 AND collection_id = $2 RETURNING ${ITEM_COLUMNS}`,
          [params.itemId, table.id, body.slug, body.title, data, body.status, body.position],
        ),
      );
      if (!rows[0]) throw notFound('Item');
      await auditTenant(db, { actorUserId: req.auth!.user.id, action: 'item.updated', target: params.itemId, metadata: { collection: table.slug } });
      return { data: rows[0] };
    },
  );

  r.route({ method: 'delete', path: '/:collectionId/items/:itemId', summary: 'Delete an item', params: itemParam, middleware: [write] }, async ({ req, params }) => {
    const { rowCount } = await req.tenant!.db.query('DELETE FROM collection_items WHERE id = $1 AND collection_id = $2', [params.itemId, params.collectionId]);
    if (!rowCount) throw notFound('Item');
    await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'item.deleted', target: params.itemId });
  });

  /** Items of any table (or products) in the public shape, drafts included: the box designer's preview. */
  r.route(
    { method: 'get', path: '/preview/:source', summary: 'Sample items for the box designer', params: z.object({ source: z.string().max(40) }) },
    async ({ req, params }) => {
      const db = req.tenant!.db;
      if (params.source === PRODUCT_SOURCE) return { data: (await listProductsAsItems(db, storage, listQuerySchema.parse({ pageSize: 6 }))).data };
      const table = await loadCollection(db, params.source);
      const { rows } = await listItems(db, table, listQuerySchema.parse({ pageSize: 6 }), { publishedOnly: false });
      // `status`: drafts are previewed here but never shown on the site.
      return { data: (await toPublicItems(db, storage, table, rows)).map((item, i) => ({ ...item, status: rows[i].status })) };
    },
  );

  return r.router;
}

/** Query string of the public list route: filters travel as JSON (they come from the page's section). */
const publicListQuery = z.object({
  filters: z.string().max(4000).optional(),
  choices: z.string().max(2000).optional(),
  visitor: z.string().max(4000).optional(),
  q: z.string().max(100).optional(),
  sort: z.string().max(40).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(60).optional(),
  current: z.string().uuid().optional(),
});

function parseListQuery(q: z.output<typeof publicListQuery>) {
  const json = (s: string | undefined, fallback: unknown) => {
    if (!s) return fallback;
    try {
      return JSON.parse(s);
    } catch {
      throw badRequest('Invalid filters');
    }
  };
  const parsed = listQuerySchema.safeParse({ ...q, filters: json(q.filters, []), choices: json(q.choices, {}), visitor: json(q.visitor, []) });
  if (!parsed.success) throw badRequest('Invalid list query', parsed.error.issues.map(issueDetail));
  return parsed.data;
}

/** Published items for visitors (registered on the public site router). */
export function registerPublicCollectionRoutes(r: ApiRouter, storage: StorageAdapter) {
  r.route({ method: 'get', path: '/collections', summary: 'Content tables (definitions only)' }, async ({ req }) => {
    const db = req.tenant!.db;
    const shop = (await db.query(`SELECT settings->'shop'->>'currency' AS currency FROM site_settings WHERE id = 1`)).rows[0]?.currency ?? 'IRR';
    return { data: [...(await loadCollections(db)).map(publicCollection), productSourceCollection(shop)] };
  });

  r.route(
    { method: 'get', path: '/collections/:collection/items', summary: 'Published items with filters, search, sort and pages', params: z.object({ collection: z.string().max(40) }), query: publicListQuery },
    async ({ req, params, query }) => {
      const db = req.tenant!.db;
      const list = parseListQuery(query);
      if (params.collection === PRODUCT_SOURCE) {
        const { data, total } = await listProductsAsItems(db, storage, list);
        return { data, meta: pageMeta(list.page, list.pageSize, total) };
      }
      const tables = await loadCollections(db);
      const table = tables.find((t) => t.slug === params.collection);
      if (!table) throw notFound('Table');
      const { rows, total } = await listItems(db, table, list, { publishedOnly: true });
      return { data: await toPublicItems(db, storage, table, rows, tables), meta: pageMeta(list.page, list.pageSize, total) };
    },
  );

  r.route(
    {
      method: 'get',
      path: '/collections/:collection/range',
      summary: 'Smallest and largest value of a number or date field (slider bounds)',
      params: z.object({ collection: z.string().max(40) }),
      query: z.object({ field: z.string().max(40) }),
    },
    async ({ req, params, query }) => {
      const db = req.tenant!.db;
      if (params.collection === PRODUCT_SOURCE) return { data: await productFieldRange(db, query.field) };
      const table = (await loadCollections(db)).find((t) => t.slug === params.collection);
      if (!table) throw notFound('Table');
      return { data: await fieldRange(db, table, query.field) };
    },
  );

  r.route(
    {
      method: 'get',
      path: '/collections/:collection/days',
      summary: 'Days that have items (for the calendar filter)',
      params: z.object({ collection: z.string().max(40) }),
      query: z.object({ field: z.string().max(40), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    },
    async ({ req, params, query }) => {
      const db = req.tenant!.db;
      const table = (await loadCollections(db)).find((t) => t.slug === params.collection);
      if (!table) return { data: [] };
      return { data: await itemDays(db, table, query.field, query.from, query.to) };
    },
  );

  r.route(
    { method: 'get', path: '/collections/:collection/items/:slug', summary: 'One published item', params: z.object({ collection: z.string().max(40), slug: z.string().min(1).max(80) }) },
    async ({ req, params }) => {
      const db = req.tenant!.db;
      const tables = await loadCollections(db);
      const table: Collection | undefined = tables.find((t) => t.slug === params.collection);
      if (!table) throw notFound('Table');
      const { rows } = await db.query(`SELECT ${ITEM_COLUMNS} FROM collection_items WHERE collection_id = $1 AND slug = $2 AND status = 'published'`, [table.id, params.slug]);
      if (!rows[0]) throw notFound('Item');
      return { data: (await toPublicItems(db, storage, table, rows, tables))[0] };
    },
  );
}
