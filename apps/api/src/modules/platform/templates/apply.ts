import { pageDocumentSchema, siteSettingsSchema } from '@site-builder/shared';
import type pg from 'pg';
import { buildInsert } from '../../../common/sql.js';
import type { AppContext } from '../../../context.js';
import { productsTable } from '../../catalog/catalog.js';
import { defaultSiteSettings } from '../provisioning.js';
import { type L, type SiteTemplate } from './catalog.js';
import { templateImageStore } from './images.js';

interface TenantRef {
  id: string;
  db_name: string;
  db_user: string;
  db_password_enc: string | null;
}

const doc = (sections: { type: string; props: Record<string, unknown> }[]) =>
  pageDocumentSchema.parse({ schemaVersion: 1, sections: sections.map((s, i) => ({ id: `s${i + 1}`, ...s })) });

/** Writes a page as published version 1 (replacing the provisioning placeholder, if any). */
async function putPage(db: pg.Pool, slug: string, title: L, isHome: boolean, position: number, document: unknown) {
  const { rows } = await db.query(
    `INSERT INTO pages (slug, title, is_home, position, draft, published, published_title, published_seo, published_at, published_version)
     VALUES ($1, $2, $3, $4, $5, $5, $2, '{}', now(), 1)
     ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, position = EXCLUDED.position, draft = EXCLUDED.draft, published = EXCLUDED.published,
       published_title = EXCLUDED.published_title, published_seo = '{}', published_at = now(), published_version = 1, draft_updated_at = now()
     RETURNING id`,
    [slug, title, isHome, position, document],
  );
  await db.query('DELETE FROM page_versions WHERE page_id = $1', [rows[0].id]);
  await db.query('INSERT INTO page_versions (page_id, version, document, title, seo) VALUES ($1, 1, $2, $3, $4)', [rows[0].id, document, title, {}]);
}

/**
 * Fills a newly provisioned site with a business template: settings and categories, products
 * with photos, and Home, About and request (contact / reservation / …) pages, all published.
 */
export async function applyTemplate(ctx: AppContext, tenant: TenantRef, t: SiteTemplate, siteName: string) {
  const db = ctx.tenantPools.get({ id: tenant.id, dbName: tenant.db_name, dbUser: tenant.db_user, dbPasswordEnc: tenant.db_password_enc! });
  const store = templateImageStore(ctx, db, tenant.id, t.palette);
  const img = async (ref: string) => (await store(ref)).url;

  const name: L = { en: siteName, fa: siteName };
  const base = defaultSiteSettings(siteName);
  const settings = siteSettingsSchema.parse({
    ...base,
    tagline: t.tagline,
    themeId: t.theme,
    accentColor: t.accent,
    productCategories: t.categories,
    headerCta: { label: t.form.navLabel, href: '/contact' },
    catalogPage: { eyebrow: name, heading: t.catalogLabel, intro: t.tagline },
    nav: [
      { href: '/products', label: t.catalogLabel },
      { href: '/about', label: { en: 'About us', fa: 'درباره ما' } },
      { href: '/contact', label: t.form.navLabel },
    ],
    modules: { services: false, products: true, projects: false, testimonials: true, faq: true, leads: true, orders: t.orders },
    seo: { titleTemplate: `%s — ${siteName}`, defaultDescription: t.tagline },
    business: { founded: null, stats: t.stats },
  });
  await db.query('UPDATE site_settings SET settings = $1, updated_at = now() WHERE id = 1', [settings]);
  if (t.orders) await db.query('UPDATE payment_settings SET allow_cod = true WHERE id = 1');

  for (const [position, p] of t.products.entries()) {
    const image = await store(p.image);
    const { sql, values } = buildInsert(productsTable, {
      slug: p.slug,
      name: p.name,
      description: p.description,
      category: p.category,
      priceMinor: p.price,
      currency: 'IRR',
      stock: p.stock === undefined ? null : p.stock,
      isAvailable: true,
      discountPercent: p.discount ?? 0,
      colors: p.colors ?? [],
      maxPerOrder: p.maxPerOrder ?? null,
      featured: !!p.featured,
      materials: p.materials ?? { en: '', fa: '' },
      dimensions: p.dimensions ?? '',
      leadTime: { en: '', fa: '' },
      status: 'published',
      position,
      seo: {},
      imageAssetId: image.id,
    });
    await db.query(`${sql.replace(/ RETURNING .*/s, '')} ON CONFLICT (slug) DO NOTHING`, values);
  }

  const cta = (label: L, href: string) => ({ label, href });
  const contactCta = cta(t.form.navLabel, '/contact');
  await putPage(
    db,
    'home',
    { en: 'Home', fa: 'خانه' },
    true,
    0,
    doc([
      { type: 'hero', props: { eyebrow: t.hero.eyebrow, heading: t.hero.heading, text: t.hero.text, imageUrl: await img(t.hero.image), primaryCta: cta(t.hero.cta, t.form.type === 'reservation' ? '/contact' : '/products'), secondaryCta: cta({ en: 'About us', fa: 'درباره ما' }, '/about') } },
      { type: 'features', props: { eyebrow: { en: 'Why us', fa: 'چرا ما' }, heading: t.about.heading, items: t.features } },
      { type: 'products', props: { eyebrow: t.catalogLabel, heading: t.catalogHeading, filter: 'featured', limit: 4, showDiscount: true, showColors: true } },
      { type: 'image-text', props: { eyebrow: { en: 'About us', fa: 'درباره ما' }, heading: t.about.heading, body: t.about.body, imageUrl: await img(t.about.image), cta: cta({ en: 'Read our story', fa: 'داستان ما' }, '/about') } },
      { type: 'testimonials', props: { eyebrow: { en: 'Reviews', fa: 'نظر مشتریان' }, heading: { en: 'What our customers say', fa: 'مشتریان ما چه می‌گویند' }, items: t.testimonials } },
      { type: 'faq', props: { eyebrow: { en: 'FAQ', fa: 'پرسش‌های متداول' }, heading: { en: 'Good to know', fa: 'دانستنی‌ها' }, items: t.faq } },
      { type: 'cta', props: { heading: t.form.heading, text: t.form.intro, cta: contactCta, tone: 'accent' } },
    ]),
  );
  await putPage(
    db,
    'about',
    { en: 'About us', fa: 'درباره ما' },
    false,
    1,
    doc([
      { type: 'page-header', props: { eyebrow: name, heading: t.about.heading, intro: t.about.body } },
      { type: 'image-text', props: { eyebrow: { en: 'Our story', fa: 'داستان ما' }, heading: t.tagline, body: t.about.long, imageUrl: await img(t.about.image), imageSide: 'end' } },
      { type: 'stats', props: { eyebrow: { en: 'In numbers', fa: 'به زبان اعداد' }, items: t.stats } },
      { type: 'features', props: { eyebrow: { en: 'What we stand for', fa: 'آنچه به آن پایبندیم' }, heading: { en: 'Our promise', fa: 'تعهد ما' }, items: t.features } },
      { type: 'cta', props: { heading: t.form.heading, text: t.form.intro, cta: contactCta, tone: 'dark' } },
    ]),
  );
  await putPage(
    db,
    'contact',
    t.form.navLabel,
    false,
    2,
    doc([{ type: 'contact-form', props: { eyebrow: name, heading: t.form.heading, intro: t.form.intro, formType: t.form.type, showDetails: true } }]),
  );
}
