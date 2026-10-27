import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decryptSecret } from '../src/common/crypto.js';
import { closeContext } from '../src/context.js';
import { PASSWORD, createAdmin, createTenant, createTestServer, lead, product, signIn, type Client } from './helpers.js';

/**
 * Proves that one client cannot see or change another client's data, and
 * that roles and modules are enforced by the server.
 */
const { ctx, app } = createTestServer();
let a: Awaited<ReturnType<typeof createTenant>>;
let b: Awaited<ReturnType<typeof createTenant>>;
let ownerA: Client;
let ownerB: Client;
let bProductId: string;
let bLeadId: string;
let bPageId: string;

beforeAll(async () => {
  const admin = await createAdmin(ctx);
  a = await createTenant(ctx, admin.id, { modules: { orders: true } });
  b = await createTenant(ctx, admin.id, { modules: { orders: true } });
  ownerA = await signIn(app, a.ownerEmail);
  ownerB = await signIn(app, b.ownerEmail);

  bProductId = (await ownerB.post(`/api/v1/sites/${b.slug}/products`, product('b-secret'))).body.data.id;
  bLeadId = (await request(app).post(`/api/v1/public/sites/${b.slug}/leads`).send(lead())).body.data.id;
  bPageId = (await ownerB.get(`/api/v1/sites/${b.slug}/pages`)).body.data[0].id;
});
afterAll(() => closeContext(ctx));

