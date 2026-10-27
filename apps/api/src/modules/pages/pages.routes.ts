import { pageInputSchema } from '@site-builder/shared';
import { z } from 'zod';
import { badRequest, notFound } from '../../common/errors.js';
import { ApiRouter, idParam } from '../../common/http.js';
import { withTransaction } from '../../database/tenant/pools.js';
import { requirePermission } from '../../middleware/tenant.js';
import { auditTenant } from '../audit/audit.js';

const SUMMARY = `id, slug, title, is_home AS "isHome", position, published_at AS "publishedAt",
  published_version AS "publishedVersion", (published IS NOT NULL) AS "isPublished",
  (published IS NULL OR draft <> published OR title <> published_title OR seo <> published_seo) AS "hasUnpublishedChanges",
  draft_updated_at AS "draftUpdatedAt"`;

const DETAIL = `${SUMMARY}, seo, draft AS document, published AS "publishedDocument"`;

/**
 * Pages hold a draft and a published copy. Editors change the draft; visitors
 * only ever receive the published copy (see the public routes). Each publish is
 * stored as a version that can be restored into the draft.
 */
export function pagesRoutes() {
  const r = new ApiRouter('/api/v1/sites/:siteId/pages', 'Pages', true);
  const canWrite = requirePermission('pages:write');

  r.route({ method: 'get', path: '/', summary: 'List pages with publish state' }, async ({ req }) => {
    const { rows } = await req.tenant!.db.query(`SELECT ${SUMMARY} FROM pages ORDER BY is_home DESC, position, created_at`);
    return { data: rows };
  });

  r.route({ method: 'post', path: '/', summary: 'Create a page (as draft)', status: 201, body: pageInputSchema, middleware: [canWrite] }, async ({ req, body }) => {
    const page = await withTransaction(req.tenant!.db, async (db) => {
      if (body.isHome) await db.query('UPDATE pages SET is_home = false WHERE is_home');
      const { rows } = await db.query(
        `INSERT INTO pages (slug, title, is_home, position, seo, draft) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${DETAIL}`,
        [body.slug, body.title, body.isHome, body.position, body.seo, body.document],
      );
      return rows[0];
    });
    await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'page.created', target: page.id });
    return { data: page };
  });

  r.route(
    { method: 'put', path: '/order', summary: 'Reorder pages', body: z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }), middleware: [canWrite] },
    async ({ req, body }) => {
      await withTransaction(req.tenant!.db, async (db) => {
        for (const [position, id] of body.ids.entries()) await db.query('UPDATE pages SET position = $2 WHERE id = $1', [id, position]);
      });
      const { rows } = await req.tenant!.db.query(`SELECT ${SUMMARY} FROM pages ORDER BY is_home DESC, position, created_at`);
      return { data: rows };
    },
  );

  r.route({ method: 'get', path: '/:id', summary: 'Get a page with its draft and published documents', params: idParam }, async ({ req, params }) => {
    const { rows } = await req.tenant!.db.query(`SELECT ${DETAIL} FROM pages WHERE id = $1`, [params.id]);
    if (!rows[0]) throw notFound('Page');
    return { data: rows[0] };
  });

  r.route(
    { method: 'patch', path: '/:id', summary: 'Update the draft (title, slug, SEO, document) or home flag', params: idParam, body: pageInputSchema.partial(), middleware: [canWrite] },
    async ({ req, params, body }) => {
      const page = await withTransaction(req.tenant!.db, async (db) => {
        if (body.isHome === false) {
          const current = await db.query('SELECT is_home FROM pages WHERE id = $1', [params.id]);
          if (current.rows[0]?.is_home) throw badRequest('Choose another home page instead of unsetting this one');
        }
        if (body.isHome) await db.query('UPDATE pages SET is_home = false WHERE is_home AND id <> $1', [params.id]);
        const { rows } = await db.query(
          `UPDATE pages SET slug = COALESCE($2, slug), title = COALESCE($3, title), is_home = COALESCE($4, is_home),
                  position = COALESCE($5, position), seo = COALESCE($6, seo), draft = COALESCE($7, draft),
                  draft_updated_at = CASE WHEN $7::jsonb IS NULL THEN draft_updated_at ELSE now() END, updated_at = now()
            WHERE id = $1 RETURNING ${DETAIL}`,
          [params.id, body.slug ?? null, body.title ?? null, body.isHome ?? null, body.position ?? null, body.seo ?? null, body.document ?? null],
        );
        return rows[0];
      });
      if (!page) throw notFound('Page');
      return { data: page };
    },
  );

  r.route({ method: 'post', path: '/:id/publish', summary: 'Publish the current draft', params: idParam, middleware: [canWrite] }, async ({ req, params }) => {
    const page = await withTransaction(req.tenant!.db, async (db) => {
      const { rows } = await db.query(
        `UPDATE pages SET published = draft, published_title = title, published_seo = seo, published_at = now(),
                published_version = published_version + 1, updated_at = now()
          WHERE id = $1 RETURNING id, published_version, draft, title, seo`,
        [params.id],
      );
      const row = rows[0];
      if (!row) throw notFound('Page');
      await db.query('INSERT INTO page_versions (page_id, version, document, title, seo, published_by) VALUES ($1, $2, $3, $4, $5, $6)', [
        row.id,
        row.published_version,
        row.draft,
        row.title,
        row.seo,
        req.auth!.user.id,
      ]);
      const detail = await db.query(`SELECT ${DETAIL} FROM pages WHERE id = $1`, [params.id]);
      return detail.rows[0];
    });
    await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'page.published', target: params.id, metadata: { version: page.publishedVersion } });
    return { data: page };
  });

  r.route({ method: 'post', path: '/:id/unpublish', summary: 'Hide the page from visitors (draft is kept)', params: idParam, middleware: [canWrite] }, async ({ req, params }) => {
    const { rows } = await req.tenant!.db.query(
      `UPDATE pages SET published = NULL, published_title = NULL, published_seo = NULL, published_at = NULL, updated_at = now()
        WHERE id = $1 AND NOT is_home RETURNING ${DETAIL}`,
      [params.id],
    );
    if (!rows[0]) throw badRequest('Page not found, or it is the home page (which cannot be unpublished)');
    await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'page.unpublished', target: params.id });
    return { data: rows[0] };
  });

  r.route({ method: 'get', path: '/:id/versions', summary: 'Published versions of a page', params: idParam }, async ({ req, params }) => {
    const { rows } = await req.tenant!.db.query(
      `SELECT version, published_at AS "publishedAt", published_by AS "publishedBy" FROM page_versions WHERE page_id = $1 ORDER BY version DESC`,
      [params.id],
    );
    return { data: rows };
  });

  r.route(
    {
      method: 'post',
      path: '/:id/versions/:version/restore',
      summary: 'Copy a published version back into the draft',
      params: idParam.extend({ version: z.coerce.number().int().min(1) }),
      middleware: [canWrite],
    },
    async ({ req, params }) => {
      const { rows } = await req.tenant!.db.query(
        `UPDATE pages p SET draft = v.document, title = v.title, seo = v.seo, draft_updated_at = now(), updated_at = now()
           FROM page_versions v WHERE p.id = $1 AND v.page_id = p.id AND v.version = $2 RETURNING p.id`,
        [params.id, params.version],
      );
      if (!rows[0]) throw notFound('Page version');
      const detail = await req.tenant!.db.query(`SELECT ${DETAIL} FROM pages WHERE id = $1`, [params.id]);
      return { data: detail.rows[0] };
    },
  );

  r.route({ method: 'delete', path: '/:id', summary: 'Delete a page (not the home page)', params: idParam, middleware: [canWrite] }, async ({ req, params }) => {
    const { rows } = await req.tenant!.db.query('SELECT is_home FROM pages WHERE id = $1', [params.id]);
    if (!rows[0]) throw notFound('Page');
    if (rows[0].is_home) throw badRequest('The home page cannot be deleted');
    await req.tenant!.db.query('DELETE FROM pages WHERE id = $1', [params.id]);
    await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'page.deleted', target: params.id });
  });

  return r.router;
}
