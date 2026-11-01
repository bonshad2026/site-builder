import {
  customerCodeSchema,
  customerLoginSchema,
  customerMessageSchema,
  customerProfileSchema,
  customerResetSchema,
  customerSignupSchema,
  normalizePhone,
  parseTrackingCode,
  requestCode,
  requestTypeConfig,
  type SiteSettings,
} from '@site-builder/shared';
import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { badRequest, notFound } from '../../common/errors.js';
import type { ApiRouter } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import {
  endCustomerSession,
  getCustomer,
  login,
  requireAccounts,
  requireCustomer,
  resetPassword,
  sendCode,
  signup,
  startCustomerSession,
  updateProfile,
  verifiedCustomer,
} from '../customers/customers.service.js';
import { orderCustomerView } from '../orders/orders.service.js';
import { gatewayFor, getPaymentSettings, startRequestPayment } from '../payments/payments.service.js';
import { accessValid, issueAccess, loadSettings, PHONE_SQL, siteBaseUrl } from './context.js';
import { customerCancel, customerMessage, customerView, findRequestByNumber, stageLabel, type RequestRow } from './requests.service.js';
import { addEvent } from './requests.service.js';
import { notifyStaff, siteName } from './notify.js';
import { filesOf, registerUploadRoute } from './files.js';

const numberParam = z.object({ number: z.string().regex(/^\d{1,12}$/) });
const localeSchema = z.enum(['en', 'fa']).default('en');
const tokenQuery = z.object({ token: z.string().max(200).optional(), locale: localeSchema });

/**
 * The visitor's side of interactions: accounts (sign up, sign in with a code or password),
 * "my requests and orders", tracking by code, and acting on a request (reply, cancel, pay).
 */
