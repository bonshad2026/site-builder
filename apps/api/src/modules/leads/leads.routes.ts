import { LEAD_STATUSES, leadUpdateSchema, requestTypeSlug } from '@site-builder/shared';
import { z } from 'zod';
import { notFound } from '../../common/errors.js';
import { ApiRouter, idParam, pageMeta, paginationQuery } from '../../common/http.js';
import { requireModule, requirePermission } from '../../middleware/tenant.js';
import { auditTenant } from '../audit/audit.js';

const COLUMNS = `id, type, name, email, phone, project_type AS "projectType", budget, message, source_path AS "sourcePath",
  status, notes, details, created_at AS "createdAt", updated_at AS "updatedAt"`;

/** Owner/staff inbox for customer requests. Visitors submit through the public routes. */
export function leadsRoutes() {
  const r = new ApiRouter('/api/v1/sites/:siteId/leads', 'Leads', true);
  r.router.use(requireModule('leads'));

  r.route(
    {
      method: 'get',
      path: '/',
      summary: 'List customer requests, newest first (optionally of one status and/or request type)',
      query: paginationQuery.extend({ status: z.enum(LEAD_STATUSES).optional(), type: requestTypeSlug.optional() }),
      middleware: [requirePermission('leads:read')],
    },
    async ({ req, query }) => {
      const { rows } = await req.tenant!.db.query(
        `SELECT ${COLUMNS}, count(*) OVER()::int AS total FROM leads WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR type = $2)
          ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
        [query.status ?? null, query.type ?? null, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return { data: rows.map(({ total: _t, ...row }) => row), meta: pageMeta(query.page, query.pageSize, rows[0]?.total ?? 0) };
    },
  );

  r.route({ method: 'get', path: '/:id', summary: 'Get a customer request', params: idParam, middleware: [requirePermission('leads:read')] }, async ({ req, params }) => {
    const { rows } = await req.tenant!.db.query(`SELECT ${COLUMNS} FROM leads WHERE id = $1`, [params.id]);
    if (!rows[0]) throw notFound('Lead');
    return { data: rows[0] };
  });

  r.route(
    { method: 'patch', path: '/:id', summary: 'Change status and/or add a note', params: idParam, body: leadUpdateSchema, middleware: [requirePermission('leads:write')] },
    async ({ req, params, body }) => {
      const note = body.note ? JSON.stringify([{ text: body.note, by: req.auth!.user.id, at: new Date().toISOString() }]) : null;
      const { rows } = await req.tenant!.db.query(
        `UPDATE leads SET status = COALESCE($2, status), notes = CASE WHEN $3::jsonb IS NULL THEN notes ELSE notes || $3::jsonb END, updated_at = now()
          WHERE id = $1 RETURNING ${COLUMNS}`,
        [params.id, body.status ?? null, note],
      );
      if (!rows[0]) throw notFound('Lead');
      await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'lead.updated', target: params.id, metadata: { status: body.status } });
      return { data: rows[0] };
    },
  );

  return r.router;
}
