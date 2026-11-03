// Builds the FireFighter client site in the studio through its API: tables, items, photos,
// settings, pages and sample data (customers, requests, reviews, a trainer waiting for approval).
// Run from the repository root with the studio up:  node tools/firefighter-site/build.mjs
// Rebuilding deletes the existing `firefighter` site first.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORIES, COURSES, LEVELS, TRAINERS } from './content-courses.mjs';
import { ABOUT, FAQ, FREE_TRAINING, GUIDE_CATEGORIES, GUIDES, NEWS, NFPA_DOCS, TERMS } from './content-pages.mjs';

const BASE = process.env.STUDIO_URL ?? 'http://admin.localhost';
const SLUG = 'firefighter';
const PHOTOS = 'var/firefighter-photos';
const fa = (text) => ({ en: '', fa: text });
/** Persian titles (and alt texts) of the photos. */
const GALLERY_TITLES = {
  'hero-fire-silhouette': 'آتش‌نشان در برابر شعله‌های آتش',
  'live-fire-training': 'تمرین اطفای حریق در کانتینر آتش',
  'live-fire-training-2': 'حمله‌ی آب به آتش در تمرین عملی',
  'smoke-search': 'جست‌وجو در دود با دستگاه تنفسی و چراغ',
  'smoke-hose': 'پیشروی با لوله در محیط دودآلود',
  'team-in-smoke': 'تیم آتش‌نشانی در میان دود و بخار',
  'hose-team': 'تیم لوله‌کشی در تمرین اطفای حریق',
  'hose-attack': 'آتش‌نشان در حال پاشیدن آب',
  'hose-run': 'آتش‌نشان در حال کشیدن لوله کنار خودروی آتش‌نشانی',
  'rescue-carry': 'تمرین نجات و حمل مصدوم',
};

/* ---------- a small cookie-keeping API client ---------- */

function client() {
  const jar = new Map();
  let csrf = '';
  const call = async (method, path, body, extraHeaders = {}) => {
    const headers = { Accept: 'application/json', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...extraHeaders };
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const csrfCookie = [...jar].find(([k]) => k.startsWith('sb_cc_'));
    if (csrfCookie) headers['X-Customer-CSRF'] = decodeURIComponent(csrfCookie[1]);
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${BASE}/api/v1${path}`, { method, headers, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    if (res.status === 204) return null;
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json?.error ?? json).slice(0, 4000)}`);
    return json?.data;
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    put: (p, b) => call('PUT', p, b),
    patch: (p, b) => call('PATCH', p, b),
    del: (p) => call('DELETE', p),
    upload: (p, form) => call('POST', p, form),
    setCsrf: (t) => (csrf = t),
  };
}

const staff = client();
const login = await staff.post('/auth/login', { email: process.env.STUDIO_ADMIN ?? 'admin', password: process.env.STUDIO_PASSWORD ?? '123456' });
staff.setCsrf(login.csrfToken);

/* ---------- a fresh site ---------- */

const existing = (await staff.get(`/platform/tenants?q=${SLUG}`)).find((t) => t.slug === SLUG);
if (existing) {
  await staff.del(`/platform/tenants/${existing.id}?confirm=${SLUG}`);
  console.log('deleted the old site');
}
const tenant = await staff.post('/platform/tenants', { slug: SLUG, name: 'FireFighter', ownerEmail: 'owner@firefighter.local' });
const site = `/sites/${SLUG}`;
console.log('site created', tenant.dbName);

/* ---------- photos ---------- */

const photos = {};
for (const f of readdirSync(PHOTOS).filter((x) => x.endsWith('.jpg'))) {
  const form = new FormData();
  form.append('visibility', 'public');
  form.append('altFa', GALLERY_TITLES[f.replace('.jpg', '')] ?? 'مربی (عکس نمونه)');
  form.append('file', new Blob([readFileSync(join(PHOTOS, f))], { type: 'image/jpeg' }), f);
  const a = await staff.upload(`${site}/assets`, form);
  photos[f.replace('.jpg', '')] = { id: a.id, url: a.url };
}
const credits = JSON.parse(readFileSync(join(PHOTOS, 'credits.json'), 'utf8'));
console.log('photos', Object.keys(photos).length);

/* ---------- box designs ---------- */

let n = 0;
const b = (type, props = {}, children = []) => ({ id: `b${++n}`, type, ...props, children });
const card = (children, extra = {}) => b('stack', { direction: 'column', gap: 0, border: true, radius: 14, shadow: true, background: '#ffffff', linkToItem: true, ...extra }, children);
const body = (children) => b('stack', { direction: 'column', gap: 2, padding: 5 }, children);

const designs = [
  {
    id: 'box-course',
    name: 'دوره',
    design: card([
      b('image', { field: '', ratio: 'wide' }),
      body([
        b('badge', { field: 'category', background: '#fde8ea', color: '#a10d24' }),
        b('text', { field: 'title', textStyle: 'title', size: 'sm', weight: 'bold' }),
        b('text', { source: 'static', text: fa('کد {{code}} · سطح {{level}} · {{duration}}'), textStyle: 'small', size: 'sm' }),
        b('text', { field: 'summary', textStyle: 'body', size: 'sm', lines: 3 }),
        b('button', { action: 'view', variant: 'link', label: fa('جزئیات دوره ←') }),
      ]),
    ]),
  },
  {
    id: 'box-trainer',
    name: 'مربی',
    design: card([
      b('image', { field: '', ratio: 'square', position: 'top' }),
      body([
        b('text', { field: 'title', textStyle: 'title', size: 'sm', weight: 'bold' }),
        b('rating', { textStyle: 'small' }),
        b('text', { field: 'experience', textStyle: 'small', size: 'sm' }),
        b('text', { source: 'static', text: fa('محدوده: {{regions}}'), textStyle: 'small', size: 'sm', lines: 2 }),
      ]),
    ]),
  },
  {
    id: 'box-article',
    name: 'دستورالعمل / خبر',
    design: card([
      b('image', { field: '', ratio: 'landscape' }),
      body([
        b('badge', { field: 'category', background: '#e8edf5', color: '#14213d' }),
        b('badge', { field: 'region', background: '#e8edf5', color: '#14213d' }),
        b('text', { field: 'date', textStyle: 'small', size: 'sm' }),
        b('text', { field: 'title', textStyle: 'title', size: 'sm', weight: 'bold' }),
        b('text', { field: 'summary', textStyle: 'body', size: 'sm', lines: 3 }),
      ]),
    ]),
  },
];

