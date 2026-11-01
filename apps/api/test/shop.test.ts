import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeContext } from '../src/context.js';
import { ZibalGateway } from '../src/modules/payments/gateways.js';
import { createAdmin, createTenant, createTestServer, product, signIn, type Client } from './helpers.js';

const { ctx, app, emails, sms } = createTestServer();
let site: Awaited<ReturnType<typeof createTenant>>;
let owner: Client;
let platform: Client;
let base: string;
let pub: string;

beforeAll(async () => {
  const admin = await createAdmin(ctx);
  platform = await signIn(app, admin.email!);
  site = await createTenant(ctx, admin.id, { modules: { orders: true, products: true } });
  owner = await signIn(app, site.ownerEmail);
  base = `/api/v1/sites/${site.slug}`;
  pub = `/api/v1/public/sites/${site.slug}`;
});
afterAll(() => closeContext(ctx));

async function settings() {
  return (await owner.get(`${base}/settings`)).body.data;
}

describe('checkout, shipping and discount codes', () => {
  it('asks what the shop sets, adds shipping, applies a code once its limit allows, and keeps totals on the server', async () => {
    const s = await settings();
    s.shop = {
      ...s.shop,
      checkout: { email: 'off', address: 'required', region: true, postalCode: 'required', note: false, fields: [{ id: 'floor', label: { en: 'Floor', fa: 'طبقه' }, type: 'text', required: true }] },
      shipping: [{ id: 'post', label: { en: 'Post', fa: 'پست' }, description: { en: '', fa: '' }, priceMinor: 500_000, freeAbove: 10_000_000 }],
      lowStock: 3,
    };
    s.notifications = { staff: true, emails: ['staff@test.local'] };
    expect((await owner.put(`${base}/settings`, s)).status).toBe(200);
    const p = (await owner.post(`${base}/products`, product('lamp', { priceMinor: 2_000_000, stock: 5 }))).body.data;
    expect((await owner.post(`${base}/shop/coupons`, { code: 'off10', kind: 'percent', value: 10, maxUses: 1 })).status).toBe(201);

    const order = (extra: object = {}) => ({
      customer: { name: 'Sara Ahmadi', phone: '09121234567', address: 'Valiasr St. 12', province: 'تهران', city: 'تهران', postalCode: '1234567890', answers: { floor: '3' } },
      items: [{ productId: p.id, quantity: 2 }],
      paymentMethod: 'online',
      shippingMethod: 'post',
      ...extra,
    });

    // Missing answers and a bad postal code are named.
    const bad = await request(app).post(`${pub}/orders`).send(order({ customer: { name: 'Sara Ahmadi', phone: '09121234567', postalCode: '12' } }));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(['customer.address', 'customer.postalCode', 'customer.province', 'customer.answers.floor']));
    expect((await request(app).post(`${pub}/orders`).send(order({ shippingMethod: '' }))).status).toBe(400);

    // The code: checked as it is typed, then applied and counted with the order.
    expect((await request(app).get(`${pub}/coupons/OFF10?subtotal=4000000`)).body.data.discountMinor).toBe(400_000);
    const placed = await request(app).post(`${pub}/orders`).send(order({ coupon: 'off10' }));
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    const list = (await owner.get(`${base}/orders`)).body.data[0];
    expect(list).toMatchObject({ subtotalMinor: '4000000', discountMinor: '400000', shippingMinor: '500000', totalMinor: '4100000', couponCode: 'OFF10' });
    expect(list.customer.answers).toEqual([{ label: 'طبقه', value: '3' }]);
    // Used up: the second order with it is refused.
    const again = await request(app).post(`${pub}/orders`).send(order({ coupon: 'OFF10' }));
    expect(again.status).toBe(400);
    expect(again.body.error.details[0].code).toBe('coupon_used_up');

    // Stock fell to the warning level (5 − 2 = 3): the staff got an e-mail.
    expect(emails.outbox.some((m) => m.to === 'staff@test.local' && /lamp|Low stock/i.test(`${m.subject}\n${m.text}`))).toBe(true);
  });

  it('sells variants at their own price and stock, and gives variant stock back on cancel', async () => {
    const p = (
      await owner.post(
        `${base}/products`,
        product('shirt', { priceMinor: 1_000_000, stock: null, variants: [{ name: { en: 'L', fa: 'لارج' }, priceMinor: 1_500_000, stock: 2 }, { name: { en: 'S', fa: 'اسمال' }, priceMinor: null, stock: null }] }),
      )
    ).body.data;
    const s = await settings();
    s.shop = { ...s.shop, checkout: { ...s.shop.checkout, fields: [], postalCode: 'optional', address: 'optional' }, shipping: [] };
    await owner.put(`${base}/settings`, s);
    const buy = (variant: string, quantity: number) => request(app).post(`${pub}/orders`).send({ customer: { name: 'Ali Rezaei', phone: '09121112222' }, items: [{ productId: p.id, quantity, variant }], paymentMethod: 'online' });

    expect((await buy('', 1)).status).toBe(400);
    expect((await buy('L', 3)).status).toBe(409);
    const ok = await buy('لارج', 2);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const order = (await owner.get(`${base}/orders`)).body.data.find((o: { number: string }) => o.number === ok.body.data.number);
    expect(order.totalMinor).toBe('3000000');
    expect((await owner.get(`${base}/products/${p.id}`)).body.data.variants[0].stock).toBe(0);
    await owner.patch(`${base}/orders/${order.id}`, { status: 'cancelled' });
    expect((await owner.get(`${base}/products/${p.id}`)).body.data.variants[0].stock).toBe(2);
  });
});

