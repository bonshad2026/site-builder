import { paymentSettingsSchema, requestTypeConfig, type PaymentSettings } from '@site-builder/shared';
import type pg from 'pg';
import { safeEqual, sha256 } from '../../common/crypto.js';
import { AppError, badRequest, notFound } from '../../common/errors.js';
import type { AppContext } from '../../context.js';
import { withTransaction } from '../../database/tenant/pools.js';
import { auditTenant } from '../audit/audit.js';
import { loadCatalog } from './catalog.js';
import { PAYMENT_DRIVERS, credentialProblem, driverFor, type PaymentDriver } from './drivers.js';
import type { PaymentGateway, VerifyResult } from './gateways.js';
import { loadSettings } from '../interactions/context.js';
import { addEvent } from '../interactions/requests.service.js';

type Text = { en: string; fa: string };
type Site = { slug: string; db: pg.Pool };

/** One gateway of a site (a `payment_gateways` row). */
export interface GatewayRow {
  provider: string;
  allowed: boolean;
  enabled: boolean;
  sort: number;
  label: Text;
  description: Text;
  credentials: Record<string, string>;
  testMode: boolean;
}

const GATEWAY_COLUMNS = `provider, allowed, enabled, sort, label, description, credentials, test_mode AS "testMode"`;

export async function getPaymentSettings(db: pg.Pool | pg.PoolClient): Promise<PaymentSettings> {
  const { rows } = await db.query('SELECT allow_cod AS "allowCod" FROM payment_settings WHERE id = 1');
  return paymentSettingsSchema.parse(rows[0] ?? {});
}

export async function gatewayRows(db: pg.Pool | pg.PoolClient): Promise<GatewayRow[]> {
  return (await db.query<GatewayRow>(`SELECT ${GATEWAY_COLUMNS} FROM payment_gateways ORDER BY sort, provider`)).rows;
}

/**
 * Gives the site a row for every gateway the system knows, with the studio catalog's defaults
 * (allowed, name, note), so the panel can list them all. Existing rows are left as they are.
 */
export async function ensureGatewayRows(ctx: AppContext, db: pg.Pool) {
  const have = new Set((await gatewayRows(db)).map((r) => r.provider));
  const missing = PAYMENT_DRIVERS.filter((d) => !have.has(d.key));
  if (!missing.length) return;
  const catalog = await loadCatalog(ctx);
  const { rows } = await db.query<{ next: number }>('SELECT coalesce(max(sort), 0) + 1 AS next FROM payment_gateways');
  let sort = rows[0].next;
  for (const d of missing) {
    const c = catalog[d.key];
    await db.query(`INSERT INTO payment_gateways (provider, allowed, sort, label, description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (provider) DO NOTHING`, [
      d.key,
      c.enabled && c.defaultAllowed,
      sort++,
      c.label,
      c.description,
    ]);
  }
}

/** Turns a site's gateway on (with its settings), adding its row when needed: site setup and sample data. */
export async function enableGateway(db: pg.Pool | pg.PoolClient, provider: string, on: boolean) {
  await db.query(
    `INSERT INTO payment_gateways (provider, enabled, sort) VALUES ($1, $2, 0)
     ON CONFLICT (provider) DO UPDATE SET enabled = EXCLUDED.enabled, allowed = payment_gateways.allowed OR EXCLUDED.enabled, updated_at = now()`,
    [provider, on],
  );
}

/** Builds the gateway of a row; null when its driver is gone, unavailable here or not set up. */
function buildGateway(ctx: AppContext, row: GatewayRow, siteSlug: string): { driver: PaymentDriver; gateway: PaymentGateway } | null {
  const driver = driverFor(row.provider);
  if (!driver || !driver.available(ctx) || credentialProblem(driver, row.credentials)) return null;
  return { driver, gateway: driver.create(ctx, { credentials: row.credentials, testMode: driver.testMode === 'toggle' && row.testMode, siteSlug }) };
}

/** The site's buyer-facing name of a gateway: its own label, else the gateway's name. */
const labelOf = (row: GatewayRow, driver: PaymentDriver): Text => ({ en: row.label?.en || driver.name.en, fa: row.label?.fa || driver.name.fa });

export interface UsableGateway {
  provider: string;
  label: Text;
  description: Text;
  gateway: PaymentGateway;
}

