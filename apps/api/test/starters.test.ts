import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeContext } from '../src/context.js';
import { addSampleStarters, SAMPLES } from '../src/modules/starters/samples.js';
import { createAdmin, createTestServer, signIn, uid, type Client } from './helpers.js';

const { ctx, app } = createTestServer();
// Template photos are not downloaded in tests (they become gradient placeholders).
ctx.httpFetch = (async () => {
  throw new Error('offline');
}) as typeof fetch;
let platform: Client;

beforeAll(async () => {
  const admin = await createAdmin(ctx);
  platform = await signIn(app, admin.email!);
});
afterAll(() => closeContext(ctx));

const site = async (setup?: object) => {
  const slug = `st-${uid()}`;
  const res = await platform.post('/api/v1/platform/tenants', { slug, name: 'Starter site', ownerEmail: `o-${slug}@test.local`, ...(setup ? { setup } : {}) });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const t = (await ctx.control.query('SELECT id, db_name, db_user, db_password_enc FROM tenants WHERE id = $1', [res.body.data.id])).rows[0];
  return { id: res.body.data.id as string, slug, db: ctx.tenantPools.get({ id: t.id, dbName: t.db_name, dbUser: t.db_user, dbPasswordEnc: t.db_password_enc }) };
};
const file = (key: string) => path.resolve(ctx.env.STORAGE_LOCAL_DIR, ...key.split('/'));

