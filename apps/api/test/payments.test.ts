import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeContext } from '../src/context.js';
import { ZarinpalGateway } from '../src/modules/payments/gateways.js';
import { createAdmin, createTenant, createTestServer, product, signIn, type Client } from './helpers.js';

const { ctx, app } = createTestServer();
let site: Awaited<ReturnType<typeof createTenant>>;
let owner: Client;
let base: string;
let pub: string;
let productId: string;
const customer = { name: 'Ali Rezaei', email: 'ali@example.com', phone: '09120000000' };

beforeAll(async () => {
  const admin = await createAdmin(ctx);
  site = await createTenant(ctx, admin.id, { modules: { orders: true } });
  owner = await signIn(app, site.ownerEmail);
  base = `/api/v1/sites/${site.slug}`;
  pub = `/api/v1/public/sites/${site.slug}`;
  productId = (await owner.post(`${base}/products`, product('pay-lamp', { priceMinor: 3_000_000, stock: 10 }))).body.data.id;
});
afterAll(() => closeContext(ctx));

async function placeOrder() {
  const res = await request(app).post(`${pub}/orders`).send({ customer, items: [{ productId, quantity: 1 }] });
  expect(res.status).toBe(201);
  return res.body.data as { number: string; orderToken: string };
}

const setProvider = (provider: string, extra: object = {}) => owner.put(`${base}/payment-settings`, { provider, merchantId: '', useSandboxHost: false, ...extra });

describe('buyer order access', () => {
  it('lets the buyer read their order only with the token', async () => {
    const order = await placeOrder();
    expect((await request(app).get(`${pub}/orders/${order.number}?token=${order.orderToken}`)).body.data.paymentStatus).toBe('unpaid');
    expect((await request(app).get(`${pub}/orders/${order.number}?token=wrong-token-123`)).status).toBe(404);
  });
});

describe('payment availability', () => {
  it('refuses to start a payment when no gateway is configured', async () => {
    const order = await placeOrder();
    expect((await request(app).get(`${pub}/payment-methods`)).body.data).toEqual({ online: false, provider: null, isTest: false });
    const res = await request(app).post(`${pub}/orders/${order.number}/pay`).send({ token: order.orderToken });
    expect(res.status).toBe(409);
  });

  it('validates the Zarinpal merchant id and keeps it out of public settings', async () => {
    expect((await setProvider('zarinpal', { merchantId: 'short' })).status).toBe(400);
    const ok = await setProvider('zarinpal', { merchantId: '00000000-0000-0000-0000-000000000000' });
    expect(ok.status).toBe(200);
    const publicSettings = await request(app).get(`${pub}/settings`);
    expect(JSON.stringify(publicSettings.body)).not.toContain('00000000-0000-0000-0000-000000000000');
  });

  it('only owners (or staff with payments:manage) can change payment settings', async () => {
    const email = `cashier-${site.slug}@test.local`;
    await owner.post(`${base}/members`, { email, permissions: ['orders:read'] });
    await ctx.control.query(`UPDATE users SET password_hash = (SELECT password_hash FROM users WHERE email = $1) WHERE email = $2`, [site.ownerEmail, email]);
    const staff = await signIn(app, email);
    expect((await staff.put(`${base}/payment-settings`, { provider: 'none' })).status).toBe(403);
  });
});

