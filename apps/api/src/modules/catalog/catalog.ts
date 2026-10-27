import { productInputSchema, serviceInputSchema, type ModuleId, type Permission } from '@site-builder/shared';
import { z, type AnyZodObject } from 'zod';
import { notFound } from '../../common/errors.js';
import { ApiRouter, idParam, pageMeta, paginationQuery } from '../../common/http.js';
import { buildInsert, buildUpdate, selectList, type TableDef } from '../../common/sql.js';
import { requireModule, requirePermission } from '../../middleware/tenant.js';
import type { StorageAdapter } from '../../storage/storage.js';
import { withImageUrls } from '../assets/urls.js';
import { auditTenant } from '../audit/audit.js';

export const servicesTable: TableDef = {
  table: 'services',
  columns: {
    slug: 'slug',
    title: 'title',
    summary: 'summary',
    body: 'body',
    imageAssetId: 'image_asset_id',
    duration: 'duration',
    startingFrom: 'starting_from',
    deliverables: 'deliverables',
    process: 'process',
    status: 'status',
    position: 'position',
    seo: 'seo',
  },
  json: new Set(['title', 'summary', 'body', 'duration', 'startingFrom', 'deliverables', 'process', 'seo']),
};

export const productsTable: TableDef = {
  table: 'products',
  columns: {
    slug: 'slug',
    name: 'name',
    description: 'description',
    category: 'category',
    priceMinor: 'price_minor',
    currency: 'currency',
    stock: 'stock',
    isAvailable: 'is_available',
    featured: 'featured',
    materials: 'materials',
    dimensions: 'dimensions',
    leadTime: 'lead_time',
    imageAssetId: 'image_asset_id',
    status: 'status',
    position: 'position',
    seo: 'seo',
  },
  json: new Set(['name', 'description', 'materials', 'leadTime', 'seo']),
};

interface CatalogConfig {
  storage: StorageAdapter;
  path: string;
  tag: string;
  module: ModuleId;
  table: TableDef;
  input: AnyZodObject;
  label: string;
}

/** Admin CRUD for one catalog type. Reads need membership; writes need catalog:write. */
function catalogRoutes({ path, tag, module, table, input, label, storage }: CatalogConfig) {
  const r = new ApiRouter(`/api/v1/sites/:siteId/${path}`, tag, true);
  const write: Permission = 'catalog:write';
  r.router.use(requireModule(module));

  r.route(
    {
      method: 'get',
      path: '/',
      summary: `List ${path} (all statuses)`,
      query: paginationQuery.extend({ status: z.enum(['draft', 'published', 'archived']).optional(), q: z.string().max(100).optional() }),
    },
    async ({ req, query }) => {
      const { rows } = await req.tenant!.db.query(
        `SELECT ${selectList(table)}, count(*) OVER()::int AS total FROM ${table.table}
          WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR slug ILIKE $2 OR ${table.table === 'products' ? 'name' : 'title'}::text ILIKE $2)
          ORDER BY position, created_at LIMIT $3 OFFSET $4`,
        [query.status ?? null, query.q ? `%${query.q}%` : null, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const data = await withImageUrls(req.tenant!.db, storage, rows.map(({ total: _t, ...row }) => row));
      return { data, meta: pageMeta(query.page, query.pageSize, rows[0]?.total ?? 0) };
    },
  );

  r.route({ method: 'post', path: '/', summary: `Create ${label}`, status: 201, body: input, middleware: [requirePermission(write)] }, async ({ req, body }) => {
    const { sql, values } = buildInsert(table, body);
    const { rows } = await req.tenant!.db.query(sql, values);
    await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: `${path}.created`, target: rows[0].id });
    return { data: rows[0] };
  });

  r.route({ method: 'get', path: '/:id', summary: `Get ${label}`, params: idParam }, async ({ req, params }) => {
    const { rows } = await req.tenant!.db.query(`SELECT ${selectList(table)} FROM ${table.table} WHERE id = $1`, [params.id]);
    if (!rows[0]) throw notFound(label);
    return { data: (await withImageUrls(req.tenant!.db, storage, rows))[0] };
  });

  r.route(
    { method: 'patch', path: '/:id', summary: `Update ${label}`, params: idParam, body: input.partial(), middleware: [requirePermission(write)] },
    async ({ req, params, body }) => {
      const { sql, values } = buildUpdate(table, params.id, body);
      const { rows } = await req.tenant!.db.query(sql, values);
      if (!rows[0]) throw notFound(label);
      await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: `${path}.updated`, target: params.id });
      return { data: rows[0] };
    },
  );

  r.route({ method: 'delete', path: '/:id', summary: `Delete ${label}`, params: idParam, middleware: [requirePermission(write)] }, async ({ req, params }) => {
    const { rowCount } = await req.tenant!.db.query(`DELETE FROM ${table.table} WHERE id = $1`, [params.id]);
    if (!rowCount) throw notFound(label);
    await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: `${path}.deleted`, target: params.id });
  });

  return r.router;
}

export const servicesRoutes = (storage: StorageAdapter) =>
  catalogRoutes({ storage, path: 'services', tag: 'Services', module: 'services', table: servicesTable, input: serviceInputSchema, label: 'Service' });

export const productsRoutes = (storage: StorageAdapter) =>
  catalogRoutes({ storage, path: 'products', tag: 'Products', module: 'products', table: productsTable, input: productInputSchema, label: 'Product' });
