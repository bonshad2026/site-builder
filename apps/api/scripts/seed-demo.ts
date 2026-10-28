/**
 * DEVELOPMENT seed: a platform admin, the "Atelier Navar" demo site (its own
 * database) and its catalog, reusing the stage 1 demo content from apps/web.
 * Credentials come from DEV_ADMIN_* / DEV_OWNER_* in the local .env.
 * Safe to re-run.
 */
import { pageDocumentSchema, siteSettingsSchema } from '@site-builder/shared';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { demoNav, demoPages } from '../../web/src/content/demoPages.js';
import { products } from '../../web/src/content/products.js';
import { services } from '../../web/src/content/services.js';
import { siteConfig } from '../../web/src/config/site.js';
import { loadEnv } from '../src/config/env.js';
import { closeContext, createContext } from '../src/context.js';
import { createUser, hashPassword } from '../src/modules/auth/auth.service.js';
import { provisionTenant } from '../src/modules/platform/provisioning.js';
import { buildInsert } from '../src/common/sql.js';
import { productsTable, servicesTable } from '../src/modules/catalog/catalog.js';

const env = loadEnv();
if (env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production');

const required = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name} in .env`);
  return v;
};

const ctx = createContext(env);
try {
  const adminEmail = required('DEV_ADMIN_EMAIL');
  const ownerEmail = required('DEV_OWNER_EMAIL');

  let admin = (await ctx.control.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [adminEmail])).rows[0];
  if (!admin) admin = await createUser(ctx, { email: adminEmail, password: required('DEV_ADMIN_PASSWORD'), isPlatformAdmin: true, displayName: 'Platform Admin' });

  const existing = await ctx.control.query<{ status: string }>(`SELECT status FROM tenants WHERE slug = 'atelier-navar'`);
  // Runs on every container start: never overwrite a demo site that already exists (and may have been edited).
  if (existing.rows[0]?.status === 'active' && process.env.SEED_FORCE !== 'true') {
    console.log('demo site already exists; seed skipped (set SEED_FORCE=true to re-seed)');
    await closeContext(ctx);
    process.exit(0);
  }
  if (existing.rows[0]?.status !== 'active') {
    await provisionTenant(ctx, { slug: 'atelier-navar', name: 'Atelier Navar', ownerEmail, domain: 'ateliernavar.localhost', actorUserId: admin.id });
  }
  // Demo convenience: give the owner a known password instead of the emailed set-password link.
  await ctx.control.query('UPDATE users SET password_hash = $2, email_verified_at = COALESCE(email_verified_at, now()) WHERE email = $1', [
    ownerEmail,
    await hashPassword(required('DEV_OWNER_PASSWORD')),
  ]);

  const t = (await ctx.control.query(`SELECT id, db_name, db_user, db_password_enc FROM tenants WHERE slug = 'atelier-navar'`)).rows[0];
  const db = ctx.tenantPools.get({ id: t.id, dbName: t.db_name, dbUser: t.db_user, dbPasswordEnc: t.db_password_enc });

  const settings = siteSettingsSchema.parse({
    name: siteConfig.name,
    tagline: siteConfig.tagline,
    defaultLocale: siteConfig.defaultLocale,
    locales: siteConfig.locales,
    themeId: siteConfig.defaultTheme,
    logoAssetId: null,
    contact: siteConfig.contact,
    social: siteConfig.social,
    nav: demoNav,
    modules: { ...siteConfig.modules, orders: true },
    seo: { titleTemplate: siteConfig.seo.titleTemplate, defaultDescription: siteConfig.seo.defaultDescription },
    business: siteConfig.business,
  });
  await db.query('UPDATE site_settings SET settings = $1, updated_at = now() WHERE id = 1', [settings]);

  // Demo photos: downloaded once from Unsplash and stored as real assets (local disk or S3).
  const imageCache = new Map<string, { id: string; url: string }>();
  const { rows: existingAssets } = await db.query<{ id: string; original_name: string; storage_key: string }>(
    `SELECT id, original_name, storage_key FROM assets WHERE original_name LIKE 'unsplash-%'`,
  );
  for (const a of existingAssets) imageCache.set(a.original_name.slice(9, -4), { id: a.id, url: ctx.storage.publicUrl(a.storage_key) });
  // Solid-colour PNG used when Unsplash can't be reached (offline or blocked networks).
  function placeholderPng(seed: string) {
    const [w, h] = [48, 32];
    const hue = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 0);
    const [r, g, b] = [0, 8, 4].map((n) => {
      const k = (n + hue / 30) % 12;
      return Math.round(255 * (0.72 - 0.12 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    });
    const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
    const chunk = (type: string, data: Buffer) => {
      const td = Buffer.concat([Buffer.from(type), data]);
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
      return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8);
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0)),
    ]);
  }
  let unsplashOffline = false;
  async function storeImage(unsplashId: string) {
    const cached = imageCache.get(unsplashId);
    if (cached) return cached;
    let body: Buffer;
    let [ext, contentType] = ['jpg', 'image/jpeg'];
    // Pre-downloaded copies (var/demo-images/<unsplashId>.jpg) win over the network.
    const localCopy = new URL(`../../../var/demo-images/${unsplashId}.jpg`, import.meta.url);
    try {
      if (existsSync(localCopy)) {
        body = readFileSync(localCopy);
      } else {
        if (unsplashOffline) throw new Error('Unsplash unreachable');
        const res = await fetch(`https://images.unsplash.com/photo-${unsplashId}?auto=format&fm=jpg&q=78&w=1800`, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        body = Buffer.from(await res.arrayBuffer());
      }
    } catch (err) {
      if (!unsplashOffline) console.warn(`Could not download demo images (${(err as Error).message}); using placeholders.`);
      unsplashOffline = true;
      body = placeholderPng(unsplashId);
      [ext, contentType] = ['png', 'image/png'];
    }
    const id = randomUUID();
    const now = new Date();
    const key = `public/tenants/${t.id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${ext}`;
    await ctx.storage.put(key, body, contentType);
    await db.query(
      `INSERT INTO assets (id, storage_key, original_name, content_type, size_bytes, visibility, kind) VALUES ($1, $2, $3, $4, $5, 'public', 'image')`,
      [id, key, `unsplash-${unsplashId}.${ext}`, contentType, body.length],
    );
    const entry = { id, url: ctx.storage.publicUrl(key) };
    imageCache.set(unsplashId, entry);
    return entry;
  }
  const allImages = new Set<string>([...services.map((x) => x.image), ...products.map((x) => x.image)]);
  const pagesWithIds = demoPages((id) => {
    allImages.add(id);
    return `__IMG__${id}`;
  });
  for (const id of allImages) await storeImage(id);
  const img = (id: string) => imageCache.get(id)!.url;

  for (const [position, s] of services.entries()) {
    const { sql, values } = buildInsert(servicesTable, {
      slug: s.slug, title: s.title, summary: s.summary, body: s.body, duration: s.duration, startingFrom: s.startingFrom,
      deliverables: s.deliverables, process: s.process, status: 'published', position, seo: {}, imageAssetId: imageCache.get(s.image)!.id,
    });
    await db.query(`${sql.replace(/ RETURNING .*/s, '')} ON CONFLICT (slug) DO NOTHING`, values);
    await db.query('UPDATE services SET image_asset_id = $2 WHERE slug = $1 AND image_asset_id IS NULL', [s.slug, imageCache.get(s.image)!.id]);
  }
  for (const [position, p] of products.entries()) {
    const { sql, values } = buildInsert(productsTable, {
      slug: p.slug, name: p.name, description: p.description, category: p.category,
      priceMinor: p.price * 1_000_000, currency: 'IRR', stock: 10, isAvailable: true, featured: !!p.featured,
      materials: p.materials, dimensions: p.dimensions, leadTime: p.leadTime, status: 'published', position, seo: {}, imageAssetId: imageCache.get(p.image)!.id,
    });
    await db.query(`${sql.replace(/ RETURNING .*/s, '')} ON CONFLICT (slug) DO NOTHING`, values);
    await db.query('UPDATE products SET image_asset_id = $2 WHERE slug = $1 AND image_asset_id IS NULL', [p.slug, imageCache.get(p.image)!.id]);
  }

  // Section-based pages (draft and published), validated by the same schema the API uses.
  for (const [position, page] of demoPages(img).entries()) {
    const document = pageDocumentSchema.parse({ schemaVersion: 1, sections: page.sections });
    await db.query(
      `INSERT INTO pages (slug, title, is_home, position, draft, published, published_title, published_seo, published_at, published_version)
       VALUES ($1, $2, $3, $4, $5, $5, $2, '{}', now(), 1)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, position = EXCLUDED.position, draft = EXCLUDED.draft,
         published = EXCLUDED.published, published_title = EXCLUDED.published_title,
         published_seo = coalesce(pages.published_seo, '{}'), published_at = now()`,
      [page.slug, page.title, !!page.isHome, position, document],
    );
  }
  void pagesWithIds;
  await db.query(`UPDATE payment_settings SET provider = 'sandbox' WHERE id = 1 AND provider = 'none'`);

  console.log(`seeded: admin ${adminEmail}, site atelier-navar (database ${t.db_name}), owner ${ownerEmail}`);
} finally {
  await closeContext(ctx);
}
