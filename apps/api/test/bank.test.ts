import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeContext } from '../src/context.js';
import { createAdmin, createTestServer, signIn, uid, type Client } from './helpers.js';

const { ctx, app } = createTestServer();
ctx.httpFetch = (async () => {
  throw new Error('offline');
}) as typeof fetch;
let platform: Client;

// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

beforeAll(async () => {
  const admin = await createAdmin(ctx);
  platform = await signIn(app, admin.email!);
});
afterAll(() => closeContext(ctx));

describe('content bank', () => {
  it('keeps types, kinds, entries and photos, and makes a site sample data from them', async () => {
    const type = `school${uid()}`.replace(/[^a-z0-9]/g, '');
    expect((await platform.post('/api/v1/platform/bank/types', { key: type, label: { en: 'School', fa: 'آموزشگاه' } })).status).toBe(201);
    expect((await platform.post('/api/v1/platform/bank/types', { key: 'general', label: { en: 'x', fa: 'x' } })).status).toBe(409);
    const types = (await platform.get('/api/v1/platform/bank/types')).body.data;
    expect(types.map((t: { key: string }) => t.key)).toEqual(expect.arrayContaining(['general', 'cosmetics', type]));

    // A kind for a table of the studio's own ("cars"): its key matches the table's.
    const kind = await platform.post('/api/v1/platform/bank/kinds', { key: 'cars', label: { en: 'Cars', fa: 'خودروها' }, fields: [{ key: 'km', type: 'number', label: { en: 'Km', fa: 'کیلومتر' } }] });
    expect(kind.status, JSON.stringify(kind.body)).toBe(201);
    expect(kind.body.data.fields.map((f: { key: string }) => f.key)).toEqual(['title', 'km']);

    const upload = await platform.agent.post('/api/v1/platform/bank/photos').set('X-CSRF-Token', platform.csrf).field('type', type).field('kind', 'course').attach('files', PNG, 'class.png');
    expect(upload.status, JSON.stringify(upload.body)).toBe(201);
    const photoId = upload.body.data[0].id;
    expect((await platform.get(`/api/v1/platform/bank/photos?type=${type}&kind=course`)).body.data).toHaveLength(1);

    const added = await platform.post('/api/v1/platform/bank/entries', {
      entries: [
        { type, kind: 'course', data: { title: { en: 'Painting for kids', fa: 'نقاشی کودکان' }, duration: { en: '10 sessions', fa: '۱۰ جلسه' }, price: 30_000_000 }, photos: [photoId] },
        { type, kind: 'cars', data: { title: { en: 'Blue sedan', fa: 'سدان آبی' }, km: 42000 } },
      ],
    });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    const listed = (await platform.get(`/api/v1/platform/bank/entries?type=${type}&kind=course`)).body.data;
    expect(listed[0]).toMatchObject({ builtIn: false, data: { title: { fa: 'نقاشی کودکان' } } });
    expect(listed[0].photos[0].url).toContain('/files/public/tenants/');

    // A site with a courses table gets items from the type's entries, with the photo copied in.
    const slug = `bank-${uid()}`;
    const site = await platform.post('/api/v1/platform/tenants', { slug, name: 'Bank site', ownerEmail: `o-${slug}@test.local`, setup: { pages: { contact: 'main' }, forms: [{ id: 'contact' }], tables: [{ id: 'courses' }], demo: { enabled: false } } });
    expect(site.status, JSON.stringify(site.body)).toBe(201);
    const id = site.body.data.id;
    const before = (await platform.get(`/api/v1/platform/tenants/${id}/demo-data`)).body.data;
    expect(before.type).toBe('general');
    expect(before.tables.map((t: { slug: string }) => t.slug)).toEqual(['courses']);

    const made = await platform.post(`/api/v1/platform/tenants/${id}/demo-data`, { type, tables: { courses: 3 }, customers: 4, requests: 5, payments: 2 });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    expect(made.body.data).toMatchObject({ items: 3, customers: 4, requests: 5 });
    const t = (await ctx.control.query('SELECT id, db_name, db_user, db_password_enc, business_type FROM tenants WHERE id = $1', [id])).rows[0];
    expect(t.business_type).toBe(type);
    const db = ctx.tenantPools.get({ id: t.id, dbName: t.db_name, dbUser: t.db_user, dbPasswordEnc: t.db_password_enc });
    const items = (await db.query(`SELECT title, data FROM collection_items ORDER BY position`)).rows;
    expect(items[0].title.fa).toBe('نقاشی کودکان');
    expect(items[0].data.duration.fa).toBe('۱۰ جلسه');
    expect((await db.query('SELECT 1 FROM assets WHERE id = $1', [items[0].data.image])).rowCount).toBe(1);

    // "Replace" starts over; "add" keeps what is there.
    await platform.post(`/api/v1/platform/tenants/${id}/demo-data`, { type, mode: 'add', tables: { courses: 2 } });
    expect((await platform.get(`/api/v1/platform/tenants/${id}/demo-data`)).body.data.demo.items).toBe(5);
    await platform.post(`/api/v1/platform/tenants/${id}/demo-data`, { type, mode: 'replace', tables: { courses: 1 } });
    expect((await platform.get(`/api/v1/platform/tenants/${id}/demo-data`)).body.data.demo).toMatchObject({ items: 1, customers: 0, requests: 0 });

    // Deleting a type removes its entries and photos.
    expect((await platform.delete(`/api/v1/platform/bank/types/${type}`)).status).toBe(204);
    expect((await platform.get(`/api/v1/platform/bank/entries?type=${type}&kind=course`)).body.data).toEqual([]);
    expect((await platform.delete('/api/v1/platform/bank/kinds/cars')).status).toBe(204);
  });
});
