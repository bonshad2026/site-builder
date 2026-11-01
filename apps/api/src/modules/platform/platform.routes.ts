import { demoRunSchema, emailSchema, GENERAL_BANK_TYPE, passwordSchema, siteSetupSchema, slugSchema } from '@site-builder/shared';
import { z } from 'zod';
import { badRequest, notFound } from '../../common/errors.js';
import { ApiRouter, idParam, pageMeta, paginationQuery } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import { auditPlatform } from '../audit/audit.js';
import { createUser, requestPasswordReset, revokeAllSessions } from '../auth/auth.service.js';
import { deleteTenant, provisionTenant } from './provisioning.js';
import { clearDemoData, demoCounts, generateDemo } from './setup/demo.js';
import { applySetup } from './templates/apply.js';
import { refreshTemplatePhotos } from './templates/images.js';
import { SITE_TEMPLATES, templateByKey } from './templates/catalog.js';

// Never select db_password_enc here: connection secrets are not returned by any API.
const TENANT_COLUMNS = `t.id, t.slug, t.name, t.status, t.db_name AS "dbName", t.provisioning_step AS "provisioningStep",
  t.last_error AS "lastError", t.schema_version AS "schemaVersion", t.created_at AS "createdAt", t.activated_at AS "activatedAt",
  (SELECT domain FROM tenant_domains d WHERE d.tenant_id = t.id AND d.is_primary) AS "primaryDomain",
  (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = t.id AND m.role = 'owner' LIMIT 1) AS "ownerEmail"`;

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, 'Invalid domain');