/** The gateways a buyer can pay with now, in the site's order. */
export async function usableGateways(ctx: AppContext, site: Site): Promise<UsableGateway[]> {
  const out: UsableGateway[] = [];
  for (const row of await gatewayRows(site.db)) {
    if (!row.allowed || !row.enabled) continue;
    const built = buildGateway(ctx, row, site.slug);
    if (built) out.push({ provider: row.provider, label: labelOf(row, built.driver), description: row.description ?? { en: '', fa: '' }, gateway: built.gateway });
  }
  return out;
}

/** The gateway a payment starts with: the one the buyer chose, else the site's first. */
async function pickGateway(ctx: AppContext, site: Site, provider?: string): Promise<PaymentGateway> {
  const usable = await usableGateways(ctx, site);
  if (!usable.length) throw new AppError(409, 'payments_unavailable', 'Online payment is not enabled for this site');
  if (!provider) return usable[0].gateway;
  const chosen = usable.find((g) => g.provider === provider);
  if (!chosen) throw badRequest('This payment method is not available');
  return chosen.gateway;
}

/**
 * The gateway that verifies an earlier payment: the one it started with, even if the site has
 * turned it off since (the buyer may already have paid).
 */
async function gatewayOfPayment(ctx: AppContext, site: Site, provider: string): Promise<PaymentGateway | null> {
  const row = (await site.db.query<GatewayRow>(`SELECT ${GATEWAY_COLUMNS} FROM payment_gateways WHERE provider = $1`, [provider])).rows[0];
  return row ? (buildGateway(ctx, row, site.slug)?.gateway ?? null) : null;
}

/**
 * A verified payment on a request: the amount is added to what was paid, nothing is due any
 * more, and the request moves to its workflow's "after payment" stage when it has one.
 */
async function settleRequestPayment(tx: pg.PoolClient, leadId: string, amount: string, isTest: boolean, currency: string, refId: string) {
  const { rows } = await tx.query<{ status: string; type: string; stage_kind: string }>(
    `UPDATE leads SET paid_minor = paid_minor + $2, amount_due_minor = 0, payment_status = $3, unread = true, updated_at = now() WHERE id = $1
     RETURNING status, type, stage_kind`,
    [leadId, amount, isTest ? 'test_paid' : 'paid'],
  );
  await addEvent(tx, { leadId }, { kind: 'payment', public: true, data: { ok: true, amountMinor: amount, currency, refId, test: isTest }, byCustomer: true });
  const lead = rows[0];
  const workflow = requestTypeConfig(await loadSettings(tx), lead.type)?.workflow;
  const target = workflow?.stages.find((s) => s.key === workflow.paidStage);
  if (target && lead.stage_kind === 'open' && target.key !== lead.status) {
    await tx.query('UPDATE leads SET status = $2, stage_kind = $3 WHERE id = $1', [leadId, target.key, target.kind]);
    await addEvent(tx, { leadId }, { kind: 'stage', public: target.visible, data: { from: lead.status, to: target.key, afterPayment: true } });
  }
}

