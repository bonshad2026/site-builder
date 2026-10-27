import { ORDER_STATUSES, orderUpdateSchema } from '@site-builder/shared';
import { z } from 'zod';
import { notFound } from '../../common/errors.js';
import { ApiRouter, idParam, pageMeta, paginationQuery } from '../../common/http.js';
import { requireModule, requirePermission } from '../../middleware/tenant.js';
import { changeOrderStatus, ORDER_COLUMNS, orderItems } from './orders.service.js';

export function ordersRoutes() {
  const r = new ApiRouter('/api/v1/sites/:siteId/orders', 'Orders', true);
  r.router.use(requireModule('orders'));

  r.route(
    {
      method: 'get',
      path: '/',
      summary: 'List orders, newest first',
      query: paginationQuery.extend({ status: z.enum(ORDER_STATUSES).optional() }),
      middleware: [requirePermission('orders:read')],
    },
    async ({ req, query }) => {
      const { rows } = await req.tenant!.db.query(
        `SELECT ${ORDER_COLUMNS}, count(*) OVER()::int AS total FROM orders WHERE $1::text IS NULL OR status = $1
          ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [query.status ?? null, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return { data: rows.map(({ total: _t, ...row }) => row), meta: pageMeta(query.page, query.pageSize, rows[0]?.total ?? 0) };
    },
  );

  r.route({ method: 'get', path: '/:id', summary: 'Get an order with its items', params: idParam, middleware: [requirePermission('orders:read')] }, async ({ req, params }) => {
    const { rows } = await req.tenant!.db.query(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1`, [params.id]);
    if (!rows[0]) throw notFound('Order');
    const payments = await req.tenant!.db.query(
      `SELECT id, provider, is_test AS "isTest", amount_minor::text AS "amountMinor", status, ref_id AS "refId", failure_reason AS "failureReason",
              created_at AS "createdAt", verified_at AS "verifiedAt" FROM payments WHERE order_id = $1 ORDER BY created_at DESC`,
      [params.id],
    );
    return { data: { ...rows[0], items: await orderItems(req.tenant!.db, params.id), payments: payments.rows } };
  });

  r.route(
    { method: 'patch', path: '/:id', summary: 'Confirm, fulfil or cancel an order', params: idParam, body: orderUpdateSchema, middleware: [requirePermission('orders:write')] },
    async ({ req, params, body }) => ({ data: await changeOrderStatus(req.tenant!.db, params.id, body.status, req.auth!.user.id) }),
  );

  return r.router;
}
