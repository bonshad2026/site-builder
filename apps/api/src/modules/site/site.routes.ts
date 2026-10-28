import { siteSettingsSchema } from '@site-builder/shared';
import { notFound } from '../../common/errors.js';
import { ApiRouter } from '../../common/http.js';
import { requirePermission } from '../../middleware/tenant.js';
import { auditTenant } from '../audit/audit.js';

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
    return { data: rows[0].settings, meta: { updatedAt: rows[0].updatedAt } };
  });

  r.route(
    { method: 'put', path: '/settings', summary: 'Replace site settings', body: siteSettingsSchema, middleware: [requirePermission('site:write')] },
    async ({ req, body }) => {
      if (clientLocked && !req.auth!.user.isPlatformAdmin) {
        const current = await req.tenant!.db.query('SELECT settings FROM site_settings WHERE id = 1');
        if (!current.rows[0]) throw notFound('Site settings');
        // Clients edit their name, tagline, logo, contact details and product categories; the rest is the design.
        const { name, tagline, logoAssetId, logoUrl, contact, productCategories } = body;
        body = { ...current.rows[0].settings, name, tagline, logoAssetId, logoUrl, contact, productCategories };
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

  return r.router;
}
