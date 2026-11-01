import { couponDiscount, fillTemplate, orderInputSchema, shippingCost, shopSchema, STANDARD_MESSAGES, type CheckoutSettings, type SiteSettings } from '@site-builder/shared';
import type { AppContext } from '../../context.js';
import type { TenantContext } from '../../types.js';
import { caseLink, loadSettings } from '../interactions/context.js';
import { messageLocale, notifyCustomer, siteName } from '../interactions/notify.js';
import type pg from 'pg';
import type { z } from 'zod';
import { randomToken, sha256 } from '../../common/crypto.js';
import { AppError, badRequest, conflict, notFound } from '../../common/errors.js';
import { withTransaction } from '../../database/tenant/pools.js';
import { auditTenant } from '../audit/audit.js';
import { availabilityOf, loadCollections, seatsTaken, type ItemRow } from '../collections/collections.service.js';
import { addEvent, eventsOf, markDelivered } from '../interactions/requests.service.js';

type OrderInput = z.output<typeof orderInputSchema>;

/** The shop's rules (limits, order stages) from the site settings, with defaults. */
export async function shopRules(db: pg.Pool | pg.PoolClient) {
  const { rows } = await db.query(`SELECT settings->'shop' AS shop FROM site_settings WHERE id = 1`);
  const parsed = shopSchema.safeParse(rows[0]?.shop ?? undefined);
  return parsed.success ? parsed.data : shopSchema.parse(undefined);
}

interface ProductRow {
  id: string;
  slug: string;
  name: Record<string, string>;
  price_minor: string | null;
  currency: string;
  stock: number | null;
  discount_percent: number;
  colors: { name: Record<string, string>; hex: string }[];
  max_per_order: number | null;
  variants: Variant[];
}

export const ORDER_COLUMNS = `id, number::text AS number, status, payment_status AS "paymentStatus", payment_method AS "paymentMethod", customer, note, currency,
  customer_id AS "customerId", unread,
  subtotal_minor::text AS "subtotalMinor", total_minor::text AS "totalMinor", shipping_minor::text AS "shippingMinor", shipping_method AS "shippingMethod",
  discount_minor::text AS "discountMinor", coupon_code AS "couponCode", created_at AS "createdAt", updated_at AS "updatedAt"`;

/** A product variant (size, model…): own price and stock when set, else the product's. */
interface Variant {
  name: Record<string, string>;
  priceMinor: number | null;
  stock: number | null;
}

/** Products whose stock (or a variant's) fell to the shop's warning level with this order. */
export interface LowStock {
  slug: string;
  name: Record<string, string>;
  variant: string;
  stock: number;
}

/**
 * Checks the buyer's details against the shop's checkout settings (which questions are asked and
 * required); throws a validation error naming each problem.
 */
function checkCheckout(input: OrderInput, checkout: CheckoutSettings) {
  const issues: { path: string; message: string; code: string }[] = [];
  const c = input.customer;
  const need = (path: string, rule: 'off' | 'optional' | 'required', value: string | undefined) => {
    if (rule === 'required' && !value?.trim()) issues.push({ path: `customer.${path}`, message: 'required', code: 'too_small' });
  };
  need('email', checkout.email, c.email);
  need('address', checkout.address, c.address);
  need('postalCode', checkout.postalCode, c.postalCode);
  if (c.postalCode && !/^\d{10}$/.test(c.postalCode.replace(/[\s-]/g, ''))) issues.push({ path: 'customer.postalCode', message: 'postalCode', code: 'pattern' });
  if (checkout.region && checkout.address === 'required') {
    need('province', 'required', c.province);
    need('city', 'required', c.city);
  }
  for (const f of checkout.fields) {
    const v = c.answers[f.id];
    if (f.required && !v?.trim()) issues.push({ path: `customer.answers.${f.id}`, message: 'required', code: 'too_small' });
    if (v && f.type === 'select' && !f.options.some((o) => o.en === v || o.fa === v)) issues.push({ path: `customer.answers.${f.id}`, message: 'option', code: 'option' });
  }
  if (issues.length) throw new AppError(400, 'validation_failed', 'Invalid request body', issues);
}