/** Starts a payment of the amount a request asks for; returns the gateway URL. */
export async function startRequestPayment(
  ctx: AppContext,
  site: Site,
  lead: { id: string; number: string; email: string; phone: string },
  returnUrl: string,
  provider?: string,
): Promise<{ redirectUrl: string; isTest: boolean }> {
  const gateway = await pickGateway(ctx, site, provider);
  const { paymentId, amount, currency } = await withTransaction(site.db, async (tx) => {
    const { rows } = await tx.query<{ amount_due_minor: string; currency: string; stage_kind: string }>(
      'SELECT amount_due_minor::text, currency, stage_kind FROM leads WHERE id = $1 FOR UPDATE',
      [lead.id],
    );
    const row = rows[0];
    if (!row || row.stage_kind !== 'open' || BigInt(row.amount_due_minor) <= 0n) throw badRequest('Nothing to pay for this request');
    // An abandoned earlier attempt is given up, so the customer can try again.
    await tx.query(`UPDATE payments SET status = 'cancelled', failure_reason = 'Replaced by a new attempt', updated_at = now() WHERE lead_id = $1 AND status = 'initiated'`, [lead.id]);
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO payments (lead_id, provider, is_test, amount_minor, currency, return_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [lead.id, gateway.name, gateway.isTest, row.amount_due_minor, row.currency, returnUrl],
    );
    return { paymentId: inserted.rows[0].id, amount: BigInt(row.amount_due_minor), currency: row.currency };
  });
  try {
    const { authority, redirectUrl } = await gateway.request({
      amountMinor: amount,
      currency,
      callbackUrl: `${ctx.env.PUBLIC_API_URL}/api/v1/payments/callback/${site.slug}/${paymentId}`,
      description: `Request R${lead.number}`,
      email: lead.email || undefined,
      mobile: lead.phone || undefined,
    });
    await site.db.query('UPDATE payments SET authority = $2, updated_at = now() WHERE id = $1', [paymentId, authority]);
    await site.db.query(`UPDATE leads SET payment_status = 'pending', updated_at = now() WHERE id = $1`, [lead.id]);
    await auditTenant(site.db, { action: 'payment.started', target: lead.id, metadata: { paymentId, provider: gateway.name, test: gateway.isTest } });
    return { redirectUrl, isTest: gateway.isTest };
  } catch (err) {
    await site.db.query(`UPDATE payments SET status = 'failed', failure_reason = $2, updated_at = now() WHERE id = $1`, [paymentId, (err as Error).message.slice(0, 500)]);
    await site.db.query(`UPDATE leads SET payment_status = 'due' WHERE id = $1 AND payment_status = 'pending'`, [lead.id]);
    ctx.log.error({ err }, 'payment request failed');
    throw new AppError(502, 'payment_gateway_error', 'The payment gateway is not responding. Please try again.');
  }
}

interface OrderRow {
  payment_method: string;
  pricing_pending: boolean;
  id: string;
  number: string;
  status: string;
  payment_status: string;
  currency: string;
  total_minor: string;
  public_token_hash: string | null;
  customer: { email?: string; phone?: string };
}

async function findOrderByNumber(db: pg.Pool, number: string): Promise<OrderRow> {
  const { rows } = await db.query<OrderRow>(
    'SELECT id, number::text, status, payment_status, currency, total_minor::text, public_token_hash, customer, pricing_pending, payment_method FROM orders WHERE number = $1',
    [number],
  );
  if (!rows[0]) throw notFound('Order');
  return rows[0];
}

export async function findOrderForBuyer(db: pg.Pool | pg.PoolClient, number: string, token: string): Promise<OrderRow> {
  const { rows } = await db.query<OrderRow>(
    'SELECT id, number::text, status, payment_status, currency, total_minor::text, public_token_hash, customer, pricing_pending, payment_method FROM orders WHERE number = $1',
    [number],
  );
  const order = rows[0];
  // Same 404 for "no such order" and "wrong token", so order numbers cannot be enumerated.
  if (!order?.public_token_hash || !safeEqual(order.public_token_hash, sha256(token))) throw notFound('Order');
  return order;
}

/** Starts a payment for an order and returns the gateway URL to send the buyer to. */
export async function startPayment(
  ctx: AppContext,
  site: Site,
  input: { number: string; token: string; returnUrl: string; provider?: string },
  /** The caller already checked the buyer may open this order (signed in, or a signed link). */
  verified = false,
): Promise<{ redirectUrl: string; isTest: boolean }> {
  const gateway = await pickGateway(ctx, site, input.provider);

  const order = verified ? await findOrderByNumber(site.db, input.number) : await findOrderForBuyer(site.db, input.number, input.token);
  if (order.payment_method === 'cod') throw badRequest('This order uses offline payment');
  if (order.pricing_pending) throw badRequest('This order awaits cafe confirmation and is not payable');
  if (order.status === 'cancelled') throw badRequest('This order was cancelled');
  if (['paid', 'test_paid', 'refunded'].includes(order.payment_status)) throw badRequest('This order is already paid');

  const amount = BigInt(order.total_minor);
  const { rows } = await site.db.query<{ id: string }>(
    `INSERT INTO payments (order_id, provider, is_test, amount_minor, currency, return_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [order.id, gateway.name, gateway.isTest, amount.toString(), order.currency, input.returnUrl],
  );
  const paymentId = rows[0].id;

  try {
    const { authority, redirectUrl } = await gateway.request({
      amountMinor: amount,
      currency: order.currency,
      callbackUrl: `${ctx.env.PUBLIC_API_URL}/api/v1/payments/callback/${site.slug}/${paymentId}`,
      description: `Order #${order.number}`,
      email: order.customer.email,
      mobile: order.customer.phone,
    });
    await site.db.query('UPDATE payments SET authority = $2, updated_at = now() WHERE id = $1', [paymentId, authority]);
    await site.db.query(`UPDATE orders SET payment_status = 'pending', updated_at = now() WHERE id = $1`, [order.id]);
    await auditTenant(site.db, { action: 'payment.started', target: order.id, metadata: { paymentId, provider: gateway.name, test: gateway.isTest } });
    return { redirectUrl, isTest: gateway.isTest };
  } catch (err) {
    await site.db.query(`UPDATE payments SET status = 'failed', failure_reason = $2, updated_at = now() WHERE id = $1`, [paymentId, (err as Error).message.slice(0, 500)]);
    ctx.log.error({ err }, 'payment request failed');
    throw new AppError(502, 'payment_gateway_error', 'The payment gateway is not responding. Please try again.');
  }
}

