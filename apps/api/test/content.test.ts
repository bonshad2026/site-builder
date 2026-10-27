import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeContext } from '../src/context.js';
import { createAdmin, createTenant, createTestServer, lead, product, signIn, type Client } from './helpers.js';

const { ctx, app } = createTestServer();
let site: Awaited<ReturnType<typeof createTenant>>;
let owner: Client;
let base: string;
let pub: string;

beforeAll(async () => {
  const admin = await createAdmin(ctx);
  site = await createTenant(ctx, admin.id, { modules: { orders: true } });
  owner = await signIn(app, site.ownerEmail);
  base = `/api/v1/sites/${site.slug}`;
  pub = `/api/v1/public/sites/${site.slug}`;
});
afterAll(() => closeContext(ctx));

const doc = (heading: string) => ({ schemaVersion: 1, sections: [{ id: 's1', type: 'hero', props: { heading: { en: heading, fa: heading } } }] });

describe('pages: draft vs published', () => {
  it('keeps drafts private until published, then serves only the published copy', async () => {
    const created = await owner.post(`${base}/pages`, { slug: 'about', title: { en: 'About', fa: 'درباره' }, document: doc('Draft one') });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect((await request(app).get(`${pub}/pages/about`)).status).toBe(404);

    const published = await owner.post(`${base}/pages/${id}/publish`);
    expect(published.body.data).toMatchObject({ isPublished: true, publishedVersion: 1, hasUnpublishedChanges: false });
    expect((await request(app).get(`${pub}/pages/about`)).body.data.document.sections[0].props.heading.en).toBe('Draft one');

    // Editing the draft does not leak to visitors.
    const edited = await owner.patch(`${base}/pages/${id}`, { document: doc('Work in progress') });
    expect(edited.body.data.hasUnpublishedChanges).toBe(true);
    expect((await request(app).get(`${pub}/pages/about`)).body.data.document.sections[0].props.heading.en).toBe('Draft one');

    // Version history: publish v2, restore v1 into the draft.
    await owner.post(`${base}/pages/${id}/publish`);
    expect((await owner.get(`${base}/pages/${id}/versions`)).body.data.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const restored = await owner.post(`${base}/pages/${id}/versions/1/restore`);
    expect(restored.body.data.document.sections[0].props.heading.en).toBe('Draft one');
    expect((await request(app).get(`${pub}/pages/about`)).body.data.document.sections[0].props.heading.en).toBe('Work in progress');

    await owner.post(`${base}/pages/${id}/unpublish`);
    expect((await request(app).get(`${pub}/pages/about`)).status).toBe(404);
  });

  it('enforces unique slugs, one home page, and protects the home page', async () => {
    expect((await owner.post(`${base}/pages`, { slug: 'about', title: { en: 'Dup', fa: 'تکراری' } })).status).toBe(409);
    const pages = (await owner.get(`${base}/pages`)).body.data;
    const home = pages.find((p: { isHome: boolean }) => p.isHome);
    expect((await owner.delete(`${base}/pages/${home.id}`)).status).toBe(400);

    const contact = await owner.post(`${base}/pages`, { slug: 'contact', title: { en: 'Contact', fa: 'تماس' }, isHome: true });
    const after = (await owner.get(`${base}/pages`)).body.data.filter((p: { isHome: boolean }) => p.isHome);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(contact.body.data.id);
  });

  it('rejects malformed page documents', async () => {
    const res = await owner.post(`${base}/pages`, { slug: 'bad', title: { en: 'Bad', fa: 'بد' }, document: { schemaVersion: 1, sections: [{ id: 'x', type: '<script>', props: {} }] } });
    expect(res.status).toBe(400);
  });
});

describe('products and services', () => {
  it('shows visitors only published items, with filters', async () => {
    await owner.post(`${base}/products`, product('lamp-a', { category: 'lighting', featured: true }));
    await owner.post(`${base}/products`, product('chair-a', { category: 'seating', priceMinor: 5_000_000 }));
    await owner.post(`${base}/products`, product('hidden-a', { status: 'draft' }));

    const all = (await request(app).get(`${pub}/products`)).body;
    expect(all.data.map((p: { slug: string }) => p.slug).sort()).toEqual(['chair-a', 'lamp-a']);
    expect(all.meta.total).toBe(2);
    expect((await request(app).get(`${pub}/products?category=lighting`)).body.data).toHaveLength(1);
    expect((await request(app).get(`${pub}/products?sort=price-desc`)).body.data[0].slug).toBe('chair-a');
    expect((await request(app).get(`${pub}/products/hidden-a`)).status).toBe(404);
  });

  it('validates input and maps conflicts', async () => {
    expect((await owner.post(`${base}/products`, product('lamp-a'))).status).toBe(409);
    const bad = await owner.post(`${base}/products`, { ...product('neg'), priceMinor: -5 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe('priceMinor');
  });

  it('manages services through the same rules', async () => {
    const s = await owner.post(`${base}/services`, { slug: 'design', title: { en: 'Design', fa: 'طراحی' }, summary: { en: '', fa: '' }, body: { en: '', fa: '' } });
    expect(s.status).toBe(201);
    expect((await request(app).get(`${pub}/services/design`)).status).toBe(404);
    await owner.patch(`${base}/services/${s.body.data.id}`, { status: 'published' });
    expect((await request(app).get(`${pub}/services/design`)).status).toBe(200);
  });
});

describe('leads', () => {
  it('accepts a valid enquiry from a visitor and shows it to the owner', async () => {
    const res = await request(app).post(`${pub}/leads`).send(lead({ type: 'consultation' }));
    expect(res.status).toBe(201);
    const inbox = (await owner.get(`${base}/leads`)).body.data;
    expect(inbox[0]).toMatchObject({ type: 'consultation', status: 'new', phone: '09123456789' });

    const updated = await owner.patch(`${base}/leads/${inbox[0].id}`, { status: 'contacted', note: 'Called back' });
    expect(updated.body.data.status).toBe('contacted');
    expect(updated.body.data.notes[0].text).toBe('Called back');
  });

  it('validates on the server and silently drops honeypot submissions', async () => {
    const invalid = await request(app).post(`${pub}/leads`).send(lead({ email: 'nope', consent: false }));
    expect(invalid.status).toBe(400);
    const before = (await owner.get(`${base}/leads`)).body.meta.total;
    expect((await request(app).post(`${pub}/leads`).send(lead({ website: 'http://spam.example' }))).status).toBe(201);
    expect((await owner.get(`${base}/leads`)).body.meta.total).toBe(before);
  });
});

describe('orders', () => {
  let lampId: string;
  let draftId: string;
  const customer = { name: 'Ali Rezaei', email: 'ali@example.com', phone: '09120000000' };

  beforeAll(async () => {
    lampId = (await owner.post(`${base}/products`, product('order-lamp', { priceMinor: 2_500_000, stock: 3 }))).body.data.id;
    draftId = (await owner.post(`${base}/products`, product('order-draft', { status: 'draft' }))).body.data.id;
  });

  it('prices orders from the database, ignores client prices, reserves stock, and stays unpaid', async () => {
    const res = await request(app)
      .post(`${pub}/orders`)
      .send({ customer, items: [{ productId: lampId, quantity: 2, unitPriceMinor: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ totalMinor: '5000000', paymentStatus: 'unpaid', status: 'pending' });
    expect(res.body.data.items[0]).toMatchObject({ unitPriceMinor: '2500000', quantity: 2, lineTotalMinor: '5000000' });
    expect((await owner.get(`${base}/products/${lampId}`)).body.data.stock).toBe(1);
  });

  it('rejects unavailable products and insufficient stock without side effects', async () => {
    expect((await request(app).post(`${pub}/orders`).send({ customer, items: [{ productId: draftId, quantity: 1 }] })).status).toBe(400);
    const tooMany = await request(app).post(`${pub}/orders`).send({ customer, items: [{ productId: lampId, quantity: 5 }] });
    expect(tooMany.status).toBe(409);
    expect((await owner.get(`${base}/products/${lampId}`)).body.data.stock).toBe(1);
  });

  it('follows the status lifecycle and returns stock on cancel', async () => {
    const order = (await owner.get(`${base}/orders`)).body.data[0];
    expect((await owner.patch(`${base}/orders/${order.id}`, { status: 'fulfilled' })).status).toBe(400);
    expect((await owner.patch(`${base}/orders/${order.id}`, { status: 'cancelled' })).body.data.status).toBe('cancelled');
    expect((await owner.get(`${base}/products/${lampId}`)).body.data.stock).toBe(3);
    expect((await owner.patch(`${base}/orders/${order.id}`, { status: 'confirmed' })).status).toBe(400);
  });

  it('has no API that can mark an order as paid', async () => {
    const order = (await owner.get(`${base}/orders`)).body.data[0];
    expect((await owner.patch(`${base}/orders/${order.id}`, { status: 'paid' })).status).toBe(400);
    expect((await owner.patch(`${base}/orders/${order.id}`, { paymentStatus: 'paid' })).status).toBe(400);
  });
});

describe('files', () => {
  // 1×1 transparent PNG.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const upload = (buf: Buffer, name: string, visibility = 'public') =>
    owner.agent.post(`${base}/assets`).set('X-CSRF-Token', owner.csrf).field('visibility', visibility).attach('file', buf, name);

  it('stores a real image and serves it publicly', async () => {
    const res = await upload(png, 'logo.png');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ contentType: 'image/png', kind: 'image', visibility: 'public' });
    expect(res.body.data.storageKey).toMatch(new RegExp(`^public/tenants/${site.id}/`));
    const file = await request(app).get(new URL(res.body.data.url).pathname);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
  });

  it('rejects files whose content is not an allowed type, whatever their name', async () => {
    const res = await upload(Buffer.from('<?php echo "hi"; ?>'), 'innocent.png');
    expect(res.status).toBe(415);
  });

  it('rejects oversized files', async () => {
    const res = await upload(Buffer.concat([png, Buffer.alloc(ctx.env.UPLOAD_MAX_BYTES)]), 'big.png');
    expect(res.status).toBe(413);
  });

  it('serves private files only through a valid signed URL', async () => {
    const res = await upload(png, 'contract.png', 'private');
    const signed = new URL(res.body.data.url);
    expect((await request(app).get(signed.pathname + signed.search)).status).toBe(200);
    expect((await request(app).get(signed.pathname)).status).toBe(403);
    expect((await request(app).get(signed.pathname + signed.search.replace(/sig=[^&]+/, 'sig=forged'))).status).toBe(403);
  });

  it('deletes files from storage and the database', async () => {
    const res = await upload(png, 'temp.png');
    expect((await owner.delete(`${base}/assets/${res.body.data.id}`)).status).toBe(204);
    expect((await request(app).get(new URL(res.body.data.url).pathname)).status).toBe(404);
  });
});

describe('API documentation', () => {
  it('serves an OpenAPI document covering the routes', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.paths['/api/v1/sites/{siteId}/products']).toBeDefined();
    expect(res.body.paths['/api/v1/public/sites/{siteSlug}/orders'].post).toBeDefined();
  });
});