describe('starter packs', () => {
  it('saves a page with its tables, items and photos, and builds it on an empty site', async () => {
    // A site with classes (pointing to courses and teachers) and sample items with photos.
    const source = await site({ pages: { contact: 'main' }, forms: [{ id: 'contact' }], tables: [{ id: 'classes' }], demo: { enabled: true, items: 3, customers: 0, orders: 0, payments: 0, requests: 0 } });
    const page = (await source.db.query(`SELECT id, draft FROM pages WHERE slug = 'classes'`)).rows[0];
    const { id: photoId, storage_key: photo } = (await source.db.query(`SELECT id, storage_key FROM assets LIMIT 1`)).rows[0];
    // An item with a photo (offline sample items have none).
    await source.db.query(`UPDATE collection_items SET data = data || jsonb_build_object('image', $1::text) WHERE id = (SELECT i.id FROM collection_items i JOIN collections c ON c.id = i.collection_id WHERE c.slug = 'classes' LIMIT 1)`, [photoId]);
    // A photo and a link to /contact on the page too.
    const draft = { ...page.draft, sections: [...page.draft.sections, { id: 'extra', type: 'image-text', props: { imageUrl: ctx.storage.publicUrl(photo), buttons: [{ label: { en: 'Ask', fa: 'بپرسید' }, href: '/contact' }] } }] };
    expect((await platform.patch(`/api/v1/sites/${source.slug}/pages/${page.id}`, { document: draft })).status).toBe(200);

    const scan = await platform.post(`/api/v1/sites/${source.slug}/starters/scan`, { kind: 'page', pages: ['classes'] });
    expect(scan.status, JSON.stringify(scan.body)).toBe(200);
    expect(scan.body.data.tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: 'classes', reason: 'table', included: true }),
        expect.objectContaining({ slug: 'courses', reason: 'reference', included: true }),
        expect.objectContaining({ slug: 'teachers', reason: 'reference', included: true }),
      ]),
    );
    expect(scan.body.data.pages).toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'classes', reason: 'chosen', included: true }), expect.objectContaining({ slug: 'contact', reason: 'link', included: false })]));
    expect(scan.body.data.photos).toBeGreaterThan(0);

    const saved = await platform.post(`/api/v1/sites/${source.slug}/starters`, { kind: 'page', name: `Classes ${uid()}`, pages: ['classes'], samples: true });
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    const starter = saved.body.data;
    expect(starter.summary).toMatchObject({ pages: 1, tables: 3 });
    expect(starter.summary.items).toBeGreaterThanOrEqual(9);
    expect(starter.data.needs.pages.map((p: { slug: string }) => p.slug)).toContain('contact');
    expect(starter.data.cardDesigns.map((d: { id: string }) => d.id)).toContain('box-classes');
    // Photos are the studio's own copies: removing the source site does not break the starter.
    expect(starter.data.photos.length).toBeGreaterThan(0);
    for (const p of starter.data.photos) expect(p.key).toMatch(/^public\/tenants\/00000000-0000-4000-8000-000000000000\//);
    expect(JSON.stringify(starter.data.pages)).not.toContain(source.id);
    expect((await platform.delete(`/api/v1/platform/tenants/${source.id}?confirm=${source.slug}`)).status).toBe(204);

    // An empty site: no pages, no tables, the shop off.
    const target = await site();
    const check = await platform.get(`/api/v1/sites/${target.slug}/starters/${starter.id}/check`);
    expect(check.status, JSON.stringify(check.body)).toBe(200);
    expect(check.body.data.tables).toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'classes', state: 'missing', suggested: { action: 'create', slug: 'classes' } })]));
    expect(check.body.data.pages).toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'contact', held: false, state: 'missing', suggested: { action: 'skip', slug: '' } })]));

    // Not held: a page it only links to cannot be made.
    const applied = await platform.post(`/api/v1/sites/${target.slug}/starters/${starter.id}/apply`, { page: { slug: 'our-courses', title: { en: 'Courses', fa: 'دوره‌ها' } }, pages: { contact: { action: 'create', slug: 'contact' } } });
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(applied.body.data).toMatchObject({ pages: 1, tables: 3 });
    expect(applied.body.data.items).toBeGreaterThanOrEqual(9);

    const db = target.db;
    expect((await db.query('SELECT slug FROM collections ORDER BY slug')).rows.map((r) => r.slug)).toEqual(['classes', 'courses', 'teachers']);
    expect((await db.query(`SELECT slug FROM pages`)).rows.map((r) => r.slug)).toEqual(['our-courses']);
    const items = (await db.query(`SELECT i.data, i.demo, c.slug FROM collection_items i JOIN collections c ON c.id = i.collection_id WHERE c.slug = 'classes'`)).rows;
    expect(items.every((i) => i.demo)).toBe(true);
    // Item photos are this site's files, and references point at this site's teachers.
    const image = items.find((i) => i.data.image)?.data.image;
    const asset = (await db.query('SELECT storage_key FROM assets WHERE id = $1', [image])).rows[0];
    expect(asset.storage_key).toContain(`/tenants/${target.id}/`);
    expect(existsSync(file(asset.storage_key))).toBe(true);
    const teacherIds = new Set((await db.query(`SELECT i.id FROM collection_items i JOIN collections c ON c.id = i.collection_id WHERE c.slug = 'teachers'`)).rows.map((r) => r.id));
    const refs = items.flatMap((i) => i.data.teacher ?? []);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((id: string) => teacherIds.has(id))).toBe(true);
    // The page's photo address is this site's copy; its box design came along.
    const doc = (await db.query(`SELECT draft FROM pages WHERE slug = 'our-courses'`)).rows[0].draft;
    expect(JSON.stringify(doc)).toContain(`/tenants/${target.id}/`);
    const settings = (await db.query('SELECT settings FROM site_settings WHERE id = 1')).rows[0].settings;
    expect(settings.cardDesigns.map((d: { id: string }) => d.id)).toContain('box-classes');

    // Again on the same site: the tables are used as they are, the page needs a new address.
    const again = await platform.get(`/api/v1/sites/${target.slug}/starters/${starter.id}/check`);
    expect(again.body.data.tables.find((t: { slug: string }) => t.slug === 'classes')).toMatchObject({ state: 'exists', suggested: { action: 'use' } });
    expect((await platform.post(`/api/v1/sites/${target.slug}/starters/${starter.id}/apply`, { page: { slug: 'our-courses', title: { en: 'C', fa: 'C' } } })).status).toBe(409);
    const second = await platform.post(`/api/v1/sites/${target.slug}/starters/${starter.id}/apply`, { page: { slug: 'courses-2', title: { en: 'C', fa: 'C' } }, samples: false });
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect(second.body.data).toMatchObject({ pages: 1, tables: 0, items: 0 });
    // The same box design is reused, not copied.
    const after = (await db.query('SELECT settings FROM site_settings WHERE id = 1')).rows[0].settings;
    expect(after.cardDesigns.filter((d: { id: string }) => d.id.startsWith('box-classes'))).toHaveLength(1);

    // Deleting the starter removes its photo copies.
    expect((await platform.delete(`/api/v1/platform/starters/${starter.id}`)).status).toBe(204);
    for (const p of starter.data.photos) expect(existsSync(file(p.key))).toBe(false);
  });

  it('maps a table starter onto tables the site already has, and replaces a starter', async () => {
    const source = await site({ pages: { contact: 'main' }, forms: [{ id: 'contact' }], tables: [{ id: 'classes' }], demo: { enabled: false } });
    const saved = await platform.post(`/api/v1/sites/${source.slug}/starters`, { kind: 'table', name: `Classes ${uid()}`, tables: ['classes'], skip: { tables: ['teachers'] }, samples: false });
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    const starter = saved.body.data;
    expect(starter.data.tables.map((t: { slug: string }) => t.slug)).toEqual(['classes', 'courses']);
    expect(starter.data.needs.tables.map((t: { slug: string }) => t.slug)).toEqual(['teachers']);

    // A site with its own "staff" table: the needed teachers table is mapped onto it.
    const target = await site();
    await target.db.query(`INSERT INTO collections (slug, name, item_name, fields) VALUES ('staff', '{"en":"Staff","fa":"کارکنان"}', '{"en":"Person","fa":"فرد"}', '[]')`);
    const applied = await platform.post(`/api/v1/sites/${target.slug}/starters/${starter.id}/apply`, { tables: { classes: { action: 'create', slug: 'groups' }, teachers: { action: 'use', slug: 'staff' } } });
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    const classes = (await target.db.query(`SELECT fields FROM collections WHERE slug = 'groups'`)).rows[0];
    expect(classes.fields.find((f: { key: string }) => f.key === 'teacher').reference).toBe('staff');
    expect(classes.fields.find((f: { key: string }) => f.key === 'course').reference).toBe('courses');

    // Replacing keeps the starter's id and swaps its contents.
    const replaced = await platform.post(`/api/v1/sites/${source.slug}/starters`, { kind: 'table', name: starter.name, tables: ['classes'], samples: false, replace: starter.id });
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(201);
    expect(replaced.body.data.id).toBe(starter.id);
    expect(replaced.body.data.data.tables.map((t: { slug: string }) => t.slug).sort()).toEqual(['classes', 'courses', 'teachers']);
    await platform.delete(`/api/v1/platform/starters/${starter.id}`);
  });

  it('adds the ready-made starters once, and each one builds on an empty site', async () => {
    await ctx.control.query(`DELETE FROM starters WHERE sample_key IS NOT NULL`);
    await ctx.control.query(`DELETE FROM app_settings WHERE key = 'starter_samples'`);
    expect(await addSampleStarters(ctx)).toBe(SAMPLES.length);
    expect(await addSampleStarters(ctx)).toBe(0);
    const all = (await platform.get('/api/v1/platform/starters')).body.data.filter((x: { sampleKey: string | null }) => x.sampleKey);
    expect(all).toHaveLength(SAMPLES.length);
    expect(new Set(all.map((x: { kind: string }) => x.kind))).toEqual(new Set(['page', 'table', 'header', 'footer']));
    expect(all.every((x: { group: string }) => x.group)).toBe(true);

    const target = await site();
    for (const x of all) {
      const res = await platform.post(`/api/v1/sites/${target.slug}/starters/${x.id}/apply`, x.kind === 'page' ? { page: { slug: x.sampleKey, title: { en: x.name, fa: x.name } } } : {});
      expect(res.status, `${x.sampleKey}: ${JSON.stringify(res.body)}`).toBe(200);
    }
    const settings = (await target.db.query('SELECT settings FROM site_settings WHERE id = 1')).rows[0].settings;
    expect(settings.footer.showSocial).toBe(true);
    expect(settings.requestTypes.map((r: { slug: string }) => r.slug)).toEqual(expect.arrayContaining(['booking', 'reservation', 'consultation']));
    const booking = settings.requestTypes.find((r: { slug: string }) => r.slug === 'booking');
    expect(booking.fields.find((f: { id: string }) => f.id === 'time').type).toBe('time');
    expect(Number((await target.db.query('SELECT count(*) FROM products WHERE demo')).rows[0].count)).toBeGreaterThan(0);

    // Deleting one keeps the photos the others share; a deleted sample does not come back.
    const shop = all.find((x: { sampleKey: string }) => x.sampleKey === 'page-shop-filters');
    const other = all.find((x: { sampleKey: string }) => x.sampleKey === 'page-shop-sidebar');
    expect((await platform.delete(`/api/v1/platform/starters/${shop.id}`)).status).toBe(204);
    for (const p of other.data.photos) expect(existsSync(file(p.key))).toBe(true);
    expect(await addSampleStarters(ctx)).toBe(0);

    // Groups move with "rename".
    const moved = await platform.patch(`/api/v1/platform/starters/${other.id}`, { name: other.name, description: other.description, group: 'My shop pages' });
    expect(moved.body.data.group).toBe('My shop pages');
  });

  it('reads starters saved before packs', async () => {
    const res = await platform.post('/api/v1/platform/starters', { kind: 'page', name: `Old ${uid()}`, data: { document: { schemaVersion: 1, sections: [{ id: 's1', type: 'rich-text', props: {} }] } } });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.data.pages[0]).toMatchObject({ role: 'main' });
    const target = await site();
    const applied = await platform.post(`/api/v1/sites/${target.slug}/starters/${res.body.data.id}/apply`, { page: { slug: 'hello', title: { en: 'Hello', fa: 'سلام' } } });
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(applied.body.data.pageId).toBeTruthy();
    await platform.delete(`/api/v1/platform/starters/${res.body.data.id}`);
  });
});
