import { paymentGatewayInputSchema, paymentProviderSchema, paymentSettingsSchema } from '@site-builder/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { badRequest, forbidden, notFound } from '../../common/errors.js';
import { ApiRouter, pageMeta, paginationQuery } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import { loadPublicTenant, requirePermission } from '../../middleware/tenant.js';
import { auditTenant } from '../audit/audit.js';
import { loadCatalog } from './catalog.js';
import { credentialProblem, driverFor, driverView } from './drivers.js';
import { completePayment, ensureGatewayRows, gatewayRows, getPaymentSettings, recheckPayment, testGateway } from './payments.service.js';

const providerParam = z.object({ provider: paymentProviderSchema });

/**
 * A site's payment settings: payment on delivery and its gateways. Which gateways a site may use
 * is the operator's call (`allowed`); the site's staff set up and turn on the allowed ones.
 */
export function paymentSettingsRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/sites/:siteId/payment-settings', 'Payments', true);
  r.router.use(requirePermission('payments:manage'));

  const view = async (req: Request) => {
    const db = req.tenant!.db;
    await ensureGatewayRows(ctx, db);
    const operator = !!req.auth!.user.isPlatformAdmin;
    const catalog = await loadCatalog(ctx);
    const gateways = (await gatewayRows(db)).flatMap((row) => {
      const driver = driverFor(row.provider);
      if (!driver) return [];
      // Staff see only what they may use; the operator also sees what the catalog still offers.
      if (!row.allowed && !(operator && catalog[row.provider].enabled)) return [];
      return [
        {
          ...driverView(driver, ctx),
          allowed: row.allowed,
          enabled: row.enabled,
          label: row.label,
          description: row.description,
          credentials: row.credentials,
          // `testMode` is the driver's kind of test mode; this is the site's switch.
          testOn: row.testMode,
          ready: row.enabled && row.allowed && driver.available(ctx) && !credentialProblem(driver, row.credentials),
        },
      ];
    });
    return { ...(await getPaymentSettings(db)), canAllow: operator, gateways };
  };

  r.route({ method: 'get', path: '/', summary: 'Payment settings and the gateways of the site' }, async ({ req }) => ({ data: await view(req) }));

  r.route({ method: 'put', path: '/', summary: 'Update payment on delivery', body: paymentSettingsSchema }, async ({ req, body }) => {
    await req.tenant!.db.query('UPDATE payment_settings SET allow_cod = $1, updated_by = $2, updated_at = now() WHERE id = 1', [body.allowCod, req.auth!.user.id]);
    await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'payments.settings_updated', metadata: { allowCod: body.allowCod } });
    return { data: await view(req) };
  });

  const rowOf = async (req: Request, provider: string) => {
    if (!driverFor(provider)) throw notFound('Gateway');
    await ensureGatewayRows(ctx, req.tenant!.db);
    return (await gatewayRows(req.tenant!.db)).find((g) => g.provider === provider)!;
  };

  r.route({ method: 'put', path: '/gateways/:provider', summary: 'Set up one gateway of the site', params: providerParam, body: paymentGatewayInputSchema }, async ({ req, params, body }) => {
    const row = await rowOf(req, params.provider);
    const driver = driverFor(params.provider)!;
    if (!row.allowed) throw forbidden('This gateway is not allowed for this site');
    if (body.enabled && !driver.available(ctx)) throw badRequest('The test gateway is disabled on this server');
    // Only the driver's own fields are kept; they must be right before the gateway is turned on.
    const credentials = Object.fromEntries(driver.fields.map((f) => [f.key, body.credentials[f.key] ?? '']));
    const problem = credentialProblem(driver, credentials);
    if (body.enabled && problem) throw badRequest(problem);
    await req.tenant!.db.query(
      'UPDATE payment_gateways SET enabled = $2, label = $3, description = $4, credentials = $5, test_mode = $6, updated_by = $7, updated_at = now() WHERE provider = $1',
      [params.provider, body.enabled, body.label, body.description, credentials, body.testMode, req.auth!.user.id],
    );
    await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'payments.gateway_updated', metadata: { provider: params.provider, enabled: body.enabled } });
    return { data: await view(req) };
  });

  r.route(
    { method: 'put', path: '/gateways/:provider/access', summary: 'Operator: allow or forbid a gateway for this site', params: providerParam, body: z.object({ allowed: z.boolean() }) },
    async ({ req, params, body }) => {
      if (!req.auth!.user.isPlatformAdmin) throw forbidden('Only the site operator chooses the gateways of a site');
      await rowOf(req, params.provider);
      if (body.allowed && !(await loadCatalog(ctx))[params.provider].enabled) throw badRequest('This gateway is turned off in the studio catalog');
      // A forbidden gateway is turned off too, so the buyer no longer sees it.
      await req.tenant!.db.query('UPDATE payment_gateways SET allowed = $2, enabled = enabled AND $2, updated_at = now() WHERE provider = $1', [params.provider, body.allowed]);
      await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'payments.gateway_access', metadata: { provider: params.provider, allowed: body.allowed } });
      return { data: await view(req) };
    },
  );

  r.route({ method: 'put', path: '/order', summary: 'Order in which checkout lists the gateways', body: z.object({ providers: z.array(paymentProviderSchema).max(50) }) }, async ({ req, body }) => {
    for (const [i, provider] of body.providers.entries()) await req.tenant!.db.query('UPDATE payment_gateways SET sort = $2 WHERE provider = $1', [provider, i + 1]);
    return { data: await view(req) };
  });

  r.route({ method: 'post', path: '/gateways/:provider/test', summary: 'Try the saved settings of a gateway with a small payment request', params: providerParam }, async ({ req, params }) => {
    const row = await rowOf(req, params.provider);
    return { data: await testGateway(ctx, req.tenant!, row) };
  });

  return r.router;
}