/* ---------- tables ---------- */

const f = (key, type, label, extra = {}) => ({ key, type, label: fa(label), ...extra });
const choices = (list) => list.map(([value, label]) => ({ value, label: fa(label) }));

const trainersTable = await staff.post(`${site}/collections`, {
  slug: 'trainers',
  name: fa('مربی‌ها'),
  itemName: fa('مربی'),
  imageField: 'photo',
  detailPage: 'trainer',
  position: 1,
  fields: [
    f('photo', 'image', 'عکس'),
    f('experience', 'text', 'سابقه'),
    f('bio', 'textarea', 'بیوگرافی'),
    f('regions', 'text', 'محدوده‌ی جغرافیایی تدریس'),
    f('availability', 'textarea', 'زمان‌های در دسترس'),
    f('files', 'files', 'فایل‌ها (رزومه، سوابق، مدارک و گواهینامه‌ها)'),
  ],
  selfService: { enabled: true, approval: true, fields: [] },
  reviews: { enabled: true, afterDoneRequest: true },
});
const coursesTable = await staff.post(`${site}/collections`, {
  slug: 'courses',
  name: fa('دوره‌ها'),
  itemName: fa('دوره'),
  imageField: 'image',
  detailPage: 'course',
  requestType: 'training',
  position: 0,
  fields: [
    f('image', 'image', 'تصویر'),
    f('code', 'text', 'کد دوره'),
    f('category', 'select', 'گروه آموزشی', { options: choices(CATEGORIES) }),
    f('level', 'select', 'سطح دوره', { options: choices(LEVELS) }),
    f('trainers', 'reference', 'مربیان دوره', { reference: 'trainers', multiple: true }),
    f('certificate', 'boolean', 'گواهی پایان دوره'),
    f('duration', 'text', 'مدت'),
    f('summary', 'textarea', 'شرح دوره'),
    f('syllabus', 'textarea', 'سرفصل‌ها'),
    f('audience', 'textarea', 'مخاطبان'),
    f('prerequisites', 'textarea', 'پیش‌نیازها'),
    f('standard', 'textarea', 'مرجع استاندارد'),
  ],
});
// Trainers point back to the courses they teach (both tables exist now).
await staff.put(`${site}/collections/${trainersTable.id}`, {
  ...trainersTable,
  fields: [...trainersTable.fields.slice(0, 4), f('courses', 'reference', 'دوره‌هایی که تدریس می‌کند', { reference: 'courses', multiple: true }), ...trainersTable.fields.slice(4)],
});
const guidesTable = await staff.post(`${site}/collections`, {
  slug: 'guides',
  name: fa('دستورالعمل‌ها'),
  itemName: fa('دستورالعمل'),
  imageField: 'image',
  detailPage: 'article',
  position: 2,
  fields: [f('image', 'image', 'تصویر'), f('category', 'select', 'گروه', { options: choices(GUIDE_CATEGORIES) }), f('summary', 'textarea', 'خلاصه'), f('body', 'textarea', 'متن'), f('source', 'text', 'منبع')],
});
const newsTable = await staff.post(`${site}/collections`, {
  slug: 'news',
  name: fa('اخبار'),
  itemName: fa('خبر'),
  imageField: 'image',
  detailPage: 'article',
  position: 3,
  fields: [
    f('image', 'image', 'تصویر'),
    f('region', 'select', 'گروه خبر', { options: choices([['iran', 'اخبار ایران'], ['world', 'اخبار جهان']]) }),
    f('date', 'date', 'تاریخ'),
    f('summary', 'textarea', 'خلاصه'),
    f('body', 'textarea', 'متن خبر'),
    f('source_name', 'text', 'منبع'),
    f('source_link', 'link', 'پیوند منبع'),
    f('sample', 'boolean', 'خبر نمونه'),
  ],
});

const item = async (table, slug, title, data, position = 0) =>
  staff.post(`${site}/collections/${table.id}/items`, { slug, title: fa(title), status: 'published', position, data });

