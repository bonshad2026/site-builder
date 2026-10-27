import { ApiRouter } from '../../common/http.js';

/** Dashboard numbers for one site. Counts only what the caller may see. */
export function overviewRoutes() {
  const r = new ApiRouter('/api/v1/sites/:siteId/overview', 'Site settings', true);

  r.route({ method: 'get', path: '/', summary: 'Dashboard summary' }, async ({ req }) => {
    const t = req.tenant!;
    const db = t.db;
    const one = async (sql: string) => (await db.query(sql)).rows[0];

    const content = await one(`SELECT
        (SELECT count(*)::int FROM pages) AS pages,
        (SELECT count(*)::int FROM pages WHERE published IS NOT NULL) AS "publishedPages",
        (SELECT count(*)::int FROM pages WHERE published IS NULL OR draft <> published OR title <> published_title) AS "pagesWithDrafts",
        (SELECT count(*)::int FROM products) AS products,
        (SELECT count(*)::int FROM services) AS services,
        (SELECT count(*)::int FROM assets) AS files`);

    const leads = t.permissions.has('leads:read')
      ? {
          ...(await one(`SELECT count(*) FILTER (WHERE status = 'new')::int AS "new", count(*)::int AS total FROM leads`)),
          recent: (await db.query(`SELECT id, name, type, status, created_at AS "createdAt" FROM leads ORDER BY created_at DESC LIMIT 5`)).rows,
        }
      : null;

    const orders = t.permissions.has('orders:read')
      ? {
          ...(await one(`SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending, count(*)::int AS total,
                          coalesce(sum(total_minor) FILTER (WHERE payment_status = 'paid'), 0)::text AS "paidRevenueMinor",
                          coalesce(sum(total_minor) FILTER (WHERE payment_status = 'test_paid'), 0)::text AS "testRevenueMinor" FROM orders`)),
          recent: (await db.query(`SELECT id, number::text, status, payment_status AS "paymentStatus", total_minor::text AS "totalMinor", created_at AS "createdAt" FROM orders ORDER BY created_at DESC LIMIT 5`)).rows,
        }
      : null;

    return { data: { content, leads, orders } };
  });

  return r.router;
}