describe('reviews and newsletter', () => {
  it('shows a review only after approval, and keeps subscribers once', async () => {
    await owner.post(`${base}/products`, product('vase'));
    expect((await request(app).post(`${pub}/products/vase/reviews`).send({ name: 'Neda', rating: 5, text: 'Lovely' })).status).toBe(201);
    expect((await request(app).get(`${pub}/products/vase/reviews`)).body.data.count).toBe(0);
    const pending = (await owner.get(`${base}/shop/reviews?status=pending`)).body.data[0];
    await owner.patch(`${base}/shop/reviews/${pending.id}`, { status: 'approved' });
    expect((await request(app).get(`${pub}/products/vase/reviews`)).body.data).toMatchObject({ count: 1, average: 5 });

    expect((await request(app).post(`${pub}/subscribe`).send({ contact: '۰۹۱۲۳۴۵۶۷۸۹' })).status).toBe(201);
    expect((await request(app).post(`${pub}/subscribe`).send({ contact: '+989123456789' })).status).toBe(201);
    expect((await request(app).post(`${pub}/subscribe`).send({ contact: 'not a contact' })).status).toBe(400);
    expect((await owner.get(`${base}/shop/subscribers`)).body.data.map((x: { contact: string }) => x.contact)).toEqual(['09123456789']);
  });
});

describe('messaging set in the panel', () => {
  it('keeps secrets out of answers, and sends through the environment until turned on', async () => {
    expect((await platform.put('/api/v1/platform/messaging', { email: { enabled: true, smtpUrl: 'not-a-url', from: 'x' }, sms: { enabled: false } })).status).toBe(400);
    expect((await platform.put('/api/v1/platform/messaging', { email: { enabled: false, smtpUrl: 'smtps://u:secret@mail.test:465', from: 'Shop <a@b.c>' }, sms: { enabled: false, apiKey: 'k-123' } })).status).toBe(204);
    const got = (await platform.get('/api/v1/platform/messaging')).body.data;
    expect(got.email).toEqual({ enabled: false, from: 'Shop <a@b.c>', hasSmtpUrl: true });
    expect(JSON.stringify(got)).not.toMatch(/secret|k-123/);
    const test = await platform.post('/api/v1/platform/messaging/test', { phone: '09120000000' });
    expect(test.body.data.sms).toBe('ok');
    expect(sms.texts.some((x) => x.phone === '09120000000')).toBe(true);
    expect((await owner.get('/api/v1/platform/messaging')).status).toBe(403);
  });
});

describe('payment gateways', () => {
  it('Zibal: asks for a payment, then verifies it server-side', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url, body });
      return Response.json(url.endsWith('/v1/request') ? { result: 100, trackId: 777 } : { result: 100, refNumber: 'R1', cardNumber: '6037**1234' });
    }) as unknown as typeof fetch;
    const g = new ZibalGateway('zibal', fake);
    expect(g.isTest).toBe(true);
    const started = await g.request({ amountMinor: 10_000n, currency: 'IRR', callbackUrl: 'https://x/cb', description: 'Order' });
    expect(started).toEqual({ authority: '777', redirectUrl: 'https://gateway.zibal.ir/start/777' });
    expect(await g.verify({ authority: '777', amountMinor: 10_000n, currency: 'IRR' })).toEqual({ ok: true, refId: 'R1', cardPan: '6037**1234' });
    expect(calls[1].body).toEqual({ merchant: 'zibal', trackId: 777 });
  });
});
