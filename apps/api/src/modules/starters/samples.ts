import { randomUUID } from 'node:crypto';
import {
  COLLECTION_PRESETS,
  collectionInputSchema,
  documentUses,
  linkSlug,
  SETUP_FORMS,
  setupRequestType,
  starterPackSchema,
  type CollectionInput,
  type StarterKind,
  type StarterPack,
} from '@site-builder/shared';
import type { AppContext } from '../../context.js';
import { BANK_STORAGE_ID } from '../bank/bank.service.js';
import { FAQ, PARAGRAPHS, TESTIMONIALS, ROLES, FIRST_NAMES, LAST_NAMES } from '../platform/setup/pools.js';
import { fieldValue, itemTitle, random } from '../platform/setup/demo.js';
import { SITE_TEMPLATES } from '../platform/templates/catalog.js';
import { productBox, tableBox } from '../platform/templates/apply.js';
import { templatePhotoLoader } from '../platform/templates/images.js';

/**
 * Ready-made starters the studio adds once (Platform ← Starters): common pages in two or three
 * looks each (404, contact, about, shop, product, services, courses, classes, request forms,
 * cart, account and sign-in…), ready tables with sample items, headers and footers. They are
 * ordinary starters afterwards: renamed, regrouped, replaced or deleted like the operator's own,
 * and a deleted one is not added again (`app_settings` key `starter_samples`).
 */

type L = { en: string; fa: string };
type Sec = { type: string; props: Record<string, unknown> };
const Lx = (en: string, fa: string): L => ({ en, fa });
const btn = (en: string, fa: string, href: string, style: 'primary' | 'secondary' | 'link' = 'primary') => ({ label: Lx(en, fa), href, style });
const sec = (type: string, props: Record<string, unknown> = {}): Sec => ({ type, props });
const header = (heading: L, intro: L = Lx('', ''), extra: Record<string, unknown> = {}) => sec('page-header', { heading, intro, ...extra });

/** Photos (template photos in var/demo-images); in texts they are `photo(ref)` until stored. */
const PHOTOS = {
  office: '1497366216548-37526070297c',
  living: '1600210492486-724fe5c67fb0',
  room: '1616486338812-3dadae4b4ace',
  bright: '1618221195710-dd6b41faaea6',
  chair: '1586023492125-27b2c045efd7',
  sofa: '1555041469-a586c61ea9bc',
  kitchen: '1600585154340-be6161a56a0c',
  hall: '1600607687939-ce8a6c25118c',
  lamp: '1513694203232-719a280e022f',
  cafe: '1495474472287-4d71bcdd2085',
  coffee: '1509042239860-f550ce710b93',
  table: '1554118811-1e0d58224f24',
};
const PHOTO_LIST = Object.values(PHOTOS);
const photo = (ref: string) => `@@photo:${ref}@@`;
const photoId = (ref: string) => `ref:${ref}`;

/* ---------- forms ---------- */

function form(id: string) {
  const def = SETUP_FORMS.find((f) => f.id === id);
  if (def) return setupRequestType(def, { access: 'anyone', notify: true, workflow: '' });
  // A booking with a time field (a clock) instead of fixed hours.
  const base = setupRequestType(SETUP_FORMS.find((f) => f.id === 'reservation')!, { access: 'anyone', notify: true, workflow: '' });
  return { ...base, slug: 'booking', label: Lx('Appointment booking', 'رزرو نوبت'), fields: base.fields.map((f) => (f.id === 'time' ? { ...f, type: 'time' as const, options: [] } : f)) };
}

/* ---------- tables and sample items ---------- */

const preset = (id: string) => collectionInputSchema.parse(COLLECTION_PRESETS.find((p) => p.id === id)!.collection);
/** A table and the tables it points to, those first. */
function withReferences(ids: string[]): CollectionInput[] {
  const out: CollectionInput[] = [];
  const add = (id: string) => {
    if (out.some((t) => t.slug === id) || !COLLECTION_PRESETS.some((p) => p.id === id)) return;
    const t = preset(id);
    for (const f of t.fields) if (f.type === 'reference' && f.reference) add(f.reference);
    out.push(t);
  };
  ids.forEach(add);
  return out;
}
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';

function sampleItems(tables: CollectionInput[], perTable = 6) {
  const refs = new Map<string, string[]>();
  const items: Record<string, { ref: string; slug: string; title: L; data: Record<string, unknown>; status: 'published' }[]> = {};
  for (const t of tables) {
    const rng = random(`starter-${t.slug}`);
    items[t.slug] = Array.from({ length: perTable }, (_, i) => {
      const title = itemTitle(t.slug, t.itemName, i);
      const data: Record<string, unknown> = {};
      for (const f of t.fields) {
        if (f.type === 'image') data[f.key] = photoId(PHOTO_LIST[(i + t.slug.length) % PHOTO_LIST.length]);
        else if (f.type === 'gallery') data[f.key] = [1, 2, 3].map((k) => photoId(PHOTO_LIST[(i + k) % PHOTO_LIST.length]));
        else {
          const v = fieldValue(f, i, rng, refs, title);
          if (v !== undefined) data[f.key] = v;
        }
      }
      return { ref: `${t.slug}-${i + 1}`, slug: `${slugify(title.en)}-${i + 1}`, title, data, status: 'published' as const };
    });
    refs.set(t.slug, items[t.slug].map((x) => x.ref));
  }
  return items;
}

/** Furniture products with categories, as the shop's sample data. */
function sampleProducts() {
  const t = SITE_TEMPLATES.find((x) => x.key === 'furniture')!;
  return {
    categories: t.categories,
    products: t.products.map((p, i) => ({
      slug: p.slug,
      name: p.name,
      description: p.description,
      category: p.category,
      priceMinor: p.price,
      currency: 'IRR',
      stock: p.stock ?? 10,
      isAvailable: true,
      discountPercent: p.discount ?? 0,
      colors: p.colors ?? [],
      featured: !!p.featured,
      status: 'published',
      position: i,
      seo: {},
      materials: p.materials ?? Lx('', ''),
      dimensions: p.dimensions ?? '',
      leadTime: Lx('', ''),
      imageAssetId: photoId(p.image),
    })),
    refs: t.products.map((p) => p.image),
  };
}

/* ---------- reusable sections ---------- */

