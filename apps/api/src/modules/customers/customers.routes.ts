import { z } from 'zod';
import { notFound } from '../../common/errors.js';
import { ApiRouter, idParam, pageMeta, paginationQuery } from '../../common/http.js';
import { requirePermission } from '../../middleware/tenant.js';
import { auditTenant } from '../audit/audit.js';

/** The site's customer accounts, for the owner and staff who handle requests. */
export function customersRoutes() {
  const r = new ApiRouter('/api/v1/sites/:siteId/customers', 'Customers', true);

  r.route(
    { method: 'get', path: '/', summary: 'List customer accounts with their request and order counts', query: paginationQuery.extend({ q: z.string().trim().max(100).optional() }), middleware: [requirePermission('leads:read')] },
    async ({ req, query }) => {
      const { rows } = await req.tenant!.db.query(
        `SELECT c.id, c.name, c.phone, c.email, c.addresses, c.status, c.created_at AS "createdAt", c.last_login_at AS "lastLoginAt",
                (SELECT count(*)::int FROM leads l WHERE l.customer_id = c.id) AS requests,
                (SELECT count(*)::int FROM orders o WHERE o.customer_id = c.id) AS orders,
                count(*) OVER()::int AS total
           FROM customers c
          WHERE $1::text IS NULL OR c.name ILIKE '%' || $1 || '%' OR c.phone LIKE '%' || $1 || '%' OR c.email ILIKE '%' || $1 || '%'
          ORDER BY c.created_at DESC LIMIT $2 OFFSET $3`,
        [query.q || null, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return { data: rows.map(({ total: _t, ...row }) => row), meta: pageMeta(query.page, query.pageSize, rows[0]?.total ?? 0) };
    },
  );

  r.route({ method: 'get', path: '/:id', summary: 'A customer account', params: idParam, middleware: [requirePermission('leads:read')] }, async ({ req, params }) => {
    const { rows } = await req.tenant!.db.query(
      `SELECT id, name, phone, email, addresses, status, created_at AS "createdAt", last_login_at AS "lastLoginAt" FROM customers WHERE id = $1`,
      [params.id],
    );
    if (!rows[0]) throw notFound('Customer');
    return { data: rows[0] };
  });

  r.route(
    { method: 'patch', path: '/:id', summary: 'Block or unblock a customer account (blocking signs them out)', params: idParam, body: z.object({ status: z.enum(['active', 'blocked']) }), middleware: [requirePermission('leads:write')] },
    async ({ req, params, body }) => {
      const db = req.tenant!.db;
      const { rows } = await db.query(`UPDATE customers SET status = $2, updated_at = now() WHERE id = $1 RETURNING id, name, phone, email, status`, [params.id, body.status]);
      if (!rows[0]) throw notFound('Customer');
      if (body.status === 'blocked') await db.query('UPDATE customer_sessions SET revoked_at = now() WHERE customer_id = $1 AND revoked_at IS NULL', [params.id]);
      await auditTenant(db, { actorUserId: req.auth!.user.id, action: `customer.${body.status}`, target: params.id });
      return { data: rows[0] };
    },
  );

  return r.router;
}
