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

/** Saves a table starter straight in the control DB (as the studio would from a site). */
async function tableStarter(name: string, table: Record<string, unknown>, items: Record<string, unknown>[]) {
  const pack = { version: 2, tables: [table], samples: { items: { [table.slug as string]: items } } };
  const { rows } = await ctx.control.query<{ id: string }>(`INSERT INTO starters (kind, name, data) VALUES ('table', $1, $2) RETURNING id`, [name, JSON.stringify(pack)]);
  return rows[0].id;
}

const L = (en: string, fa: string) => ({ en, fa });

describe('site kits', () => {
  it('keeps copies of table starters with editable items and photos, and makes a site sample data from them', async () => {
    const type = `school${uid()}`.replace(/[^a-z0-9]/g, '');
    expect((await platform.post('/api/v1/platform/bank/types', { key: type, label: L('School', 'آموزشگاه') })).status).toBe(201);
    expect((await platform.post('/api/v1/platform/bank/types', { key: 'general', label: L('x', 'x') })).status).toBe(409);
    const types = (await platform.get('/api/v1/platform/bank/types')).body.data;
    expect(types.map((t: { key: string }) => t.key)).toEqual(expect.arrayContaining(['general', 'cosmetics', type]));
    expect((await platform.get('/api/v1/platform/bank/kinds')).body.data.map((k: { key: string }) => k.key)).toEqual(['product', 'service', 'testimonial', 'faq']);

    // A copy of the courses starter goes into the kit; the same table twice is refused.
    const courses = await tableStarter('Courses', {
      slug: 'courses',
      name: L('Courses', 'دوره‌ها'),
      itemName: L('Course', 'دوره'),
      imageField: 'image',
      fields: [
        { key: 'duration', type: 'text', label: L('Duration', 'مدت') },
        { key: 'price', type: 'price', label: L('Price', 'قیمت') },
        { key: 'image', type: 'image', label: L('Photo', 'عکس') },
      ],
    }, [{ ref: 'c1', slug: 'c1', title: L('Drawing', 'طراحی'), data: { duration: L('8 sessions', '۸ جلسه'), price: 10_000_000 } }]);
    const added = await platform.post('/api/v1/platform/bank/tables', { type, starter: courses });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(added.body.data).toMatchObject({ slug: 'courses', items: 1 });
    expect((await platform.post('/api/v1/platform/bank/tables', { type, starter: courses })).status).toBe(409);
    const kitId = added.body.data.id;

    // Its items are edited in the kit (the starter keeps its own), with a photo of the kit's.
    const upload = await platform.agent.post(`/api/v1/platform/bank/tables/${kitId}/photos`).set('X-CSRF-Token', platform.csrf).attach('files', PNG, 'class.png');
    expect(upload.status, JSON.stringify(upload.body)).toBe(201);
    const photoId = upload.body.data[0].id;
    const edited = await platform.put(`/api/v1/platform/bank/tables/${kitId}/items`, {
      items: { courses: [{ ref: 'c1', title: L('Painting for kids', 'نقاشی کودکان'), data: { duration: L('10 sessions', '۱۰ جلسه'), price: 30_000_000, image: photoId } }] },
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    const kit = (await platform.get(`/api/v1/platform/bank/tables/${kitId}`)).body.data;
    expect(kit.items.courses[0].title.fa).toBe('نقاشی کودکان');
    expect(kit.photos[0].url).toContain('/files/public/tenants/');
    const starter = (await ctx.control.query('SELECT data FROM starters WHERE id = $1', [courses])).rows[0].data;
    expect(starter.samples.items.courses[0].title.fa).toBe('طراحی');

    // A site with a courses table gets the kit's items, with the photo copied in.
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
    // More items than the kit has: the same ones again, numbered.
    expect(items[1].title.fa).toBe('نقاشی کودکان 2');
    expect((await db.query('SELECT 1 FROM assets WHERE id = $1', [items[0].data.image])).rowCount).toBe(1);

    // A kit table the site does not have is added first (table, then its items).
    const cars = await tableStarter('Cars', { slug: 'cars', name: L('Cars', 'خودروها'), itemName: L('Car', 'خودرو'), fields: [{ key: 'km', type: 'number', label: L('Km', 'کیلومتر') }] }, [
      { ref: 'x1', slug: 'x1', title: L('Blue sedan', 'سدان آبی'), data: { km: 42000 } },
    ]);
    const carKit = (await platform.post('/api/v1/platform/bank/tables', { type, starter: cars })).body.data;
    const withCars = await platform.post(`/api/v1/platform/tenants/${id}/demo-data`, { type, addTables: [carKit.id], tables: { cars: 2 } });
    expect(withCars.status, JSON.stringify(withCars.body)).toBe(200);
    const carItems = (await db.query(`SELECT i.title, i.data FROM collection_items i JOIN collections c ON c.id = i.collection_id WHERE c.slug = 'cars' ORDER BY i.position`)).rows;
    expect(carItems.map((r) => r.data.km)).toEqual([42000, 42000]);

    // "Replace" starts over; "add" keeps what is there.
    await platform.post(`/api/v1/platform/tenants/${id}/demo-data`, { type, mode: 'add', tables: { courses: 2 } });
    expect((await platform.get(`/api/v1/platform/tenants/${id}/demo-data`)).body.data.demo.items).toBe(7);
    await platform.post(`/api/v1/platform/tenants/${id}/demo-data`, { type, mode: 'replace', tables: { courses: 1 } });
    expect((await platform.get(`/api/v1/platform/tenants/${id}/demo-data`)).body.data.demo).toMatchObject({ items: 1, customers: 0, requests: 0 });

    // Deleting a type removes its entries, photos and kit tables.
    expect((await platform.delete(`/api/v1/platform/bank/types/${type}`)).status).toBe(204);
    expect((await platform.get(`/api/v1/platform/bank/tables?type=${type}`)).body.data).toEqual([]);
  });

  it('counts entries and photos per list, built-in ones included', async () => {
    const general = (await platform.get('/api/v1/platform/bank/counts?type=general')).body.data;
    // General has reviews and FAQ but no products or services (those depend on the business).
    expect(general.testimonial.entries).toBeGreaterThan(0);
    expect(general.faq.entries).toBeGreaterThan(0);
    expect(general.product.entries).toBe(0);
    expect(general[''].photos).toBe(0);
    const cosmetics = (await platform.get('/api/v1/platform/bank/counts?type=cosmetics')).body.data;
    expect(cosmetics.product.entries).toBeGreaterThan(0);
    expect(cosmetics[''].photos).toBeGreaterThan(0);
  });
});