const list = (source: string, extra: Record<string, unknown> = {}) => sec('collection-list', { source, limit: 9, columns: 3, ...extra });
const tableCard = (id: string, sells = true) => tableBox(preset(id), sells);
const faq = (n = 4, extra: Record<string, unknown> = {}) => sec('faq', { heading: Lx('Questions', 'پرسش‌های متداول'), items: FAQ.slice(0, n), ...extra });
const reviews = (layout: 'slider' | 'grid' = 'slider') =>
  sec('testimonials', {
    eyebrow: Lx('Reviews', 'نظر مشتریان'),
    heading: Lx('What our customers say', 'مشتریان ما چه می‌گویند'),
    layout,
    items: TESTIMONIALS.slice(0, 4).map((quote, i) => ({ quote, name: Lx(`${FIRST_NAMES[i].en} ${LAST_NAMES[i].en}`, `${FIRST_NAMES[i].fa} ${LAST_NAMES[i].fa}`), role: ROLES[i % ROLES.length] })),
  });
const trust = sec('features', {
  marker: 'none',
  items: [
    { title: Lx('Fast delivery', 'ارسال سریع'), text: Lx('Same day in the city, 2–4 days elsewhere.', 'در شهر همان روز، سایر شهرها ۲ تا ۴ روز.') },
    { title: Lx('Secure payment', 'پرداخت امن'), text: Lx("Through the bank's secure gateway.", 'از درگاه امن بانکی.') },
    { title: Lx('7-day returns', 'بازگشت ۷ روزه'), text: Lx('Unused items in their box.', 'برای کالای استفاده‌نشده با بسته‌بندی.') },
  ],
});
const contactCta = (tone: 'dark' | 'accent' = 'dark') => sec('cta', { heading: Lx('Have a question?', 'سؤالی دارید؟'), text: Lx('We answer the same working day.', 'همان روز کاری پاسخ می‌دهیم.'), buttons: [btn('Contact us', 'تماس با ما', '/contact')], tone });
const stats = sec('stats', { eyebrow: Lx('In numbers', 'به زبان اعداد'), items: [{ value: '+1200', label: Lx('happy customers', 'مشتری راضی') }, { value: '+8', label: Lx('years', 'سال تجربه') }, { value: '24h', label: Lx('response', 'زمان پاسخ') }] });
const hours = sec('features', {
  marker: 'none',
  items: [
    { title: Lx('Phone', 'تلفن'), text: Lx('021-88000000', '۰۲۱-۸۸۰۰۰۰۰۰') },
    { title: Lx('Hours', 'ساعت کاری'), text: Lx('Sat–Thu, 9:00–20:00', 'شنبه تا پنجشنبه، ۹ تا ۲۰') },
    { title: Lx('Address', 'نشانی'), text: Lx('12 Valiasr St, Tehran', 'تهران، خیابان ولیعصر، پلاک ۱۲') },
  ],
});
const account = (props: Record<string, unknown>) => sec('system-page', { page: 'account', ...props });
const formSection = (requestType: string, heading: L, intro: L, extra: Record<string, unknown> = {}) => sec('contact-form', { heading, intro, requestType, showDetails: false, ...extra });

/* ---------- the samples ---------- */

interface Sample {
  key: string;
  kind: StarterKind;
  group: string;
  name: string;
  description: string;
  /** Page starters: the main page. */
  page?: { slug: string; title: L; sections: Sec[] };
  /** Other pages held: item pages (`detail` of a table) and linked ones. */
  pages?: { slug: string; title: L; role: 'detail' | 'linked'; sections: Sec[]; detailOf?: string }[];
  tables?: string[];
  products?: boolean;
  forms?: string[];
  site?: StarterPack['site'];
}

const G = {
  notFound: '۴۰۴ / 404 page',
  contact: 'تماس با ما / Contact',
  about: 'درباره ما / About',
  shop: 'فروشگاه / Shop',
  product: 'صفحه‌ی محصول / Product page',
  services: 'خدمات / Services',
  courses: 'دوره‌ها / Courses',
  classes: 'کلاس‌ها / Classes',
  events: 'رویدادها / Events',
  blog: 'وبلاگ / Blog',
  forms: 'فرم‌های درخواست / Request forms',
  checkout: 'خرید / Cart & checkout',
  auth: 'ورود و ثبت‌نام / Sign in',
  account: 'حساب کاربری / Account',
  tables: 'جدول‌های آماده / Ready tables',
  headers: 'هدر / Headers',
  footers: 'فوتر / Footers',
};

const notFoundTitle = Lx('Page not found', 'صفحه پیدا نشد');
const courseDetail = {
  slug: 'course',
  title: Lx('Course', 'دوره'),
  role: 'detail' as const,
  detailOf: 'courses',
  sections: [
    sec('collection-item', { source: 'courses', card: tableCard('courses') }),
    list('classes', { heading: Lx('Upcoming classes of this course', 'کلاس‌های پیش‌روی این دوره'), filters: [{ field: 'course', op: 'eq', valueFrom: 'current' }], card: tableCard('classes'), emptyText: Lx('No classes yet.', 'هنوز کلاسی نیست.') }),
    formSection('registration', Lx('Ask about this course', 'درباره‌ی این دوره بپرسید'), Lx('We call you back with dates and prices.', 'با تاریخ‌ها و هزینه با شما تماس می‌گیریم.')),
  ],
};
const articleDetail = {
  slug: 'article',
  title: Lx('Article', 'مطلب'),
  role: 'detail' as const,
  detailOf: 'articles',
  sections: [sec('collection-item', { source: 'articles', card: tableCard('articles') }), list('articles', { heading: Lx('More articles', 'مطالب بیشتر'), limit: 3, filters: [{ field: 'id', op: 'neq', valueFrom: 'current' }], card: tableCard('articles') })],
};

