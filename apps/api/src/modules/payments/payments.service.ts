import { paymentSettingsSchema, requestTypeConfig, type PaymentSettings } from '@site-builder/shared';
import type pg from 'pg';
import { safeEqual, sha256 } from '../../common/crypto.js';
import { AppError, badRequest, notFound } from '../../common/errors.js';
import type { AppContext } from '../../context.js';
import { withTransaction } from '../../database/tenant/pools.js';
import { auditTenant } from '../audit/audit.js';
import { SandboxGateway, IdpayGateway, ZarinpalGateway, ZibalGateway, type PaymentGateway } from './gateways.js';
import { loadSettings } from '../interactions/context.js';
import { addEvent } from '../interactions/requests.service.js';

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
  site: { slug: string; db: pg.Pool },
  lead: { id: string; number: string; email: string; phone: string },
  returnUrl: string,
): Promise<{ redirectUrl: string; isTest: boolean }> {
  const gateway = gatewayFor(ctx, await getPaymentSettings(site.db), site.slug);
  if (!gateway) throw new AppError(409, 'payments_unavailable', 'Online payment is not enabled for this site');
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

export async function getPaymentSettings(db: pg.Pool): Promise<PaymentSettings> {
  const { rows } = await db.query('SELECT provider, merchant_id AS "merchantId", use_sandbox_host AS "useSandboxHost", allow_cod AS "allowCod" FROM payment_settings WHERE id = 1');
  return paymentSettingsSchema.parse(rows[0] ?? { provider: 'none' });
}

export function gatewayFor(ctx: AppContext, settings: PaymentSettings, siteSlug: string): PaymentGateway | null {
  if (settings.provider === 'zarinpal' && settings.merchantId) return new ZarinpalGateway(settings.merchantId, settings.useSandboxHost, ctx.httpFetch);
  if (settings.provider === 'zibal' && settings.merchantId) return new ZibalGateway(settings.merchantId, ctx.httpFetch);
  if (settings.provider === 'idpay' && settings.merchantId) return new IdpayGateway(settings.merchantId, settings.useSandboxHost, ctx.httpFetch);
  if (settings.provider === 'sandbox' && ctx.env.paymentSandboxEnabled) {
    return new SandboxGateway((authority) => `${ctx.env.PUBLIC_API_URL}/api/v1/payments/sandbox/${siteSlug}/${encodeURIComponent(authority)}`);
  }
  return null;
}

interface OrderRow {
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
    'SELECT id, number::text, status, payment_status, currency, total_minor::text, public_token_hash, customer FROM orders WHERE number = $1',
    [number],
  );
  if (!rows[0]) throw notFound('Order');
  return rows[0];
}

export async function findOrderForBuyer(db: pg.Pool | pg.PoolClient, number: string, token: string): Promise<OrderRow> {
  const { rows } = await db.query<OrderRow>(
    'SELECT id, number::text, status, payment_status, currency, total_minor::text, public_token_hash, customer FROM orders WHERE number = $1',
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
  site: { slug: string; db: pg.Pool },
  input: { number: string; token: string; returnUrl: string },
  /** The caller already checked the buyer may open this order (signed in, or a signed link). */
  verified = false,
): Promise<{ redirectUrl: string; isTest: boolean }> {
  const gateway = gatewayFor(ctx, await getPaymentSettings(site.db), site.slug);
  if (!gateway) throw new AppError(409, 'payments_unavailable', 'Online payment is not enabled for this site');

  const order = verified ? await findOrderByNumber(site.db, input.number) : await findOrderForBuyer(site.db, input.number, input.token);
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

/**
 * Handles the gateway's return. Verifies server-to-server before marking
 * anything as paid. Idempotent: a repeated callback returns the same result.
 * Returns the URL to send the buyer back to.
 */
export async function completePayment(
  ctx: AppContext,
  site: { slug: string; db: pg.Pool },
  input: { paymentId: string; authority?: string; status?: string },
): Promise<string> {
  const gateway = gatewayFor(ctx, await getPaymentSettings(site.db), site.slug);

  return withTransaction(site.db, async (tx) => {
    const { rows } = await tx.query(
      `SELECT p.*, p.amount_minor::text AS amount, p.currency::text AS currency FROM payments p WHERE p.id = $1 FOR UPDATE`,
      [input.paymentId],
    );
    const payment = rows[0];
    if (!payment) throw notFound('Payment');
    const back = (result: string) => `${payment.return_url}${payment.return_url.includes('?') ? '&' : '?'}payment=${result}`;

    if (payment.status === 'succeeded') return back('success');
    if (payment.status !== 'initiated') return back('failed');
    if (!gateway || gateway.name !== payment.provider) throw new AppError(409, 'payments_unavailable', 'Payment provider changed; payment cannot be verified');
    if (input.authority && input.authority !== payment.authority && input.authority !== String(payment.authority).split(':')[0]) throw badRequest('Payment reference mismatch');

    const subject = payment.order_id ?? payment.lead_id;
    const fail = async (status: 'failed' | 'cancelled', reason: string) => {
      await tx.query('UPDATE payments SET status = $2, failure_reason = $3, updated_at = now() WHERE id = $1', [payment.id, status, reason]);
      if (payment.order_id) {
        await tx.query(`UPDATE orders SET payment_status = 'failed', updated_at = now() WHERE id = $1 AND payment_status = 'pending'`, [payment.order_id]);
      } else {
        // A request keeps its amount due, so the customer can try again.
        await tx.query(`UPDATE leads SET payment_status = 'due', updated_at = now() WHERE id = $1 AND payment_status = 'pending'`, [payment.lead_id]);
        await addEvent(tx, { leadId: payment.lead_id }, { kind: 'payment', public: true, data: { ok: false, amountMinor: payment.amount, currency: payment.currency }, byCustomer: true });
      }
      await auditTenant(tx, { action: 'payment.failed', target: subject, metadata: { paymentId: payment.id, reason } });
      return back(status === 'cancelled' ? 'cancelled' : 'failed');
    };

    if (input.status !== 'OK') return fail('cancelled', 'Buyer cancelled or gateway reported failure');

    const result = await gateway.verify({ authority: payment.authority, amountMinor: BigInt(payment.amount), currency: payment.currency, sandboxDecision: payment.sandbox_decision });
    if (!result.ok) return fail('failed', result.reason);

    await tx.query(`UPDATE payments SET status = 'succeeded', ref_id = $2, card_pan = $3, verified_at = now(), updated_at = now() WHERE id = $1`, [
      payment.id,
      result.refId,
      result.cardPan ?? null,
    ]);
    if (payment.order_id) {
      await tx.query(
        `UPDATE orders SET payment_status = $2, status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END, unread = true, updated_at = now() WHERE id = $1`,
        [payment.order_id, payment.is_test ? 'test_paid' : 'paid'],
      );
      await addEvent(tx, { orderId: payment.order_id }, { kind: 'payment', public: true, data: { ok: true, amountMinor: payment.amount, currency: payment.currency, refId: result.refId, test: payment.is_test } });
    } else {
      await settleRequestPayment(tx, payment.lead_id, payment.amount, payment.is_test, payment.currency, result.refId);
    }
    await auditTenant(tx, { action: 'payment.succeeded', target: subject, metadata: { paymentId: payment.id, refId: result.refId, test: payment.is_test } });
    return back('success');
  });
}
