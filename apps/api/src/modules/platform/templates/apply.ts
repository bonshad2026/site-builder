import {
  COLLECTION_PRESETS,
  collectionInputSchema,
  defaultSetup,
  demoRunSchema,
  GENERAL_BANK_TYPE,
  newBlock,
  pageDocumentSchema,
  SETUP_FORMS,
  SETUP_PAGES,
  SYSTEM_PAGES,
  systemPageSections,
  setupRequestType,
  siteSettingsSchema,
  siteSetupSchema,
  type CardBlock,
  type CollectionInput,
  type MenuPlace,
  type SiteSetup,
  type SiteSetupInput,
} from '@site-builder/shared';
import type pg from 'pg';
import { buildInsert } from '../../../common/sql.js';
import type { AppContext } from '../../../context.js';
import { productsTable, servicesTable } from '../../catalog/catalog.js';
import { defaultSiteSettings } from '../provisioning.js';
import { listKinds, loadBank, photoStore } from '../../bank/bank.service.js';
import { addDemoData } from '../setup/demo.js';
import { ARTICLE_TITLES, CITIES, PARAGRAPHS, STREETS } from '../setup/pools.js';
import { type L, type SiteTemplate } from './catalog.js';
import { templateImageStore, type StoredImage } from './images.js';

interface TenantRef {
  id: string;
  slug: string;
  db_name: string;
  db_user: string;
  db_password_enc: string | null;
}

const Lx = (en: string, fa: string): L => ({ en, fa });
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

/** A site without a business type: neutral texts and a few sample products and services. */
function genericTemplate(siteName: string): SiteTemplate {
  const p = (n: number, price: number, category: string) => ({
    slug: `product-${n}`,
    name: Lx(`Product ${n}`, `محصول نمونه ${n}`),
    description: Lx('A short description of this product.', 'توضیح کوتاهی درباره‌ی این محصول.'),
    category,
    price,
    image: `generic-${(n % 4) + 1}`,
    featured: n <= 4,
    stock: n % 5 === 0 ? 0 : 10 + n,
  });
  return {
    key: '',
    label: Lx('General business', 'کسب‌وکار عمومی'),
    theme: 'ivory',
    accent: '#8a6d4b',
    palette: ['#ece6dc', '#cdbfa9'],
    tagline: Lx('Quality you can trust', 'کیفیتی که می‌توانید به آن اعتماد کنید'),
    hero: {
      eyebrow: Lx('Welcome', 'خوش آمدید'),
      heading: Lx(siteName, siteName),
      text: Lx('Products and services chosen with care, with friendly support from first question to delivery.', 'محصولات و خدماتی که با دقت انتخاب شده‌اند، با پشتیبانی صمیمی از اولین سؤال تا تحویل.'),
      image: 'generic-1',
      cta: Lx('Get started', 'شروع کنید'),
    },
    about: {
      heading: Lx('Who we are', 'ما که هستیم'),
      body: Lx('A team that has served customers for years with honest advice and reliable service.', 'تیمی که سال‌هاست با مشاوره‌ی صادقانه و خدمات مطمئن در کنار مشتریان است.'),
      image: 'generic-2',
      long: Lx('We started small and grew with the trust of our customers.\n\n- Honest advice\n- Fast response\n- Support after purchase', 'ما کوچک شروع کردیم و با اعتماد مشتریان رشد کردیم.\n\n- مشاوره‌ی صادقانه\n- پاسخ‌گویی سریع\n- پشتیبانی پس از خرید'),
    },
    features: [
      { title: Lx('Experienced team', 'تیم باتجربه'), text: Lx('Years of experience behind every answer.', 'سال‌ها تجربه پشت هر پاسخ.') },
      { title: Lx('Fast response', 'پاسخ‌گویی سریع'), text: Lx('We answer requests the same working day.', 'درخواست‌ها را همان روز کاری پاسخ می‌دهیم.') },
      { title: Lx('After-sales support', 'پشتیبانی پس از فروش'), text: Lx('We stay with you after the purchase too.', 'بعد از خرید هم در کنار شما هستیم.') },
    ],
    stats: [
      { value: '+1200', label: Lx('happy customers', 'مشتری راضی') },
      { value: '+8', label: Lx('years of experience', 'سال تجربه') },
      { value: '24h', label: Lx('response time', 'زمان پاسخ‌گویی') },
    ],
    catalogLabel: Lx('Products', 'محصولات'),
    catalogHeading: Lx('Popular products', 'محصولات محبوب'),
    categories: [
      { slug: 'main', label: Lx('Main products', 'محصولات اصلی') },
      { slug: 'accessories', label: Lx('Accessories', 'لوازم جانبی') },
    ],
    products: [p(1, 12_000_000, 'main'), p(2, 8_500_000, 'main'), p(3, 4_200_000, 'accessories'), p(4, 19_000_000, 'main'), p(5, 2_600_000, 'accessories'), p(6, 6_900_000, 'accessories')],
    testimonials: [],
    faq: [],
    form: { type: 'contact', navLabel: Lx('Contact', 'تماس با ما'), heading: Lx('Get in touch', 'با ما در تماس باشید'), intro: Lx('Send us a message.', 'پیامتان را بفرستید.') },
    orders: true,
  };
}