interface PaymentRow {
  id: string;
  order_id: string | null;
  lead_id: string | null;
  provider: string;
  is_test: boolean;
  status: string;
  authority: string | null;
  amount: string;
  currency: string;
  return_url: string;
  sandbox_decision: string | null;
  created_at: Date;
}

async function lockPayment(tx: pg.PoolClient, paymentId: string): Promise<PaymentRow> {
  const { rows } = await tx.query<PaymentRow>(`SELECT p.*, p.amount_minor::text AS amount, p.currency::text AS currency FROM payments p WHERE p.id = $1 FOR UPDATE`, [paymentId]);
  if (!rows[0]) throw notFound('Payment');
  return rows[0];
}

/** Records a payment as failed or cancelled, on its order or request too. */
async function failPayment(tx: pg.PoolClient, payment: PaymentRow, status: 'failed' | 'cancelled', reason: string) {
  await tx.query('UPDATE payments SET status = $2, failure_reason = $3, updated_at = now() WHERE id = $1', [payment.id, status, reason]);
  if (payment.order_id) {
    await tx.query(`UPDATE orders SET payment_status = 'failed', updated_at = now() WHERE id = $1 AND payment_status = 'pending'`, [payment.order_id]);
  } else {
    // A request keeps its amount due, so the customer can try again.
    await tx.query(`UPDATE leads SET payment_status = 'due', updated_at = now() WHERE id = $1 AND payment_status = 'pending'`, [payment.lead_id]);
    await addEvent(tx, { leadId: payment.lead_id! }, { kind: 'payment', public: true, data: { ok: false, amountMinor: payment.amount, currency: payment.currency }, byCustomer: true });
  }
  await auditTenant(tx, { action: 'payment.failed', target: payment.order_id ?? payment.lead_id ?? undefined, metadata: { paymentId: payment.id, reason } });
}

/** Records a verified payment and marks its order or request as paid. */
async function succeedPayment(tx: pg.PoolClient, payment: PaymentRow, result: Extract<VerifyResult, { ok: true }>) {
  await tx.query(`UPDATE payments SET status = 'succeeded', ref_id = $2, card_pan = $3, verified_at = now(), updated_at = now() WHERE id = $1`, [payment.id, result.refId, result.cardPan ?? null]);
  if (payment.order_id) {
    await tx.query(
      `UPDATE orders SET payment_status = $2, status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END, unread = true, updated_at = now() WHERE id = $1`,
      [payment.order_id, payment.is_test ? 'test_paid' : 'paid'],
    );
    await addEvent(tx, { orderId: payment.order_id }, { kind: 'payment', public: true, data: { ok: true, amountMinor: payment.amount, currency: payment.currency, refId: result.refId, test: payment.is_test } });
  } else {
    await settleRequestPayment(tx, payment.lead_id!, payment.amount, payment.is_test, payment.currency, result.refId);
  }
  await auditTenant(tx, { action: 'payment.succeeded', target: payment.order_id ?? payment.lead_id ?? undefined, metadata: { paymentId: payment.id, refId: result.refId, test: payment.is_test } });
}

const verifyWith = (gateway: PaymentGateway, payment: PaymentRow) =>
  gateway.verify({ authority: payment.authority!, amountMinor: BigInt(payment.amount), currency: payment.currency, sandboxDecision: payment.sandbox_decision });

