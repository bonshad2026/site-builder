import { paymentSettingsSchema } from '@site-builder/shared';
import { Router } from 'express';
import { z } from 'zod';
import { badRequest } from '../../common/errors.js';
import { ApiRouter } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import { loadPublicTenant, requirePermission } from '../../middleware/tenant.js';
import { auditTenant } from '../audit/audit.js';
import { completePayment, getPaymentSettings } from './payments.service.js';

/** Owner settings: which gateway the site uses. */
export function paymentSettingsRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/sites/:siteId/payment-settings', 'Payments', true);
  r.router.use(requirePermission('payments:manage'));

  r.route({ method: 'get', path: '/', summary: 'Payment gateway settings' }, async ({ req }) => ({
    data: { ...(await getPaymentSettings(req.tenant!.db)), sandboxAvailable: ctx.env.paymentSandboxEnabled },
  }));

  r.route({ method: 'put', path: '/', summary: 'Update payment gateway settings', body: paymentSettingsSchema }, async ({ req, body }) => {
    if (body.provider === 'zarinpal' && !/^[0-9a-f-]{36}$/i.test(body.merchantId)) throw badRequest('Enter a valid Zarinpal merchant id (36 characters)');
    if (body.provider === 'sandbox' && !ctx.env.paymentSandboxEnabled) throw badRequest('The test gateway is disabled on this server');
    await req.tenant!.db.query(
      'UPDATE payment_settings SET provider = $1, merchant_id = $2, use_sandbox_host = $3, updated_by = $4, updated_at = now() WHERE id = 1',
      [body.provider, body.merchantId, body.useSandboxHost, req.auth!.user.id],
    );
    await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'payments.settings_updated', metadata: { provider: body.provider } });
    return { data: { ...(await getPaymentSettings(req.tenant!.db)), sandboxAvailable: ctx.env.paymentSandboxEnabled } };
  });

  return r.router;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Gateway return URL, plus the sandbox gateway's approve/decline page. */
export function paymentReturnRoutes(ctx: AppContext) {
  const router = Router({ mergeParams: true });
  const tenant = loadPublicTenant(ctx);

  router.get('/callback/:siteSlug/:paymentId', tenant, async (req, res) => {
    const params = z.object({ paymentId: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return res.status(404).end();
    const query = req.query as Record<string, string | undefined>;
    const target = await completePayment(ctx, req.tenant!, { paymentId: params.data.paymentId, authority: query.Authority, status: query.Status });
    res.redirect(303, target);
  });

  router.get('/sandbox/:siteSlug/:authority', tenant, async (req, res) => {
    const { rows } = await req.tenant!.db.query(
      `SELECT p.id, p.amount_minor::text AS amount, p.currency, p.status, o.number::text AS number FROM payments p JOIN orders o ON o.id = p.order_id
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
<h1>Sandbox payment gateway</h1><p>Order #${escapeHtml(p.number)} — ${escapeHtml(Number(p.amount).toLocaleString('en-US'))} ${escapeHtml(p.currency)}</p>
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
