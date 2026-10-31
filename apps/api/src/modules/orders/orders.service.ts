import { orderInputSchema, shopSchema } from '@site-builder/shared';
import type pg from 'pg';
import type { z } from 'zod';
import { randomToken, sha256 } from '../../common/crypto.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { withTransaction } from '../../database/tenant/pools.js';
import { auditTenant } from '../audit/audit.js';
import { availabilityOf, loadCollections, seatsTaken, type ItemRow } from '../collections/collections.service.js';

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
}

export const ORDER_COLUMNS = `id, number::text AS number, status, payment_status AS "paymentStatus", payment_method AS "paymentMethod", customer, note, currency,
  subtotal_minor::text AS "subtotalMinor", total_minor::text AS "totalMinor", created_at AS "createdAt", updated_at AS "updatedAt"`;

/**
 * Creates an order using prices and availability from the database only.
 * Stock is reserved atomically; if any item cannot be satisfied, nothing is written.
 * Payment is never marked as done here. Discounts come from the product, never from the buyer.
 */
export async function createOrder(db: pg.Pool, input: OrderInput) {
  // Merge duplicate lines (same product and colour); limits and stock use each product's total.
  const merged = new Map<string, { productId: string; option: string; quantity: number }>();
  for (const item of input.items) {
    if (!item.productId) continue;
    const key = `${item.productId}|${item.option}`;
    const line = merged.get(key) ?? { productId: item.productId, option: item.option, quantity: 0 };
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
  const totalUnits = [...quantities.values(), ...seats.values()].reduce((a, b) => a + b, 0);
  if (rules.maxItemsPerOrder !== null && totalUnits > rules.maxItemsPerOrder) throw badRequest(`An order can have at most ${rules.maxItemsPerOrder} items`);

  return withTransaction(db, async (tx) => {
    const ids = [...quantities.keys()];
    const { rows: products } = !ids.length ? { rows: [] as ProductRow[] } : await tx.query<ProductRow>(
      `SELECT id, slug, name, price_minor::text AS price_minor, currency, stock, discount_percent, colors, max_per_order FROM products
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
    const lines = [...merged.values()].map(({ productId, option, quantity }) => {
      const product = byId.get(productId)!;
      // A colour must be one of the product's own; products without colours take none.
      const colors = product.colors ?? [];
      if (colors.length ? !colors.some((c) => Object.values(c.name).includes(option)) : option !== '') throw badRequest(`Choose a valid colour for ${product.slug}`);
      const unit = (BigInt(product.price_minor!) * BigInt(100 - (product.discount_percent ?? 0))) / 100n;
      const lineTotal = unit * BigInt(quantity);
      subtotal += lineTotal;
      return { product, option, quantity, unit, lineTotal };
    });
    for (const l of itemLines) subtotal += l.unit * BigInt(l.quantity);

    for (const id of ids) {
      const product = byId.get(id)!;
      if (product.stock === null) continue;
      const res = await tx.query('UPDATE products SET stock = stock - $2, updated_at = now() WHERE id = $1 AND stock >= $2', [id, quantities.get(id)]);
      if (!res.rowCount) throw conflict(`Not enough stock for ${product.slug}`);
    }

    const { rows } = await tx.query(
      `INSERT INTO orders (customer, note, currency, subtotal_minor, total_minor, public_token_hash, payment_method) VALUES ($1, $2, $3, $4, $4, $5, $6) RETURNING ${ORDER_COLUMNS}`,
      [input.customer, input.note ?? null, [...currencies][0], subtotal.toString(), sha256(orderToken), input.paymentMethod],
    );
    const order = rows[0];
    for (const line of lines) {
      await tx.query(
        `INSERT INTO order_items (order_id, product_id, product_slug, product_name, unit_price_minor, quantity, line_total_minor, option)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [order.id, line.product.id, line.product.slug, line.product.name, line.unit.toString(), line.quantity, line.lineTotal.toString(), line.option],
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
    return { ...order, orderToken, items: await orderItems(tx, order.id) };
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
            unit_price_minor::text AS "unitPriceMinor", quantity, line_total_minor::text AS "lineTotalMinor", option
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
export async function changeOrderStatus(db: pg.Pool, orderId: string, status: string, actorUserId: string) {
  const stages = (await shopRules(db)).orderStatuses.map((s) => s.slug);
  return withTransaction(db, async (tx) => {
    const { rows } = await tx.query<{ status: string }>('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!rows[0]) throw notFound('Order');
    if (!nextStatuses(rows[0].status, stages).includes(status)) throw badRequest(`Cannot change an order from ${rows[0].status} to ${status}`);
    if (status === 'cancelled') {
      await tx.query(
        `UPDATE products p SET stock = p.stock + i.quantity FROM order_items i
          WHERE i.order_id = $1 AND i.product_id = p.id AND p.stock IS NOT NULL`,
        [orderId],
      );
    }
    const updated = await tx.query(`UPDATE orders SET status = $2, updated_at = now() WHERE id = $1 RETURNING ${ORDER_COLUMNS}`, [orderId, status]);
    await auditTenant(tx, { actorUserId, action: 'order.status_changed', target: orderId, metadata: { from: rows[0].status, to: status } });
    return { ...updated.rows[0], items: await orderItems(tx, orderId) };
  });
}