/**
 * Handles the gateway's return. Verifies server-to-server before marking
 * anything as paid. Idempotent: a repeated callback returns the same result.
 * Returns the URL to send the buyer back to.
 */
export async function completePayment(ctx: AppContext, site: Site, input: { paymentId: string; answer: Record<string, string | undefined> }): Promise<string> {
  return withTransaction(site.db, async (tx) => {
    const payment = await lockPayment(tx, input.paymentId);
    const back = (result: string) => `${payment.return_url}${payment.return_url.includes('?') ? '&' : '?'}payment=${result}`;

    if (payment.status === 'succeeded') return back('success');
    if (payment.status !== 'initiated') return back('failed');
    const gateway = await gatewayOfPayment(ctx, site, payment.provider);
    if (!gateway) throw new AppError(409, 'payments_unavailable', 'Payment provider changed; payment cannot be verified');
    // Each gateway names its answer differently; its driver reads it.
    const { authority, status } = driverFor(payment.provider)!.readCallback(input.answer);
    if (authority && authority !== payment.authority && authority !== String(payment.authority).split(':')[0]) throw badRequest('Payment reference mismatch');

    if (status !== 'OK') {
      await failPayment(tx, payment, 'cancelled', 'Buyer cancelled or gateway reported failure');
      return back('cancelled');
    }
    const result = await verifyWith(gateway, payment);
    if (!result.ok) {
      await failPayment(tx, payment, 'failed', result.reason);
      return back('failed');
    }
    await succeedPayment(tx, payment, result);
    return back('success');
  });
}

/** How long a buyer may still be on the gateway's page; a recheck before that leaves the payment open. */
const STILL_PAYING_MS = 30 * 60_000;

/**
 * Asks the gateway again about a payment that never came back (the buyer closed the page, the
 * return failed…). Paid → recorded as paid; not paid and old enough → failed.
 */
export async function recheckPayment(ctx: AppContext, site: Site, paymentId: string, actorUserId: string): Promise<{ status: string; reason?: string }> {
  return withTransaction(site.db, async (tx) => {
    const payment = await lockPayment(tx, paymentId);
    if (payment.status !== 'initiated') return { status: payment.status };
    if (!payment.authority) {
      await failPayment(tx, payment, 'failed', 'The gateway never answered the payment request');
      return { status: 'failed' };
    }
    const gateway = await gatewayOfPayment(ctx, site, payment.provider);
    if (!gateway) throw new AppError(409, 'payments_unavailable', 'This gateway is not set up any more, so the payment cannot be checked');
    let result: VerifyResult;
    try {
      result = await verifyWith(gateway, payment);
    } catch (err) {
      ctx.log.error({ err }, 'payment recheck failed');
      throw new AppError(502, 'payment_gateway_error', 'The payment gateway is not responding. Please try again.');
    }
    await auditTenant(tx, { actorUserId, action: 'payment.rechecked', target: payment.id, metadata: { ok: result.ok } });
    if (result.ok) {
      await succeedPayment(tx, payment, result);
      return { status: 'succeeded' };
    }
    if (Date.now() - new Date(payment.created_at).getTime() < STILL_PAYING_MS) return { status: 'initiated', reason: result.reason };
    await failPayment(tx, payment, 'failed', result.reason);
    return { status: 'failed', reason: result.reason };
  });
}

/** Tries a gateway's settings with a small payment request (no money moves: the buyer step never happens). */
export async function testGateway(ctx: AppContext, site: Site, row: GatewayRow): Promise<{ ok: boolean; message: string }> {
  const driver = driverFor(row.provider);
  if (!driver) throw notFound('Gateway');
  if (!driver.available(ctx)) return { ok: false, message: 'This gateway is not available on this server' };
  const problem = credentialProblem(driver, row.credentials);
  if (problem) return { ok: false, message: problem };
  const built = buildGateway(ctx, row, site.slug)!;
  try {
    await built.gateway.request({ amountMinor: 10_000n, currency: 'IRR', callbackUrl: `${ctx.env.PUBLIC_API_URL}/api/v1/payments/test-return`, description: 'Connection test' });
    return { ok: true, message: built.gateway.isTest ? 'Connected (test mode: no real money moves)' : 'Connected' };
  } catch (err) {
    return { ok: false, message: (err as Error).message.slice(0, 300) };
  }
}
