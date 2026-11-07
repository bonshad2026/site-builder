import { nextStages, paymentRequestSchema, requestTypeConfig, requestTypeSlug, requestUpdateSchema, staffEventSchema, stageChangeSchema, stageKeySchema } from '@site-builder/shared';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { ApiRouter, idParam, pageMeta, paginationQuery } from '../../common/http.js';
import { requireModule, requirePermission } from '../../middleware/tenant.js';
import { auditTenant } from '../audit/audit.js';
import { loadSettings } from '../interactions/context.js';
import { filesOf } from '../interactions/files.js';
import { addStaffEvent, assignItem, changeStage, eventsOf, getRequest, REQUEST_COLUMNS, requestPayment } from '../interactions/requests.service.js';

/**
 * Owner/staff inbox for customer requests: each request follows its type's workflow, with a
 * timeline of stage changes, messages to the customer, internal notes and payments. Visitors
 * submit and follow their requests through the public routes.
 */
export function leadsRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/sites/:siteId/leads', 'Requests', true);
  r.router.use(requireModule('leads'));

  r.route(
    {
      method: 'get',
      path: '/',
      summary: 'List customer requests, newest activity first, with filters',
      query: paginationQuery.extend({
        type: requestTypeSlug.optional(),
        stage: stageKeySchema.optional(),
        state: z.enum(['open', 'done', 'cancelled']).optional(),
        unread: z.enum(['true']).optional(),
        payment: z.enum(['due', 'paid']).optional(),
        customerId: z.string().uuid().optional(),
        q: z.string().trim().max(100).optional(),
      }),
      middleware: [requirePermission('leads:read')],
    },
    async ({ req, query }) => {
      const q = query.q ? query.q.replace(/^r/i, '') : null;
      const { rows } = await req.tenant!.db.query(
        `SELECT ${REQUEST_COLUMNS}, count(*) OVER()::int AS total FROM leads
          WHERE ($1::text IS NULL OR type = $1) AND ($2::text IS NULL OR status = $2) AND ($3::text IS NULL OR stage_kind = $3)
            AND ($4::boolean IS NULL OR unread) AND ($5::text IS NULL OR ($5 = 'due' AND amount_due_minor > 0) OR ($5 = 'paid' AND paid_minor > 0))
            AND ($6::uuid IS NULL OR customer_id = $6)
            AND ($7::text IS NULL OR number::text = $7 OR name ILIKE '%' || $7 || '%' OR email ILIKE '%' || $7 || '%' OR phone LIKE '%' || $7 || '%' OR message ILIKE '%' || $7 || '%')
          ORDER BY unread DESC, updated_at DESC LIMIT $8 OFFSET $9`,
        [query.type ?? null, query.stage ?? null, query.state ?? null, query.unread ? true : null, query.payment ?? null, query.customerId ?? null, q, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return { data: rows.map(({ total: _t, ...row }) => row), meta: pageMeta(query.page, query.pageSize, rows[0]?.total ?? 0) };
    },
  );

  r.route({ method: 'get', path: '/staff', summary: 'People who can handle requests (for assigning and the timeline)', middleware: [requirePermission('leads:read')] }, async ({ req }) => {
    const { rows } = await ctx.control.query(
      `SELECT u.id, coalesce(nullif(u.display_name, ''), u.email) AS name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = $1 ORDER BY m.role, u.email`,
      [req.tenant!.id],
    );
    return { data: rows };
  });

  r.route({ method: 'get', path: '/summary', summary: 'Counts for the inbox: unread, open, waiting for payment, per type', middleware: [requirePermission('leads:read')] }, async ({ req }) => {
    const db = req.tenant!.db;
    const totals = await db.query(
      `SELECT count(*) FILTER (WHERE unread)::int AS unread, count(*) FILTER (WHERE stage_kind = 'open')::int AS open,
              count(*) FILTER (WHERE amount_due_minor > 0 AND stage_kind = 'open')::int AS "paymentDue", count(*)::int AS total FROM leads`,
    );
    const byType = await db.query(
      `SELECT type, count(*)::int AS total, count(*) FILTER (WHERE stage_kind = 'open')::int AS open, count(*) FILTER (WHERE unread)::int AS unread FROM leads GROUP BY type`,
    );
    const byStage = await db.query(`SELECT type, status AS stage, count(*)::int AS total FROM leads WHERE stage_kind = 'open' GROUP BY type, status`);
    return { data: { ...totals.rows[0], byType: byType.rows, byStage: byStage.rows } };
  });

  r.route({ method: 'get', path: '/:id', summary: 'A request with its timeline, workflow and payments (opening it marks it read)', params: idParam, middleware: [requirePermission('leads:read')] }, async ({ req, params }) => {
    const db = req.tenant!.db;
    const lead = await getRequest(db, params.id);
    if ((lead as { unread?: boolean }).unread) await db.query('UPDATE leads SET unread = false WHERE id = $1', [params.id]);
    const settings = await loadSettings(db);
    const type = requestTypeConfig(settings, lead.type);
    const payments = await db.query(
      `SELECT id, provider, is_test AS "isTest", amount_minor::text AS "amountMinor", status, ref_id AS "refId", failure_reason AS "failureReason",
              created_at AS "createdAt", verified_at AS "verifiedAt" FROM payments WHERE lead_id = $1 ORDER BY created_at DESC`,
      [params.id],
    );
    const customer = lead.customerId
      ? (await db.query('SELECT id, name, phone, email, created_at AS "createdAt" FROM customers WHERE id = $1', [lead.customerId])).rows[0] ?? null
      : null;
    return {
      data: {
        ...lead,
        unread: false,
        workflow: type?.workflow ?? null,
        next: type ? nextStages(type.workflow, lead.stage).map((s) => s.key) : [],
        events: await eventsOf(db, { leadId: params.id }, false),
        payments: payments.rows,
        files: await filesOf(ctx, db, params.id),
        customer,
      },
    };
  });

  r.route(
    { method: 'post', path: '/:id/stage', summary: 'Move a request to another stage of its workflow (may ask for payment and notify the customer)', params: idParam, body: stageChangeSchema, middleware: [requirePermission('leads:write')] },
    async ({ req, params, body }) => ({ data: await changeStage(ctx, req.tenant!, params.id, body, req.auth!.user.id) }),
  );

  r.route(
    { method: 'post', path: '/:id/events', summary: 'Send the customer a message, or add an internal note', params: idParam, body: staffEventSchema, status: 201, middleware: [requirePermission('leads:write')] },
    async ({ req, params, body }) => ({ data: await addStaffEvent(ctx, req.tenant!, params.id, body, req.auth!.user.id) }),
  );

  r.route(
    { method: 'post', path: '/:id/payment-request', summary: 'Ask the customer to pay an amount (0 withdraws the request)', params: idParam, body: paymentRequestSchema.extend({ amountMinor: z.number().int().min(0).max(1e13) }), middleware: [requirePermission('leads:write')] },
    async ({ req, params, body }) => ({ data: await requestPayment(ctx, req.tenant!, params.id, body, req.auth!.user.id) }),
  );

  r.route(
    { method: 'patch', path: '/:id', summary: 'Assign a request to a staff member, or mark it unread', params: idParam, body: requestUpdateSchema, middleware: [requirePermission('leads:write')] },
    async ({ req, params, body }) => {
      const db = req.tenant!.db;
      if (body.assigneeUserId !== undefined) {
        await db.query('UPDATE leads SET assignee_user_id = $2, updated_at = now() WHERE id = $1', [params.id, body.assigneeUserId]);
        await db.query(`INSERT INTO case_events (lead_id, kind, data, actor_user_id) VALUES ($1, 'assigned', jsonb_build_object('to', $2::text), $3)`, [params.id, body.assigneeUserId, req.auth!.user.id]);
      }
      if (body.assignedItemId !== undefined) await assignItem(db, params.id, body.assignedItemId, req.auth!.user.id);
      if (body.read !== undefined) await db.query('UPDATE leads SET unread = $2 WHERE id = $1', [params.id, !body.read]);
      await auditTenant(db, { actorUserId: req.auth!.user.id, action: 'request.updated', target: params.id, metadata: body });
      return { data: await getRequest(db, params.id) };
    },
  );

  return r.router;
}