describe('database-level isolation', () => {
  it('gives every tenant its own database and role', () => {
    expect(a.db_name).not.toBe(b.db_name);
    expect(a.db_user).not.toBe(b.db_user);
  });

  it("a tenant's database role cannot connect to another tenant's database", async () => {
    const client = new pg.Client({
      host: ctx.env.TENANT_DB_HOST,
      port: ctx.env.TENANT_DB_PORT,
      database: b.db_name,
      user: a.db_user,
      password: decryptSecret(a.db_password_enc!, ctx.env.TENANT_SECRETS_KEY),
    });
    await expect(client.connect()).rejects.toThrow(/permission denied/i);
    await client.end().catch(() => {});
  });

  it('never returns database credentials from the API', async () => {
    const admin = await createAdmin(ctx);
    const client = await signIn(app, admin.email!);
    const res = await client.get(`/api/v1/platform/tenants/${a.id}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/password|db_password_enc|dbPassword/i);
  });
});

describe('cross-tenant access through the API', () => {
  it("owner A cannot open site B's admin endpoints", async () => {
    for (const path of ['', '/settings', '/pages', '/products', '/leads', '/orders', '/assets', '/members']) {
      const res = await ownerA.get(`/api/v1/sites/${b.slug}${path}`);
      expect(res.status, path).toBe(404);
    }
  });

  it("owner A cannot read or change site B's records even with B's ids", async () => {
    expect((await ownerA.get(`/api/v1/sites/${a.slug}/products/${bProductId}`)).status).toBe(404);
    expect((await ownerA.patch(`/api/v1/sites/${a.slug}/products/${bProductId}`, { status: 'archived' })).status).toBe(404);
    expect((await ownerA.delete(`/api/v1/sites/${a.slug}/products/${bProductId}`)).status).toBe(404);
    expect((await ownerA.get(`/api/v1/sites/${a.slug}/leads/${bLeadId}`)).status).toBe(404);
    expect((await ownerA.patch(`/api/v1/sites/${a.slug}/pages/${bPageId}`, { title: { en: 'Hacked', fa: 'هک' } })).status).toBe(404);
    expect((await ownerA.delete(`/api/v1/sites/${b.slug}/products/${bProductId}`)).status).toBe(404);

    const stillThere = await ownerB.get(`/api/v1/sites/${b.slug}/products/${bProductId}`);
    expect(stillThere.body.data.status).toBe('published');
  });

  it('ignores tenant ids supplied by the browser', async () => {
    const res = await ownerA
      .post(`/api/v1/sites/${a.slug}/products`, { ...product('spoof'), tenantId: b.id, siteId: b.slug })
      .set('X-Tenant-Id', b.id);
    expect(res.status).toBe(201);
    expect((await ownerB.get(`/api/v1/sites/${b.slug}/products?q=spoof`)).body.data).toHaveLength(0);
    expect((await ownerA.get(`/api/v1/sites/${a.slug}/products?q=spoof`)).body.data).toHaveLength(1);
  });

  it('keeps leads, orders and files separate', async () => {
    expect((await ownerA.get(`/api/v1/sites/${a.slug}/leads`)).body.data.find((l: { id: string }) => l.id === bLeadId)).toBeUndefined();
    const order = await request(app)
      .post(`/api/v1/public/sites/${a.slug}/orders`)
      .send({ customer: { name: 'Ali', email: 'ali@example.com', phone: '09120000000' }, items: [{ productId: bProductId, quantity: 1 }] });
    expect(order.status).toBe(400); // B's product does not exist in A's database
  });
});

describe('roles and permissions', () => {
  let staff: Client;
  beforeAll(async () => {
    const email = `staff-${a.slug}@test.local`;
    const res = await ownerA.post(`/api/v1/sites/${a.slug}/members`, { email, permissions: ['leads:read'] });
    expect(res.status).toBe(201);
    await ctx.control.query(`UPDATE users SET password_hash = (SELECT password_hash FROM users WHERE email = $1) WHERE email = $2`, [a.ownerEmail, email]);
    staff = await signIn(app, email, PASSWORD);
  });

  it('staff can use what they were granted', async () => {
    expect((await staff.get(`/api/v1/sites/${a.slug}/leads`)).status).toBe(200);
  });

  it('staff cannot do owner-only or ungranted operations', async () => {
    expect((await staff.post(`/api/v1/sites/${a.slug}/products`, product('nope'))).status).toBe(403);
    expect((await staff.get(`/api/v1/sites/${a.slug}/members`)).status).toBe(403);
    expect((await staff.post(`/api/v1/sites/${a.slug}/members`, { email: 'x@test.local', permissions: [] })).status).toBe(403);
    const settings = (await ownerA.get(`/api/v1/sites/${a.slug}/settings`)).body.data;
    expect((await staff.put(`/api/v1/sites/${a.slug}/settings`, settings)).status).toBe(403);
    expect((await staff.get(`/api/v1/sites/${b.slug}/leads`)).status).toBe(404);
  });

  it('site owners have no access to platform administration', async () => {
    expect((await ownerA.get('/api/v1/platform/tenants')).status).toBe(403);
    expect((await ownerA.post('/api/v1/platform/tenants', { slug: 'evil', name: 'Evil', ownerEmail: 'e@test.local' })).status).toBe(403);
  });

  it('anonymous visitors cannot reach admin routes', async () => {
    expect((await request(app).get(`/api/v1/sites/${a.slug}/leads`)).status).toBe(401);
  });
});

describe('modules and site status', () => {
  it('rejects API calls to a disabled module (admin and public)', async () => {
    const settings = (await ownerA.get(`/api/v1/sites/${a.slug}/settings`)).body.data;
    const off = await ownerA.put(`/api/v1/sites/${a.slug}/settings`, { ...settings, modules: { ...settings.modules, products: false } });
    expect(off.status).toBe(200);

    const admin = await ownerA.get(`/api/v1/sites/${a.slug}/products`);
    expect(admin.status).toBe(403);
    expect(admin.body.error.code).toBe('module_disabled');
    expect((await request(app).get(`/api/v1/public/sites/${a.slug}/products`)).status).toBe(403);

    await ownerA.put(`/api/v1/sites/${a.slug}/settings`, settings);
    expect((await ownerA.get(`/api/v1/sites/${a.slug}/products`)).status).toBe(200);
  });

  it('a suspended site is unavailable to its owner and visitors', async () => {
    const admin = await createAdmin(ctx);
    const platform = await signIn(app, admin.email!);
    expect((await platform.patch(`/api/v1/platform/tenants/${b.id}`, { status: 'suspended' })).status).toBe(200);
    expect((await ownerB.get(`/api/v1/sites/${b.slug}/products`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/public/sites/${b.slug}/settings`)).status).toBe(404);
    await platform.patch(`/api/v1/platform/tenants/${b.id}`, { status: 'active' });
    expect((await ownerB.get(`/api/v1/sites/${b.slug}/products`)).status).toBe(200);
  });
});
