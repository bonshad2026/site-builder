import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeContext } from '../src/context.js';
import { createAdmin, createTenant, createTestServer, PASSWORD, product, signIn, uid, type Client } from './helpers.js';

const { ctx, app } = createTestServer();
let operator: Client, owner: Client, base: string, tenant: Awaited<ReturnType<typeof createTenant>>, operatorEmail: string;

beforeAll(async () => {
  const admin = await createAdmin(ctx);
  operatorEmail = admin.email!;
  tenant = await createTenant(ctx, admin.id, { modules: { orders: true, products: true } });
  operator = await signIn(app, operatorEmail);
  owner = await signIn(app, tenant.ownerEmail);
  base = '/api/v1/sites/' + tenant.slug;
  const productId = (await owner.post(base + '/products', product('clear-coffee', { priceMinor: 1000, stock: 10 }))).body.data.id;
  for (let i = 0; i < 2; i++) expect((await owner.post(base + '/orders', { requestId: randomUUID(), items: [{ productId, quantity: 1 }] })).status).toBe(201);
  const db = ctx.tenantPools.get({ id: tenant.id, dbName: tenant.db_name, dbUser: tenant.db_user, dbPasswordEnc: tenant.db_password_enc! });
  await db.query(`INSERT INTO customers (phone, name) VALUES ('09120000001', 'Test')`);
});
afterAll(() => closeContext(ctx));

it('only the operator clears customers and orders, with the site id typed, and numbering restarts', async () => {
  expect((await owner.post(base + '/business-data/clear', { confirm: tenant.slug })).status).toBe(403);
  expect((await operator.post(base + '/business-data/clear', { confirm: 'nope' })).status).toBe(400);
  const res = await operator.post(base + '/business-data/clear', { confirm: tenant.slug });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(res.body.data).toEqual({ orders: 2, customers: 1 });
  expect((await owner.get(base + '/orders')).body.data).toHaveLength(0);
  expect((await owner.get(base + '/products')).body.data).toHaveLength(1);
  const productId = (await owner.get(base + '/products')).body.data[0].id;
  expect((await owner.post(base + '/orders', { requestId: randomUUID(), items: [{ productId, quantity: 1 }] })).body.data.number).toBe('1001');
});

it('changes the own sign-in name and password with the current password and signs out other sessions', async () => {
  const other = await signIn(app, tenant.ownerEmail);
  expect((await owner.patch('/api/v1/auth/me/sign-in', { currentPassword: 'wrong-password', password: 'new-owner-pass-1' })).status).toBe(400);
  expect((await owner.patch('/api/v1/auth/me/sign-in', { currentPassword: PASSWORD, password: 'short' })).status).toBe(400);
  expect((await owner.patch('/api/v1/auth/me/sign-in', { currentPassword: PASSWORD, email: operatorEmail })).status).toBe(409);
  const name = `boss${uid()}`;
  const res = await owner.patch('/api/v1/auth/me/sign-in', { currentPassword: PASSWORD, email: name, password: 'new-owner-pass-1' });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect((await other.get('/api/v1/auth/me')).status).toBe(401);
  expect((await owner.get('/api/v1/auth/me')).status).toBe(200);
  expect((await request(app).post('/api/v1/auth/login').send({ email: tenant.ownerEmail, password: PASSWORD })).status).toBe(401);
  await signIn(app, name, 'new-owner-pass-1');
});
