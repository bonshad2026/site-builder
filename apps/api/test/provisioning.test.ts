import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeContext } from '../src/context.js';
import { migrate, MigrationError } from '../src/database/migrator.js';
import { tenantDbName } from '../src/modules/platform/provisioning.js';
import { createAdmin, createTestServer, signIn, uid, type Client } from './helpers.js';

const { ctx, app, emails } = createTestServer();
let platform: Client;

beforeAll(async () => {
  const admin = await createAdmin(ctx);
  platform = await signIn(app, admin.email!);
});
afterAll(() => closeContext(ctx));

describe('creating a client site', () => {
  it('provisions a dedicated database, seeds it, links the owner and activates the site', async () => {
    const slug = `new-${uid()}`;
    const ownerEmail = `owner-${slug}@test.local`;
    const res = await platform.post('/api/v1/platform/tenants', { slug, name: 'New Client', ownerEmail, domain: `${slug}.example.com` });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ slug, status: 'active', provisioningStep: 'done', schemaVersion: '016_mobile_apps.sql', ownerEmail, primaryDomain: `${slug}.example.com` });


    // The new owner gets a set-password link (acts as the invitation).
    expect(emails.outbox.some((m) => m.to === ownerEmail && /reset-password\?token=/.test(m.text))).toBe(true);

    // The site works publicly straight away, resolved by its domain too.
    expect((await request(app).get(`/api/v1/public/sites/${slug}/settings`)).body.data.name.en).toBe('New Client');
    // Its forms are stored with every question as an editable field (no older fixed forms).
    const stored = await ctx.control.query('SELECT id, db_name, db_user, db_password_enc FROM tenants WHERE slug = $1', [slug]);
    const t = stored.rows[0];
    const db = ctx.tenantPools.get({ id: t.id, dbName: t.db_name, dbUser: t.db_user, dbPasswordEnc: t.db_password_enc });
    const types = (await db.query(`SELECT settings->'requestTypes' AS types FROM site_settings`)).rows[0].types;
    expect(types.length).toBeGreaterThan(0);
    expect(types.every((x: { formVersion: number; fields: unknown[] }) => x.formVersion === 2 && x.fields.length > 0)).toBe(true);
    const consultation = types.find((x: { slug: string }) => x.slug === 'consultation');
    expect(consultation.fields.find((f: { id: string }) => f.id === 'budget').options.length).toBe(4);
    expect((await request(app).get(`/api/v1/public/resolve?domain=${slug}.example.com`)).body.data.siteId).toBe(slug);

    const audit = await ctx.control.query(`SELECT action FROM audit_events WHERE tenant_id = $1 ORDER BY id`, [res.body.data.id]);
    expect(audit.rows.map((r) => r.action)).toEqual(['tenant.provision_started', 'tenant.provisioned']);
  });

  it('rejects duplicate site ids and invalid input', async () => {
    const slug = `dup-${uid()}`;
    expect((await platform.post('/api/v1/platform/tenants', { slug, name: 'One', ownerEmail: `o-${slug}@test.local` })).status).toBe(201);
    expect((await platform.post('/api/v1/platform/tenants', { slug, name: 'Two', ownerEmail: `o-${slug}@test.local` })).status).toBe(409);
    expect((await platform.post('/api/v1/platform/tenants', { slug: 'Bad Slug!', name: 'X', ownerEmail: 'x@test.local' })).status).toBe(400);
  });

  it('marks a failed run as failed (never active) and can be retried safely', async () => {
    const slug = `fail-${uid()}`;
    const dbName = tenantDbName(ctx.env.TENANT_DB_PREFIX, slug);
    // Sabotage: a database with that name already exists but is owned by someone else,
    // so the tenant role cannot create its tables and migrations fail.
    const admin = new pg.Client({ connectionString: ctx.env.PG_ADMIN_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${dbName}"`);

    const res = await platform.post('/api/v1/platform/tenants', { slug, name: 'Failing', ownerEmail: `o-${slug}@test.local` });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('provisioning_failed');

    const failed = (await platform.get('/api/v1/platform/tenants?q=' + slug)).body.data[0];
    expect(failed).toMatchObject({ status: 'failed', provisioningStep: 'migrate' });
    expect(failed.lastError).toMatch(/permission denied/i);
    expect((await request(app).get(`/api/v1/public/sites/${slug}/settings`)).status).toBe(404);

    await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    await admin.end();

    const retry = await platform.post(`/api/v1/platform/tenants/${failed.id}/retry`, { ownerEmail: `o-${slug}@test.local` });
    expect(retry.status, JSON.stringify(retry.body)).toBe(200);
    expect(retry.body.data.status).toBe('active');
  });

  it('can reassign the owner; the previous owner becomes staff', async () => {
    const slug = `own-${uid()}`;
    const created = await platform.post('/api/v1/platform/tenants', { slug, name: 'Owner swap', ownerEmail: `first-${slug}@test.local` });
    const res = await platform.put(`/api/v1/platform/tenants/${created.body.data.id}/owner`, { email: `second-${slug}@test.local` });
    expect(res.body.data.ownerEmail).toBe(`second-${slug}@test.local`);
    const roles = await ctx.control.query(
      `SELECT u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = $1 ORDER BY u.email`,
      [created.body.data.id],
    );
    expect(roles.rows).toEqual([
      { email: `first-${slug}@test.local`, role: 'staff' },
      { email: `second-${slug}@test.local`, role: 'owner' },
    ]);
  });

  it('lists how many placeholder template photos each active site still has', async () => {
    const slug = `ph-${uid()}`;
    const created = await platform.post('/api/v1/platform/tenants', { slug, name: 'Placeholders', ownerEmail: `o-${slug}@test.local` });
    const listed = async () => (await platform.get('/api/v1/platform/tenants?q=' + slug)).body.data[0];
    expect((await listed()).placeholderPhotos).toBe(0);

    const t = (await ctx.control.query('SELECT id, db_name, db_user, db_password_enc FROM tenants WHERE id = $1', [created.body.data.id])).rows[0];
    const db = ctx.tenantPools.get({ id: t.id, dbName: t.db_name, dbUser: t.db_user, dbPasswordEnc: t.db_password_enc });
    await db.query(
      `INSERT INTO assets (id, storage_key, original_name, content_type, size_bytes, visibility, kind)
       VALUES (gen_random_uuid(), 'public/x/a.png', 'unsplash-test-ref.png', 'image/png', 10, 'public', 'image'),
              (gen_random_uuid(), 'public/x/b.jpg', 'unsplash-test-ref.jpg', 'image/jpeg', 10, 'public', 'image')`,
    );
    expect((await listed()).placeholderPhotos).toBe(1);

    // Suspended sites are not checked.
    await platform.patch(`/api/v1/platform/tenants/${t.id}`, { status: 'suspended' });
    expect((await listed()).placeholderPhotos).toBeNull();
  });
});