describe('sandbox gateway (no real money)', () => {
  beforeAll(async () => {
    expect((await setProvider('sandbox')).status).toBe(200);
  });

  it('approved test payment → order is test_paid (never paid) and confirmed', async () => {
    const order = await placeOrder();
    const start = await request(app).post(`${pub}/orders/${order.number}/pay`).send({ token: order.orderToken, locale: 'fa' });
    expect(start.status).toBe(200);
    expect(start.body.data.isTest).toBe(true);
    const page = new URL(start.body.data.redirectUrl).pathname;

    const html = await request(app).get(page);
    expect(html.text).toMatch(/No real money moves/);

    const decision = await request(app).post(page).type('form').send({ decision: 'approved' });
    expect(decision.status).toBe(303);
    const callback = await request(app).get(decision.headers.location);
    expect(callback.status).toBe(303);
    expect(callback.headers.location).toMatch(/\/fa\/checkout\/result\?order=\d+&token=.+&payment=success$/);

    const view = await request(app).get(`${pub}/orders/${order.number}?token=${order.orderToken}`);
    expect(view.body.data).toMatchObject({ paymentStatus: 'test_paid', status: 'confirmed' });

    // Replaying the callback changes nothing and does not double-charge.
    const replay = await request(app).get(decision.headers.location);
    expect(replay.headers.location).toMatch(/payment=success$/);
    const detail = await owner.get(`${base}/orders/${(await owner.get(`${base}/orders`)).body.data[0].id}`);
    expect(detail.body.data.payments.filter((p: { status: string }) => p.status === 'succeeded')).toHaveLength(1);

    // Paying again is refused.
    expect((await request(app).post(`${pub}/orders/${order.number}/pay`).send({ token: order.orderToken })).status).toBe(400);
  });

  it('declined test payment → order payment failed, can be retried', async () => {
    const order = await placeOrder();
    const start = await request(app).post(`${pub}/orders/${order.number}/pay`).send({ token: order.orderToken });
    const page = new URL(start.body.data.redirectUrl).pathname;
    const decision = await request(app).post(page).type('form').send({ decision: 'declined' });
    const callback = await request(app).get(decision.headers.location);
    expect(callback.headers.location).toMatch(/payment=cancelled$/);
    expect((await request(app).get(`${pub}/orders/${order.number}?token=${order.orderToken}`)).body.data.paymentStatus).toBe('failed');
    expect((await request(app).post(`${pub}/orders/${order.number}/pay`).send({ token: order.orderToken })).status).toBe(200);
  });

  it('a forged "Status=OK" callback without approval is not accepted', async () => {
    const order = await placeOrder();
    const start = await request(app).post(`${pub}/orders/${order.number}/pay`).send({ token: order.orderToken });
    const authority = decodeURIComponent(new URL(start.body.data.redirectUrl).pathname.split('/').pop()!);
    const payment = (await owner.get(`${base}/orders/${(await owner.get(`${base}/orders`)).body.data[0].id}`)).body.data.payments[0];
    const forged = await request(app).get(`/api/v1/payments/callback/${site.slug}/${payment.id}?Authority=${authority}&Status=OK`);
    expect(forged.headers.location).toMatch(/payment=failed$/);
    expect((await request(app).get(`${pub}/orders/${order.number}?token=${order.orderToken}`)).body.data.paymentStatus).toBe('failed');
  });
});