export const SAMPLES: Sample[] = [
  /* 404 */
  {
    key: 'page-404-simple',
    kind: 'page',
    group: G.notFound,
    name: '۴۰۴ ساده / Simple 404',
    description: 'Use the address not-found so it replaces the built-in 404 page.',
    page: { slug: 'not-found', title: notFoundTitle, sections: [header(Lx('404 — Page not found', '۴۰۴ — صفحه پیدا نشد'), Lx('The page you are looking for has moved or no longer exists.', 'صفحه‌ای که دنبالش هستید جابه‌جا شده یا دیگر وجود ندارد.'), { buttons: [btn('Back to home', 'بازگشت به خانه', '/'), btn('Contact us', 'تماس با ما', '/contact', 'secondary')] })] },
  },
  {
    key: 'page-404-image',
    kind: 'page',
    group: G.notFound,
    name: '۴۰۴ با تصویر / 404 with a photo',
    description: 'A photo beside the message. Use the address not-found.',
    page: {
      slug: 'not-found',
      title: notFoundTitle,
      sections: [
        sec('image-text', { eyebrow: Lx('Error 404', 'خطای ۴۰۴'), heading: Lx('We could not find this page', 'این صفحه را پیدا نکردیم'), body: Lx('Maybe the address was typed wrong, or the page was moved. These links may help.', 'شاید نشانی اشتباه وارد شده یا صفحه جابه‌جا شده است. این لینک‌ها کمک می‌کنند.'), imageUrl: photo(PHOTOS.lamp), imageSide: 'end', buttons: [btn('Home', 'صفحه‌ی اصلی', '/'), btn('Shop', 'فروشگاه', '/products', 'secondary')] }),
      ],
    },
  },
  {
    key: 'page-404-helpful',
    kind: 'page',
    group: G.notFound,
    name: '۴۰۴ راهنما با مطالب / Helpful 404',
    description: 'Helpful links and the latest articles (brings the Articles table). Use the address not-found.',
    page: {
      slug: 'not-found',
      title: notFoundTitle,
      sections: [
        header(Lx('Oops, this page is missing', 'اوه، این صفحه نیست'), Lx('Here are some places to go instead.', 'به جای آن می‌توانید سری به این‌ها بزنید.')),
        sec('features', { marker: 'number', items: [{ title: Lx('Home page', 'صفحه‌ی اصلی'), text: Lx('Start again from the beginning.', 'از ابتدا شروع کنید.') }, { title: Lx('Our services', 'خدمات ما'), text: Lx('See what we can do for you.', 'ببینید چه کاری برایتان انجام می‌دهیم.') }, { title: Lx('Ask us', 'از ما بپرسید'), text: Lx('We answer the same working day.', 'همان روز کاری پاسخ می‌دهیم.') }], buttons: [btn('Home', 'خانه', '/'), btn('Contact', 'تماس', '/contact', 'secondary')] }),
        list('articles', { heading: Lx('Latest articles', 'تازه‌ترین مطالب'), limit: 3, sort: 'newest', card: tableCard('articles') }),
      ],
    },
    tables: ['articles'],
  },

  /* contact */
  {
    key: 'page-contact-form',
    kind: 'page',
    group: G.contact,
    name: 'تماس با فرم و نقشه / Form and map',
    description: 'The contact form with the site details, and a map.',
    forms: ['contact'],
    page: {
      slug: 'contact',
      title: Lx('Contact us', 'تماس با ما'),
      sections: [header(Lx('Contact us', 'تماس با ما'), Lx('Send a message or visit us.', 'پیام بفرستید یا به ما سر بزنید.')), sec('contact-form', { heading: Lx('Send us a message', 'پیام خود را بفرستید'), requestType: 'contact', showDetails: true }), sec('map', { heading: Lx('Find us', 'نشانی ما'), address: Lx('Valiasr St, Tehran', 'تهران، خیابان ولیعصر'), lat: 35.7219, lng: 51.4086 })],
    },
  },
  {
    key: 'page-contact-split',
    kind: 'page',
    group: G.contact,
    name: 'تماس دوستونه با پرسش‌ها / Split with FAQ',
    description: 'Photo and details beside the form, then common questions.',
    forms: ['contact'],
    page: {
      slug: 'contact',
      title: Lx('Contact us', 'تماس با ما'),
      sections: [
        sec('image-text', { eyebrow: Lx('Contact', 'تماس'), heading: Lx('We would love to hear from you', 'خوشحال می‌شویم از شما بشنویم'), body: Lx('Questions about products, orders or anything else: write to us and we reply the same working day.', 'درباره‌ی محصولات، سفارش‌ها یا هر چیز دیگر بپرسید؛ همان روز کاری پاسخ می‌دهیم.'), imageUrl: photo(PHOTOS.office), imageSide: 'end' }),
        hours,
        formSection('contact', Lx('Write to us', 'برای ما بنویسید'), Lx('', '')),
        faq(4),
      ],
    },
  },
  {
    key: 'page-contact-callback',
    kind: 'page',
    group: G.contact,
    name: 'درخواست تماس / Call me back',
    description: 'A short form: the visitor leaves a number and a time to call.',
    forms: ['callback'],
    page: {
      slug: 'contact',
      title: Lx('Contact us', 'تماس با ما'),
      sections: [
        sec('hero', { slides: [{ eyebrow: Lx('Contact', 'تماس'), heading: Lx('Leave your number, we call you', 'شماره‌تان را بگذارید، ما تماس می‌گیریم'), text: Lx('Usually within an hour in working time.', 'معمولاً در ساعات کاری ظرف یک ساعت.'), imageUrl: photo(PHOTOS.cafe), buttons: [] }], height: 'small' }),
        formSection('callback', Lx('Call me back', 'با من تماس بگیرید'), Lx('Your name, number and the best time.', 'نام، شماره و بهترین زمان تماس.')),
        hours,
      ],
    },
  },

  /* about */
  {
    key: 'page-about-story',
    kind: 'page',
    group: G.about,
    name: 'داستان ما / Our story',
    description: 'Story with a photo, numbers, values and a call to action.',
    page: {
      slug: 'about',
      title: Lx('About us', 'درباره ما'),
      sections: [
        header(Lx('About us', 'درباره ما'), PARAGRAPHS[0]),
        sec('image-text', { eyebrow: Lx('Our story', 'داستان ما'), heading: Lx('Started small, grown with your trust', 'کوچک شروع کردیم، با اعتماد شما بزرگ شدیم'), body: Lx(`${PARAGRAPHS[1].en}\n\n${PARAGRAPHS[2].en}`, `${PARAGRAPHS[1].fa}\n\n${PARAGRAPHS[2].fa}`), imageUrl: photo(PHOTOS.room), imageSide: 'end' }),
        stats,
        sec('features', { eyebrow: Lx('What we stand for', 'آنچه به آن پایبندیم'), heading: Lx('Our promise', 'تعهد ما'), items: [{ title: Lx('Honest advice', 'مشاوره‌ی صادقانه'), text: Lx('We recommend what you need.', 'آنچه لازم دارید را پیشنهاد می‌کنیم.') }, { title: Lx('Quality', 'کیفیت'), text: Lx('Chosen and checked with care.', 'با دقت انتخاب و بررسی می‌شود.') }, { title: Lx('Support', 'پشتیبانی'), text: Lx('With you after the purchase too.', 'بعد از خرید هم کنار شما هستیم.') }] }),
        contactCta('accent'),
      ],
    },
  },
  {
    key: 'page-about-team',
    kind: 'page',
    group: G.about,
    name: 'درباره ما با تیم / With the team',
    description: 'A short intro, the team (brings the Team table) and reviews.',
    tables: ['team'],
    page: {
      slug: 'about',
      title: Lx('About us', 'درباره ما'),
      sections: [
        sec('hero', { slides: [{ eyebrow: Lx('About us', 'درباره ما'), heading: Lx('People who care about the details', 'آدم‌هایی که به جزئیات اهمیت می‌دهند'), text: PARAGRAPHS[3], imageUrl: photo(PHOTOS.office), buttons: [btn('Work with us', 'همکاری با ما', '/contact')] }], height: 'medium' }),
        sec('rich-text', { heading: Lx('Who we are', 'ما که هستیم'), body: Lx(`${PARAGRAPHS[0].en}\n\n${PARAGRAPHS[4].en}`, `${PARAGRAPHS[0].fa}\n\n${PARAGRAPHS[4].fa}`) }),
        list('team', { heading: Lx('Our team', 'تیم ما'), columns: 4, limit: 8, card: tableCard('team') }),
        reviews('grid'),
      ],
    },
  },
  {
    key: 'page-about-timeline',
    kind: 'page',
    group: G.about,
    name: 'مسیر ما و گالری / Timeline and gallery',
    description: 'Milestones as numbered steps and a photo gallery.',
    page: {
      slug: 'about',
      title: Lx('About us', 'درباره ما'),
      sections: [
        header(Lx('Our journey', 'مسیر ما'), Lx('From a small workshop to a trusted name.', 'از یک کارگاه کوچک تا یک نام قابل‌اعتماد.')),
        sec('features', { marker: 'number', markerPosition: 'inline', items: [{ title: Lx('2016 — The start', '۱۳۹۵ — شروع'), text: PARAGRAPHS[1] }, { title: Lx('2019 — First store', '۱۳۹۸ — اولین فروشگاه'), text: PARAGRAPHS[2] }, { title: Lx('2023 — Online', '۱۴۰۲ — فروش آنلاین'), text: PARAGRAPHS[3] }] }),
        sec('gallery', { heading: Lx('A look inside', 'نگاهی به درون'), items: [PHOTOS.living, PHOTOS.room, PHOTOS.kitchen, PHOTOS.hall, PHOTOS.bright, PHOTOS.lamp].map((ref, i) => ({ imageUrl: photo(ref), title: Lx(`Photo ${i + 1}`, `تصویر ${i + 1}`) })) }),
        contactCta(),
      ],
    },
  },

  /* shop */
  {
    key: 'page-shop-filters',
    kind: 'page',
    group: G.shop,
    name: 'فروشگاه با فیلتر / Shop with filters',
    description: 'Products with search, category chips, a price slider and in-stock only; page numbers. Address products replaces the built-in shop.',
    products: true,
    page: {
      slug: 'products',
      title: Lx('Shop', 'فروشگاه'),
      sections: [
        header(Lx('Shop', 'فروشگاه'), Lx('Everything we offer, with prices.', 'همه‌ی محصولات ما با قیمت.')),
        list('products', {
          limit: 12,
          columns: 4,
          showSearch: true,
          pagination: 'pages',
          visitorFilters: [
            { field: 'category', display: 'chips', label: Lx('Category', 'دسته‌بندی') },
            { field: 'price', display: 'slider', label: Lx('Price', 'قیمت') },
            { field: '__available', display: 'toggle', label: Lx('In stock only', 'فقط کالاهای موجود') },
          ],
          card: productBox(true),
        }),
      ],
    },
  },
  {
    key: 'page-shop-sidebar',
    kind: 'page',
    group: G.shop,
    name: 'فروشگاه با فیلترهای ستونی / Stacked filters, list',
    description: 'Filters stacked above a two-column list with price presets and discounts.',
    products: true,
    page: {
      slug: 'products',
      title: Lx('Shop', 'فروشگاه'),
      sections: [
        header(Lx('All products', 'همه‌ی محصولات')),
        list('products', {
          limit: 10,
          layout: 'list',
          columns: 2,
          showSearch: true,
          filtersLayout: 'stacked',
          pagination: 'more',
          visitorFilters: [
            { field: 'category', display: 'checkboxes', label: Lx('Category', 'دسته‌بندی') },
            { field: 'price', display: 'presets', label: Lx('Price', 'قیمت'), presets: [{ label: Lx('Under 20M', 'زیر ۲۰ میلیون'), min: null, max: 20_000_000 }, { label: Lx('20M – 50M', '۲۰ تا ۵۰ میلیون'), min: 20_000_000, max: 50_000_000 }, { label: Lx('Over 50M', 'بالای ۵۰ میلیون'), min: 50_000_000, max: null }] },
            { field: 'discount', display: 'range', label: Lx('Discount', 'تخفیف') },
          ],
          card: productBox(true),
        }),
      ],
    },
  },
  {
    key: 'page-shop-featured',
    kind: 'page',
    group: G.shop,
    name: 'فروشگاه با ویترین / Showcase',
    description: 'A banner, featured products, then the full list and trust points.',
    products: true,
    page: {
      slug: 'products',
      title: Lx('Shop', 'فروشگاه'),
      sections: [
        sec('hero', { slides: [{ eyebrow: Lx('New season', 'فصل جدید'), heading: Lx('Pieces made to last', 'قطعه‌هایی برای سال‌ها'), text: Lx('Up to 20% off this week.', 'تا ۲۰٪ تخفیف این هفته.'), imageUrl: photo(PHOTOS.sofa), buttons: [] }], height: 'medium' }),
        list('products', { heading: Lx('Featured', 'پیشنهاد ویژه'), limit: 4, columns: 4, filters: [{ field: 'featured', op: 'eq', value: 'true' }], card: productBox(true) }),
        list('products', { heading: Lx('All products', 'همه‌ی محصولات'), limit: 8, columns: 4, pagination: 'more', visitorFilters: [{ field: 'category', display: 'chips', label: Lx('Category', 'دسته‌بندی') }], card: productBox(true) }),
        trust,
      ],
    },
  },
  {
    key: 'page-product-related',
    kind: 'page',
    group: G.product,
    name: 'محصول با پیشنهادها / With related products',
    description: 'The product (built-in), related products and questions. Use the address product.',
    products: true,
    page: { slug: 'product', title: Lx('Product', 'محصول'), sections: [sec('system-page', { page: 'productDetail' }), list('products', { heading: Lx('You may also like', 'شاید این‌ها را هم بپسندید'), limit: 4, columns: 4, card: productBox(true) }), faq(3)] },
  },
  {
    key: 'page-product-trust',
    kind: 'page',
    group: G.product,
    name: 'محصول با ضمانت و نظرات / With guarantees and reviews',
    description: 'The product, delivery and return points, and reviews. Use the address product.',
    products: true,
    page: { slug: 'product', title: Lx('Product', 'محصول'), sections: [sec('system-page', { page: 'productDetail' }), trust, reviews()] },
  },

  /* services */
  {
    key: 'page-services-cards',
    kind: 'page',
    group: G.services,
    name: 'خدمات کارتی / Services as cards',
    description: 'The services list as cards and a consultation form. Address services replaces the built-in list.',
    forms: ['consultation'],
    page: { slug: 'services', title: Lx('Services', 'خدمات'), sections: [header(Lx('Our services', 'خدمات ما'), Lx('What we do, step by step.', 'کارهایی که انجام می‌دهیم.')), sec('services', { limit: 12, layout: 'cards' }), formSection('consultation', Lx('Not sure which one?', 'نمی‌دانید کدام؟'), Lx('Ask for a free consultation.', 'مشاوره‌ی رایگان بگیرید.'))] },
  },
  {
    key: 'page-services-pricing',
    kind: 'page',
    group: G.services,
    name: 'خدمات با تعرفه / Services with pricing',
    description: 'Services in rows, plans side by side and questions.',
    page: {
      slug: 'services',
      title: Lx('Services', 'خدمات'),
      sections: [
        sec('hero', { slides: [{ eyebrow: Lx('Services', 'خدمات'), heading: Lx('Everything you need, in one place', 'هر آنچه نیاز دارید، یکجا'), text: PARAGRAPHS[2], imageUrl: photo(PHOTOS.hall), buttons: [btn('Get a quote', 'دریافت قیمت', '/contact')] }], height: 'small' }),
        sec('services', { limit: 12, layout: 'rows' }),
        sec('pricing', {
          heading: Lx('Plans', 'تعرفه‌ها'),
          plans: [
            { name: Lx('Basic', 'پایه'), price: Lx('2,900,000', '۲٬۹۰۰٬۰۰۰'), period: Lx('per month', 'ماهانه'), features: [Lx('Core service', 'خدمات اصلی'), Lx('Email support', 'پشتیبانی ایمیلی')], buttons: [btn('Choose', 'انتخاب', '/contact')] },
            { name: Lx('Standard', 'استاندارد'), price: Lx('5,900,000', '۵٬۹۰۰٬۰۰۰'), period: Lx('per month', 'ماهانه'), features: [Lx('Everything in Basic', 'همه‌ی امکانات پایه'), Lx('Phone support', 'پشتیبانی تلفنی')], highlighted: true, buttons: [btn('Choose', 'انتخاب', '/contact')] },
          ],
        }),
        faq(3),
      ],
    },
  },
  {
    key: 'page-service-detail',
    kind: 'page',
    group: G.services,
    name: 'صفحه‌ی هر خدمت / Service page',
    description: 'The service (built-in) with a consultation form. Use the address service.',
    forms: ['consultation'],
    page: { slug: 'service', title: Lx('Service', 'خدمت'), sections: [sec('system-page', { page: 'serviceDetail' }), formSection('consultation', Lx('Ask about this service', 'درباره‌ی این خدمت بپرسید'), Lx('We call you back.', 'با شما تماس می‌گیریم.'))] },
  },

  /* courses and classes */
  {
    key: 'page-courses-grid',
    kind: 'page',
    group: G.courses,
    name: 'دوره‌ها با فیلتر سطح / Courses with level filter',
    description: 'Courses as cards with search and level chips; each course has its own page with its classes.',
    tables: ['courses', 'classes'],
    forms: ['registration'],
    page: { slug: 'courses', title: Lx('Courses', 'دوره‌ها'), sections: [header(Lx('Our courses', 'دوره‌های ما'), Lx('Pick a course, then a class that suits you.', 'یک دوره و سپس کلاس مناسب خود را انتخاب کنید.')), list('courses', { showSearch: true, visitorFilters: [{ field: 'level', display: 'chips', label: Lx('Level', 'سطح') }], card: tableCard('courses') })] },
    pages: [courseDetail],
  },
  {
    key: 'page-courses-list',
    kind: 'page',
    group: G.courses,
    name: 'دوره‌ها به‌صورت فهرست / Courses as a list',
    description: 'A list with stacked filters beside a short intro and questions.',
    tables: ['courses', 'classes'],
    forms: ['registration'],
    page: { slug: 'courses', title: Lx('Courses', 'دوره‌ها'), sections: [sec('image-text', { eyebrow: Lx('Learn with us', 'با ما یاد بگیرید'), heading: Lx('Courses for every level', 'دوره برای هر سطح'), body: PARAGRAPHS[1], imageUrl: photo(PHOTOS.table) }), list('courses', { layout: 'list', columns: 1, filtersLayout: 'stacked', visitorFilters: [{ field: 'level', display: 'select', label: Lx('Level', 'سطح') }], card: tableCard('courses') }), faq(3)] },
    pages: [courseDetail],
  },
  {
    key: 'page-classes-booking',
    kind: 'page',
    group: G.classes,
    name: 'کلاس‌ها با ثبت‌نام و تقویم / Classes with booking',
    description: 'Classes with course, date (calendar) and seats-left filters; booking adds them to the cart.',
    tables: ['classes'],
    page: {
      slug: 'classes',
      title: Lx('Classes', 'کلاس‌ها'),
      sections: [
        header(Lx('Classes', 'کلاس‌ها'), Lx('Choose a date and book a seat.', 'تاریخ را انتخاب و جای خود را رزرو کنید.')),
        list('classes', {
          showSearch: true,
          visitorFilters: [
            { field: 'course', display: 'select', label: Lx('Course', 'دوره') },
            { field: 'starts_at', display: 'calendar', label: Lx('Date', 'تاریخ'), calendarMode: 'popup' },
            { field: '__available', display: 'toggle', label: Lx('Seats left only', 'فقط دارای ظرفیت') },
          ],
          card: tableCard('classes'),
        }),
      ],
    },
  },
  {
    key: 'page-classes-calendar',
    kind: 'page',
    group: G.classes,
    name: 'کلاس‌ها با تقویم باز / Calendar first',
    description: 'An open calendar next to the classes as a list, sorted by start time.',
    tables: ['classes'],
    page: {
      slug: 'classes',
      title: Lx('Classes', 'کلاس‌ها'),
      sections: [
        header(Lx('Class calendar', 'تقویم کلاس‌ها')),
        list('classes', { layout: 'list', columns: 1, sort: 'starts_at', filtersLayout: 'stacked', visitorFilters: [{ field: 'starts_at', display: 'calendar', label: Lx('Pick a day', 'یک روز را انتخاب کنید'), calendarMode: 'inline' }, { field: 'price', display: 'slider', label: Lx('Price', 'قیمت') }], card: tableCard('classes') }),
      ],
    },
  },
  {
    key: 'page-events',
    kind: 'page',
    group: G.events,
    name: 'رویدادها با تاریخ / Events by date',
    description: 'Upcoming events with date presets and a sign-up form.',
    tables: ['events'],
    forms: ['registration'],
    page: { slug: 'events', title: Lx('Events', 'رویدادها'), sections: [header(Lx('Events', 'رویدادها')), list('events', { sort: 'starts_at', visitorFilters: [{ field: 'starts_at', display: 'datePresets', label: Lx('When', 'زمان') }], card: tableCard('events') }), formSection('registration', Lx('Sign up', 'ثبت‌نام'), Lx('Tell us which event.', 'بگویید کدام رویداد.'))] },
  },
  {
    key: 'page-blog-grid',
    kind: 'page',
    group: G.blog,
    name: 'وبلاگ کارتی / Blog as cards',
    description: 'Articles with category chips and search; each article has its own page.',
    tables: ['articles'],
    page: { slug: 'blog', title: Lx('Blog', 'وبلاگ'), sections: [header(Lx('Blog and news', 'وبلاگ و اخبار')), list('articles', { sort: 'newest', showSearch: true, pagination: 'more', visitorFilters: [{ field: 'category', display: 'chips', label: Lx('Category', 'دسته') }], card: tableCard('articles') })] },
    pages: [articleDetail],
  },
  {
    key: 'page-blog-list',
    kind: 'page',
    group: G.blog,
    name: 'وبلاگ فهرستی / Blog as a list',
    description: 'Articles one under another, newest first, with page numbers.',
    tables: ['articles'],
    page: { slug: 'blog', title: Lx('Blog', 'وبلاگ'), sections: [header(Lx('Articles', 'مطالب')), list('articles', { layout: 'list', columns: 1, sort: 'newest', pagination: 'pages', limit: 6, card: tableCard('articles') })] },
    pages: [articleDetail],
  },

  /* request forms */
  {
    key: 'page-consultation',
    kind: 'page',
    group: G.forms,
    name: 'درخواست مشاوره / Consultation',
    description: 'Why a consultation helps, then the form.',
    forms: ['consultation'],
    page: { slug: 'consultation', title: Lx('Free consultation', 'مشاوره‌ی رایگان'), sections: [sec('image-text', { eyebrow: Lx('Consultation', 'مشاوره'), heading: Lx('Talk to an expert, free', 'رایگان با کارشناس صحبت کنید'), body: PARAGRAPHS[0], imageUrl: photo(PHOTOS.office) }), formSection('consultation', Lx('Request a consultation', 'درخواست مشاوره'), Lx('We call you back within a working day.', 'ظرف یک روز کاری تماس می‌گیریم.')), faq(3)] },
  },
  {
    key: 'page-demo',
    kind: 'page',
    group: G.forms,
    name: 'درخواست دمو / Demo request',
    description: 'What the demo shows, then the request form with a preferred date.',
    forms: ['demo'],
    page: { slug: 'demo', title: Lx('Book a demo', 'درخواست دمو'), sections: [header(Lx('See it in action', 'از نزدیک ببینید'), Lx('A 30-minute walk-through for your team.', 'معرفی ۳۰ دقیقه‌ای برای تیم شما.')), sec('features', { marker: 'number', items: [{ title: Lx('Tell us your needs', 'نیازتان را بگویید'), text: Lx('A short form.', 'یک فرم کوتاه.') }, { title: Lx('We set a time', 'زمان را هماهنگ می‌کنیم'), text: Lx('At a date that suits you.', 'در تاریخی که مناسب شماست.') }, { title: Lx('Live demo', 'دموی زنده'), text: Lx('Online or in person.', 'آنلاین یا حضوری.') }] }), formSection('demo', Lx('Request a demo', 'درخواست دمو'), Lx('', ''))] },
  },
  {
    key: 'page-reservation',
    kind: 'page',
    group: G.forms,
    name: 'رزرو با تاریخ و ساعت / Reservation',
    description: 'Date, a choice of hours and number of people.',
    forms: ['reservation'],
    page: { slug: 'reservation', title: Lx('Reservation', 'رزرو'), sections: [sec('hero', { slides: [{ eyebrow: Lx('Reservation', 'رزرو'), heading: Lx('Book your table', 'میز خود را رزرو کنید'), text: Lx('Pick a date and time; we confirm by SMS.', 'تاریخ و ساعت را انتخاب کنید؛ با پیامک تأیید می‌کنیم.'), imageUrl: photo(PHOTOS.cafe), buttons: [] }], height: 'small' }), formSection('reservation', Lx('Reserve', 'ثبت رزرو'), Lx('', '')), hours] },
  },
  {
    key: 'page-booking-time',
    kind: 'page',
    group: G.forms,
    name: 'رزرو نوبت با انتخاب ساعت / Appointment with a clock',
    description: 'A date and any time (a clock field) for appointments.',
    forms: ['booking'],
    page: { slug: 'booking', title: Lx('Book an appointment', 'رزرو نوبت'), sections: [header(Lx('Book an appointment', 'رزرو نوبت'), Lx('Choose the day and time that suit you.', 'روز و ساعت مناسب خود را انتخاب کنید.')), formSection('booking', Lx('Your appointment', 'نوبت شما'), Lx('', ''), { showDetails: true })] },
  },

  /* cart and checkout */
  {
    key: 'page-cart',
    kind: 'page',
    group: G.checkout,
    name: 'سبد خرید با اطمینان‌بخشی / Cart with trust points',
    description: 'The cart (built-in) with delivery and return points. Use the address cart.',
    products: true,
    page: { slug: 'cart', title: Lx('Cart', 'سبد خرید'), sections: [sec('system-page', { page: 'cart' }), trust] },
  },
  {
    key: 'page-checkout',
    kind: 'page',
    group: G.checkout,
    name: 'تسویه با پرسش‌ها / Checkout with questions',
    description: 'Checkout (built-in) under a short header, with delivery questions. Use the address checkout.',
    products: true,
    page: { slug: 'checkout', title: Lx('Checkout', 'تسویه حساب'), sections: [header(Lx('Checkout', 'تکمیل خرید'), Lx('Almost done.', 'یک قدم تا پایان.')), sec('system-page', { page: 'checkout' }), faq(3)] },
  },

  /* sign-in and account */
  {
    key: 'page-login',
    kind: 'page',
    group: G.auth,
    name: 'صفحه‌ی ورود / Sign-in page',
    description: 'Sign in (with code or password) and why to have an account. Needs customer accounts on in Settings.',
    page: { slug: 'login', title: Lx('Sign in', 'ورود'), sections: [account({ authStart: 'login' }), sec('features', { marker: 'none', items: [{ title: Lx('Track orders', 'پیگیری سفارش‌ها'), text: Lx('See every order and its stage.', 'هر سفارش و مرحله‌اش را ببینید.') }, { title: Lx('Faster checkout', 'خرید سریع‌تر'), text: Lx('Your details are kept.', 'اطلاعات شما ذخیره می‌ماند.') }, { title: Lx('Your requests', 'درخواست‌های شما'), text: Lx('Answers in one place.', 'پاسخ‌ها یکجا.') }] })] },
  },
  {
    key: 'page-signup',
    kind: 'page',
    group: G.auth,
    name: 'صفحه‌ی ثبت‌نام / Sign-up page',
    description: 'Create an account first, beside a photo. Needs customer accounts on.',
    page: { slug: 'signup', title: Lx('Create account', 'ثبت‌نام'), sections: [sec('image-text', { eyebrow: Lx('Join us', 'به ما بپیوندید'), heading: Lx('Create your account in a minute', 'در یک دقیقه حساب بسازید'), body: Lx('With your mobile number and a one-time code.', 'با شماره‌ی موبایل و یک کد یک‌بارمصرف.'), imageUrl: photo(PHOTOS.bright) }), account({ authStart: 'signup' })] },
  },
  {
    key: 'page-account-tabs',
    kind: 'page',
    group: G.account,
    name: 'حساب با زبانه‌ها / Account with tabs',
    description: 'Requests, orders and profile as tabs. Use the address account.',
    page: { slug: 'account', title: Lx('My account', 'حساب من'), sections: [account({ accountMenu: 'tabs' })] },
  },
  {
    key: 'page-account-sidebar',
    kind: 'page',
    group: G.account,
    name: 'حساب با منوی کناری / Account with a side menu',
    description: 'A side menu with requests, orders, profile and sign out. Use the address account.',
    page: { slug: 'account', title: Lx('My account', 'حساب من'), sections: [account({ accountMenu: 'sidebar' })] },
  },
  {
    key: 'page-account-cards',
    kind: 'page',
    group: G.account,
    name: 'حساب با کارت‌ها / Account with cards',
    description: 'Cards with counts open each part. Use the address account.',
    page: { slug: 'account', title: Lx('My account', 'حساب من'), sections: [account({ accountMenu: 'cards' }), contactCta()] },
  },
  {
    key: 'page-my-orders',
    kind: 'page',
    group: G.account,
    name: 'سفارش‌های من / My orders',
    description: "Only the customer's orders, as its own page (link it from the menu).",
    page: { slug: 'my-orders', title: Lx('My orders', 'سفارش‌های من'), sections: [account({ accountMenu: 'none', accountOpen: 'orders' })] },
  },
  {
    key: 'page-my-requests',
    kind: 'page',
    group: G.account,
    name: 'درخواست‌های من / My requests',
    description: "Only the customer's requests, with their stages.",
    page: { slug: 'my-requests', title: Lx('My requests', 'درخواست‌های من'), sections: [account({ accountMenu: 'none', accountOpen: 'requests' })] },
  },
  {
    key: 'page-profile',
    kind: 'page',
    group: G.account,
    name: 'مشخصات من / My profile',
    description: 'Name, contact details and password.',
    page: { slug: 'profile', title: Lx('My profile', 'مشخصات من'), sections: [account({ accountMenu: 'none', accountOpen: 'profile' })] },
  },
  {
    key: 'page-track',
    kind: 'page',
    group: G.account,
    name: 'پیگیری با کد / Track by code',
    description: 'Track an order or request by its code, with questions. Use the address track.',
    page: { slug: 'track', title: Lx('Track', 'پیگیری'), sections: [sec('system-page', { page: 'track' }), faq(3)] },
  },

  /* ready tables */
  ...(['courses', 'classes', 'events', 'articles', 'portfolio', 'team'] as const).map(
    (id): Sample => ({
      key: `table-${id}`,
      kind: 'table',
      group: G.tables,
      name: `${preset(id).name.fa} / ${preset(id).name.en}`,
      description: 'With sample items and photos.',
      tables: [id],
    }),
  ),

  /* headers */
  {
    key: 'header-standard',
    kind: 'header',
    group: G.headers,
    name: 'استاندارد با دکمه / Standard with a button',
    description: 'Logo, menu and one button; cart and account icons.',
    site: { header: { layout: 'standard', size: 'normal', showCart: true, showAccount: true, showSearch: false, buttons: [btn('Contact us', 'تماس با ما', '/contact')] } as never },
  },
  {
    key: 'header-centered',
    kind: 'header',
    group: G.headers,
    name: 'وسط‌چین بزرگ / Centered, large',
    description: 'Logo in the middle, larger header, transparent over the hero.',
    site: { header: { layout: 'centered', size: 'large', transparentOverHero: true, showCart: true, showSearch: true, buttons: [] } as never },
  },
  {
    key: 'header-shop',
    kind: 'header',
    group: G.headers,
    name: 'فروشگاهی با جستجو / Shop with search',
    description: 'Menu below the logo row, search, cart and account, two buttons.',
    site: { header: { layout: 'stacked', size: 'compact', showSearch: true, showCart: true, showAccount: true, buttons: [btn('Call us', 'تماس', 'tel:02188000000', 'secondary'), btn('Shop', 'فروشگاه', '/products')] } as never },
  },
  {
    key: 'header-minimal',
    kind: 'header',
    group: G.headers,
    name: 'مینیمال / Minimal',
    description: 'Menu at the start, no buttons, no theme or language switch.',
    site: { header: { layout: 'menu-start', size: 'compact', showButton: false, showTheme: false, showLanguage: false, showCart: false, buttons: [] } as never },
  },

  /* footers */
  {
    key: 'footer-simple',
    kind: 'footer',
    group: G.footers,
    name: 'ساده / Simple',
    description: 'Name, menu, contact and copyright.',
    site: { footer: { showBrand: true, showMenu: true, showContact: true, showSocial: true, columns: [] } as never },
  },
  {
    key: 'footer-columns',
    kind: 'footer',
    group: G.footers,
    name: 'چهارستونه با لینک‌ها / Four columns with links',
    description: 'About text, useful links and customer links in their own columns.',
    site: {
      footer: {
        showLogo: true,
        placement: { brand: 1, social: 1, menu: 2, contact: 4 },
        columns: [
          { title: Lx('Customers', 'مشتریان'), links: [{ label: Lx('My account', 'حساب من'), href: '/account' }, { label: Lx('Track an order', 'پیگیری سفارش'), href: '/track' }, { label: Lx('Shipping and returns', 'ارسال و مرجوعی'), href: '/shipping' }], column: 3 },
          { title: Lx('About us', 'درباره ما'), text: PARAGRAPHS[0], links: [{ label: Lx('Read more', 'بیشتر بخوانید'), href: '/about' }], column: 0 },
        ],
      } as never,
    },
  },
  {
    key: 'footer-minimal',
    kind: 'footer',
    group: G.footers,
    name: 'مینیمال / Minimal',
    description: 'Only social links and the copyright line.',
    site: { footer: { showBrand: false, showTagline: false, showMenu: false, showContact: false, showSocial: true, copyright: Lx('© {year} {name}', '© {year} {name}') } as never },
  },
];

