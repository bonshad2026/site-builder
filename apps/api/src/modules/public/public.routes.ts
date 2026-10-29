import { DEFAULT_REQUEST_TYPES, LEAD_TYPES, leadInputSchema, orderInputSchema, withSettingDefaults, type RequestType } from '@site-builder/shared';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { sha256 } from '../../common/crypto.js';
import { badRequest, notFound } from '../../common/errors.js';
import { ApiRouter, pageMeta, paginationQuery } from '../../common/http.js';
import { selectList } from '../../common/sql.js';
import type { AppContext } from '../../context.js';
import { requireModule } from '../../middleware/tenant.js';
import { productsTable, servicesTable } from '../catalog/catalog.js';
import { withImageUrls } from '../assets/urls.js';
import { createOrder, orderItems } from '../orders/orders.service.js';
import { findOrderForBuyer, gatewayFor, getPaymentSettings, startPayment } from '../payments/payments.service.js';

const slugParam = z.object({ slug: z.string().min(1).max(64) });

/**
 * Read-only, published-only data for site visitors, plus lead and order submission.
 * Drafts are never returned here.
 */
export function publicRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/public/sites/:siteSlug', 'Public site', false);

  const submitLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: ctx.env.NODE_ENV === 'test' ? 1000 : 5,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${req.params.siteSlug}`,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many submissions, try again later' } },
  });

  r.route({ method: 'get', path: '/settings', summary: 'Public site configuration' }, async ({ req }) => {
    const { rows } = await req.tenant!.db.query('SELECT settings FROM site_settings WHERE id = 1');
    return { data: rows[0]?.settings ? withSettingDefaults(rows[0].settings) : null };
  });

  r.route({ method: 'get', path: '/pages', summary: 'Published pages (for navigation and sitemap)' }, async ({ req }) => {
    const { rows } = await req.tenant!.db.query(
      `SELECT slug, published_title AS title, is_home AS "isHome", published_at AS "publishedAt", published_seo AS seo
         FROM pages WHERE published IS NOT NULL ORDER BY is_home DESC, position`,
    );
    return { data: rows };
  });

  r.route({ method: 'get', path: '/pages/:slug', summary: 'A published page document', params: slugParam }, async ({ req, params }) => {
    const { rows } = await req.tenant!.db.query(
      `SELECT slug, published_title AS title, is_home AS "isHome", published_seo AS seo, published AS document,
              published_version AS version, published_at AS "publishedAt"
         FROM pages WHERE published IS NOT NULL AND (slug = $1 OR ($1 = 'home' AND is_home))`,
      [params.slug],
    );
    if (!rows[0]) throw notFound('Page');
    return { data: rows[0] };
  });

  r.route({ method: 'get', path: '/services', summary: 'Published services', middleware: [requireModule('services')] }, async ({ req }) => {
    const { rows } = await req.tenant!.db.query(`SELECT ${selectList(servicesTable)} FROM services WHERE status = 'published' ORDER BY position, created_at`);
    return { data: await withImageUrls(req.tenant!.db, ctx.storage, rows) };
  });

  r.route({ method: 'get', path: '/services/:slug', summary: 'A published service', params: slugParam, middleware: [requireModule('services')] }, async ({ req, params }) => {
    const { rows } = await req.tenant!.db.query(`SELECT ${selectList(servicesTable)} FROM services WHERE status = 'published' AND slug = $1`, [params.slug]);
    if (!rows[0]) throw notFound('Service');
    return { data: (await withImageUrls(req.tenant!.db, ctx.storage, rows))[0] };
  });

  r.route(
    {
      method: 'get',
      path: '/products',
      summary: 'Published products with filter, search, sort and pagination',
      middleware: [requireModule('products')],
      query: paginationQuery.extend({
        category: z.string().max(64).optional(),
        q: z.string().max(100).optional(),
        featured: z.enum(['true', 'false']).optional(),
        sort: z.enum(['position', 'price-asc', 'price-desc', 'newest']).default('position'),
      }),
    },
    async ({ req, query }) => {
      const order = { position: 'featured DESC, position, created_at', 'price-asc': 'price_minor ASC NULLS LAST', 'price-desc': 'price_minor DESC NULLS LAST', newest: 'created_at DESC' }[query.sort];
      const { rows } = await req.tenant!.db.query(
        `SELECT ${selectList(productsTable)}, count(*) OVER()::int AS total
           FROM products
          WHERE status = 'published'
            AND ($1::text IS NULL OR category = $1)
            AND ($2::text IS NULL OR name->>'en' ILIKE $2 OR name->>'fa' ILIKE $2 OR description::text ILIKE $2)
            AND ($3::boolean IS NULL OR featured = $3)
          ORDER BY ${order} LIMIT $4 OFFSET $5`,
        [query.category ?? null, query.q ? `%${query.q}%` : null, query.featured ? query.featured === 'true' : null, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const data = await withImageUrls(req.tenant!.db, ctx.storage, rows.map(({ total: _t, ...p }) => p));
      return { data, meta: pageMeta(query.page, query.pageSize, rows[0]?.total ?? 0) };
    },
  );

  r.route({ method: 'get', path: '/products/:slug', summary: 'A published product', params: slugParam, middleware: [requireModule('products')] }, async ({ req, params }) => {
    const { rows } = await req.tenant!.db.query(
      `SELECT ${selectList(productsTable)} FROM products WHERE status = 'published' AND slug = $1`,
      [params.slug],
    );
    if (!rows[0]) throw notFound('Product');
    return { data: (await withImageUrls(req.tenant!.db, ctx.storage, rows))[0] };
  });

  r.route(
    { method: 'post', path: '/leads', summary: 'Submit a customer request (consultation, reservation, demo, question…)', status: 201, body: leadInputSchema, middleware: [submitLimiter, requireModule('leads')] },
    async ({ req, body }) => {
      // Honeypot filled in: accept silently so bots learn nothing, but store nothing.
      if (body.website) return { data: { received: true } };
      const configured = (await req.tenant!.db.query(`SELECT settings->'requestTypes' AS types FROM site_settings WHERE id = 1`)).rows[0]?.types as RequestType[] | null;
      const known = new Set<string>([...LEAD_TYPES, ...(configured ?? DEFAULT_REQUEST_TYPES).map((t) => t.slug)]);
      if (!known.has(body.type)) throw badRequest('Unknown request type');
      const { rows } = await req.tenant!.db.query(
        `INSERT INTO leads (type, name, email, phone, project_type, budget, message, source_path, ip_hash, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, created_at AS "createdAt"`,
        [body.type, body.name, body.email, body.phone, body.projectType ?? null, body.budget ?? null, body.message, body.sourcePath ?? null, req.ip ? sha256(`${req.tenant!.id}:${req.ip}`) : null, body.details],
      );
      return { data: { received: true, id: rows[0].id, createdAt: rows[0].createdAt } };
    },
  );

  r.route(
    {
      method: 'post',
      path: '/orders',
      summary: 'Place an order (prices and stock are checked on the server; payment is not processed)',
      status: 201,
      body: orderInputSchema,
      middleware: [submitLimiter, requireModule('products'), requireModule('orders')],
    },
    async ({ req, body }) => {
      if (body.paymentMethod === 'cod' && !(await getPaymentSettings(req.tenant!.db)).allowCod) throw badRequest('Payment on delivery is not offered by this shop');
      const order = await createOrder(req.tenant!.db, body);
      return {
        data: {
          number: order.number,
          orderToken: order.orderToken,
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          currency: order.currency,
          totalMinor: order.totalMinor,
          items: order.items,
        },
      };
    },
  );

  r.route({ method: 'get', path: '/payment-methods', summary: 'Whether online payment is available, and whether it is a test gateway', middleware: [requireModule('orders')] }, async ({ req }) => {
    const settings = await getPaymentSettings(req.tenant!.db);
    const gateway = gatewayFor(ctx, settings, req.tenant!.slug);
    return { data: { online: !!gateway, cod: settings.allowCod, provider: gateway?.name ?? null, isTest: gateway?.isTest ?? false } };
  });

  const orderLookup = z.object({ number: z.string().regex(/^\d{1,12}$/) });
  r.route(
    {
      method: 'get',
      path: '/orders/:number',
      summary: "Buyer's view of their order (requires the order token)",
      params: orderLookup,
      query: z.object({ token: z.string().min(10).max(100) }),
      middleware: [requireModule('orders')],
    },
    async ({ req, params, query }) => {
      const order = await findOrderForBuyer(req.tenant!.db, params.number, query.token);
      return {
        data: {
          number: order.number,
          status: order.status,
          paymentStatus: order.payment_status,
          currency: order.currency,
          totalMinor: order.total_minor,
          items: await orderItems(req.tenant!.db, order.id),
        },
      };
    },
  );

  r.route(
    {
      method: 'post',
      path: '/orders/:number/pay',
      summary: 'Start online payment; returns the gateway URL',
      params: orderLookup,
      body: z.object({ token: z.string().min(10).max(100), locale: z.enum(['en', 'fa']).default('en') }),
      middleware: [submitLimiter, requireModule('orders')],
    },
    async ({ req, params, body }) => {
      const base = await siteBaseUrl(ctx, req.tenant!.id);
      const returnUrl = `${base}${body.locale === 'fa' ? '/fa' : ''}/checkout/result?order=${params.number}&token=${encodeURIComponent(body.token)}`;
      return { data: await startPayment(ctx, req.tenant!, { number: params.number, token: body.token, returnUrl }) };
    },
  );

  r.route({ method: 'get', path: '/sitemap.xml', summary: 'XML sitemap of published content in both languages' }, async ({ req, res }) => {
    const base = await siteBaseUrl(ctx, req.tenant!.id);
    const db = req.tenant!.db;
    const modules = (await db.query(`SELECT settings->'modules' AS modules FROM site_settings WHERE id = 1`)).rows[0]?.modules ?? {};
    const entries: { path: string; lastmod: Date }[] = [];
    const pages = await db.query(
      `SELECT slug, is_home, published_at FROM pages WHERE published IS NOT NULL AND NOT coalesce((published_seo->>'noIndex')::boolean, false)`,
    );
    for (const p of pages.rows) entries.push({ path: p.is_home ? '' : `/${p.slug}`, lastmod: p.published_at });
    if (modules.services) {
      for (const s of (await db.query(`SELECT slug, updated_at FROM services WHERE status = 'published'`)).rows) entries.push({ path: `/services/${s.slug}`, lastmod: s.updated_at });
    }
    if (modules.products) {
      for (const p of (await db.query(`SELECT slug, updated_at FROM products WHERE status = 'published'`)).rows) entries.push({ path: `/products/${p.slug}`, lastmod: p.updated_at });
    }
    const esc = (u: string) => u.replace(/&/g, '&amp;');
    const urls = entries
      .map((e) => {
        const en = esc(`${base}${e.path || '/'}`);
        const fa = esc(`${base}/fa${e.path}`);
        return `<url><loc>${en}</loc><lastmod>${new Date(e.lastmod).toISOString()}</lastmod><xhtml:link rel="alternate" hreflang="en" href="${en}"/><xhtml:link rel="alternate" hreflang="fa" href="${fa}"/></url>`;
      })
      .join('');
    res
      .type('application/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`);
  });

  r.route({ method: 'get', path: '/robots.txt', summary: 'robots.txt pointing at the sitemap' }, async ({ req, res }) => {
    res
      .type('text/plain')
      .send(`User-agent: *\nDisallow: /admin\nDisallow: /checkout\nDisallow: /cart\nSitemap: ${ctx.env.PUBLIC_API_URL}/api/v1/public/sites/${req.tenant!.slug}/sitemap.xml\n`);
  });

  return r.router;
}

