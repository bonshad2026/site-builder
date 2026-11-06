import { registerInstagramConnection } from './instagram.routes.js';
import { streamOrders } from './live.js';
import { recordManualPayment } from './manual-payment.js';
import { walkInOrderSchema, orderManualPaymentSchema, orderUpdateSchema, staffEventSchema } from '@site-builder/shared';
import { z } from 'zod';
import { notFound } from '../../common/errors.js';
import { ApiRouter, idParam, pageMeta, paginationQuery } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import { requireModule, requirePermission } from '../../middleware/tenant.js';
import { eventsOf } from '../interactions/requests.service.js';
import { createOrder, addOrderEvent, changeOrderStage, ORDER_COLUMNS, orderItems } from './orders.service.js';

export function ordersRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/sites/:siteId/orders', 'Orders', true);
  r.router.use(requireModule('orders'));
  registerInstagramConnection(r,ctx);
  r.route({method:'post',path:'/',summary:'Create a confirmed, priced walk-in order as staff',status:201,body:walkInOrderSchema,middleware:[requirePermission('orders:write'),requireModule('products')]},
    async({req,body})=>{
      const order=await createOrder(req.tenant!.db,{
        ...body,customer:{name:'مشتری حضوری',phone:'',email:'',answers:{}},
        paymentMethod:'cod',shippingMethod:'',coupon:'',
      },null,req.auth!.user.id);
      const {orderToken:_token,...saved}=order;
      return {data:saved};
    });
  r.route({method:'get',path:'/live',summary:'Authenticated tenant-local order change stream',middleware:[requirePermission('orders:read')]},
    async({req,res})=>{await streamOrders(req.tenant!.db,res);});

  r.route(
    {
      method: 'get',
      path: '/',
      summary: 'List orders, newest first',
      query: paginationQuery.extend({ status: orderUpdateSchema.shape.status.optional(), customerId: z.string().uuid().optional(), unread: z.enum(['true']).optional() }),
      middleware: [requirePermission('orders:read')],
    },
    async ({ req, query }) => {
      const { rows } = await req.tenant!.db.query(
        `SELECT ${ORDER_COLUMNS}, count(*) OVER()::int AS total FROM orders
          WHERE ($1::text IS NULL OR status = $1) AND ($2::uuid IS NULL OR customer_id = $2) AND ($3::boolean IS NULL OR unread)
          ORDER BY created_at DESC LIMIT $4 OFFSET $5`,
        [query.status ?? null, query.customerId ?? null, query.unread ? true : null, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return { data: rows.map(({ total: _t, ...row }) => row), meta: pageMeta(query.page, query.pageSize, rows[0]?.total ?? 0) };
    },
  );

  r.route({ method: 'get', path: '/:id', summary: 'Get an order with its items, payments and timeline (opening it marks it read)', params: idParam, query: z.object({preview:z.enum(['true']).optional()}), middleware: [requirePermission('orders:read')] }, async ({ req, params, query }) => {
    const db = req.tenant!.db;
    const { rows } = await db.query(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1`, [params.id]);
    if (!rows[0]) throw notFound('Order');
    if (!query.preview && rows[0].unread) await db.query('UPDATE orders SET unread = false WHERE id = $1', [params.id]);
    const payments = await db.query(
      `SELECT id, provider, is_test AS "isTest", amount_minor::text AS "amountMinor", status, ref_id AS "refId", failure_reason AS "failureReason",
              created_at AS "createdAt", verified_at AS "verifiedAt" FROM payments WHERE order_id = $1 ORDER BY created_at DESC`,
      [params.id],
    );
    return { data: { ...rows[0], unread: query.preview ? rows[0].unread : false, items: await orderItems(db, params.id), payments: payments.rows, events: await eventsOf(db, { orderId: params.id }, false) } };
  });

  r.route(
    {
      method: 'patch',
      path: '/:id',
      summary: "Move an order to another of the shop's stages (cancelling puts stock back); may message the buyer",
      params: idParam,
      body: orderUpdateSchema.extend({ message: z.string().trim().max(1000).default(''), notify: z.boolean().optional() }),
      middleware: [requirePermission('orders:write')],
    },
    async ({ req, params, body }) => ({ data: await changeOrderStage(ctx, req.tenant!, params.id, body, req.auth!.user.id) }),
  );

  r.route(
    { method: 'post', path: '/:id/events', summary: 'Send the buyer a message, or add an internal note', params: idParam, body: staffEventSchema, status: 201, middleware: [requirePermission('orders:write')] },
    async ({ req, params, body }) => {
      await addOrderEvent(ctx, req.tenant!, params.id, body, req.auth!.user.id);
      return { data: await eventsOf(req.tenant!.db, { orderId: params.id }, false) };
    },
  );

  r.route({method:'patch',path:'/:id/payment-status',summary:'Record offline payment status without altering a gateway transaction',params:idParam,body:orderManualPaymentSchema,middleware:[requirePermission('payments:manage')]},
    async({req,params,body})=>({data:await recordManualPayment(req.tenant!.db,params.id,body.paymentStatus,req.auth!.user.id)}));
  return r.router;
}