export function registerInteractionRoutes(r: ApiRouter, ctx: AppContext) {
  const limiter = (limit: number, name: string) =>
    rateLimit({
      windowMs: 10 * 60_000,
      limit: ctx.env.NODE_ENV === 'production' ? limit : 1000,
      keyGenerator: (req) => `${name}:${ipKeyGenerator(req.ip ?? '')}:${req.params.siteSlug}`,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'rate_limited', message: 'Too many attempts, try again later' } },
    });
  const codeLimiter = limiter(10, 'code');
  const loginLimiter = limiter(20, 'login');
  const trackLimiter = limiter(20, 'track');
  const actionLimiter = limiter(30, 'action');
  registerUploadRoute(r, ctx, limiter(40, 'upload'));

  const accounts = async (req: Request) => {
    const settings = await loadSettings(req.tenant!.db);
    requireAccounts(settings.accounts);
    return settings;
  };

  /* ---------- account ---------- */

  r.route({ method: 'get', path: '/customer/me', summary: 'The signed-in customer, or null' }, async ({ req }) => ({
    data: req.customer ? await getCustomer(req.tenant!.db, req.customer.id) : null,
  }));

  r.route({ method: 'post', path: '/customer/code', summary: 'Send a one-time code (sign up, sign in or password reset)', body: customerCodeSchema, middleware: [codeLimiter] }, async ({ req, body }) => {
    const settings = await accounts(req);
    return { data: await sendCode(ctx, req.tenant!.db, settings.accounts, siteName(settings), body.identifier, body.purpose) };
  });

  r.route({ method: 'post', path: '/customer/signup', summary: 'Create an account with the code sent to the phone or email', body: customerSignupSchema, status: 201, middleware: [loginLimiter] }, async ({ req, res, body }) => {
    const settings = await accounts(req);
    const customer = await signup(req.tenant!.db, settings.accounts, body);
    await startCustomerSession(ctx, req.tenant!.db, req.tenant!.slug, customer.id, res);
    await notifyStaff(ctx, req.tenant!, settings, 'New customer account', `${customer.name} (${customer.phone ?? customer.email}) signed up.`);
    return { data: await getCustomer(req.tenant!.db, customer.id) };
  });

  r.route({ method: 'post', path: '/customer/login', summary: 'Sign in with a password or a one-time code', body: customerLoginSchema, middleware: [loginLimiter] }, async ({ req, res, body }) => {
    const settings = await accounts(req);
    const customer = await login(req.tenant!.db, settings.accounts, body);
    await startCustomerSession(ctx, req.tenant!.db, req.tenant!.slug, customer.id, res);
    return { data: await getCustomer(req.tenant!.db, customer.id) };
  });

  r.route({ method: 'post', path: '/customer/reset', summary: 'Set a new password with a one-time code', body: customerResetSchema, middleware: [loginLimiter] }, async ({ req, res, body }) => {
    const settings = await accounts(req);
    const customer = await resetPassword(req.tenant!.db, settings.accounts, body);
    await startCustomerSession(ctx, req.tenant!.db, req.tenant!.slug, customer.id, res);
    return { data: await getCustomer(req.tenant!.db, customer.id) };
  });

  r.route({ method: 'post', path: '/customer/logout', summary: 'Sign out', middleware: [requireCustomer] }, async ({ req, res }) => {
    await endCustomerSession(req.tenant!.db, req.tenant!.slug, req.customer!.sessionId, res);
  });

  r.route({ method: 'patch', path: '/customer/me', summary: 'Change name, the other contact detail or the password', body: customerProfileSchema, middleware: [requireCustomer] }, async ({ req, body }) => {
    const settings = await accounts(req);
    await updateProfile(req.tenant!.db, settings.accounts, req.customer!, body);
    return { data: await getCustomer(req.tenant!.db, req.customer!.id) };
  });

  r.route({ method: 'get', path: '/customer/cases', summary: "The customer's requests and orders", query: z.object({ locale: localeSchema }), middleware: [requireCustomer] }, async ({ req, query }) => {
    const db = req.tenant!.db;
    const settings = await loadSettings(db);
    const leads = await db.query(
      `SELECT id, number::text AS number, type, status AS stage, stage_kind AS "stageKind", amount_due_minor::text AS "amountDueMinor", currency,
              payment_status AS "paymentStatus", created_at AS "createdAt", updated_at AS "updatedAt",
              (SELECT max(e.created_at) FROM case_events e WHERE e.lead_id = leads.id AND e.public AND NOT e.by_customer) AS "lastReplyAt"
         FROM leads WHERE customer_id = $1 ORDER BY updated_at DESC LIMIT 200`,
      [req.customer!.id],
    );
    const orders = await db.query(
      `SELECT number::text AS number, status, payment_status AS "paymentStatus", currency, total_minor::text AS "totalMinor", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [req.customer!.id],
    );
    const locale = query.locale;
    return {
      data: {
        requests: leads.rows.map((l) => {
          const type = requestTypeConfig(settings, l.type);
          const stage = type?.workflow.stages.find((s) => s.key === l.stage);
          return { ...l, code: requestCode(l.number), typeLabel: type?.label ?? { en: l.type, fa: l.type }, stageLabel: stageLabel(stage, l.stage, locale, true), stageColor: stage?.color ?? 'gray' };
        }),
        orders: orders.rows.map((o) => {
          const s = settings.shop.orderStatuses.find((x) => x.slug === o.status);
          return { ...o, code: `#${o.number}`, stageLabel: (s && (s.label[locale] || s.label.en)) || o.status };
        }),
      },
    };
  });

  /* ---------- tracking without an account ---------- */

  r.route(
    {
      method: 'post',
      path: '/track',
      summary: 'Find a request or order by its code and the phone or email it was sent with; returns a link token',
      body: z.object({ code: z.string().trim().min(1).max(20), contact: z.string().trim().min(3).max(254) }),
      middleware: [trackLimiter],
    },
    async ({ req, body }) => {
      const parsed = parseTrackingCode(body.code);
      if (!parsed) throw notFound('Request');
      const db = req.tenant!.db;
      const contact = body.contact.includes('@') ? body.contact.toLowerCase() : normalizePhone(body.contact);
      const byEmail = body.contact.includes('@');
      const sql =
        parsed.kind === 'request'
          ? `SELECT id FROM leads WHERE number = $1 AND ${byEmail ? 'lower(email) = $2' : `phone <> '' AND ${PHONE_SQL('phone')} = $2`}`
          : `SELECT id FROM orders WHERE number = $1 AND ${byEmail ? "lower(customer->>'email') = $2" : `${PHONE_SQL("coalesce(customer->>'phone', '')")} = $2`}`;
      const { rows } = await db.query<{ id: string }>(sql, [parsed.number, contact]);
      // Same answer for a wrong code and a wrong phone/email, so codes cannot be probed.
      if (!rows[0]) throw notFound('Request');
      const code = parsed.kind === 'request' ? requestCode(parsed.number) : parsed.number;
      return { data: { kind: parsed.kind, code, token: issueAccess(ctx, req.tenant!.id, parsed.kind, rows[0].id) } };
    },
  );

  /* ---------- one request ---------- */

  /** The request if the visitor may open it: it is theirs (signed in) or they hold its link. */
  const openRequest = async (req: Request, number: string, token: string | undefined, write: boolean): Promise<RequestRow> => {
    const lead = await findRequestByNumber(req.tenant!.db, number);
    if (!lead) throw notFound('Request');
    const customer = write ? verifiedCustomer(req) : req.customer;
    const own = !!customer && lead.customerId === customer.id;
    if (!own && !accessValid(ctx, req.tenant!.id, 'request', { id: lead.id, public_token_hash: lead.public_token_hash ?? null }, token)) throw notFound('Request');
    return lead;
  };

  r.route({ method: 'get', path: '/requests/:number', summary: 'A request as its customer sees it', params: numberParam, query: tokenQuery }, async ({ req, params, query }) => {
    const lead = await openRequest(req, params.number, query.token, false);
    const settings = await loadSettings(req.tenant!.db);
    const payments = await getPaymentSettings(req.tenant!.db);
    return { data: { ...(await customerView(req.tenant!.db, settings, lead, query.locale)), files: await filesOf(ctx, req.tenant!.db, lead.id), onlinePayment: !!gatewayFor(ctx, payments, req.tenant!.slug) } };
  });

  r.route({ method: 'post', path: '/requests/:number/messages', summary: 'The customer writes on their request', params: numberParam, body: customerMessageSchema, status: 201, middleware: [actionLimiter] }, async ({ req, params, body }) => {
    const lead = await openRequest(req, params.number, body.token, true);
    await customerMessage(ctx, req.tenant!, lead, body.text, await loadSettings(req.tenant!.db));
    return { data: { sent: true } };
  });

  r.route({ method: 'post', path: '/requests/:number/cancel', summary: 'The customer cancels their request (where its stage allows)', params: numberParam, body: z.object({ token: z.string().max(200).optional() }), middleware: [actionLimiter] }, async ({ req, params, body }) => {
    const lead = await openRequest(req, params.number, body.token, true);
    await customerCancel(ctx, req.tenant!, lead.id, await loadSettings(req.tenant!.db));
    return { data: { cancelled: true } };
  });

  r.route(
    { method: 'post', path: '/requests/:number/pay', summary: 'Start paying the amount the request asks for; returns the gateway URL', params: numberParam, body: z.object({ token: z.string().max(200).optional(), locale: localeSchema }), middleware: [actionLimiter] },
    async ({ req, params, body }) => {
      const lead = await openRequest(req, params.number, body.token, true);
      const base = await siteBaseUrl(ctx, req.tenant!);
      const back = issueAccess(ctx, req.tenant!.id, 'request', lead.id);
      const returnUrl = `${base}${body.locale === 'fa' ? '/fa' : ''}/track/${requestCode(lead.number)}?t=${encodeURIComponent(back)}`;
      return { data: await startRequestPayment(ctx, req.tenant!, lead, returnUrl) };
    },
  );

  /* ---------- one order ---------- */

  const openOrder = async (req: Request, number: string, token: string | undefined, write: boolean) => {
    const { rows } = await req.tenant!.db.query(
      `SELECT id, number::text, status, payment_status, payment_method, currency, total_minor::text, subtotal_minor::text, shipping_minor::text, shipping_method, discount_minor::text, coupon_code, created_at, public_token_hash, customer, customer_id FROM orders WHERE number = $1`,
      [number],
    );
    const order = rows[0];
    if (!order) throw notFound('Order');
    const customer = write ? verifiedCustomer(req) : req.customer;
    if (!(customer && order.customer_id === customer.id) && !accessValid(ctx, req.tenant!.id, 'order', order, token)) throw notFound('Order');
    return order;
  };

  r.route({ method: 'get', path: '/orders/:number/view', summary: 'An order as its buyer sees it, with its timeline', params: numberParam, query: tokenQuery }, async ({ req, params, query }) => {
    const order = await openOrder(req, params.number, query.token, false);
    const settings: SiteSettings = await loadSettings(req.tenant!.db);
    const payments = await getPaymentSettings(req.tenant!.db);
    return { data: { ...(await orderCustomerView(req.tenant!.db, settings, order, query.locale)), onlinePayment: !!gatewayFor(ctx, payments, req.tenant!.slug) } };
  });

  r.route({ method: 'post', path: '/orders/:number/messages', summary: 'The buyer writes on their order', params: numberParam, body: customerMessageSchema, status: 201, middleware: [actionLimiter] }, async ({ req, params, body }) => {
    const order = await openOrder(req, params.number, body.token, true);
    if (['fulfilled', 'cancelled'].includes(order.status)) throw badRequest('Messages are closed for this order');
    await addEvent(req.tenant!.db, { orderId: order.id }, { kind: 'customer_message', public: true, body: body.text, byCustomer: true });
    await req.tenant!.db.query('UPDATE orders SET unread = true, updated_at = now() WHERE id = $1', [order.id]);
    const settings = await loadSettings(req.tenant!.db);
    const base = await siteBaseUrl(ctx, req.tenant!);
    await notifyStaff(ctx, req.tenant!, settings, `#${order.number} — ${order.customer?.name ?? ''}`, `${body.text}\n\n${base}/admin/sites/${req.tenant!.slug}/orders?open=${order.id}`);
    return { data: { sent: true } };
  });
}