describe('deleting sites and users', () => {
  it('starts an empty site with no pages, and deletes a site with its database after the id is typed', async () => {
    const slug = `gone-${uid()}`;
    const ownerEmail = `o-${slug}@test.local`;
    const res = await platform.post('/api/v1/platform/tenants', { slug, name: 'Gone', ownerEmail });
    expect(res.status).toBe(201);
    expect((await request(app).get(`/api/v1/public/sites/${slug}/pages`)).body.data).toEqual([]);
    // No shop, built-in tables, content tables or sample rows either; only requests stay on.
    expect((await request(app).get(`/api/v1/public/sites/${slug}/settings`)).body.data.modules).toEqual({
      services: false, products: false, projects: false, testimonials: false, faq: false, leads: true, orders: false,
    });
    const id = res.body.data.id;
    const t = (await ctx.control.query('SELECT id, db_name, db_user, db_password_enc FROM tenants WHERE id = $1', [id])).rows[0];
    const db = ctx.tenantPools.get({ id: t.id, dbName: t.db_name, dbUser: t.db_user, dbPasswordEnc: t.db_password_enc });
    const { rows: counts } = await db.query(
      `SELECT (SELECT count(*) FROM collections)::int AS tables, (SELECT count(*) FROM products)::int AS products,
              (SELECT count(*) FROM services)::int AS services, (SELECT count(*) FROM assets)::int AS photos`,
    );
    expect(counts[0]).toEqual({ tables: 0, products: 0, services: 0, photos: 0 });
    const dbName = tenantDbName(ctx.env.TENANT_DB_PREFIX, slug);

    expect((await platform.delete(`/api/v1/platform/tenants/${id}?confirm=wrong`)).status).toBe(400);
    expect((await platform.delete(`/api/v1/platform/tenants/${id}?confirm=${slug}`)).status).toBe(204);
    expect((await platform.get(`/api/v1/platform/tenants/${id}`)).status).toBe(404);
    const admin = new pg.Client({ connectionString: ctx.env.PG_ADMIN_URL });
    await admin.connect();
    expect((await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])).rowCount).toBe(0);
    await admin.end();
    expect((await request(app).get(`/api/v1/public/sites/${slug}/settings`)).status).toBe(404);

    // Its owner owns nothing now and can be deleted; nobody can delete themselves.
    const user = await ctx.control.query('SELECT id FROM users WHERE email = $1', [ownerEmail]);
    expect((await platform.delete(`/api/v1/platform/users/${user.rows[0].id}`)).status).toBe(204);
    expect((await ctx.control.query('SELECT 1 FROM users WHERE email = $1', [ownerEmail])).rowCount).toBe(0);
  });

  it('refuses to delete a user who still owns a site', async () => {
    const slug = `own-${uid()}`;
    const ownerEmail = `o-${slug}@test.local`;
    expect((await platform.post('/api/v1/platform/tenants', { slug, name: 'Owned', ownerEmail })).status).toBe(201);
    const user = await ctx.control.query('SELECT id FROM users WHERE email = $1', [ownerEmail]);
    const res = await platform.delete(`/api/v1/platform/users/${user.rows[0].id}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain(slug);
  });
});

describe('migrations', () => {
  let dir: string;
  let client: pg.Client;
  const dbName = `sb_test_migr_${uid()}`;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'migr-'));
    const admin = new pg.Client({ connectionString: ctx.env.PG_ADMIN_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${dbName}"`);
    await admin.end();
    const url = new URL(ctx.env.PG_ADMIN_URL);
    url.pathname = `/${dbName}`;
    client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
    await rm(dir, { recursive: true, force: true });
  });

  it('applies in order, is idempotent, and does not record a failing migration', async () => {
    await writeFile(path.join(dir, '001_a.sql'), 'CREATE TABLE a (id int);');
    await writeFile(path.join(dir, '002_bad.sql'), 'CREATE TABLE b (id int); SELECT no_such_function();');
    await expect(migrate(client, dir)).rejects.toBeInstanceOf(MigrationError);

    const applied = await client.query('SELECT name FROM schema_migrations ORDER BY name');
    expect(applied.rows.map((r) => r.name)).toEqual(['001_a.sql']);
    // The failed migration rolled back completely: table b does not exist.
    expect((await client.query(`SELECT to_regclass('b') AS t`)).rows[0].t).toBeNull();

    await writeFile(path.join(dir, '002_bad.sql'), 'CREATE TABLE b (id int);');
    expect(await migrate(client, dir)).toEqual(['002_bad.sql']);
    expect(await migrate(client, dir)).toEqual([]);
  });

  it('refuses to run when an applied migration was edited', async () => {
    await writeFile(path.join(dir, '001_a.sql'), 'CREATE TABLE a (id int, changed int);');
    await expect(migrate(client, dir)).rejects.toThrow(/modified after it was applied/);
  });
});
