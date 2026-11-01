import { couponDiscount, couponInputSchema, reviewInputSchema, subscribeInputSchema } from '@site-builder/shared';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { sha256 } from '../../common/crypto.js';
import { AppError, badRequest, conflict, notFound } from '../../common/errors.js';
import { ApiRouter, idParam, pageMeta, paginationQuery } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import { requireModule, requirePermission } from '../../middleware/tenant.js';
import { auditTenant } from '../audit/audit.js';
import { verifiedCustomer } from '../customers/customers.service.js';

/**
 * Shop extras for the staff: discount codes, product reviews (approved before they show) and
 * newsletter subscribers.
 */

const COUPON = `id, code, kind, value::int AS value, min_order_minor::text AS "minOrderMinor", max_uses AS "maxUses", used_count AS "usedCount",
  starts_at AS "startsAt", ends_at AS "endsAt", active, created_at AS "createdAt"`;

export function shopAdminRoutes() {
  const r = new ApiRouter('/api/v1/sites/:siteId/shop', 'Shop extras', true);

  /* ----- discount codes ----- */

  r.route({ method: 'get', path: '/coupons', summary: 'Discount codes', middleware: [requireModule('orders'), requirePermission('orders:read')] }, async ({ req }) => {
    const { rows } = await req.tenant!.db.query(`SELECT ${COUPON} FROM coupons ORDER BY created_at DESC`);
    return { data: rows };
  });

  r.route({ method: 'post', path: '/coupons', summary: 'Add a discount code', status: 201, body: couponInputSchema, middleware: [requireModule('orders'), requirePermission('orders:write')] }, async ({ req, body }) => {
    try {
      const { rows } = await req.tenant!.db.query(
        `INSERT INTO coupons (code, kind, value, min_order_minor, max_uses, starts_at, ends_at, active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COUPON}`,
        [body.code, body.kind, body.value, body.minOrderMinor, body.maxUses, body.startsAt, body.endsAt, body.active],
      );
      await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'coupon.created', target: body.code });
      return { data: rows[0] };
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw conflict('This code already exists');
      throw err;
    }
  });

  r.route({ method: 'put', path: '/coupons/:id', summary: 'Change a discount code', params: idParam, body: couponInputSchema, middleware: [requireModule('orders'), requirePermission('orders:write')] }, async ({ req, params, body }) => {
    const { rows } = await req.tenant!.db.query(
      `UPDATE coupons SET code = $2, kind = $3, value = $4, min_order_minor = $5, max_uses = $6, starts_at = $7, ends_at = $8, active = $9, updated_at = now() WHERE id = $1 RETURNING ${COUPON}`,
      [params.id, body.code, body.kind, body.value, body.minOrderMinor, body.maxUses, body.startsAt, body.endsAt, body.active],
    );
    if (!rows[0]) throw notFound('Discount code');
    return { data: rows[0] };
  });

  r.route({ method: 'delete', path: '/coupons/:id', summary: 'Delete a discount code', params: idParam, middleware: [requireModule('orders'), requirePermission('orders:write')] }, async ({ req, params }) => {
    const { rowCount } = await req.tenant!.db.query('DELETE FROM coupons WHERE id = $1', [params.id]);
    if (!rowCount) throw notFound('Discount code');
  });

  /* ----- reviews ----- */

  r.route(
    {
      method: 'get',
      path: '/reviews',
      summary: 'Product reviews, newest first',
      query: paginationQuery.extend({ status: z.enum(['pending', 'approved', 'rejected']).optional() }),
      middleware: [requireModule('products'), requirePermission('catalog:write')],
    },
    async ({ req, query }) => {
      const { rows } = await req.tenant!.db.query(
        `SELECT r.id, r.name, r.rating, r.text, r.status, r.created_at AS "createdAt", p.slug AS "productSlug", p.name AS "productName", count(*) OVER()::int AS total
           FROM product_reviews r JOIN products p ON p.id = r.product_id
          WHERE $1::text IS NULL OR r.status = $1 ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
        [query.status ?? null, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return { data: rows.map(({ total: _t, ...x }) => x), meta: pageMeta(query.page, query.pageSize, rows[0]?.total ?? 0) };
    },
  );

  r.route(
    { method: 'patch', path: '/reviews/:id', summary: 'Approve or reject a review', params: idParam, body: z.object({ status: z.enum(['approved', 'rejected', 'pending']) }), middleware: [requirePermission('catalog:write')] },
    async ({ req, params, body }) => {
      const { rowCount } = await req.tenant!.db.query('UPDATE product_reviews SET status = $2 WHERE id = $1', [params.id, body.status]);
      if (!rowCount) throw notFound('Review');
    },
  );

  r.route({ method: 'delete', path: '/reviews/:id', summary: 'Delete a review', params: idParam, middleware: [requirePermission('catalog:write')] }, async ({ req, params }) => {
    const { rowCount } = await req.tenant!.db.query('DELETE FROM product_reviews WHERE id = $1', [params.id]);
    if (!rowCount) throw notFound('Review');
  });

  /* ----- newsletter ----- */

  r.route({ method: 'get', path: '/subscribers', summary: 'Newsletter subscribers', query: paginationQuery.extend({ q: z.string().max(100).optional() }), middleware: [requirePermission('leads:read')] }, async ({ req, query }) => {
    const { rows } = await req.tenant!.db.query(
      `SELECT id, contact, name, source_path AS "sourcePath", created_at AS "createdAt", count(*) OVER()::int AS total FROM subscribers
        WHERE $1::text IS NULL OR contact ILIKE $1 OR name ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [query.q ? `%${query.q}%` : null, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return { data: rows.map(({ total: _t, ...x }) => x), meta: pageMeta(query.page, query.pageSize, rows[0]?.total ?? 0) };
  });

  r.route({ method: 'delete', path: '/subscribers/:id', summary: 'Remove a subscriber', params: idParam, middleware: [requirePermission('leads:write')] }, async ({ req, params }) => {
    await req.tenant!.db.query('DELETE FROM subscribers WHERE id = $1', [params.id]);
  });

  return r.router;
}

export function shopPublicRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/public/sites/:siteSlug', 'Public site', false);
  const submitLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: ctx.env.NODE_ENV === 'production' ? 5 : 1000,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${req.params.siteSlug}:shop`,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many submissions, try again later' } },
  });

  r.route(
    { method: 'get', path: '/coupons/:code', summary: 'Check a discount code against a products total', params: z.object({ code: z.string().max(40) }), query: z.object({ subtotal: z.coerce.number().int().min(0).default(0) }), middleware: [requireModule('orders')] },
    async ({ req, params, query }) => {
      const { rows } = await req.tenant!.db.query<{ kind: 'percent' | 'amount'; value: string; min_order_minor: string; max_uses: number | null; used_count: number }>(
        `SELECT kind, value::text, min_order_minor::text, max_uses, used_count FROM coupons
          WHERE code = upper($1) AND active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())`,
        [params.code.trim()],
      );
      const c = rows[0];
      const fail = (reason: string) => new AppError(400, 'validation_failed', 'Invalid request body', [{ path: 'coupon', message: reason, code: reason }]);
      if (!c) throw fail('coupon_invalid');
      if (c.max_uses !== null && c.used_count >= c.max_uses) throw fail('coupon_used_up');
      if (query.subtotal < Number(c.min_order_minor)) throw fail('coupon_min_order');
      return { data: { code: params.code.trim().toUpperCase(), kind: c.kind, value: Number(c.value), discountMinor: couponDiscount({ kind: c.kind, value: Number(c.value) }, query.subtotal) } };
    },
  );

  const productOf = async (db: import('pg').Pool, slug: string) => {
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM products WHERE slug = $1 AND status = 'published'`, [slug]);
    if (!rows[0]) throw notFound('Product');
    return rows[0].id;
  };

  r.route({ method: 'get', path: '/products/:slug/reviews', summary: 'Approved reviews of a product', params: z.object({ slug: z.string().max(80) }), middleware: [requireModule('products')] }, async ({ req, params }) => {
    const id = await productOf(req.tenant!.db, params.slug);
    const { rows } = await req.tenant!.db.query(
      `SELECT name, rating, text, created_at AS "createdAt" FROM product_reviews WHERE product_id = $1 AND status = 'approved' ORDER BY created_at DESC LIMIT 100`,
      [id],
    );
    const avg = rows.length ? rows.reduce((s, x) => s + Number(x.rating), 0) / rows.length : 0;
    return { data: { average: Math.round(avg * 10) / 10, count: rows.length, reviews: rows } };
  });

  r.route(
    { method: 'post', path: '/products/:slug/reviews', summary: 'Send a review (shown after the staff approve it)', status: 201, params: z.object({ slug: z.string().max(80) }), body: reviewInputSchema, middleware: [submitLimiter, requireModule('products')] },
    async ({ req, params, body }) => {
      if (body.website) return { data: { ok: true } };
      const id = await productOf(req.tenant!.db, params.slug);
      await req.tenant!.db.query('INSERT INTO product_reviews (product_id, customer_id, name, rating, text, ip_hash) VALUES ($1, $2, $3, $4, $5, $6)', [
        id,
        verifiedCustomer(req)?.id ?? null,
        body.name,
        body.rating,
        body.text,
        req.ip ? sha256(`${req.tenant!.id}:${req.ip}`) : null,
      ]);
      return { data: { ok: true } };
    },
  );

  r.route({ method: 'post', path: '/subscribe', summary: 'Join the newsletter (email or mobile)', status: 201, body: subscribeInputSchema.extend({ sourcePath: z.string().max(300).optional() }), middleware: [submitLimiter] }, async ({ req, body }) => {
    if (body.website) return { data: { ok: true } };
    const raw = body.contact.trim().toLowerCase().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
    const phone = raw.replace(/[\s()-]/g, '').replace(/^\+98/, '0');
    if (!email && !/^\+?\d{8,15}$/.test(phone)) throw badRequest('Enter an email or a mobile number');
    await req.tenant!.db.query('INSERT INTO subscribers (contact, name, source_path) VALUES ($1, $2, $3) ON CONFLICT (contact) DO NOTHING', [email ? raw : phone, body.name, body.sourcePath ?? null]);
    return { data: { ok: true } };
  });

  return r.router;
}