/**
 * Boxes for list pages: products show category, price with discount and "add to cart"; a table
 * shows its main choice / date fields, price and seats left, and a buy or request button.
 */
export function productBox(sells: boolean): CardBlock {
  return newBlock('stack', {
    border: true,
    radius: 12,
    gap: 0,
    children: [
      newBlock('image', { field: '', ratio: 'portrait' }),
      newBlock('stack', {
        gap: 2,
        padding: 4,
        children: [
          newBlock('text', { field: 'category', textStyle: 'eyebrow', size: 'sm' }),
          newBlock('text', { field: 'title', textStyle: 'title', size: 'md', weight: 'medium', lines: 2 }),
          newBlock('price', { textStyle: 'subtitle', weight: 'medium' }),
          newBlock('stack', {
            direction: 'row',
            gap: 2,
            wrap: true,
            children: [
              newBlock('button', { action: 'view', label: Lx('View', 'مشاهده'), variant: 'secondary' }),
              ...(sells ? [newBlock('button', { action: 'cart', label: Lx('Add to cart', 'افزودن به سبد'), variant: 'primary' })] : []),
            ],
          }),
        ],
      }),
    ],
  });
}

export function tableBox(c: CollectionInput, sells: boolean): CardBlock {
  const details = c.fields.filter((f) => ['select', 'date', 'datetime', 'reference'].includes(f.type) || ['duration', 'location', 'role', 'client'].includes(f.key)).slice(0, 3);
  const summary = c.fields.find((f) => f.key === 'summary' || f.key === 'bio');
  const buy = c.commerce.enabled && sells;
  return newBlock('stack', {
    border: true,
    radius: 12,
    gap: 0,
    children: [
      ...(c.imageField ? [newBlock('image', { field: c.imageField, ratio: c.slug === 'team' || c.slug === 'teachers' ? 'square' : 'landscape' })] : []),
      newBlock('stack', {
        gap: 2,
        padding: 4,
        children: [
          newBlock('text', { field: 'title', textStyle: 'title', size: 'md', weight: 'medium', lines: 2 }),
          ...details.map((f) => newBlock('text', { field: f.key, textStyle: 'small', showLabel: true, label: f.label })),
          ...(summary ? [newBlock('text', { field: summary.key, textStyle: 'body', size: 'sm', lines: 3 })] : []),
          ...(c.commerce.priceField ? [newBlock('price', { textStyle: 'subtitle', weight: 'medium' })] : []),
          ...(c.commerce.capacityField ? [newBlock('capacity', { textStyle: 'small' })] : []),
          newBlock('stack', {
            direction: 'row',
            gap: 2,
            wrap: true,
            children: [
              newBlock('button', { action: 'view', label: Lx('Details', 'جزئیات'), variant: 'secondary' }),
              ...(buy
                ? [newBlock('button', { action: 'cart', label: Lx('Book', 'ثبت‌نام'), variant: 'primary' })]
                : c.requestType
                  ? [newBlock('button', { action: 'request', requestType: c.requestType, label: Lx('Register', 'درخواست'), variant: 'primary' })]
                  : []),
            ],
          }),
        ],
      }),
    ],
  });
}

/** Tables a chosen table points to are added before it. */
function tablesWithReferences(ids: string[]): CollectionInput[] {
  const out: CollectionInput[] = [];
  const add = (id: string) => {
    if (out.some((c) => c.slug === id)) return;
    const preset = COLLECTION_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const parsed = collectionInputSchema.parse(preset.collection);
    for (const f of parsed.fields) if (f.type === 'reference' && f.reference) add(f.reference);
    out.push(parsed);
  };
  ids.forEach(add);
  return out;
}

export interface SetupResult {
  pages: number;
  forms: number;
  tables: number;
  demo: Awaited<ReturnType<typeof addDemoData>> | null;
}

/**
 * Sets up a newly provisioned site from the operator's choices (see `siteSetupSchema`) and an
 * optional business type: settings, menus, header and footer, request forms and their pages,
 * content tables with list pages, products and services with photos, all published; then the
 * sample data, marked as demo.
 */