export function platformRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/platform', 'Platform', true);

  async function getTenant(id: string) {
    const { rows } = await ctx.control.query(`SELECT ${TENANT_COLUMNS} FROM tenants t WHERE t.id = $1`, [id]);
    if (!rows[0]) throw notFound('Site');
    return rows[0];
  }

  r.route(
    { method: 'get', path: '/tenants', summary: 'List client sites', query: paginationQuery.extend({ q: z.string().max(100).optional() }) },
    async ({ query }) => {
      const filter = query.q ? `%${query.q}%` : null;
      const { rows } = await ctx.control.query(
        `SELECT ${TENANT_COLUMNS}, count(*) OVER()::int AS total FROM tenants t
          WHERE $1::text IS NULL OR t.slug ILIKE $1 OR t.name ILIKE $1
          ORDER BY t.created_at DESC LIMIT $2 OFFSET $3`,
        [filter, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const total = rows[0]?.total ?? 0;
      return { data: rows.map(({ total: _t, ...row }) => row), meta: pageMeta(query.page, query.pageSize, total) };
    },
  );

  r.route(
    {
      method: 'post',
      path: '/tenants',
      summary: 'Create a client site with its own database',
      status: 201,
      body: z.object({
        slug: slugSchema,
        name: z.string().trim().min(2).max(120),
        ownerEmail: emailSchema,
        domain: domainSchema.optional(),
        /** Kind of business: fills the new site with matching pages, products and photos. */
        template: z.string().max(40).optional(),
        /** Pages, menus, forms, buttons, filters, tables, accounts and sample data to start with. */
        setup: siteSetupSchema.optional(),
      }),
    },
    async ({ req, body }) => {
      const template = body.template ? templateByKey(body.template) : undefined;
      if (body.template && !template) throw badRequest('Unknown business type');
      // A cell holds exactly one client; new clients get their own cell from the control panel.
      if (ctx.env.CELL_SLUG) throw badRequest('This stack serves a single client; create new clients from the control panel');
      const { template: _t, setup, ...input } = body;
      const tenant = await provisionTenant(ctx, { ...input, actorUserId: req.auth!.user.id });
      const result = (template || setup) && tenant.status === 'active' ? await applySetup(ctx, tenant, template, body.name, setup) : null;
      // The site's type picks its bank of sample texts and photos later on.
      await ctx.control.query('UPDATE tenants SET business_type = $2 WHERE id = $1', [tenant.id, template?.key ?? (setup ? GENERAL_BANK_TYPE : '')]);
      // An empty site starts with no pages at all (not even the placeholder home page).
      if (!template && !setup && tenant.status === 'active') {
        const db = ctx.tenantPools.get({ id: tenant.id, dbName: tenant.db_name, dbUser: tenant.db_user, dbPasswordEnc: tenant.db_password_enc! });
        await db.query('DELETE FROM pages');
        // …and without the shop or the built-in tables (products, categories, services, projects…);
        // the operator turns modules on in Settings when the site needs them.
        await db.query(
          `UPDATE site_settings SET settings = jsonb_set(settings, '{modules}', $1::jsonb) WHERE id = 1`,
          [JSON.stringify({ services: false, products: false, projects: false, testimonials: false, faq: false, leads: true, orders: false })],
        );
      }
      return { data: { ...(await getTenant(tenant.id)), setup: result } };
    },
  );

  r.route({ method: 'post', path: '/tenants/:id/refresh-photos', summary: 'Replace placeholder template photos with files now in var/demo-images', params: idParam }, async ({ params }) => {
    return { data: await refreshTemplatePhotos(ctx, await activeDb(params.id)) };
  });

  r.route({ method: 'get', path: '/templates', summary: 'Business types a new site can start from' }, async () => ({
    data: SITE_TEMPLATES.map((t) => ({ key: t.key, label: t.label, orders: t.orders, products: t.products.length })),
  }));

  async function activeDb(id: string) {
    const { rows } = await ctx.control.query('SELECT id, db_name, db_user, db_password_enc, status FROM tenants WHERE id = $1', [id]);
    const t = rows[0];
    if (!t) throw notFound('Site');
    if (t.status !== 'active') throw badRequest('Site is not active');
    return ctx.tenantPools.get({ id: t.id, dbName: t.db_name, dbUser: t.db_user, dbPasswordEnc: t.db_password_enc });
  }

  r.route({ method: 'get', path: '/tenants/:id/demo-data', summary: 'Sample data on the site, its tables and its type', params: idParam }, async ({ params }) => {
    const db = await activeDb(params.id);
    const { rows: tables } = await db.query(
      `SELECT c.slug, c.name, (SELECT count(*) FROM collection_items i WHERE i.collection_id = c.id)::int AS items FROM collections c ORDER BY c.position`,
    );
    const { rows } = await db.query(
      `SELECT (SELECT count(*) FROM products)::int AS products, (SELECT count(*) FROM services)::int AS services, (SELECT count(*) FROM customers)::int AS customers,
              (SELECT count(*) FROM orders)::int AS orders, (SELECT count(*) FROM leads)::int AS requests, settings->'modules' AS modules FROM site_settings WHERE id = 1`,
    );
    const type = (await ctx.control.query<{ business_type: string }>('SELECT business_type FROM tenants WHERE id = $1', [params.id])).rows[0].business_type;
    const { modules, ...all } = rows[0];
    return { data: { demo: await demoCounts(db), all, modules, tables, type: type || GENERAL_BANK_TYPE } };
  });

  r.route({ method: 'post', path: '/tenants/:id/demo-data', summary: 'Make sample data for the site from the content bank', params: idParam, body: demoRunSchema }, async ({ req, params, body }) => {
    const db = await activeDb(params.id);
    const t = await getTenant(params.id);
    const made = await generateDemo(ctx, db, t.slug, body);
    await ctx.control.query('UPDATE tenants SET business_type = $2 WHERE id = $1', [params.id, body.type]);
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, tenantId: params.id, action: 'tenant.demo_generated', metadata: { ...made, type: body.type, mode: body.mode } });
    return { data: made };
  });

  r.route({ method: 'delete', path: '/tenants/:id/demo-data', summary: 'Remove all sample data (products, items, customers, orders, payments, requests)', params: idParam }, async ({ req, params }) => {
    const removed = await clearDemoData(await activeDb(params.id));
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, tenantId: params.id, action: 'tenant.demo_cleared', metadata: { ...removed } });
    return { data: removed };
  });

  r.route({ method: 'get', path: '/tenants/:id', summary: 'Get a client site', params: idParam }, async ({ params }) => ({ data: await getTenant(params.id) }));

  r.route(
    {
      method: 'post',
      path: '/tenants/:id/retry',
      summary: 'Retry a failed provisioning run',
      params: idParam,
      // The owner link is made in the last step, so a failed run may need the email again.
      body: z.object({ ownerEmail: emailSchema.optional() }),
    },
    async ({ req, params, body }) => {
      const t = await getTenant(params.id);
      if (t.status === 'active') throw badRequest('Site is already active');
      const ownerEmail = t.ownerEmail ?? body.ownerEmail;
      if (!ownerEmail) throw badRequest('ownerEmail is required to retry this site');
      await provisionTenant(ctx, { slug: t.slug, name: t.name, ownerEmail, domain: t.primaryDomain ?? undefined, actorUserId: req.auth!.user.id });
      return { data: await getTenant(params.id) };
    },
  );

  r.route(
    {
      method: 'patch',
      path: '/tenants/:id',
      summary: 'Rename, suspend or re-activate a site',
      params: idParam,
      body: z.object({ name: z.string().trim().min(2).max(120).optional(), status: z.enum(['active', 'suspended']).optional() }),
    },
    async ({ req, params, body }) => {
      const t = await getTenant(params.id);
      if (body.status && !['active', 'suspended'].includes(t.status)) throw badRequest(`Cannot change status of a ${t.status} site`);
      await ctx.control.query('UPDATE tenants SET name = COALESCE($2, name), status = COALESCE($3, status), updated_at = now() WHERE id = $1', [
        params.id,
        body.name ?? null,
        body.status ?? null,
      ]);
      if (body.status === 'suspended') await ctx.tenantPools.evict(params.id);
      await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, tenantId: params.id, action: 'tenant.updated', metadata: body });
      return { data: await getTenant(params.id) };
    },
  );

  r.route(
    { method: 'put', path: '/tenants/:id/owner', summary: 'Assign the site owner (previous owner becomes staff)', params: idParam, body: z.object({ email: emailSchema }) },
    async ({ req, params, body }) => {
      await getTenant(params.id);
      let user = (await ctx.control.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [body.email])).rows[0];
      const invited = !user;
      if (!user) user = await createUser(ctx, { email: body.email });
      const client = await ctx.control.connect();
      try {
        await client.query('BEGIN');
        await client.query(`UPDATE memberships SET role = 'staff', permissions = '{}' WHERE tenant_id = $1 AND role = 'owner' AND user_id <> $2`, [params.id, user.id]);
        await client.query(
          `INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner') ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = 'owner', permissions = '{}'`,
          [user.id, params.id],
        );
        await auditPlatform(client, { actorUserId: req.auth!.user.id, tenantId: params.id, action: 'tenant.owner_changed', target: body.email });
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      if (invited) await requestPasswordReset(ctx, body.email);
      return { data: await getTenant(params.id) };
    },
  );

  r.route(
    {
      method: 'delete',
      path: '/tenants/:id',
      summary: 'Delete a client site with its database and files (cannot be undone)',
      params: idParam,
      // The site id typed again, so a site is never deleted by a slip.
      query: z.object({ confirm: z.string().max(64) }),
    },
    async ({ req, params, query }) => {
      if (ctx.env.CELL_SLUG) throw badRequest('This stack serves a single client; its site cannot be deleted here');
      const t = await getTenant(params.id);
      if (query.confirm !== t.slug) throw badRequest('Type the site id to confirm');
      const removed = await deleteTenant(ctx, params.id);
      await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, tenantId: params.id, action: 'tenant.deleted', target: t.slug, metadata: { ...removed } });
    },
  );

  r.route({ method: 'get', path: '/users', summary: 'List users', query: paginationQuery }, async ({ query }) => {
    const { rows } = await ctx.control.query(
      `SELECT id, email, phone, display_name AS "displayName", is_platform_admin AS "isPlatformAdmin", status,
              email_verified_at IS NOT NULL AS "emailVerified", created_at AS "createdAt", count(*) OVER()::int AS total
         FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [query.pageSize, (query.page - 1) * query.pageSize],
    );
    return { data: rows.map(({ total: _t, ...u }) => u), meta: pageMeta(query.page, query.pageSize, rows[0]?.total ?? 0) };
  });

  r.route(
    {
      method: 'post',
      path: '/users',
      summary: 'Create a user (without a password they receive a set-password email)',
      status: 201,
      body: z.object({ email: emailSchema, password: passwordSchema.optional(), displayName: z.string().trim().max(80).default(''), isPlatformAdmin: z.boolean().default(false) }),
    },
    async ({ req, body }) => {
      const user = await createUser(ctx, body);
      if (!body.password) await requestPasswordReset(ctx, body.email);
      await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: 'user.created', target: body.email, metadata: { isPlatformAdmin: body.isPlatformAdmin } });
      return { data: user };
    },
  );

  r.route(
    { method: 'patch', path: '/users/:id', summary: 'Enable or disable a user', params: idParam, body: z.object({ status: z.enum(['active', 'disabled']) }) },
    async ({ req, params, body }) => {
      if (params.id === req.auth!.user.id) throw badRequest('You cannot change your own status');
      const { rowCount } = await ctx.control.query('UPDATE users SET status = $2, updated_at = now() WHERE id = $1', [params.id, body.status]);
      if (!rowCount) throw notFound('User');
      if (body.status === 'disabled') await revokeAllSessions(ctx, params.id);
      await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: 'user.status_changed', target: params.id, metadata: body });
    },
  );

  r.route({ method: 'delete', path: '/users/:id', summary: 'Delete a user (not yourself, nor a site owner)', params: idParam }, async ({ req, params }) => {
    if (params.id === req.auth!.user.id) throw badRequest('You cannot delete your own account');
    const { rows } = await ctx.control.query<{ email: string | null }>('SELECT email FROM users WHERE id = $1', [params.id]);
    if (!rows[0]) throw notFound('User');
    const owned = await ctx.control.query<{ slug: string }>(`SELECT t.slug FROM memberships m JOIN tenants t ON t.id = m.tenant_id WHERE m.user_id = $1 AND m.role = 'owner'`, [params.id]);
    if (owned.rows.length) throw badRequest(`This user owns ${owned.rows.map((r) => r.slug).join(', ')}; assign another owner first`);
    await revokeAllSessions(ctx, params.id);
    await ctx.control.query('DELETE FROM users WHERE id = $1', [params.id]);
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: 'user.deleted', target: rows[0].email ?? params.id });
  });

  r.route(
    { method: 'get', path: '/audit', summary: 'Platform audit log', query: paginationQuery.extend({ tenantId: z.string().uuid().optional() }) },
    async ({ query }) => {
      const { rows } = await ctx.control.query(
        `SELECT id, actor_user_id AS "actorUserId", tenant_id AS "tenantId", action, target, metadata, created_at AS "createdAt"
           FROM audit_events WHERE $1::uuid IS NULL OR tenant_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3`,
        [query.tenantId ?? null, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return { data: rows, meta: { page: query.page, pageSize: query.pageSize } };
    },
  );

  return r.router;
}
