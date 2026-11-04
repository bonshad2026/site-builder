import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeContext } from '../src/context.js';
import { createAdmin, createTestServer, signIn, uid, type Client } from './helpers.js';

const { ctx, app } = createTestServer();
// No network in tests: template photos become placeholders straight away.
ctx.httpFetch = (async () => {
  throw new Error('offline');
}) as typeof fetch;
let platform: Client;

beforeAll(async () => {
  const admin = await createAdmin(ctx);
  platform = await signIn(app, admin.email!);
});
afterAll(() => closeContext(ctx));

const pub = (slug: string, path: string) => request(app).get(`/api/v1/public/sites/${slug}${path}`);

describe('setting up a new site', () => {
  it('builds the chosen pages, menus, forms, header and filters, then fills sample data that can be removed', async () => {
    const slug = `setup-${uid()}`;
    const res = await platform.post('/api/v1/platform/tenants', {
      slug,
      name: 'Setup Shop',
      ownerEmail: `o-${slug}@test.local`,
      template: 'cosmetics',
      setup: {
        languages: 'fa',
        contact: { phone: '021-22223333', instagram: 'setupshop', whatsapp: '09121112222' },
        pages: { shop: 'main', about: 'main', contact: 'main', faq: 'more', blog: 'main', team: 'more', terms: 'footer', track: 'footer', account: 'none' },
        forms: [
          { id: 'consultation', menu: 'none' },
          { id: 'quote', menu: 'more' },
          { id: 'registration', menu: 'none' },
        ],
        mainForm: 'consultation',
        tables: [{ id: 'classes', menu: 'main' }],
        header: { phone: true, whatsapp: true, search: true },
        shop: { orders: true, cod: true, online: true },
        filters: { price: true, available: true },
        accounts: { enabled: true },
        demo: { products: 10, items: 4, customers: 6, orders: 12, payments: 5, requests: 15, testimonials: 5, faq: 6, months: 3 },
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.setup.demo).toMatchObject({ customers: 6, orders: 12, requests: 15, items: 20 });
    expect(res.body.data.setup.demo.payments).toBeLessThanOrEqual(5);
    expect(res.body.data.setup.demo.products).toBe(4);

    const settings = (await pub(slug, '/settings')).body.data;
    expect(settings.locales).toEqual(['fa']);
    expect(settings.accounts.enabled).toBe(true);
    expect(settings.header).toMatchObject({ showSearch: true, showCart: true });
    expect(settings.header.buttons.map((b: { href: string }) => b.href)).toEqual(['/contact', 'tel:02122223333', 'https://wa.me/989121112222']);
    expect(settings.social.map((s: { icon: string }) => s.icon)).toEqual(['instagram', 'whatsapp']);
    const hrefs = settings.nav.map((n: { href: string }) => n.href);
    // Contact comes last.
    expect(hrefs).toEqual(['/products', '/about', '/blog', '/classes', '', '/contact']);
    expect(settings.nav[4].children.map((c: { href: string }) => c.href)).toEqual(['/faq', '/team', '/quote']);
    expect(settings.footer.columns.at(-1).links.map((l: { href: string }) => l.href)).toEqual(['/terms', '/track']);
    expect(settings.requestTypes.map((t: { slug: string }) => t.slug)).toEqual(['consultation', 'quote', 'registration', 'contact']);

    const shop = (await pub(slug, '/pages/products')).body.data;
    const list = shop.document.sections.find((s: { type: string }) => s.type === 'collection-list');
    expect(list.props.visitorFilters.map((f: { field: string }) => f.field)).toEqual(['category', 'price', '__available']);
    expect((await pub(slug, '/pages/quote')).status).toBe(200);
    // Built-in pages are builder pages holding their built-in content.
    for (const page of ['product', 'cart', 'checkout', 'checkout-result', 'not-found']) {
      const sections = (await pub(slug, `/pages/${page}`)).body.data.document.sections;
      expect(sections.map((x: { type: string }) => x.type), page).toEqual(['system-page']);
    }
    expect((await pub(slug, '/pages/terms')).status).toBe(200);
    // Classes need courses and teachers; the blog is a news table.
    const collections = await ctx.control.query('SELECT id, db_name, db_user, db_password_enc FROM tenants WHERE slug = $1', [slug]);
    const t = collections.rows[0];
    const db = ctx.tenantPools.get({ id: t.id, dbName: t.db_name, dbUser: t.db_user, dbPasswordEnc: t.db_password_enc });
    expect((await db.query('SELECT slug FROM collections ORDER BY position')).rows.map((r) => r.slug)).toEqual(['articles', 'courses', 'teachers', 'classes', 'team']);
    const orders = await db.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE payment_status = 'test_paid')::int AS paid FROM orders`);
    expect(orders.rows[0].n).toBe(12);
    const events = await db.query(`SELECT count(*)::int AS n FROM case_events`);
    expect(events.rows[0].n).toBeGreaterThan(27);

    // A sample customer can sign in with the demo password.
    const customer = (await db.query('SELECT phone FROM customers LIMIT 1')).rows[0];
    const login = await request(app).post(`/api/v1/public/sites/${slug}/customer/login`).send({ identifier: customer.phone, password: '12345678' });
    expect(login.status, JSON.stringify(login.body)).toBe(200);

    expect((await platform.get(`/api/v1/platform/tenants/${t.id}/demo-data`)).body.data.demo).toMatchObject({ orders: 12, requests: 15, customers: 6 });
    const cleared = await platform.delete(`/api/v1/platform/tenants/${t.id}/demo-data`);
    expect(cleared.status).toBe(200);
    expect((await platform.get(`/api/v1/platform/tenants/${t.id}/demo-data`)).body.data.demo).toEqual({ products: 0, services: 0, items: 0, customers: 0, orders: 0, payments: 0, requests: 0 });
    // The business type's own products stay.
    expect((await db.query('SELECT count(*)::int AS n FROM products')).rows[0].n).toBe(6);
  });

  it('sets up a site without a business type and without sample data', async () => {
    const slug = `plain-${uid()}`;
    const res = await platform.post('/api/v1/platform/tenants', {
      slug,
      name: 'Plain',
      ownerEmail: `o-${slug}@test.local`,
      setup: { pages: { services: 'main', contact: 'main', pricing: 'main' }, forms: [{ id: 'contact' }], demo: { enabled: false } },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.setup.demo).toBeNull();
    const settings = (await pub(slug, '/settings')).body.data;
    expect(settings.nav.map((n: { href: string }) => n.href)).toEqual(['/services', '/pricing', '/contact']);
    expect(settings.modules).toMatchObject({ services: true, products: false, orders: false });
    expect((await pub(slug, '/services')).body.data.length).toBe(3);
  });
});