/* ---------- building and adding ---------- */

/** A sample as a pack; photos are still `@@photo:<ref>@@` in texts and `ref:<ref>` in items. */
export function samplePack(s: Sample): { pack: StarterPack; refs: string[] } {
  const tables = withReferences(s.tables ?? []);
  for (const p of s.pages ?? []) {
    const t = tables.find((x) => x.slug === p.detailOf);
    if (t) t.detailPage = p.slug;
  }
  const doc = (sections: Sec[]) => ({ schemaVersion: 1 as const, sections: sections.map((x, i) => ({ id: `s${i + 1}`, ...x })) });
  const pages = [...(s.page ? [{ slug: s.page.slug, title: s.page.title, role: 'main' as const, document: doc(s.page.sections) }] : []), ...(s.pages ?? []).map((p) => ({ slug: p.slug, title: p.title, role: p.role, document: doc(p.sections) }))];
  const shop = s.products ? sampleProducts() : null;
  const uses = documentUses({ sections: pages.flatMap((p) => p.document.sections) });
  // Links to pages the starter does not hold: listed so using it says they are needed.
  const own = new Set([...pages.map((p) => p.slug), ...tables.map((t) => t.slug)]);
  const links = new Set<string>();
  JSON.stringify([pages, s.site ?? {}]).replace(/"href":"([^"]*)"/g, (_, href: string) => {
    const slug = linkSlug(href);
    if (slug && !own.has(slug) && !['products', 'product', 'services', 'service', 'cart', 'checkout'].includes(slug)) links.add(slug);
    return '';
  });
  const pack = starterPackSchema.parse({
    version: 2,
    pages,
    tables,
    forms: (s.forms ?? []).map(form),
    samples: { items: sampleItems(tables), products: shop?.products ?? [], categories: shop?.categories ?? [] },
    modules: [...new Set([...uses.modules, ...(s.products ? (['products', 'orders'] as const) : []), ...(tables.some((t) => t.commerce.enabled) ? (['orders'] as const) : [])])],
    needs: { pages: [...links].map((slug) => ({ slug, title: Lx(slug, slug) })) },
    site: s.site ?? {},
  });
  const text = JSON.stringify(pack);
  const refs = [...new Set([...text.matchAll(/@@photo:([^@]+)@@|"ref:([^"]+)"/g)].map((m) => m[1] ?? m[2]))];
  return { pack, refs };
}

const SAMPLES_KEY = 'starter_samples';

/**
 * Adds the ready-made starters the studio does not have yet (each only once, ever). Photos are
 * copied into the studio's storage once and shared between the samples.
 */
export async function addSampleStarters(ctx: AppContext): Promise<number> {
  const done = new Set<string>(((await ctx.control.query('SELECT value FROM app_settings WHERE key = $1', [SAMPLES_KEY])).rows[0]?.value as string[] | undefined) ?? []);
  const todo = SAMPLES.filter((s) => !done.has(s.key));
  if (!todo.length) return 0;
  const load = templatePhotoLoader(ctx, ['#ece6dc', '#cdbfa9']);
  const stored = new Map<string, { key: string; contentType: string; url: string }>();
  const store = async (ref: string) => {
    if (!stored.has(ref)) {
      const { body, ext, contentType } = await load(ref);
      const now = new Date();
      const key = `public/tenants/${BANK_STORAGE_ID}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
      await ctx.storage.put(key, body, contentType);
      stored.set(ref, { key, contentType, url: ctx.storage.publicUrl(key) });
    }
    return stored.get(ref)!;
  };
  for (const s of todo) {
    const { pack, refs } = samplePack(s);
    let text = JSON.stringify(pack);
    const photos = [];
    for (const ref of refs) {
      const p = await store(ref);
      text = text.split(`@@photo:${ref}@@`).join(p.url);
      photos.push({ id: photoId(ref), ...p });
    }
    const final = starterPackSchema.parse({ ...JSON.parse(text), photos });
    await ctx.control.query(`INSERT INTO starters (kind, name, description, group_name, data, sample_key) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (sample_key) DO NOTHING`, [s.kind, s.name, s.description, s.group, final, s.key]);
    done.add(s.key);
  }
  await ctx.control.query(`INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [SAMPLES_KEY, JSON.stringify([...done])]);
  return todo.length;
}
