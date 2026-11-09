import { siteSettingsSchema, withSettingDefaults, type SiteSettings } from '@site-builder/shared';
import { z } from 'zod';
import { badRequest, notFound } from '../../common/errors.js';
import { ApiRouter } from '../../common/http.js';
import { requirePlatformAdmin } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/tenant.js';
import { auditTenant } from '../audit/audit.js';

type RequestTypes = SiteSettings['requestTypes'];

/**
 * A client's edit of the request types: they may rename types and stages and change the texts
 * sent to customers. Fields, stages, their order, payment and access stay as the operator made them.
 */
function clientRequestTypes(stored: unknown, incoming: RequestTypes): RequestTypes {
  const parsed = siteSettingsSchema.shape.requestTypes.safeParse(stored ?? undefined);
  const current = parsed.success ? parsed.data : siteSettingsSchema.shape.requestTypes.parse(undefined);
  return current.map((t) => {
    const edit = incoming.find((x) => x.slug === t.slug);
    if (!edit) return t;
    const workflow = t.workflow && {
      ...t.workflow,
      stages: t.workflow.stages.map((s) => {
        const e = edit.workflow?.stages.find((x) => x.key === s.key);
        return e ? { ...s, label: e.label, customerLabel: e.customerLabel, message: e.message } : s;
      }),
    };
    // Button and thank-you texts are the client's too; columns and steps stay the design.
    const layout = { ...t.layout, submitLabel: edit.layout.submitLabel, nextLabel: edit.layout.nextLabel, backLabel: edit.layout.backLabel, successTitle: edit.layout.successTitle, successText: edit.layout.successText };
    return { ...t, label: edit.label, workflow, layout };
  });
}

/** `clientLocked`: only the operator (platform admin) may change the design settings. */
export function siteRoutes(clientLocked = false) {
  const r = new ApiRouter('/api/v1/sites/:siteId', 'Site settings', true);

  r.route({ method: 'get', path: '/', summary: 'Site summary and the caller’s role in it' }, async ({ req }) => {
    const t = req.tenant!;
    return { data: { siteId: t.slug, name: t.name, role: t.role, permissions: [...t.permissions] } };
  });

  r.route({ method: 'get', path: '/settings', summary: 'Get site settings (brand, theme, contact, menu, modules, SEO)' }, async ({ req }) => {
    const { rows } = await req.tenant!.db.query('SELECT settings, updated_at AS "updatedAt" FROM site_settings WHERE id = 1');
    if (!rows[0]) throw notFound('Site settings');
    return { data: withSettingDefaults(rows[0].settings), meta: { updatedAt: rows[0].updatedAt } };
  });

  r.route(
    { method: 'put', path: '/settings', summary: 'Replace site settings', body: siteSettingsSchema, middleware: [requirePermission('site:write')] },
    async ({ req, body }) => {
      if (clientLocked && !req.auth!.user.isPlatformAdmin) {
        const current = await req.tenant!.db.query('SELECT settings FROM site_settings WHERE id = 1');
        if (!current.rows[0]) throw notFound('Site settings');
        // Clients edit their name, tagline, logo, contact details, social links, product categories,
        // request type names and customer texts, form choices, footer, shop rules and who is notified;
        // the rest (forms, workflows, accounts, the site's built-in texts) is the operator's.
        // Owners can change a numeric ownership code, but arbitrary page code stays operator-only.
        const { name, tagline, logoAssetId, logoUrl, contact, social, socialDisplay, productCategories, formOptions, footer, shop, exportOptions, notifications, announcement, popup } = body;
        const requestTypes = clientRequestTypes(current.rows[0].settings.requestTypes, body.requestTypes);
        body = { ...current.rows[0].settings, meta: { ...current.rows[0].settings.meta, enamadCode: body.meta.enamadCode }, name, tagline, logoAssetId, logoUrl, contact, social, socialDisplay, productCategories, requestTypes, formOptions, footer, shop, exportOptions, notifications, announcement, popup };
      }
      const { rows } = await req.tenant!.db.query(
        `INSERT INTO site_settings (id, settings, updated_by, updated_at) VALUES (1, $1, $2, now())
         ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING settings`,
        [body, req.auth!.user.id],
      );
      await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'site.settings_updated' });
      return { data: rows[0].settings };
    },
  );

  r.route(
    {
      method: 'post',
      path: '/business-data/clear',
      summary: 'Delete every customer account and order (operator only; requests, catalog and design stay)',
      middleware: [requirePlatformAdmin],
      body: z.object({ confirm: z.string() }),
    },
    async ({ req, body }) => {
      const t = req.tenant!;
      if (body.confirm !== t.slug) throw badRequest('Type the site id to confirm');
      const client = await t.db.connect();
      try {
        await client.query('BEGIN');
        // Order payments block deleting their orders; request payments stay with their requests.
        await client.query('DELETE FROM payments WHERE order_id IS NOT NULL');
        const orders = await client.query('DELETE FROM orders');
        const customers = await client.query('DELETE FROM customers');
        await client.query('DELETE FROM customer_codes');
        await client.query('ALTER SEQUENCE order_number_seq RESTART WITH 1001');
        await auditTenant(client, { actorUserId: req.auth!.user.id, action: 'business_data.cleared', metadata: { orders: orders.rowCount, customers: customers.rowCount } });
        await client.query('COMMIT');
        return { data: { orders: orders.rowCount ?? 0, customers: customers.rowCount ?? 0 } };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  );

  return r.router;
}