/** The site's payments (transactions): every attempt, with its order or request. */
export function paymentsListRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/sites/:siteId/payments', 'Payments', true);
  r.router.use(requirePermission('payments:manage'));

  r.route(
    {
      method: 'get',
      path: '/',
      summary: 'Payments, newest first',
      query: paginationQuery.extend({
        status: z.enum(['initiated', 'succeeded', 'failed', 'cancelled']).optional(),
        provider: paymentProviderSchema.optional(),
        test: z.enum(['true', 'false']).optional(),
        q: z.string().trim().max(60).optional(),
      }),
    },
    async ({ req, query }) => {
      const q = query.q?.replace(/^[#rR]-?/, '') || null;
      const { rows } = await req.tenant!.db.query(
        `SELECT p.id, p.provider, p.is_test AS "isTest", p.amount_minor::text AS "amountMinor", p.currency, p.status, p.ref_id AS "refId", p.card_pan AS "cardPan",
                p.failure_reason AS "failureReason", p.created_at AS "createdAt", p.verified_at AS "verifiedAt",
                o.id AS "orderId", o.number::text AS "orderNumber", l.id AS "leadId", l.number::text AS "requestNumber",
                coalesce(o.customer->>'name', l.name) AS "customerName", count(*) OVER()::int AS total
           FROM payments p LEFT JOIN orders o ON o.id = p.order_id LEFT JOIN leads l ON l.id = p.lead_id
          WHERE ($1::text IS NULL OR p.status = $1) AND ($2::text IS NULL OR p.provider = $2) AND ($3::boolean IS NULL OR p.is_test = $3)
            AND ($4::text IS NULL OR o.number::text = $4 OR l.number::text = $4 OR p.ref_id = $4)
          ORDER BY p.created_at DESC LIMIT $5 OFFSET $6`,
        [query.status ?? null, query.provider ?? null, query.test === undefined ? null : query.test === 'true', q, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const label = (p: string) => driverFor(p)?.name ?? { en: p, fa: p };
      return { data: rows.map(({ total: _t, ...x }) => ({ ...x, providerName: label(x.provider) })), meta: pageMeta(query.page, query.pageSize, rows[0]?.total ?? 0) };
    },
  );

  r.route({ method: 'post', path: '/:id/recheck', summary: 'Ask the gateway again about a payment that never came back', params: z.object({ id: z.string().uuid() }) }, async ({ req, params }) => ({
    data: await recheckPayment(ctx, req.tenant!, params.id, req.auth!.user.id),
  }));

  return r.router;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Gateway return URL, plus the sandbox gateway's approve/decline page. */
export function paymentReturnRoutes(ctx: AppContext) {
  const router = Router({ mergeParams: true });
  const tenant = loadPublicTenant(ctx);

  // The gateway's answer comes as query or form fields; the payment's driver reads it.
  const callback = async (req: Request, res: Response) => {
    const params = z.object({ paymentId: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return res.status(404).end();
    const raw = { ...(req.query as Record<string, unknown>), ...((req.body ?? {}) as Record<string, unknown>) };
    const answer = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v === undefined ? undefined : String(v)]));
    const target = await completePayment(ctx, req.tenant!, { paymentId: params.data.paymentId, answer });
    res.redirect(303, target);
  };
  router.get('/callback/:siteSlug/:paymentId', tenant, callback);
  router.post('/callback/:siteSlug/:paymentId', tenant, callback);

  router.get('/sandbox/:siteSlug/:authority', tenant, async (req, res) => {
    const { rows } = await req.tenant!.db.query(
      `SELECT p.id, p.amount_minor::text AS amount, p.currency, p.status, coalesce('Order #' || o.number::text, 'Request R' || l.number::text) AS subject
         FROM payments p LEFT JOIN orders o ON o.id = p.order_id LEFT JOIN leads l ON l.id = p.lead_id
        WHERE p.authority = $1 AND p.provider = 'sandbox'`,
      [String(req.params.authority)],
    );
    const p = rows[0];
    if (!p || p.status !== 'initiated') return res.status(404).send('Unknown or finished test payment');
    const action = escapeHtml(`/api/v1/payments/sandbox/${req.tenant!.slug}/${encodeURIComponent(String(req.params.authority))}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action *");
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test payment</title><style>body{font:16px system-ui;background:#f4f1ec;color:#1d1b18;display:grid;place-items:center;min-height:100vh;margin:0}
main{background:#fff;border:1px solid #ddd4c7;padding:32px;max-width:420px;width:calc(100% - 32px)}h1{font-size:22px;margin:0 0 8px}
.warn{background:#fff4d6;border:1px solid #e8c55c;padding:12px;margin:16px 0;font-size:14px}button{padding:12px 20px;border:0;border-radius:999px;font-size:15px;cursor:pointer;margin-inline-end:8px}
.ok{background:#1d1b18;color:#fff}.no{background:#eee}</style></head><body><main>
<h1>Sandbox payment gateway</h1><p>${escapeHtml(p.subject)} — ${escapeHtml(Number(p.amount).toLocaleString('en-US'))} ${escapeHtml(p.currency)}</p>
<p class="warn"><strong>Test only.</strong> No real money moves. Approved test payments are recorded as “test paid”, never as paid.</p>
<form method="post" action="${action}"><button class="ok" name="decision" value="approved">Approve test payment</button><button class="no" name="decision" value="declined">Decline</button></form>
</main></body></html>`);
  });

  router.post('/sandbox/:siteSlug/:authority', tenant, async (req, res) => {
    const decision = String((req.body as { decision?: string })?.decision ?? '');
    if (!['approved', 'declined'].includes(decision)) return res.status(400).send('Invalid decision');
    const { rows } = await req.tenant!.db.query(
      `UPDATE payments SET sandbox_decision = $2, updated_at = now() WHERE authority = $1 AND provider = 'sandbox' AND status = 'initiated' RETURNING id`,
      [String(req.params.authority), decision],
    );
    if (!rows[0]) return res.status(404).send('Unknown or finished test payment');
    const status = decision === 'approved' ? 'OK' : 'NOK';
    res.redirect(303, `/api/v1/payments/callback/${req.tenant!.slug}/${rows[0].id}?Authority=${encodeURIComponent(String(req.params.authority))}&Status=${status}`);
  });

  return router;
}