export async function applySetup(ctx: AppContext, tenant: TenantRef, template: SiteTemplate | undefined, siteName: string, input?: SiteSetupInput): Promise<SetupResult> {
  const setup: SiteSetup = input ? siteSetupSchema.parse(input) : defaultSetup(template?.key ?? '', template?.orders);
  const t = template ?? genericTemplate(siteName);
  const db = ctx.tenantPools.get({ id: tenant.id, dbName: tenant.db_name, dbUser: tenant.db_user, dbPasswordEnc: tenant.db_password_enc! });
  const store = templateImageStore(ctx, db, tenant.id, t.palette);
  const bankType = template?.key ?? GENERAL_BANK_TYPE;
  const img = async (ref: string) => (await store(ref)).url;
  const name: L = { en: siteName, fa: siteName };
  const fa = setup.languages !== 'en';
  const lang = (l: L) => (fa ? l.fa : l.en);

  /* ----- what was chosen ----- */
  const pages = new Map<string, MenuPlace>(Object.entries(setup.pages).filter(([id]) => SETUP_PAGES.some((p) => p.id === id)));
  if (!setup.accounts.enabled) pages.delete('account');
  // The main form lives on /contact, so that page always exists (even when not in a menu).
  if (!pages.has('contact')) pages.set('contact', 'none');
  const shop = pages.has('shop');
  const sells = shop && setup.shop.orders;
  const forms = setup.forms.filter((f, i, all) => SETUP_FORMS.some((x) => x.id === f.id) && all.findIndex((y) => y.id === f.id) === i);
  const mainId = SETUP_FORMS.some((f) => f.id === setup.mainForm) ? setup.mainForm : forms[0]?.id ?? 'contact';
  if (!forms.some((f) => f.id === mainId)) forms.unshift({ id: mainId, menu: 'none', access: 'anyone', notify: true, workflow: '' });
  const formDef = (id: string) => SETUP_FORMS.find((f) => f.id === id)!;
  const main = formDef(mainId);
  const requestTypes = forms.map((f) => setupRequestType(formDef(f.id), f));
  if (!requestTypes.some((r) => r.slug === 'contact')) {
    // Older sections and the inbox expect a plain contact type.
    requestTypes.push({ ...setupRequestType(formDef('contact'), { access: 'anyone', notify: true, workflow: '' }) });
  }

  const tableIds = setup.tables.map((x) => x.id);
  if (pages.has('blog')) tableIds.unshift('articles');
  if (pages.has('team')) tableIds.push('team');
  const tables = tablesWithReferences(tableIds);
  // Forms for a table's items: sign-up for classes, courses and events.
  const registration = forms.some((f) => f.id === 'registration') ? 'registration' : mainId;
  for (const c of tables) if (['classes', 'courses', 'events'].includes(c.slug)) c.requestType = registration;

  /* ----- photos ----- */
  const refs = [...new Set([t.hero.image, t.about.image, ...t.products.map((p) => p.image)])];
  const photos: StoredImage[] = [];
  for (const ref of refs) photos.push(await store(ref));
  const photo = (i: number) => photos[i % photos.length];

  /* ----- products and services ----- */
  if (shop) {
    for (const [position, p] of t.products.entries()) {
      const image = await store(p.image);
      const { sql, values } = buildInsert(productsTable, {
        slug: p.slug,
        name: p.name,
        description: p.description,
        category: p.category,
        priceMinor: p.price,
        currency: 'IRR',
        stock: setup.shop.stock ? (p.stock === undefined ? null : p.stock) : null,
        isAvailable: true,
        discountPercent: setup.shop.discounts ? p.discount ?? 0 : 0,
        colors: setup.shop.colors ? p.colors ?? [] : [],
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
  }
  if (pages.has('services')) {
    for (const [position, f] of t.features.entries()) {
      const { sql, values } = buildInsert(servicesTable, {
        slug: `service-${position + 1}`,
        title: f.title,
        summary: f.text,
        body: { en: `${f.text.en}\n\n${PARAGRAPHS[position % PARAGRAPHS.length].en}`, fa: `${f.text.fa}\n\n${PARAGRAPHS[position % PARAGRAPHS.length].fa}` },
        imageAssetId: photo(position + 1).id,
        duration: Lx('1–2 weeks', '۱ تا ۲ هفته'),
        startingFrom: Lx('On request', 'بر اساس درخواست'),
        deliverables: [Lx('Free consultation', 'مشاوره‌ی رایگان'), Lx('Written quote', 'پیش‌فاکتور مکتوب'), Lx('Support after delivery', 'پشتیبانی پس از تحویل')],
        process: [
          { title: Lx('Request', 'ثبت درخواست'), text: Lx('Tell us what you need.', 'نیازتان را بگویید.') },
          { title: Lx('Plan and price', 'برنامه و قیمت'), text: Lx('We send a plan and a quote.', 'برنامه و پیش‌فاکتور می‌فرستیم.') },
          { title: Lx('Delivery', 'انجام و تحویل'), text: Lx('We do the work and hand it over.', 'کار را انجام می‌دهیم و تحویل می‌دهیم.') },
        ],
        status: 'published',
        position,
        seo: {},
      });
      await db.query(`${sql.replace(/ RETURNING .*/s, '')} ON CONFLICT (slug) DO NOTHING`, values);
    }
  }

  /* ----- content tables ----- */
  for (const [position, c] of tables.entries()) {
    await db.query(
      `INSERT INTO collections (slug, name, item_name, fields, detail_page, image_field, commerce, request_type, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (slug) DO NOTHING`,
      [c.slug, c.name, c.itemName, JSON.stringify(c.fields), c.detailPage, c.imageField, c.commerce, c.requestType, position],
    );
  }

  /* ----- pages ----- */
  // Reviews and questions come from the content bank: the type's own first, then general ones.
  const bank = await loadBank(ctx, bankType);
  const text = (v: unknown): L => (v && typeof v === 'object' ? (v as L) : Lx(String(v ?? ''), String(v ?? '')));
  const testimonials = bank
    .entries('testimonial')
    .slice(0, setup.demo.enabled ? Math.max(setup.demo.testimonials, t.testimonials.length) : t.testimonials.length)
    .map((e) => ({ quote: text(e.data.quote), name: text(e.data.title), role: text(e.data.role) }));
  const faq = bank
    .entries('faq')
    .slice(0, Math.max(setup.demo.enabled ? setup.demo.faq : t.faq.length, 4))
    .map((e) => ({ question: text(e.data.title), answer: text(e.data.answer) }));

  const cta = (label: L, href: string, style: 'primary' | 'secondary' | 'link' = 'primary') => ({ label, href, style });
  const contactCta = cta(main.label, '/contact');
  const shopHref = '/products';
  const tableList = (c: CollectionInput, extra: Record<string, unknown> = {}) => {
    const visitorFilters = c.fields
      .filter((f) => ['select', 'reference', 'price', 'date', 'datetime'].includes(f.type))
      .slice(0, 3)
      .map((f) => ({ field: f.key, label: f.label, display: f.type === 'select' ? 'chips' : f.type === 'reference' ? 'select' : f.type === 'price' ? 'slider' : 'calendar', calendarMode: 'popup' }));
    if (c.commerce.capacityField) visitorFilters.push({ field: '__available', label: Lx('Available only', 'فقط موارد دارای ظرفیت'), display: 'toggle', calendarMode: 'popup' });
    return {
      type: 'collection-list',
      props: {
        eyebrow: name,
        heading: c.name,
        source: c.slug,
        limit: 9,
        pagination: setup.filters.pagination,
        showSearch: setup.filters.search,
        visitorFilters,
        filtersLayout: setup.filters.layout,
        columns: 3,
        sort: c.slug === 'articles' ? 'newest' : 'position',
        cardDesign: `box-${c.slug}`,
        ...extra,
      },
    };
  };
  const news = tables.find((c) => c.slug === 'articles');
  const team = tables.find((c) => c.slug === 'team');
  const firstTable = tables.find((c) => !['articles', 'team', 'teachers'].includes(c.slug));

  const home = [
    {
      type: 'hero',
      props: {
        slides: [
          { eyebrow: t.hero.eyebrow, heading: t.hero.heading, text: t.hero.text, imageUrl: await img(t.hero.image), buttons: [cta(t.hero.cta, shop ? shopHref : '/contact'), cta(Lx('About us', 'درباره ما'), '/about', 'secondary')] },
          ...(photos.length > 2 ? [{ eyebrow: name, heading: t.about.heading, text: t.about.body, imageUrl: photo(2).url, buttons: [contactCta] }] : []),
        ],
        display: photos.length > 2 ? 'slider' : 'single',
      },
    },
    { type: 'features', props: { eyebrow: Lx('Why us', 'چرا ما'), heading: t.about.heading, items: t.features } },
    ...(shop ? [{ type: 'products', props: { eyebrow: t.catalogLabel, heading: t.catalogHeading, filter: 'featured', limit: 4, showDiscount: setup.shop.discounts, showColors: setup.shop.colors, showStock: setup.shop.stock, showAddToCart: sells && setup.shop.addToCart, buttons: [cta(Lx('View all', 'مشاهده همه'), shopHref, 'link')] } }] : []),
    ...(pages.has('services') ? [{ type: 'services', props: { eyebrow: Lx('Services', 'خدمات'), heading: Lx('What we do', 'خدمات ما'), limit: 3, buttons: [cta(Lx('All services', 'همه‌ی خدمات'), '/services', 'link')] } }] : []),
    ...(firstTable ? [tableList(firstTable, { limit: 3, pagination: 'none', showSearch: false, visitorFilters: [], buttons: [cta(Lx('View all', 'مشاهده همه'), `/${firstTable.slug}`, 'link')] })] : []),
    { type: 'image-text', props: { eyebrow: Lx('About us', 'درباره ما'), heading: t.about.heading, body: t.about.body, imageUrl: await img(t.about.image), buttons: [cta(Lx('Read our story', 'داستان ما'), '/about', 'link')] } },
    { type: 'stats', props: { eyebrow: Lx('In numbers', 'به زبان اعداد'), items: t.stats } },
    ...(news ? [tableList(news, { heading: Lx('Latest articles', 'تازه‌ترین مطالب'), limit: 3, pagination: 'none', showSearch: false, visitorFilters: [], buttons: [cta(Lx('All articles', 'همه‌ی مطالب'), '/blog', 'link')] })] : []),
    ...(testimonials.length ? [{ type: 'testimonials', props: { eyebrow: Lx('Reviews', 'نظر مشتریان'), heading: Lx('What our customers say', 'مشتریان ما چه می‌گویند'), items: testimonials.slice(0, 6) } }] : []),
    { type: 'faq', props: { eyebrow: Lx('FAQ', 'پرسش‌های متداول'), heading: Lx('Good to know', 'دانستنی‌ها'), items: faq.slice(0, 4), buttons: pages.has('faq') ? [cta(Lx('All questions', 'همه‌ی پرسش‌ها'), '/faq', 'link')] : [] } },
    { type: 'cta', props: { heading: main.heading, text: main.intro, buttons: [contactCta], tone: 'accent' } },
  ];
  let position = 0;
  const put = (slug: string, title: L, sections: { type: string; props: Record<string, unknown> }[], isHome = false) => putPage(db, slug, title, isHome, position++, doc(sections));
  const header = (heading: L, intro: L) => ({ type: 'page-header', props: { eyebrow: name, heading, intro } });
  const legal = (heading: L, body: L) => [header(heading, Lx('', '')), { type: 'rich-text', props: { heading: Lx('', ''), body } }];

  await put('home', Lx('Home', 'خانه'), home, true);
  if (pages.has('about')) {
    await put('about', Lx('About us', 'درباره ما'), [
      header(t.about.heading, t.about.body),
      { type: 'image-text', props: { eyebrow: Lx('Our story', 'داستان ما'), heading: t.tagline, body: t.about.long, imageUrl: await img(t.about.image), imageSide: 'end' } },
      { type: 'stats', props: { eyebrow: Lx('In numbers', 'به زبان اعداد'), items: t.stats } },
      { type: 'features', props: { eyebrow: Lx('What we stand for', 'آنچه به آن پایبندیم'), heading: Lx('Our promise', 'تعهد ما'), items: t.features } },
      { type: 'cta', props: { heading: main.heading, text: main.intro, buttons: [contactCta], tone: 'dark' } },
    ]);
  }
  await put('contact', Lx('Contact us', 'تماس با ما'), [{ type: 'contact-form', props: { eyebrow: name, heading: main.heading, intro: main.intro, formType: main.form, requestType: main.id, showDetails: true } }]);
  for (const f of forms) {
    if (f.id === mainId) continue;
    const def = formDef(f.id);
    await put(def.page, def.label, [{ type: 'contact-form', props: { eyebrow: name, heading: def.heading, intro: def.intro, formType: def.form, requestType: def.id, showDetails: false } }]);
  }
  if (pages.has('faq')) await put('faq', Lx('FAQ', 'سؤالات متداول'), [header(Lx('Frequently asked questions', 'پرسش‌های متداول'), Lx('Answers to what customers ask most.', 'پاسخ پرسش‌های پرتکرار مشتریان.')), { type: 'faq', props: { searchable: true, items: faq } }, { type: 'cta', props: { heading: Lx('Did not find your answer?', 'پاسخ خود را پیدا نکردید؟'), text: main.intro, buttons: [contactCta] } }]);
  if (news) await put('blog', Lx('Blog', 'وبلاگ'), [header(Lx('Blog and news', 'وبلاگ و اخبار'), Lx('Guides, news and stories.', 'راهنماها، اخبار و داستان‌ها.')), tableList(news, { heading: Lx('', '') })]);
  if (pages.has('gallery')) {
    await put('gallery', Lx('Gallery', 'گالری'), [
      header(Lx('Gallery', 'گالری'), Lx('A look at our work and products.', 'نگاهی به کارها و محصولات ما.')),
      {
        type: 'gallery',
        props: {
          filterable: true,
          items: photos.slice(0, 12).map((p, i) => ({ imageUrl: p.url, title: ARTICLE_TITLES[i % ARTICLE_TITLES.length], caption: Lx('', ''), category: i % 2 ? Lx('Projects', 'پروژه‌ها') : Lx('Products', 'محصولات') })),
        },
      },
    ]);
  }
  if (team) await put('team', Lx('Our team', 'تیم ما'), [header(Lx('Our team', 'تیم ما'), Lx('The people behind the work.', 'افرادی که پشت این کار هستند.')), tableList(team, { heading: Lx('', ''), visitorFilters: [], showSearch: false, columns: 4, pagination: 'none', limit: 24 })]);
  if (pages.has('pricing')) {
    const plan = (n: L, price: string, features: L[], highlighted = false) => ({ name: n, price: Lx(price, price), period: Lx('per month', 'ماهانه'), features, highlighted, buttons: [contactCta] });
    await put('pricing', Lx('Pricing', 'تعرفه‌ها'), [
      header(Lx('Plans and pricing', 'تعرفه‌ها و پلن‌ها'), Lx('Pick the plan that fits you.', 'پلن مناسب خود را انتخاب کنید.')),
      {
        type: 'pricing',
        props: {
          plans: [
            plan(Lx('Basic', 'پایه'), '2,900,000', [Lx('Core service', 'خدمات اصلی'), Lx('Email support', 'پشتیبانی ایمیلی')]),
            plan(Lx('Standard', 'استاندارد'), '5,900,000', [Lx('Everything in Basic', 'همه‌ی امکانات پایه'), Lx('Phone support', 'پشتیبانی تلفنی'), Lx('Monthly report', 'گزارش ماهانه')], true),
            plan(Lx('Pro', 'حرفه‌ای'), '9,900,000', [Lx('Everything in Standard', 'همه‌ی امکانات استاندارد'), Lx('Dedicated adviser', 'مشاور اختصاصی'), Lx('Priority service', 'خدمات با اولویت')]),
          ],
        },
      },
      { type: 'faq', props: { heading: Lx('Questions', 'پرسش‌ها'), items: faq.slice(0, 3) } },
    ]);
  }
  if (pages.has('reviews')) await put('reviews', Lx('Reviews', 'نظرات مشتریان'), [header(Lx('Customer reviews', 'نظرات مشتریان'), Lx('What people say about us.', 'دیگران درباره‌ی ما چه می‌گویند.')), { type: 'testimonials', props: { layout: 'grid', items: testimonials } }, { type: 'cta', props: { heading: main.heading, text: main.intro, buttons: [contactCta], tone: 'accent' } }]);
  if (pages.has('branches')) {
    await put('branches', Lx('Branches', 'شعبه‌ها'), [
      header(Lx('Our branches', 'شعبه‌های ما'), Lx('Visit us at any of our branches.', 'در هر یک از شعبه‌ها پذیرای شما هستیم.')),
      {
        type: 'features',
        props: {
          marker: 'number',
          items: CITIES.slice(0, 3).map((c, i) => ({ title: Lx(`${c.en} branch`, `شعبه‌ی ${c.fa}`), text: Lx(`${STREETS[i].en}, ${c.en} · Sat–Thu 9–20 · 021-8800${i}00${i}`, `${c.fa}، ${STREETS[i].fa} · شنبه تا پنجشنبه ۹ تا ۲۰ · ۰۲۱-۸۸۰۰${i}۰۰${i}`) })),
        },
      },
    ]);
  }
  if (pages.has('terms')) {
    await put('terms', Lx('Terms', 'قوانین و مقررات'), legal(Lx('Terms and conditions', 'قوانین و مقررات'), Lx(
      `By using ${siteName} you accept these terms.\n\n- Prices and availability may change without notice.\n- Orders are confirmed after payment or a call from our team.\n- Information on the site is for guidance; ask us if anything is unclear.\n- Disputes are settled under the laws of the Islamic Republic of Iran.`,
      `استفاده از ${siteName} به معنی پذیرش این قوانین است.\n\n- قیمت‌ها و موجودی ممکن است بدون اطلاع قبلی تغییر کند.\n- سفارش‌ها پس از پرداخت یا تماس کارشناس ما قطعی می‌شوند.\n- اطلاعات سایت برای راهنمایی است؛ در صورت ابهام از ما بپرسید.\n- رسیدگی به اختلافات طبق قوانین جمهوری اسلامی ایران انجام می‌شود.`,
    )));
  }
  if (pages.has('privacy')) {
    await put('privacy', Lx('Privacy', 'حریم خصوصی'), legal(Lx('Privacy', 'حریم خصوصی'), Lx(
      `${siteName} keeps your details safe.\n\n- We use your name, phone and address only for your orders and requests.\n- We never sell or share your details with others.\n- Payments go through the bank's secure gateway; we never see your card details.\n- You can ask us to delete your account at any time.`,
      `${siteName} از اطلاعات شما محافظت می‌کند.\n\n- نام، شماره و نشانی شما فقط برای سفارش‌ها و درخواست‌هایتان استفاده می‌شود.\n- اطلاعات شما هرگز فروخته یا در اختیار دیگران قرار نمی‌گیرد.\n- پرداخت از درگاه امن بانکی انجام می‌شود و ما اطلاعات کارت شما را نمی‌بینیم.\n- هر زمان بخواهید می‌توانید حذف حساب خود را درخواست کنید.`,
    )));
  }
  if (pages.has('shipping')) {
    await put('shipping', Lx('Shipping and returns', 'ارسال و مرجوعی'), legal(Lx('Shipping and returns', 'شرایط ارسال و مرجوعی'), Lx(
      'Shipping\n\n- Same or next day in the city, 2–4 working days elsewhere.\n- Orders are packed carefully and insured.\n\nReturns\n\n- Unused items in original packaging can be returned within 7 days.\n- Damaged items are replaced free of charge.',
      'ارسال\n\n- در شهر همان روز یا روز بعد، سایر شهرها ۲ تا ۴ روز کاری.\n- سفارش‌ها با دقت بسته‌بندی و بیمه می‌شوند.\n\nمرجوعی\n\n- کالای استفاده‌نشده با بسته‌بندی اصلی تا ۷ روز قابل مرجوعی است.\n- کالای آسیب‌دیده رایگان تعویض می‌شود.',
    )));
  }
  if (shop) {
    const visitorFilters = [
      ...(setup.filters.category ? [{ field: 'category', display: 'chips', label: Lx('Category', 'دسته‌بندی') }] : []),
      ...(setup.filters.price ? [{ field: 'price', display: 'slider', label: Lx('Price', 'قیمت') }] : []),
      ...(setup.filters.discount ? [{ field: 'discount', display: 'range', label: Lx('Discount', 'تخفیف') }] : []),
      ...(setup.filters.available ? [{ field: '__available', display: 'toggle', label: Lx('In stock only', 'فقط کالاهای موجود') }] : []),
    ];
    // The shop is a builder page at /products (replacing the built-in list), so it is edited like any page.
    await put('products', t.catalogLabel, [
      header(t.catalogLabel, t.tagline),
      { type: 'collection-list', props: { source: 'products', cardDesign: 'box-products', limit: 12, pagination: setup.filters.pagination, showSearch: setup.filters.search, visitorFilters, filtersLayout: setup.filters.layout, columns: setup.shop.columns, sort: 'position' } },
    ]);
  }
  // The other built-in pages as builder pages too, holding their built-in content.
  const builtIn = [
    ...(shop ? (['productDetail'] as const) : []),
    ...(pages.has('services') ? (['services', 'serviceDetail'] as const) : []),
    ...(sells ? (['cart', 'checkout', 'checkoutResult'] as const) : []),
    ...(pages.has('account') ? (['account'] as const) : []),
    ...(pages.has('track') ? (['track'] as const) : []),
    'notFound' as const,
  ];
  for (const key of builtIn) {
    const def = SYSTEM_PAGES.find((p) => p.key === key)!;
    await put(def.slug, def.label, systemPageSections(key));
  }
  for (const c of tables) {
    if ((c.slug === 'articles' && pages.has('blog')) || (c.slug === 'team' && pages.has('team')) || !setup.tables.some((x) => x.id === c.slug)) continue;
    await put(c.slug, c.name, [header(c.name, Lx('', '')), tableList(c, { heading: Lx('', '') })]);
  }

  /* ----- menus ----- */
  type Link = { href: string; label: L };
  const links: { link: Link; place: MenuPlace }[] = [];
  for (const p of SETUP_PAGES) {
    const place = pages.get(p.id);
    if (!place || place === 'none') continue;
    const href = p.id === 'shop' ? shopHref : p.id === 'contact' ? '/contact' : p.href;
    links.push({ link: { href, label: p.id === 'shop' ? t.catalogLabel : p.label }, place });
  }
  for (const c of setup.tables) {
    const table = tables.find((x) => x.slug === c.id);
    if (table && c.menu !== 'none') links.push({ link: { href: `/${table.slug}`, label: table.name }, place: c.menu });
  }
  for (const f of forms) {
    if (f.id === mainId || f.menu === 'none') continue;
    const def = formDef(f.id);
    links.push({ link: { href: `/${def.page}`, label: def.label }, place: f.menu });
  }
  const mainLinks = links.filter((x) => x.place === 'main').map((x) => ({ ...x.link, children: [] as Link[] }));
  const more = links.filter((x) => x.place === 'more').map((x) => x.link);
  // Contact goes last in the main menu, after "More".
  const contactIndex = mainLinks.findIndex((x) => x.href === '/contact');
  const contactLink = contactIndex >= 0 ? mainLinks.splice(contactIndex, 1) : [];
  const nav = [...mainLinks.slice(0, 7), ...(more.length ? [{ href: '', label: Lx('More', 'بیشتر'), children: more.slice(0, 12) }] : []), ...contactLink];
  const footerLinks = links.filter((x) => x.place === 'footer').map((x) => x.link);

  /* ----- settings ----- */
  const contactAddress = setup.contact.address || (fa ? `${CITIES[0].fa}، ${STREETS[0].fa}، پلاک ۱۲` : `12 ${STREETS[0].en}, ${CITIES[0].en}`);
  const social = [
    ...(setup.contact.instagram ? [{ label: 'Instagram', href: `https://instagram.com/${setup.contact.instagram.replace(/^@/, '')}`, icon: 'instagram' as const }] : []),
    ...(setup.contact.telegram ? [{ label: 'Telegram', href: `https://t.me/${setup.contact.telegram.replace(/^@/, '')}`, icon: 'telegram' as const }] : []),
    ...(setup.contact.whatsapp ? [{ label: 'WhatsApp', href: `https://wa.me/${setup.contact.whatsapp.replace(/\D/g, '').replace(/^0/, '98')}`, icon: 'whatsapp' as const }] : []),
  ];
  const phone = setup.contact.phone || '021-88000000';
  const buttons = [
    ...(setup.header.cta ? [{ label: main.label, href: '/contact', style: 'primary' as const }] : []),
    ...(setup.header.phone ? [{ label: Lx('Call us', 'تماس'), href: `tel:${phone.replace(/[^\d+]/g, '')}`, style: 'secondary' as const }] : []),
    ...(setup.header.whatsapp && setup.contact.whatsapp ? [{ label: Lx('WhatsApp', 'واتس‌اپ'), href: `https://wa.me/${setup.contact.whatsapp.replace(/\D/g, '').replace(/^0/, '98')}`, style: 'secondary' as const, newTab: true }] : []),
  ];
  const base = defaultSiteSettings(siteName);
  const settings = siteSettingsSchema.parse({
    ...base,
    defaultLocale: fa ? 'fa' : 'en',
    locales: setup.languages === 'both' ? ['fa', 'en'] : [setup.languages],
    calendar: setup.calendar,
    tagline: t.tagline,
    themeId: setup.theme || t.theme,
    accentColor: setup.accent || t.accent,
    contact: {
      email: setup.contact.email,
      phone,
      address: { en: setup.contact.address || contactAddress, fa: setup.contact.address || contactAddress },
      hours: { en: setup.contact.hours || 'Sat–Thu 9:00–20:00', fa: setup.contact.hours || 'شنبه تا پنجشنبه ۹ تا ۲۰' },
    },
    social,
    socialDisplay: 'icon',
    nav,
    productCategories: shop ? t.categories : [],
    requestTypes,
    headerCta: { label: main.label, href: '/contact' },
    catalogPage: { eyebrow: name, heading: t.catalogLabel, intro: t.tagline },
    modules: { services: pages.has('services'), products: shop, projects: false, testimonials: testimonials.length > 0, faq: true, leads: true, orders: sells },
    seo: { titleTemplate: `%s — ${siteName}`, defaultDescription: t.tagline },
    business: { founded: null, stats: t.stats },
    header: {
      layout: setup.header.layout,
      showCart: sells && setup.header.cart,
      showLanguage: setup.languages === 'both' && setup.header.language,
      showTheme: setup.header.theme,
      showButton: buttons.length > 0,
      buttons: buttons.length > 1 || setup.header.phone ? buttons : [],
      showSearch: shop && setup.header.search,
      showAccount: setup.header.account,
    },
    footer: {
      showSocial: setup.footer.social,
      showContact: setup.footer.contact,
      showMenu: setup.footer.menu,
      columns: [
        ...(setup.footer.about ? [{ title: Lx('About us', 'درباره ما'), text: t.about.body, links: pages.has('about') ? [{ label: Lx('Read more', 'بیشتر بخوانید'), href: '/about' }] : [], column: 1 }] : []),
        ...(footerLinks.length ? [{ title: Lx('Useful links', 'لینک‌های مفید'), links: footerLinks.slice(0, 12), column: 4 }] : []),
      ],
    },
    shopPage: {
      columns: setup.shop.columns,
      showCategoryFilter: setup.filters.category,
      showSearch: setup.filters.search,
      showSort: setup.filters.sort,
      sortOptions: ['featured', 'price-asc', 'price-desc', 'newest'],
      card: { showDiscount: setup.shop.discounts, showColors: setup.shop.colors, showStock: setup.shop.stock, showAddToCart: sells && setup.shop.addToCart },
    },
    // A shop that sends goods asks for the full address.
    shop: { checkout: { address: sells ? 'required' : 'optional' } },
    accounts: setup.accounts,
    cardDesigns: [
      ...(shop ? [{ id: 'box-products', name: fa ? 'کارت محصول' : 'Product box', source: 'products', design: productBox(sells && setup.shop.addToCart) }] : []),
      ...tables.map((c) => ({ id: `box-${c.slug}`, name: `${lang(c.name)}`, source: c.slug, design: tableBox(c, sells) })),
    ],
  });
  await db.query('UPDATE site_settings SET settings = $1, updated_at = now() WHERE id = 1', [settings]);
  await db.query(`UPDATE payment_settings SET allow_cod = $1, provider = $2 WHERE id = 1`, [sells && setup.shop.cod, sells && setup.shop.online ? 'sandbox' : 'none']);

  const demo = setup.demo.enabled
    ? await addDemoData(db, {
        settings,
        seed: tenant.slug,
        bank,
        store: photoStore(ctx, db, tenant.id, t.palette, store),
        customKinds: await listKinds(ctx),
        shop: { sells, online: sells && setup.shop.online, cod: sells && setup.shop.cod, stock: setup.shop.stock, discounts: setup.shop.discounts, colors: setup.shop.colors },
        // "Products in all" counts the business type's own products too.
        run: demoRunSchema.parse({
          type: bankType,
          products: shop ? Math.max(0, setup.demo.products - t.products.length) : 0,
          tables: Object.fromEntries(tables.map((c) => [c.slug, setup.demo.items])),
          customers: setup.demo.customers,
          orders: setup.demo.orders,
          payments: setup.demo.payments,
          requests: setup.demo.requests,
          months: setup.demo.months,
        }),
      })
    : null;
  return { pages: position, forms: forms.length, tables: tables.length, demo };
}

/** Older name: a business type with its standard setup. */
export const applyTemplate = (ctx: AppContext, tenant: TenantRef, t: SiteTemplate, siteName: string) => applySetup(ctx, tenant, t, siteName);