/** Canonical origin of a site: its primary domain in production, the web app URL otherwise. */
async function siteBaseUrl(ctx: AppContext, tenantId: string): Promise<string> {
  if (ctx.env.NODE_ENV === 'production') {
    const { rows } = await ctx.control.query<{ domain: string }>('SELECT domain FROM tenant_domains WHERE tenant_id = $1 AND is_primary', [tenantId]);
    if (rows[0]) return `https://${rows[0].domain}`;
  }
  return ctx.env.WEB_APP_URL.replace(/\/$/, '');
}

/** Maps a custom domain to its site id, for hosting each client on their own domain. */
export function resolveRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/public', 'Public site', false);
  r.route({ method: 'get', path: '/resolve', summary: 'Find the site for a domain', query: z.object({ domain: z.string().trim().toLowerCase().max(253) }) }, async ({ query }) => {
    const { rows } = await ctx.control.query(
      `SELECT t.slug AS "siteId", d.is_primary AS "isPrimary",
              (SELECT domain FROM tenant_domains p WHERE p.tenant_id = t.id AND p.is_primary) AS "canonicalDomain"
         FROM tenant_domains d JOIN tenants t ON t.id = d.tenant_id WHERE d.domain = $1 AND t.status = 'active'`,
      [query.domain],
    );
    if (!rows[0]) throw notFound('Site');
    return { data: rows[0] };
  });
  return r.router;
}