const trainerIds = {};
for (const [i, [key, t]] of Object.entries(TRAINERS).entries()) {
  const it = await item(trainersTable, `trainer-${key}`, t.title, { photo: photos[t.photo].id, experience: fa(t.experience), bio: fa(t.bio), regions: fa(t.regions), availability: fa(t.availability) }, i);
  trainerIds[key] = it.id;
}
const courseIds = {};
for (const [i, c] of COURSES.entries()) {
  const it = await item(
    coursesTable,
    c.slug,
    c.title,
    {
      image: photos[c.image].id,
      code: fa(c.code),
      category: c.category,
      level: c.level,
      trainers: c.trainers.map((k) => trainerIds[k]),
      certificate: c.certificate,
      duration: fa(c.duration),
      summary: fa(c.summary),
      syllabus: fa(c.syllabus),
      audience: fa(c.audience),
      prerequisites: fa(c.prerequisites),
      standard: fa(c.standard),
    },
    i,
  );
  courseIds[c.slug] = it.id;
}
// Each trainer lists the courses they teach; their sample CV is a PDF made here.
const cvPdf = (name) => {
  const text = `Sample CV - ${name}\\nPlaceholder document: replace with the trainer's own file.`;
  const stream = `BT /F1 16 Tf 60 760 Td (Sample document - replace with the trainer's own file) Tj 0 -28 Td (${text.split('\\n')[0]}) Tj ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
};
for (const [key, t] of Object.entries(TRAINERS)) {
  const files = [];
  for (const [title, label] of [['رزومه', 'cv'], ['گواهینامه‌ی مربیگری', 'certificate']]) {
    const form = new FormData();
    form.append('visibility', 'public');
    form.append('file', new Blob([cvPdf(key)], { type: 'application/pdf' }), `${key}-${label}.pdf`);
    const a = await staff.upload(`${site}/assets`, form);
    files.push({ id: a.id, title: `${title} (نمونه)` });
  }
  const current = await staff.get(`${site}/collections/${trainersTable.id}/items/${trainerIds[key]}`);
  const teaches = COURSES.filter((c) => c.trainers.includes(key)).map((c) => courseIds[c.slug]);
  await staff.put(`${site}/collections/${trainersTable.id}/items/${trainerIds[key]}`, { ...current, data: { ...current.data, courses: teaches, files } });
}
for (const [i, g] of GUIDES.entries()) await item(guidesTable, g.slug, g.title, { image: photos[g.image].id, category: g.category, summary: fa(g.summary), body: fa(g.body), source: fa(g.source) }, i);
for (const [i, x] of NEWS.entries())
  await item(newsTable, x.slug, x.title, { image: photos[x.image].id, region: x.region, date: x.date, summary: fa(x.summary), body: fa(x.body), source_name: fa(x.sourceName), source_link: x.sourceLink || null, sample: x.sample }, i);
console.log('items done');

/* ---------- settings ---------- */

const PROVINCES = ['آذربایجان شرقی', 'آذربایجان غربی', 'اردبیل', 'اصفهان', 'البرز', 'ایلام', 'بوشهر', 'تهران', 'چهارمحال و بختیاری', 'خراسان جنوبی', 'خراسان رضوی', 'خراسان شمالی', 'خوزستان', 'زنجان', 'سمنان', 'سیستان و بلوچستان', 'فارس', 'قزوین', 'قم', 'کردستان', 'کرمان', 'کرمانشاه', 'کهگیلویه و بویراحمد', 'گلستان', 'گیلان', 'لرستان', 'مازندران', 'مرکزی', 'هرمزگان', 'همدان', 'یزد'];
const q = (id, type, label, extra = {}) => ({ id, type, label: fa(label), ...extra });
const opt = (labels) => labels.map((x) => ({ en: '', fa: x, price: 0 }));
const trainingType = {
  slug: 'training',
  label: fa('درخواست آموزش'),
  form: 'contact',
  formVersion: 2,
  access: 'signed_in',
  assignTable: 'trainers',
  contact: { email: 'optional', phone: 'required' },
  fields: [
    q('h1', 'heading', 'اطلاعات سازمان'),
    q('name', 'text', 'نام سازمان یا ارگان', { role: 'name', required: true, min: 2 }),
    q('phone', 'tel', 'شماره‌ی تماس', { role: 'phone', required: true }),
    q('email', 'email', 'ایمیل (اختیاری)', { role: 'email' }),
    q('h2', 'heading', 'دوره‌ی مورد نیاز'),
    q('course', 'select', 'نوع دوره', { required: true, optionsFrom: 'courses' }),
    q('people', 'number', 'تعداد نفرات', { required: true, min: 1, max: 500 }),
    q('province', 'select', 'استان', { required: true, options: opt(PROVINCES) }),
    q('city', 'text', 'شهر', { required: true, min: 2 }),
    q('venue', 'text', 'محل برگزاری', { required: true, width: 'full', placeholder: fa('نشانی یا نام محل برگزاری دوره') }),
    q('date', 'date', 'تاریخ پیشنهادی', { required: true, min: 1 }),
    q('duration', 'select', 'مدت دوره', { required: true, options: opt(['یک روز', 'دو روز', 'سه روز', 'چهار روز', 'پنج روز', 'بیش از پنج روز']) }),
    q('budget', 'select', 'بودجه‌ی تقریبی', { options: opt(['کمتر از ۵۰ میلیون تومان', '۵۰ تا ۱۵۰ میلیون تومان', '۱۵۰ تا ۳۰۰ میلیون تومان', 'بیش از ۳۰۰ میلیون تومان', 'هنوز مشخص نیست']) }),
    q('lodging', 'radio', 'محل اسکان مربی', { required: true, options: opt(['داریم', 'نداریم']) }),
    q('equipment', 'textarea', 'تجهیزات و فضای موجود', { width: 'full', placeholder: fa('مثلاً: سالن کلاس، محوطه‌ی باز برای تمرین عملی، خاموش‌کننده، دستگاه تنفسی…') }),
    q('notes', 'textarea', 'توضیحات اضافه', { width: 'full' }),
    q('consent', 'checkbox', 'قوانین ثبت درخواست را خوانده‌ام و می‌پذیرم.', { required: true }),
  ],
  workflow: {
    stages: [
      { key: 'new', label: fa('جدید'), customerLabel: fa('ثبت شد'), color: 'blue', next: ['reviewing', 'cancelled'], customerCanCancel: true },
      { key: 'reviewing', label: fa('در حال بررسی'), color: 'amber', next: ['scheduled', 'cancelled'], notify: true, customerCanCancel: true },
      { key: 'scheduled', label: fa('زمان‌بندی و تعیین مربی'), customerLabel: fa('برنامه‌ریزی شد'), color: 'violet', next: ['held', 'cancelled'], notify: true },
      { key: 'held', label: fa('برگزار شد'), kind: 'done', color: 'green', next: [], notify: true, customerCanReply: false },
      { key: 'cancelled', label: fa('لغو شد'), kind: 'cancelled', color: 'red', next: [], notify: true, customerCanReply: false },
    ],
  },
  layout: { columns: 2, submitLabel: fa('ثبت درخواست آموزش'), successTitle: fa('درخواست شما ثبت شد'), successText: fa('کد پیگیری را نگه دارید. وضعیت درخواست را در «حساب من» می‌بینید و نتیجه‌ی بررسی با پیامک به شما اطلاع داده می‌شود.') },
};
const contactType = {
  slug: 'contact',
  label: fa('پیام تماس'),
  form: 'contact',
  formVersion: 2,
  contact: { email: 'optional', phone: 'required' },
  fields: [q('name', 'text', 'نام و نام خانوادگی', { role: 'name', required: true }), q('phone', 'tel', 'شماره‌ی تماس', { role: 'phone', required: true }), q('email', 'email', 'ایمیل', { role: 'email' }), q('message', 'textarea', 'پیام شما', { required: true, width: 'full' })],
};

const settings = await staff.get(`${site}/settings`);
const nav = (label, href, children = []) => ({ label: fa(label), href, children: children.map(([l, h]) => ({ label: fa(l), href: h })) });
Object.assign(settings, {
  name: { en: 'FireFighter', fa: 'فایرفایتر' },
  tagline: fa('مرکز آموزش‌های تخصصی آتش‌نشانی و ایمنی'),
  defaultLocale: 'fa',
  locales: ['fa'],
  calendar: 'jalali',
  themeId: 'firefighter',
  contact: { email: 'info@example.com', phone: '۰۲۱-۰۰۰۰۰۰۰۰', address: fa('نشانی نمونه — با نشانی واقعی جایگزین شود'), hours: fa('شنبه تا چهارشنبه، ۸ تا ۱۶') },
  social: [
    { label: 'تلگرام', href: 'https://t.me/example', icon: 'telegram' },
    { label: 'اینستاگرام', href: 'https://instagram.com/example', icon: 'instagram' },
    { label: 'ایتا', href: 'https://eitaa.com/example', icon: 'eitaa' },
    { label: 'بله', href: 'https://ble.ir/example', icon: 'bale' },
  ],
  socialDisplay: 'icon',
  modules: { ...settings.modules, leads: true, orders: false, products: false, services: false },
  seo: { titleTemplate: '%s | فایرفایتر', defaultDescription: fa('آموزش‌های تخصصی آتش‌نشانی، امداد و نجات، مواد خطرناک و ایمنی ساختمان؛ اعزام مربی به سراسر کشور.') },
  design: {
    ...settings.design,
    fonts: { ...settings.design.fonts, faDisplay: 'Vazirmatn', faBody: 'Vazirmatn' },
    themes: [
      {
        id: 'firefighter',
        name: fa('آتش‌نشانی'),
        colors: { bg: '#ffffff', surface: '#f4f6f9', surface2: '#e7ebf1', ink: '#14213d', inkSoft: '#4b5568', line: '#dde2ea', accent: '#c8102e', accentInk: '#ffffff', accentSoft: '#fde8ea' },
      },
    ],
  },
  cardDesigns: designs,
  nav: [
    nav('تجهیزات', '', [['دنیای آتش‌نشانی', '/fire-world'], ['گالری عکس', '/gallery']]),
    nav('دستورالعمل‌ها', '/guides', GUIDE_CATEGORIES.map(([k, l]) => [l, `/guides-${k}`])),
    nav('آموزش‌ها', '', [['آموزش‌های عمومی رایگان', '/free-training'], ['NFPA', '/nfpa']]),
    nav('آموزش‌های تخصصی و اعزام مربی', '/courses', CATEGORIES.map(([k, l]) => [l, `/courses-${k}`])),
    nav('اخبار', '/news', [['اخبار ایران', '/news-iran'], ['اخبار جهان', '/news-world']]),
    nav('مربیان', '/trainers'),
    nav('درباره ما', '/about'),
    nav('تماس با ما', '/contact'),
  ],
  header: { ...settings.header, layout: 'stacked', showCart: false, showLanguage: false, showTheme: false, showSearch: false, showAccount: true, transparentOverHero: true, buttons: [{ label: fa('درخواست آموزش'), href: '/request-training', style: 'primary' }] },
  footer: {
    ...settings.footer,
    showSubmenu: false,
    columns: [
      {
        title: fa('دسترسی سریع'),
        links: [
          { label: fa('درخواست آموزش'), href: '/request-training' },
          { label: fa('ثبت‌نام مربی'), href: '/account?kind=trainer' },
          { label: fa('سوالات متداول'), href: '/faq' },
          { label: fa('قوانین و مقررات'), href: '/terms' },
          { label: fa('منابع تصاویر'), href: '/image-credits' },
        ],
        column: 4,
      },
    ],
  },
  accounts: {
    enabled: true,
    identifier: 'phone',
    passwords: true,
    kinds: [
      { key: 'organization', label: fa('سازمان یا ارگان'), hint: fa('برای ثبت درخواست آموزش کارکنان'), organization: true },
      { key: 'person', label: fa('فرد'), hint: fa('برای ثبت درخواست شخصی') },
      { key: 'trainer', label: fa('مربی'), hint: fa('برای معرفی خود و دریافت دوره'), profileTable: 'trainers' },
    ],
  },
  requestTypes: [trainingType, contactType],
  notifications: { ...settings.notifications, staff: false, emails: [] },
});
await staff.put(`${site}/settings`, settings);
console.log('settings saved');

/* ---------- pages ---------- */

let sid = 0;
const s = (type, props = {}) => ({ id: `s${++sid}`, type, props });
const header = (heading, intro = '', eyebrow = '') => s('page-header', { eyebrow: fa(eyebrow), heading: fa(heading), intro: fa(intro) });
const list = (source, design, extra = {}) => s('collection-list', { source, cardDesign: design, limit: 12, columns: 3, columnsTablet: 2, columnsMobile: 1, gap: 6, pagination: 'pages', ...extra });
const eq = (field, value) => ({ field, op: 'eq', value, valueFrom: 'static' });
const btn = (label, href, style = 'primary') => ({ label: fa(label), href, style });
const rich = (heading, text, width = 'narrow') => s('rich-text', { heading: fa(heading), body: fa(text), width });
const pages = [];
const page = (slug, title, sections, extra = {}) => pages.push({ slug, title: { en: title, fa: title }, document: { schemaVersion: 1, sections }, seo: {}, ...extra });

page('home', 'خانه', [
  s('hero', {
    display: 'slider',
    autoplay: 7,
    height: 'large',
    slides: [
      { eyebrow: fa('آموزش تخصصی آتش‌نشانی و ایمنی'), heading: fa('آمادگی، فاصله‌ی میان حادثه و فاجعه است'), text: fa('دوره‌های عملی اطفای حریق، امداد و نجات، مواد خطرناک و ایمنی ساختمان؛ با اعزام مربی به محل سازمان شما در سراسر کشور.'), imageUrl: photos['hero-fire-silhouette'].url, buttons: [btn('درخواست آموزش', '/request-training'), btn('دوره‌ها', '/courses', 'secondary')] },
      { eyebrow: fa('تمرین واقعی، محیط ایمن'), heading: fa('مهارتی که در لحظه‌ی بحران به کار می‌آید'), text: fa('تمرین‌های عملی زیر نظر مربیان باتجربه و با رعایت کامل اصول ایمنی.'), imageUrl: photos['live-fire-training'].url, buttons: [btn('آشنایی با مربیان', '/trainers')] },
    ],
  }),
  s('features', {
    eyebrow: fa('چرا فایرفایتر'),
    heading: fa('آموزشی که به کار می‌آید'),
    marker: 'number',
    items: [
      { title: fa('اعزام مربی به محل شما'), text: fa('دوره در محل سازمان شما و متناسب با خطرها و تجهیزات همان‌جا برگزار می‌شود.') },
      { title: fa('مربیان تأییدشده'), text: fa('سوابق و مدارک هر مربی پیش از نمایش در سایت بررسی می‌شود و مشتریان پس از دوره به او امتیاز می‌دهند.') },
      { title: fa('محتوای مستند'), text: fa('سرفصل‌ها بر پایه‌ی مقررات ملی ساختمان و استانداردهای NFPA طراحی شده‌اند.') },
      { title: fa('پیگیری آنلاین'), text: fa('درخواست را آنلاین ثبت می‌کنید و وضعیت آن را در پنل خود می‌بینید.') },
    ],
  }),
  list('courses', 'box-course', { eyebrow: fa('آموزش‌های تخصصی'), heading: fa('دوره‌های پرطرفدار'), limit: 6, pagination: 'none', buttons: [btn('همه‌ی دوره‌ها', '/courses', 'secondary')] }),
  s('image-text', { eyebrow: fa('برای سازمان‌ها'), heading: fa('درخواست آموزش در چند دقیقه'), body: fa('نیاز آموزشی سازمان خود را ثبت کنید: نوع دوره، تعداد نفرات، محل و زمان پیشنهادی. ما درخواست را بررسی می‌کنیم، مربی مناسب را معرفی می‌کنیم و برنامه‌ی دوره را با شما هماهنگ می‌کنیم.'), imageUrl: photos['hose-team'].url, imageSide: 'end', buttons: [btn('ثبت درخواست آموزش', '/request-training')] }),
  list('trainers', 'box-trainer', { eyebrow: fa('مربیان'), heading: fa('با مربیان آشنا شوید'), limit: 3, pagination: 'none', buttons: [btn('همه‌ی مربیان', '/trainers', 'secondary')] }),
  list('news', 'box-article', { eyebrow: fa('اخبار'), heading: fa('تازه‌ترین خبرها'), limit: 3, pagination: 'none', sort: 'date', dir: 'desc', buttons: [btn('همه‌ی اخبار', '/news', 'secondary')] }),
  s('cta', { heading: fa('مربی هستید؟'), text: fa('ثبت‌نام کنید، صفحه‌ی معرفی خود را بسازید و پس از تأیید، درخواست‌های آموزش دریافت کنید.'), tone: 'accent', buttons: [btn('ثبت‌نام مربی', '/account?kind=trainer')] }),
], { isHome: true });

page('fire-world', 'دنیای آتش‌نشانی', [
  header('دنیای آتش‌نشانی', 'آشنایی با تجهیزات و ابزارهایی که آتش‌نشانان هر روز با آن‌ها کار می‌کنند.', 'تجهیزات'),
  s('image-text', { eyebrow: fa('حفاظت فردی'), heading: fa('لباس حفاظتی و دستگاه تنفسی'), body: fa('لباس حفاظتی آتش‌نشان از چند لایه تشکیل شده تا در برابر گرما، شعله و رطوبت از بدن محافظت کند. دستگاه تنفسی مستقل (SCBA) هوای قابل تنفس را از یک سیلندر فشرده تأمین می‌کند و ورود به محیط‌های پر از دود را ممکن می‌سازد. الزامات این تجهیزات در استاندارد NFPA 1970 گرد آمده است.'), imageUrl: photos['smoke-search'].url }),
  s('image-text', { eyebrow: fa('آب و کف'), heading: fa('لوله، سرلوله و اتصالات'), body: fa('لوله‌های آتش‌نشانی آب را از خودرو یا شیر آتش‌نشانی به محل آتش می‌رسانند. سرلوله‌ها شکل و جریان آب را کنترل می‌کنند: جریان مستقیم برای برد بیشتر و جریان مه‌پاش برای خنک‌سازی و محافظت از نیروها. انتخاب درست قطر لوله و سرلوله و آرایش خطوط آب، از مهارت‌های پایه‌ی آتش‌نشانی است.'), imageUrl: photos['hose-attack'].url, imageSide: 'end' }),
  s('image-text', { eyebrow: fa('خودروها'), heading: fa('خودروهای آتش‌نشانی'), body: fa('خودروی آتش‌نشانی مخزن آب، پمپ، لوله و ابزار عملیات را با خود حمل می‌کند. خودروهای نردبان‌دار برای دسترسی به ارتفاع، خودروهای نجات برای حوادث و خودروهای ویژه‌ی فرودگاهی برای حریق هواپیما طراحی شده‌اند.'), imageUrl: photos['hose-run'].url }),
  s('image-text', { eyebrow: fa('ابزار نجات'), heading: fa('ابزار امداد و نجات'), body: fa('ابزارهای هیدرولیک برش و بازکننده، تجهیزات کار با طناب، برانکارد و وسایل پایدارسازی، امکان رسیدن به مصدوم و خارج‌کردن ایمن او را فراهم می‌کنند.'), imageUrl: photos['rescue-carry'].url, imageSide: 'end' }),
  s('features', { heading: fa('خاموش‌کننده‌ها: نخستین خط دفاع'), marker: 'bullet', items: [
    { title: fa('انتخاب درست'), text: fa('هر خاموش‌کننده برای نوع خاصی از آتش مناسب است؛ برچسب دستگاه را بخوانید.') },
    { title: fa('جانمایی'), text: fa('در مسیر خروج، در دسترس و قابل دیدن نصب شود.') },
    { title: fa('نگهداری'), text: fa('بازرسی ظاهری منظم و سرویس دوره‌ای طبق NFPA 10 و دستور سازنده.') },
  ] }),
]);

page('gallery', 'گالری عکس', [
  header('گالری عکس', 'تصاویری از تمرین‌ها و عملیات آتش‌نشانی. منبع و مجوز هر تصویر در صفحه‌ی «منابع تصاویر» آمده است.', 'تجهیزات'),
  // The brief wants 20 photos; there are 10 scene photos, so each is shown twice (sample content).
  s('gallery', {
    items: [1, 2].flatMap(() =>
      Object.keys(photos)
        .filter((k) => !k.startsWith('trainer-'))
        .map((k) => ({ imageUrl: photos[k].url, title: fa(GALLERY_TITLES[k] ?? 'آتش‌نشانی'), caption: fa(GALLERY_TITLES[k] ?? '') })),
    ),
  }),
]);

page('guides', 'دستورالعمل‌ها', [header('دستورالعمل‌ها', 'راهنماهای کاربردی ایمنی و عملیات، بر پایه‌ی مقررات ملی ساختمان و استانداردهای NFPA.'), list('guides', 'box-article', { showSearch: true, visitorFilters: [{ field: 'category', display: 'chips', label: fa('گروه') }] })]);
for (const [k, l] of GUIDE_CATEGORIES) page(`guides-${k}`, l, [header(l, '', 'دستورالعمل‌ها'), list('guides', 'box-article', { filters: [eq('category', k)], emptyText: fa('به‌زودی دستورالعمل‌های این بخش منتشر می‌شود.') })]);

page('free-training', 'آموزش‌های عمومی رایگان', [header('آموزش‌های عمومی رایگان', 'نکات پایه‌ای که هر شهروند باید بداند.', 'آموزش‌ها'), ...FREE_TRAINING.map((x) => rich(x.heading, x.body)), s('cta', { heading: fa('آموزش عملی برای سازمان خود می‌خواهید؟'), text: fa('دوره‌های عملی را در محل سازمان شما برگزار می‌کنیم.'), buttons: [btn('درخواست آموزش', '/request-training')] })]);

page('nfpa', 'استانداردهای NFPA', [
  header('استانداردهای NFPA', 'انجمن ملی حفاظت در برابر آتش (NFPA) صدها کد و استاندارد در حوزه‌ی ایمنی حریق منتشر می‌کند. در این صفحه استانداردهایی را معرفی می‌کنیم که در طراحی دوره‌ها از آن‌ها کمک گرفته‌ایم.', 'آموزش‌ها'),
  rich('NFPA چیست؟', `NFPA (National Fire Protection Association) سازمانی غیرانتفاعی است که کدها و استانداردهای ایمنی حریق، برق و ایمنی جانی را با روش اجماع تدوین می‌کند. این اسناد به‌طور دوره‌ای بازنگری می‌شوند؛ از این رو همیشه به آخرین ویرایش در وب‌سایت رسمی [nfpa.org](https://www.nfpa.org) مراجعه کنید.

در سال‌های اخیر NFPA بسیاری از استانداردهای خدمات اضطراری را در اسناد یکپارچه گرد آورده است؛ برای نمونه استانداردهای تجهیزات حفاظتی آتش‌نشانان در **NFPA 1970** و صلاحیت حرفه‌ای آتش‌نشانان در **NFPA 1010** ادغام شده‌اند. به همین دلیل در منابع قدیمی‌تر ممکن است شماره‌های دیگری ببینید.

**نکته:** در ایران، مرجع الزامی برای ساختمان‌ها مقررات ملی ساختمان، به‌ویژه **مبحث سوم (حفاظت ساختمان‌ها در مقابل حریق)**، و ضوابط مراجع رسمی است. استانداردهای NFPA مرجع فنی معتبر بین‌المللی‌اند.`),
  rich('استانداردهای معرفی‌شده', NFPA_DOCS.map(([no, title, faText]) => `**NFPA ${no}** — ${title}\n${faText} [صفحه‌ی رسمی](https://www.nfpa.org/codes-and-standards/nfpa-${no}-standard-development/${no})`).join('\n\n'), 'wide'),
]);

page('courses', 'آموزش‌های تخصصی و اعزام مربی', [
  header('آموزش‌های تخصصی و اعزام مربی', 'دوره‌های عملی تخصصی با اعزام مربی به محل سازمان شما. دوره را انتخاب کنید و درخواست آموزش ثبت کنید.'),
  list('courses', 'box-course', { showSearch: true, visitorFilters: [{ field: 'category', display: 'select', label: fa('گروه آموزشی') }, { field: 'level', display: 'chips', label: fa('سطح') }], limit: 15 }),
]);
for (const [k, l] of CATEGORIES) page(`courses-${k}`, l, [header(l, 'دوره‌های این گروه آموزشی را ببینید و برای سازمان خود درخواست آموزش ثبت کنید.', 'آموزش‌های تخصصی'), list('courses', 'box-course', { filters: [eq('category', k)] }), s('cta', { heading: fa('دوره‌ی مورد نیازتان را پیدا نکردید؟'), text: fa('نیاز آموزشی خود را در فرم درخواست بنویسید؛ دوره‌ی متناسب را برایتان طراحی می‌کنیم.'), buttons: [btn('درخواست آموزش', '/request-training')] })]);

page('news', 'اخبار', [header('اخبار', 'اخبار آتش‌نشانی و ایمنی از ایران و جهان؛ همراه با منبع.'), list('news', 'box-article', { sort: 'date', dir: 'desc', visitorFilters: [{ field: 'region', display: 'chips', label: fa('گروه') }] })]);
page('news-iran', 'اخبار ایران', [header('اخبار ایران', 'خبرهای «نمونه» پیش از انتشار با خبر واقعی و منبع آن جایگزین می‌شوند.', 'اخبار'), list('news', 'box-article', { filters: [eq('region', 'iran')], sort: 'date', dir: 'desc' })]);
page('news-world', 'اخبار جهان', [header('اخبار جهان', 'اخبار آتش‌نشانی و ایمنی از منابع بین‌المللی.', 'اخبار'), list('news', 'box-article', { filters: [eq('region', 'world')], sort: 'date', dir: 'desc' })]);

page('trainers', 'مربیان', [header('مربیان', 'مربیان تأییدشده‌ی فایرفایتر؛ سوابق، دوره‌ها، محدوده‌ی تدریس و امتیاز مشتریان.'), list('trainers', 'box-trainer', { columns: 3, limit: 12 }), s('cta', { heading: fa('مربی هستید؟'), text: fa('ثبت‌نام کنید و صفحه‌ی معرفی خود را بسازید.'), tone: 'accent', buttons: [btn('ثبت‌نام مربی', '/account?kind=trainer')] })]);

page('about', 'درباره ما', [header('درباره ما', ABOUT.intro), s('image-text', { heading: fa('داستان ما'), body: fa(ABOUT.story.split('\n\n## ')[0]), imageUrl: photos['team-in-smoke'].url }), rich('', `## ${ABOUT.story.split('\n\n## ')[1]}`)]);
page('contact', 'تماس با ما', [header('تماس با ما', 'برای پرسش، همکاری یا هماهنگی دوره با ما در تماس باشید. برای ثبت درخواست آموزش از فرم «درخواست آموزش» استفاده کنید.'), s('contact-form', { requestType: 'contact', heading: fa('پیام بفرستید'), showDetails: true })]);
page('request-training', 'درخواست آموزش', [header('درخواست آموزش', 'برای ثبت درخواست وارد حساب کاربری شوید یا با نوع «سازمان» ثبت‌نام کنید. پس از ثبت، کد پیگیری دریافت می‌کنید و وضعیت را در پنل خود می‌بینید.'), s('contact-form', { requestType: 'training', showDetails: false })]);
page('faq', 'سوالات متداول', [header('سوالات متداول', 'پاسخ پرسش‌های رایج درباره‌ی دوره‌ها، درخواست آموزش، ثبت‌نام مربی و گواهی‌ها.'), s('faq', { searchable: true, items: FAQ.map(([qq, a]) => ({ question: fa(qq), answer: fa(a) })) })]);
page('terms', 'قوانین و مقررات', [header('قوانین و مقررات'), ...TERMS.map((x) => rich(x.heading, x.body))]);
page('image-credits', 'منابع تصاویر', [
  header('منابع تصاویر', 'همه‌ی تصاویر سایت از ویکی‌مدیا کامانز با مجوز آزاد برداشته شده‌اند.'),
  rich('', Object.entries(credits).map(([k, c]) => `- **${GALLERY_TITLES[k] ?? k}** — ${c.artist || 'بی‌نام'} — مجوز ${c.license} — [صفحه‌ی منبع](${c.page})`).join('\n') + '\n\nتصاویر مربیان، برش‌هایی از همین عکس‌ها هستند و افراد واقعی معرفی‌شده نیستند.', 'wide'),
]);

// Template pages of table items.
page('course', 'صفحه‌ی دوره', [
  s('collection-item', {
    source: 'courses',
    card: b('stack', { direction: 'column', gap: 8, padding: 0 }, [
      b('stack', { direction: 'row', wrap: true, gap: 8, align: 'start' }, [
        b('image', { field: '', ratio: 'landscape', radius: 14, width: '1/2' }),
        b('stack', { direction: 'column', gap: 3, width: '1/3' }, [
          b('badge', { field: 'category', background: '#fde8ea', color: '#a10d24' }),
          b('text', { field: 'title', textStyle: 'title', size: 'lg', weight: 'bold' }),
          b('text', { field: 'code', showLabel: true, textStyle: 'subtitle' }),
          b('text', { field: 'level', showLabel: true, textStyle: 'subtitle' }),
          b('text', { field: 'duration', showLabel: true, textStyle: 'subtitle' }),
          b('text', { field: 'certificate', showLabel: true, label: fa('امکان ارائه‌ی گواهی پایان دوره'), textStyle: 'subtitle' }),
          b('list', { field: 'trainers', showLabel: true, label: fa('مربیان دوره'), display: 'row' }),
          b('button', { action: 'request', href: '/request-training', requestType: 'training', label: fa('درخواست این دوره'), variant: 'primary' }),
        ]),
      ]),
      b('text', { source: 'static', text: fa('شرح دوره'), textStyle: 'title', size: 'sm', weight: 'bold' }),
      b('text', { field: 'summary', textStyle: 'body', size: 'lg' }),
      b('text', { source: 'static', text: fa('سرفصل‌ها'), textStyle: 'title', size: 'sm', weight: 'bold' }),
      b('text', { field: 'syllabus', textStyle: 'body' }),
      b('text', { source: 'static', text: fa('مخاطبان'), textStyle: 'title', size: 'sm', weight: 'bold' }),
      b('text', { field: 'audience', textStyle: 'body' }),
      b('text', { source: 'static', text: fa('پیش‌نیازها'), textStyle: 'title', size: 'sm', weight: 'bold' }),
      b('text', { field: 'prerequisites', textStyle: 'body' }),
      b('text', { field: 'standard', textStyle: 'small' }),
    ]),
  }),
  list('trainers', 'box-trainer', { heading: fa('مربیان این دوره'), filters: [{ field: 'courses', op: 'eq', value: '', valueFrom: 'current' }], limit: 6, pagination: 'none', emptyText: fa('مربی این دوره پس از بررسی درخواست معرفی می‌شود.') }),
]);
page('trainer', 'صفحه‌ی مربی', [
  s('collection-item', {
    source: 'trainers',
    card: b('stack', { direction: 'column', gap: 8 }, [
      b('stack', { direction: 'row', wrap: true, gap: 8, align: 'start' }, [
        b('image', { field: '', ratio: 'square', radius: 14, width: '1/3' }),
        b('stack', { direction: 'column', gap: 3, width: '1/2' }, [
          b('text', { field: 'title', textStyle: 'title', size: 'lg', weight: 'bold' }),
          b('rating', { textStyle: 'subtitle' }),
          b('text', { field: 'experience', textStyle: 'subtitle' }),
          b('text', { field: 'regions', showLabel: true, textStyle: 'subtitle' }),
          b('text', { field: 'availability', showLabel: true, textStyle: 'subtitle' }),
          b('list', { field: 'courses', showLabel: true, label: fa('دوره‌هایی که تدریس می‌کند'), display: 'row' }),
          b('button', { action: 'request', href: '/request-training', requestType: 'training', label: fa('درخواست آموزش'), variant: 'primary' }),
        ]),
      ]),
      b('text', { source: 'static', text: fa('بیوگرافی'), textStyle: 'title', size: 'sm', weight: 'bold' }),
      b('text', { field: 'bio', textStyle: 'body', size: 'lg' }),
      b('list', { field: 'files', showLabel: true, label: fa('فایل‌ها و مدارک'), display: 'stack' }),
    ]),
  }),
  s('item-reviews', { heading: fa('امتیازها و نظرها'), limit: 10, showForm: true }),
]);
page('article', 'صفحه‌ی مطلب', [
  s('collection-item', {
    card: b('stack', { direction: 'column', gap: 5 }, [
      b('stack', { direction: 'row', wrap: true, gap: 2 }, [b('badge', { field: 'category', background: '#fde8ea', color: '#a10d24' }), b('badge', { field: 'region', background: '#fde8ea', color: '#a10d24' })]),
      b('text', { field: 'title', textStyle: 'title', size: 'xl', weight: 'bold' }),
      b('text', { field: 'date', textStyle: 'small' }),
      b('image', { field: '', ratio: 'wide', radius: 14 }),
      b('text', { field: 'summary', textStyle: 'subtitle', size: 'lg' }),
      b('text', { field: 'body', textStyle: 'body', size: 'lg' }),
      b('text', { field: 'source', showLabel: true, textStyle: 'small' }),
      b('text', { field: 'source_name', showLabel: true, textStyle: 'small' }),
      b('button', { action: 'link', source: 'field', field: 'source_link', label: fa('خواندن خبر در منبع اصلی'), variant: 'link', newTab: true }),
    ]),
  }),
]);
page('account', 'حساب من', [s('system-page', { page: 'account', accountMenu: 'tabs' })]);

const made = [];
for (const [i, p] of pages.entries()) {
  const created = await staff.post(`${site}/pages`, { ...p, position: i });
  await staff.post(`${site}/pages/${created.id}/publish`);
  made.push(created);
}
console.log('pages', made.length);

/* ---------- sample customers, requests and reviews (real flows through the public API) ---------- */

const pub = `/public/sites/${SLUG}`;
async function customer(phone, name, kind, organization = '') {
  const c = client();
  const sent = await c.post(`${pub}/customer/code`, { identifier: phone, purpose: 'signup' });
  await c.post(`${pub}/customer/signup`, { identifier: phone, code: sent.devCode, name, kind, organization, password: 'firefighter-demo' });
  return c;
}
const orgs = [
  ['09121000001', 'مریم احمدی', 'شرکت نمونه‌ی پالایش نفت جنوب'],
  ['09121000002', 'علی رضایی', 'فرودگاه نمونه‌ی شمال‌غرب'],
  ['09121000003', 'حسین مرادی', 'مجتمع اداری نمونه‌ی تهران'],
];
const REQUESTS = [
  [0, 'آتش‌نشانی صنعتی و پالایشگاهی', 'maleki', 'held', 'خوزستان', 'آبادان', 'سالن آموزش و محوطه‌ی تمرین پالایشگاه', 20],
  [0, 'واکنش به حوادث مواد خطرناک', 'farahmand', 'held', 'خوزستان', 'آبادان', 'سالن آموزش پالایشگاه', 15],
  [1, 'نجات و اطفای حریق هواپیما (ARFF)', 'shayan', 'held', 'آذربایجان شرقی', 'تبریز', 'ایستگاه آتش‌نشانی فرودگاه', 12],
  [1, 'کار با دستگاه تنفسی (SCBA)', 'kiani', 'scheduled', 'آذربایجان شرقی', 'تبریز', 'ایستگاه آتش‌نشانی فرودگاه', 12],
  [2, 'کمک‌های اولیه و اورژانس پیش‌بیمارستانی', 'tavana', 'held', 'تهران', 'تهران', 'سالن اجتماعات ساختمان', 30],
  [2, 'ایمنی ساختمان و بازرسی آتش', '', 'new', 'تهران', 'تهران', 'سالن اجتماعات ساختمان', 8],
];
const REVIEWS = {
  0: [5, 'تمرین‌های خنک‌سازی مخزن و کار با کف بسیار کاربردی بود. مربی به سؤال‌های تیم با حوصله پاسخ داد.'],
  1: [4, 'مطالب دقیق و منظم بود؛ کاش زمان تمرین عملی رفع آلودگی بیشتر بود.'],
  2: [5, 'سناریوهای تمرین بسیار نزدیک به شرایط واقعی فرودگاه طراحی شده بود.'],
  4: [5, 'آموزش احیا و کار با AED ساده و عملی بود و همه‌ی همکاران تمرین کردند.'],
};
const customers = [];
for (const [phone, name, org] of orgs) customers.push(await customer(phone, name, 'organization', org));
const inDays = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
for (const [i, [who, course, trainer, stage, province, city, venue, people]] of REQUESTS.entries()) {
  const [phone, , org] = orgs[who];
  const res = await customers[who].post(`${pub}/leads`, {
    type: 'training',
    answers: { name: org, phone, course, people: String(people), province, city, venue, date: inDays(20 + i * 7), duration: 'سه روز', budget: 'هنوز مشخص نیست', lodging: i % 2 ? 'نداریم' : 'داریم', equipment: 'سالن کلاس با ویدئوپروژکتور و محوطه‌ی باز برای تمرین عملی', notes: '', consent: true },
  });
  const path = ['new', 'reviewing', 'scheduled', 'held'];
  for (const st of path.slice(1, path.indexOf(stage) + 1)) {
    if (st === 'scheduled' && trainer) await staff.patch(`${site}/leads/${res.id}`, { assignedItemId: trainerIds[trainer] });
    await staff.post(`${site}/leads/${res.id}/stage`, { stage: st, notify: false });
  }
  if (REVIEWS[i]) {
    const t = TRAINERS[trainer];
    await customers[who].post(`${pub}/collections/trainers/items/trainer-${trainer}/reviews`, { rating: REVIEWS[i][0], body: REVIEWS[i][1], leadId: res.id });
    void t;
  }
}
// A trainer who signed up and is waiting for approval.
const newTrainer = await customer('09121000009', 'مهدی پویا', 'trainer');
await newTrainer.put(`${pub}/customer/profile`, { title: fa('مهدی پویا'), data: { experience: fa('۸ سال سابقه‌ی عملیاتی'), regions: fa('فارس، بوشهر'), availability: fa('آخر هفته‌ها'), bio: fa('آتش‌نشان عملیاتی با علاقه به آموزش نجات در حوادث خودرو. (نمونه)') } });
console.log('sample requests and reviews done');

/* ---------- mark sample rows ---------- */

const sql = `UPDATE customers SET demo = true; UPDATE leads SET demo = true; UPDATE item_reviews SET demo = true;
  UPDATE collection_items SET demo = true WHERE collection_id = (SELECT id FROM collections WHERE slug = 'trainers')
     OR (collection_id = (SELECT id FROM collections WHERE slug = 'news') AND (data->>'sample')::boolean);`;
execFileSync('docker', ['exec', 'sb-studio-db', 'sh', '-c', `psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ${tenant.dbName} -c "${sql.replace(/"/g, '\\"')}"`], { stdio: 'inherit' });
console.log(`done: http://${SLUG}.preview.localhost`);