/** The questions and answers of the shop's own checkout fields, as the staff read them. */
function labelledCheckoutAnswers(input: OrderInput, checkout: CheckoutSettings) {
  return checkout.fields
    .filter((f) => input.customer.answers[f.id]?.trim())
    .map((f) => ({ label: f.label.fa || f.label.en || f.id, value: input.customer.answers[f.id].trim() }));
}

/**
 * Creates an order using prices and availability from the database only.
 * Stock is reserved atomically; if any item cannot be satisfied, nothing is written.
 * Payment is never marked as done here. Discounts come from the product or a valid code, shipping
 * from the shop's methods; the buyer's figures are never used.
 */
export async function createOrder(db: pg.Pool, input: OrderInput, customerId: string | null = null) {
  // Merge duplicate lines (same product, colour and variant); limits and stock use each product's total.
  const merged = new Map<string, { productId: string; option: string; variant: string; quantity: number }>();
  for (const item of input.items) {
    if (!item.productId) continue;
    const key = `${item.productId}|${item.option}|${item.variant}`;
    const line = merged.get(key) ?? { productId: item.productId, option: item.option, variant: item.variant, quantity: 0 };
    line.quantity += item.quantity;
    merged.set(key, line);
  }
  const quantities = new Map<string, number>();
  for (const l of merged.values()) quantities.set(l.productId, (quantities.get(l.productId) ?? 0) + l.quantity);
  // Content-table items (class seats, event tickets…): one line per item.
  const seats = new Map<string, number>();
  for (const item of input.items) if (item.itemId) seats.set(item.itemId, (seats.get(item.itemId) ?? 0) + item.quantity);

  // Lets the buyer (and only the buyer) look up and pay for this order.
  const orderToken = randomToken(24);

  const rules = await shopRules(db);
  checkCheckout(input, rules.checkout);
  const totalUnits = [...quantities.values(), ...seats.values()].reduce((a, b) => a + b, 0);
  if (rules.maxItemsPerOrder !== null && totalUnits > rules.maxItemsPerOrder) throw badRequest(`An order can have at most ${rules.maxItemsPerOrder} items`);
  const method = rules.shipping.length ? rules.shipping.find((m) => m.id === input.shippingMethod) : undefined;
  if (rules.shipping.length && !method) throw new AppError(400, 'validation_failed', 'Invalid request body', [{ path: 'shippingMethod', message: 'required', code: 'too_small' }]);

  return withTransaction(db, async (tx) => {
    const ids = [...quantities.keys()];
    const { rows: products } = !ids.length ? { rows: [] as ProductRow[] } : await tx.query<ProductRow>(
      `SELECT id, slug, name, price_minor::text AS price_minor, currency, stock, discount_percent, colors, max_per_order, variants FROM products
        WHERE id = ANY($1::uuid[]) AND status = 'published' AND is_available AND price_minor IS NOT NULL
        FOR UPDATE`,
      [ids],
    );
    const byId = new Map(products.map((p) => [p.id, p]));
    const unavailable = ids.filter((id) => !byId.has(id));
    if (unavailable.length) throw badRequest('Some products are not available for ordering', { productIds: unavailable });

    const itemLines = await lockItemLines(tx, seats);
    const currencies = new Set([...products.map((p) => p.currency), ...itemLines.map((l) => l.currency)]);
    if (currencies.size > 1) throw badRequest('All items in one order must use the same currency');

    for (const id of ids) {
      const product = byId.get(id)!;
      const limit = Math.min(rules.maxPerProduct, product.max_per_order ?? rules.maxPerProduct);
      if (quantities.get(id)! > limit) throw badRequest(`Quantity of ${product.slug} is limited to ${limit} per order`);
    }

    let subtotal = 0n;
    const lines = [...merged.values()].map(({ productId, option, variant, quantity }) => {
      const product = byId.get(productId)!;
      // A colour must be one of the product's own; products without colours take none.
      const colors = product.colors ?? [];
      if (colors.length ? !colors.some((c) => Object.values(c.name).includes(option)) : option !== '') throw badRequest(`Choose a valid colour for ${product.slug}`);
      // Likewise a variant, when the product has variants.
      const variants = product.variants ?? [];
      const chosen = variants.find((v) => Object.values(v.name).includes(variant));
      if (variants.length ? !chosen : variant !== '') throw badRequest(`Choose a valid option for ${product.slug}`);
      const base = BigInt(chosen?.priceMinor ?? product.price_minor!);
      const unit = (base * BigInt(100 - (product.discount_percent ?? 0))) / 100n;
      const lineTotal = unit * BigInt(quantity);
      subtotal += lineTotal;
      return { product, option, variant: chosen ? chosen.name.fa || chosen.name.en : '', variantIndex: chosen ? variants.indexOf(chosen) : -1, quantity, unit, lineTotal };
    });
    for (const l of itemLines) subtotal += l.unit * BigInt(l.quantity);

    // Stock: a variant with its own stock counts that; else the product's stock.
    const lowStock: LowStock[] = [];
    for (const id of ids) {
      const product = byId.get(id)!;
      const own = lines.filter((l) => l.product.id === id);
      const variants = [...(product.variants ?? [])];
      let productUnits = 0;
      let variantsChanged = false;
      for (const l of own) {
        const v = l.variantIndex >= 0 ? variants[l.variantIndex] : null;
        if (v && v.stock !== null) {
          if (v.stock < l.quantity) throw conflict(`Not enough stock for ${product.slug} (${l.variant})`);
          variants[l.variantIndex] = { ...v, stock: v.stock - l.quantity };
          variantsChanged = true;
          if (rules.lowStock !== null && v.stock - l.quantity <= rules.lowStock) lowStock.push({ slug: product.slug, name: product.name, variant: l.variant, stock: v.stock - l.quantity });
        } else productUnits += l.quantity;
      }
      if (variantsChanged) await tx.query('UPDATE products SET variants = $2, updated_at = now() WHERE id = $1', [id, JSON.stringify(variants)]);
      if (product.stock === null || !productUnits) continue;
      const res = await tx.query<{ stock: number }>('UPDATE products SET stock = stock - $2, updated_at = now() WHERE id = $1 AND stock >= $2 RETURNING stock', [id, productUnits]);
      if (!res.rowCount) throw conflict(`Not enough stock for ${product.slug}`);
      if (rules.lowStock !== null && res.rows[0].stock <= rules.lowStock) lowStock.push({ slug: product.slug, name: product.name, variant: '', stock: res.rows[0].stock });
    }

    // A discount code: checked and counted while its row is locked, so a limited code is not overused.
    let discount = 0n;
    let couponCode: string | null = null;
    if (input.coupon) {
      const code = input.coupon.toUpperCase();
      const { rows: found } = await tx.query<{ id: string; kind: 'percent' | 'amount'; value: string; min_order_minor: string; max_uses: number | null; used_count: number }>(
        `SELECT id, kind, value::text, min_order_minor::text, max_uses, used_count FROM coupons
          WHERE code = $1 AND active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) FOR UPDATE`,
        [code],
      );
      const c = found[0];
      const invalid = (reason: string) => new AppError(400, 'validation_failed', 'Invalid request body', [{ path: 'coupon', message: reason, code: reason }]);
      if (!c) throw invalid('coupon_invalid');
      if (c.max_uses !== null && c.used_count >= c.max_uses) throw invalid('coupon_used_up');
      if (subtotal < BigInt(c.min_order_minor)) throw invalid('coupon_min_order');
      discount = BigInt(couponDiscount({ kind: c.kind, value: Number(c.value) }, Number(subtotal)));
      couponCode = code;
      await tx.query('UPDATE coupons SET used_count = used_count + 1, updated_at = now() WHERE id = $1', [c.id]);
    }
    const shipping = method ? BigInt(shippingCost(method, Number(subtotal - discount))) : 0n;
    const total = subtotal - discount + shipping;
    const customer = { ...input.customer, answers: labelledCheckoutAnswers(input, rules.checkout) };

    const { rows } = await tx.query(
      `INSERT INTO orders (customer, note, currency, subtotal_minor, total_minor, public_token_hash, payment_method, customer_id, shipping_minor, shipping_method, discount_minor, coupon_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING ${ORDER_COLUMNS}`,
      [
        customer,
        input.note ?? null,
        [...currencies][0],
        subtotal.toString(),
        total.toString(),
        sha256(orderToken),
        input.paymentMethod,
        customerId,
        shipping.toString(),
        method ? { id: method.id, label: method.label } : null,
        discount.toString(),
        couponCode,
      ],
    );
    const order = rows[0];
    await addEvent(tx, { orderId: order.id }, { kind: 'created', public: true, data: { stage: order.status }, byCustomer: true });
    for (const line of lines) {
      await tx.query(
        `INSERT INTO order_items (order_id, product_id, product_slug, product_name, unit_price_minor, quantity, line_total_minor, option, variant)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [order.id, line.product.id, line.product.slug, line.product.name, line.unit.toString(), line.quantity, line.lineTotal.toString(), line.option, line.variant],
      );
    }
    for (const l of itemLines) {
      await tx.query(
        `INSERT INTO order_items (order_id, product_id, product_slug, product_name, unit_price_minor, quantity, line_total_minor, option, collection_item_id)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, '', $7)`,
        [order.id, l.slug, l.title, l.unit.toString(), l.quantity, (l.unit * BigInt(l.quantity)).toString(), l.id],
      );
    }
    await auditTenant(tx, { action: 'order.created', target: order.id, metadata: { number: order.number } });
    return { ...order, orderToken, lowStock, items: await orderItems(tx, order.id) };
  });
}

/**
 * Locks the ordered content-table items and checks each one against its table: on sale, before
 * the deadline, within the seats left and the per-order limit. Seats are counted while the item
 * rows are locked, so two buyers cannot take the last seat at once.
 */
async function lockItemLines(tx: pg.PoolClient, seats: Map<string, number>) {
  if (!seats.size) return [];
  const ids = [...seats.keys()];
  const { rows } = await tx.query<ItemRow>(
    `SELECT id, collection_id AS "collectionId", slug, title, data, status, position, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM collection_items WHERE id = ANY($1::uuid[]) AND status = 'published' ORDER BY id FOR UPDATE`,
    [ids],
  );
  if (rows.length !== ids.length) throw badRequest('Some items are not available for ordering', { itemIds: ids.filter((id) => !rows.some((r) => r.id === id)) });
  const tables = await loadCollections(tx);
  const lines = [];
  for (const item of rows) {
    const table = tables.find((t) => t.id === item.collectionId);
    if (!table?.commerce.enabled) throw badRequest(`${item.slug} cannot be bought online`);
    const quantity = seats.get(item.id)!;
    if (quantity > table.commerce.maxPerOrder) throw badRequest(`Quantity of ${item.slug} is limited to ${table.commerce.maxPerOrder} per order`);
    const taken = (await seatsTaken(tx, table, [item.id])).get(item.id) ?? 0;
    const state = availabilityOf(table, item, taken);
    if (state.reason === 'deadline') throw badRequest(`Booking for ${item.slug} has closed`);
    if (state.remaining !== null && quantity > state.remaining) throw conflict(state.remaining ? `Only ${state.remaining} seats left for ${item.slug}` : `${item.slug} is full`);
    if (state.finalPriceMinor === null) throw badRequest(`${item.slug} has no price`);
    lines.push({ id: item.id, slug: `${table.slug}/${item.slug}`, title: item.title, quantity, unit: BigInt(state.finalPriceMinor), currency: state.currency });
  }
  return lines;
}

export async function orderItems(db: pg.Pool | pg.PoolClient, orderId: string) {
  const { rows } = await db.query(
    `SELECT product_id AS "productId", collection_item_id AS "itemId", product_slug AS "productSlug", product_name AS "productName",
            unit_price_minor::text AS "unitPriceMinor", quantity, line_total_minor::text AS "lineTotalMinor", option, variant
       FROM order_items WHERE order_id = $1 ORDER BY id`,
    [orderId],
  );
  return rows;
}

/** Fulfilled and cancelled orders are done; nothing moves them again. */
const FINAL = new Set(['fulfilled', 'cancelled']);

/**
 * Where an order may go next: a pending order is confirmed or cancelled first; after that it can
 * move to any of the shop's other stages (never back to pending); finished orders stay put.
 */
export function nextStatuses(current: string, stages: string[]): string[] {
  if (FINAL.has(current)) return [];
  if (current === 'pending') return ['confirmed', 'cancelled'];
  return stages.filter((s) => s !== current && s !== 'pending');
}

/** Moves an order to another of the shop's stages (built-in or added in the settings). Cancelling puts reserved stock back. */
export async function changeOrderStatus(db: pg.Pool, orderId: string, status: string, actorUserId: string, message = '') {
  const stages = (await shopRules(db)).orderStatuses.map((s) => s.slug);
  return withTransaction(db, async (tx) => {
    const { rows } = await tx.query<{ status: string }>('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!rows[0]) throw notFound('Order');
    if (!nextStatuses(rows[0].status, stages).includes(status)) throw badRequest(`Cannot change an order from ${rows[0].status} to ${status}`);
    if (status === 'cancelled') {
      // Units go back where they came from: the variant's own stock, else the product's.
      const { rows: items } = await tx.query<{ product_id: string; variant: string; quantity: number; variants: Variant[]; stock: number | null }>(
        `SELECT i.product_id, i.variant, i.quantity, p.variants, p.stock FROM order_items i JOIN products p ON p.id = i.product_id WHERE i.order_id = $1 FOR UPDATE OF p`,
        [orderId],
      );
      for (const i of items) {
        const variants = i.variants ?? [];
        const k = i.variant ? variants.findIndex((v) => Object.values(v.name).includes(i.variant)) : -1;
        if (k >= 0 && variants[k].stock !== null) {
          variants[k] = { ...variants[k], stock: variants[k].stock! + i.quantity };
          await tx.query('UPDATE products SET variants = $2 WHERE id = $1', [i.product_id, JSON.stringify(variants)]);
        } else if (i.stock !== null) await tx.query('UPDATE products SET stock = stock + $2 WHERE id = $1', [i.product_id, i.quantity]);
      }
    }
    const updated = await tx.query(`UPDATE orders SET status = $2, updated_at = now() WHERE id = $1 RETURNING ${ORDER_COLUMNS}`, [orderId, status]);
    const eventId = await addEvent(tx, { orderId }, { kind: 'stage', public: true, body: message, data: { from: rows[0].status, to: status }, actorUserId });
    await auditTenant(tx, { actorUserId, action: 'order.status_changed', target: orderId, metadata: { from: rows[0].status, to: status } });
    return { ...updated.rows[0], eventId, items: await orderItems(tx, orderId) };
  });
}

/** Moves an order and tells the buyer when the stage says so (or the staff wrote a message). */
export async function changeOrderStage(ctx: AppContext, tenant: TenantContext, orderId: string, input: { status: string; message?: string; notify?: boolean }, actorUserId: string) {
  const { eventId, ...order } = await changeOrderStatus(tenant.db, orderId, input.status, actorUserId, input.message ?? '');
  const settings = await loadSettings(tenant.db);
  const stage = settings.shop.orderStatuses.find((s) => s.slug === input.status);
  if (input.notify ?? (stage?.notify || !!input.message)) {
    const ml = messageLocale(settings);
    const code = String(order.number);
    const link = await caseLink(ctx, tenant, 'order', orderId, code, ml);
    const values = { site: siteName(settings), number: `#${code}`, name: order.customer?.name ?? '', stage: stage?.label[ml] || stage?.label.en || input.status, amount: '', link };
    const template = stage?.message[ml] || STANDARD_MESSAGES.orderStage[ml];
    const text = input.message ? `${input.message}\n${fillTemplate(template, values)}` : fillTemplate(template, values);
    await markDelivered(tenant.db, eventId, await notifyCustomer(ctx, settings, order.customer ?? {}, text, `#${code}`));
  }
  return order;
}

/** A message to the buyer (shown on their order page and sent) or an internal note. */
export async function addOrderEvent(ctx: AppContext, tenant: TenantContext, orderId: string, input: { kind: 'note' | 'message'; text: string }, actorUserId: string) {
  const { rows } = await tenant.db.query(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1`, [orderId]);
  const order = rows[0];
  if (!order) throw notFound('Order');
  const eventId = await addEvent(tenant.db, { orderId }, { kind: input.kind, public: input.kind === 'message', body: input.text, actorUserId });
  if (input.kind === 'message') {
    const settings = await loadSettings(tenant.db);
    const ml = messageLocale(settings);
    const link = await caseLink(ctx, tenant, 'order', orderId, String(order.number), ml);
    const text = fillTemplate(STANDARD_MESSAGES.reply[ml], { site: siteName(settings), number: `#${order.number}`, text: input.text.slice(0, 300), link });
    await markDelivered(tenant.db, eventId, await notifyCustomer(ctx, settings, order.customer ?? {}, text, `#${order.number}`));
  }
}

/** An order as its buyer sees it: stage names, items, payment and public events. */
export async function orderCustomerView(
  db: pg.Pool,
  settings: SiteSettings,
  order: {
    id: string;
    number: string;
    status: string;
    payment_status: string;
    currency: string;
    total_minor: string;
    payment_method?: string;
    subtotal_minor?: string;
    shipping_minor?: string;
    shipping_method?: unknown;
    discount_minor?: string;
    coupon_code?: string | null;
    created_at?: Date;
    customer?: unknown;
  },
  locale: 'en' | 'fa',
) {
  const stages = settings.shop.orderStatuses;
  const label = (slug: string) => {
    const s = stages.find((x) => x.slug === slug);
    return (s && (s.label[locale] || s.label.en || s.label.fa)) || slug;
  };
  const events = await eventsOf(db, { orderId: order.id }, true);
  const path = ['pending', 'confirmed', ...stages.map((s) => s.slug).filter((s) => !['pending', 'confirmed', 'fulfilled', 'cancelled'].includes(s)), 'fulfilled'];
  const reached = new Set(events.map((e) => String(e.data.to ?? e.data.stage ?? '')));
  return {
    kind: 'order' as const,
    id: order.id,
    code: `#${order.number}`,
    number: order.number,
    status: order.status,
    stage: { key: order.status, label: label(order.status), kind: order.status === 'fulfilled' ? 'done' : order.status === 'cancelled' ? 'cancelled' : 'open' },
    path: path.map((key) => ({ key, label: label(key), kind: key === 'fulfilled' ? 'done' : 'open', reached: reached.has(key) || key === order.status })),
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    currency: order.currency,
    totalMinor: order.total_minor,
    // What the buyer's invoice needs (the buyer already proved who they are to see this).
    subtotalMinor: order.subtotal_minor,
    shippingMinor: order.shipping_minor,
    shippingMethod: order.shipping_method ?? null,
    discountMinor: order.discount_minor,
    couponCode: order.coupon_code ?? null,
    createdAt: order.created_at,
    customer: order.customer,
    items: await orderItems(db, order.id),
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      body: e.body,
      byCustomer: e.byCustomer,
      createdAt: e.createdAt,
      stage: e.kind === 'stage' || e.kind === 'created' ? label(String(e.data.to ?? e.data.stage ?? '')) : undefined,
      amountMinor: typeof e.data.amountMinor === 'string' ? e.data.amountMinor : undefined,
      currency: typeof e.data.currency === 'string' ? e.data.currency : undefined,
      ok: typeof e.data.ok === 'boolean' ? e.data.ok : undefined,
    })),
  };
}
