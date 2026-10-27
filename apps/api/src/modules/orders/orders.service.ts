import { orderInputSchema } from '@site-builder/shared';
import type pg from 'pg';
import type { z } from 'zod';
import { randomToken, sha256 } from '../../common/crypto.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { withTransaction } from '../../database/tenant/pools.js';
import { auditTenant } from '../audit/audit.js';

type OrderInput = z.output<typeof orderInputSchema>;

interface ProductRow {
  id: string;
  slug: string;
  name: Record<string, string>;
  price_minor: string | null;
  currency: string;
  stock: number | null;
}

export const ORDER_COLUMNS = `id, number::text AS number, status, payment_status AS "paymentStatus", customer, note, currency,
  subtotal_minor::text AS "subtotalMinor", total_minor::text AS "totalMinor", created_at AS "createdAt", updated_at AS "updatedAt"`;

/**
 * Creates an order using prices and availability from the database only.
 * Stock is reserved atomically; if any item cannot be satisfied, nothing is written.
 * Payment is never marked as done here (no gateway is connected yet).
 */
export async function createOrder(db: pg.Pool, input: OrderInput) {
  // Merge duplicate lines so quantity limits and stock checks see the real total.
  const quantities = new Map<string, number>();
  for (const item of input.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);

  // Lets the buyer (and only the buyer) look up and pay for this order.
  const orderToken = randomToken(24);

  return withTransaction(db, async (tx) => {
    const ids = [...quantities.keys()];
    const { rows: products } = await tx.query<ProductRow>(
      `SELECT id, slug, name, price_minor::text AS price_minor, currency, stock FROM products
        WHERE id = ANY($1::uuid[]) AND status = 'published' AND is_available AND price_minor IS NOT NULL
        FOR UPDATE`,
      [ids],
    );
    const byId = new Map(products.map((p) => [p.id, p]));
    const unavailable = ids.filter((id) => !byId.has(id));
    if (unavailable.length) throw badRequest('Some products are not available for ordering', { productIds: unavailable });

    const currencies = new Set(products.map((p) => p.currency));
    if (currencies.size > 1) throw badRequest('All items in one order must use the same currency');

    let subtotal = 0n;
    const lines = ids.map((id) => {
      const product = byId.get(id)!;
      const quantity = quantities.get(id)!;
      if (quantity > 50) throw badRequest('Quantity per product is limited to 50');
      const unit = BigInt(product.price_minor!);
      const lineTotal = unit * BigInt(quantity);
      subtotal += lineTotal;
      return { product, quantity, unit, lineTotal };
    });

    for (const line of lines) {
      if (line.product.stock === null) continue;
      const res = await tx.query('UPDATE products SET stock = stock - $2, updated_at = now() WHERE id = $1 AND stock >= $2', [line.product.id, line.quantity]);
      if (!res.rowCount) throw conflict(`Not enough stock for ${line.product.slug}`);
    }

    const { rows } = await tx.query(
      `INSERT INTO orders (customer, note, currency, subtotal_minor, total_minor, public_token_hash) VALUES ($1, $2, $3, $4, $4, $5) RETURNING ${ORDER_COLUMNS}`,
      [input.customer, input.note ?? null, [...currencies][0], subtotal.toString(), sha256(orderToken)],
    );
    const order = rows[0];
    for (const line of lines) {
      await tx.query(
        `INSERT INTO order_items (order_id, product_id, product_slug, product_name, unit_price_minor, quantity, line_total_minor)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [order.id, line.product.id, line.product.slug, line.product.name, line.unit.toString(), line.quantity, line.lineTotal.toString()],
      );
    }
    await auditTenant(tx, { action: 'order.created', target: order.id, metadata: { number: order.number } });
    return { ...order, orderToken, items: await orderItems(tx, order.id) };
  });
}

export async function orderItems(db: pg.Pool | pg.PoolClient, orderId: string) {
  const { rows } = await db.query(
    `SELECT product_id AS "productId", product_slug AS "productSlug", product_name AS "productName",
            unit_price_minor::text AS "unitPriceMinor", quantity, line_total_minor::text AS "lineTotalMinor"
       FROM order_items WHERE order_id = $1 ORDER BY id`,
    [orderId],
  );
  return rows;
}

const TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['fulfilled', 'cancelled'],
  fulfilled: [],
  cancelled: [],
};

/** Moves an order through its lifecycle; cancelling puts reserved stock back. */
export async function changeOrderStatus(db: pg.Pool, orderId: string, status: string, actorUserId: string) {
  return withTransaction(db, async (tx) => {
    const { rows } = await tx.query<{ status: string }>('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!rows[0]) throw notFound('Order');
    if (!TRANSITIONS[rows[0].status].includes(status)) throw badRequest(`Cannot change an order from ${rows[0].status} to ${status}`);
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