describe('Zarinpal gateway (HTTP mocked)', () => {
  const json = (body: object) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('marks paid only after server-side verification succeeds', async () => {
    const http = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { code: 100, authority: 'A0000000000000000000000000000012345' }, errors: [] }))
      .mockResolvedValueOnce(json({ data: { code: 100, ref_id: 987654, card_pan: '6037****1234' }, errors: [] }));
    ctx.httpFetch = http;
    await setProvider('zarinpal', { merchantId: '11111111-1111-1111-1111-111111111111' });

    const order = await placeOrder();
    const start = await request(app).post(`${pub}/orders/${order.number}/pay`).send({ token: order.orderToken });
    expect(start.body.data).toEqual({ redirectUrl: 'https://payment.zarinpal.com/pg/StartPay/A0000000000000000000000000000012345', isTest: false });
    const [, init] = http.mock.calls[0];
    expect(JSON.parse(String(init!.body))).toMatchObject({ merchant_id: '11111111-1111-1111-1111-111111111111', amount: 3_000_000, currency: 'IRR' });

    const payment = (await owner.get(`${base}/orders/${(await owner.get(`${base}/orders`)).body.data[0].id}`)).body.data.payments[0];
    const cb = await request(app).get(`/api/v1/payments/callback/${site.slug}/${payment.id}?Authority=A0000000000000000000000000000012345&Status=OK`);
    expect(cb.headers.location).toMatch(/payment=success$/);
    expect(JSON.parse(String(http.mock.calls[1][1]!.body))).toMatchObject({ amount: 3_000_000, authority: 'A0000000000000000000000000000012345' });
    expect((await request(app).get(`${pub}/orders/${order.number}?token=${order.orderToken}`)).body.data.paymentStatus).toBe('paid');
  });

  it('does not mark paid when verification fails', async () => {
    const http = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { code: 100, authority: 'A0000000000000000000000000000099999' }, errors: [] }))
      .mockResolvedValueOnce(json({ data: [], errors: { code: -51, message: 'Session is not valid' } }));
    ctx.httpFetch = http;
    const order = await placeOrder();
    await request(app).post(`${pub}/orders/${order.number}/pay`).send({ token: order.orderToken });
    const payment = (await owner.get(`${base}/orders/${(await owner.get(`${base}/orders`)).body.data[0].id}`)).body.data.payments[0];
    const cb = await request(app).get(`/api/v1/payments/callback/${site.slug}/${payment.id}?Authority=A0000000000000000000000000000099999&Status=OK`);
    expect(cb.headers.location).toMatch(/payment=failed$/);
    expect((await request(app).get(`${pub}/orders/${order.number}?token=${order.orderToken}`)).body.data.paymentStatus).toBe('failed');
  });

  it('treats the Zarinpal sandbox host as a test gateway', () => {
    expect(new ZarinpalGateway('x', true).isTest).toBe(true);
    expect(new ZarinpalGateway('x', false).isTest).toBe(false);
  });
});

describe('section validation and SEO endpoints', () => {
  it('fills defaults, strips unknown props and rejects unknown section types and unsafe links', async () => {
    const ok = await owner.post(`${base}/pages`, {
      slug: 'landing',
      title: { en: 'Landing', fa: 'فرود' },
      document: { schemaVersion: 1, sections: [{ id: 'h', type: 'hero', props: { heading: { en: 'Hi', fa: 'سلام' }, evil: '<script>' } }] },
    });
    expect(ok.status).toBe(201);
    const props = ok.body.data.document.sections[0].props;
    expect(props.evil).toBeUndefined();
    expect(props.height).toBe('full');

    const unknown = await owner.patch(`${base}/pages/${ok.body.data.id}`, { document: { schemaVersion: 1, sections: [{ id: 'x', type: 'marquee', props: {} }] } });
    expect(unknown.status).toBe(400);
    const js = await owner.patch(`${base}/pages/${ok.body.data.id}`, {
      document: { schemaVersion: 1, sections: [{ id: 'c', type: 'cta', props: { cta: { label: { en: 'x', fa: 'x' }, href: 'javascript:alert(1)' } } }] },
    });
    expect(js.status).toBe(400);
  });

  it('serves a sitemap with both languages and robots.txt', async () => {
    const page = (await owner.get(`${base}/pages`)).body.data.find((p: { slug: string }) => p.slug === 'landing');
    await owner.post(`${base}/pages/${page.id}/publish`);
    const xml = await request(app).get(`${pub}/sitemap.xml`);
    expect(xml.headers['content-type']).toMatch(/xml/);
    expect(xml.text).toContain('/landing</loc>');
    expect(xml.text).toContain('hreflang="fa" href="http://localhost:5173/fa/landing"');
    expect(xml.text).toContain('/products/pay-lamp');
    expect((await request(app).get(`${pub}/robots.txt`)).text).toMatch(/Sitemap: .*sitemap\.xml/);
  });

  it('dashboard overview reports content, leads and orders', async () => {
    const res = await owner.get(`${base}/overview`);
    expect(res.status).toBe(200);
    expect(res.body.data.content.products).toBeGreaterThan(0);
    expect(res.body.data.orders.total).toBeGreaterThan(0);
  });
});
