import { z } from 'zod';
import { COLLECTION_PRESETS } from './collections.js';
import { consentField, emailField, nameField, phoneField } from './forms.js';
import { WORKFLOW_PRESETS, type Workflow } from './interactions.js';
import { formFieldSchema, type FormField } from './siteOptions.js';

/**
 * Setting up a new site in one go: which pages, menus, forms, header buttons, shop options,
 * filters, content tables and accounts it starts with, and how much sample data (products,
 * items, customers, orders, payments, requests) fills it so it looks like a site that has been
 * running for a while. The operator picks from these lists when creating a site; everything can
 * be changed in the builder afterwards.
 */

type Lbl = { en: string; fa: string };
const L = (en: string, fa: string): Lbl => ({ en, fa });

/** Where a page's link goes: the main menu, the "More" submenu, the footer, or nowhere (page only). */
export const MENU_PLACES = ['main', 'more', 'footer', 'none'] as const;
export type MenuPlace = (typeof MENU_PLACES)[number];

export interface SetupPage {
  id: string;
  label: Lbl;
  hint: Lbl;
  /** The path it lives at. Built-in pages (shop, services, track, account) exist on every site. */
  href: string;
  builtIn?: boolean;
  /** Needs another choice to make sense (shown as a hint). */
  needs?: 'shop' | 'accounts';
  /** Where it goes when picked. */
  place: MenuPlace;
}

export const SETUP_PAGES: SetupPage[] = [
  { id: 'shop', label: L('Shop / catalogue', 'فروشگاه / کاتالوگ'), hint: L('Product list with search and filters', 'فهرست محصولات با جستجو و فیلتر'), href: '/products', builtIn: true, place: 'main' },
  { id: 'services', label: L('Services', 'خدمات'), hint: L('What you offer, each with its own page', 'خدمات شما، هر کدام با صفحه‌ی جدا'), href: '/services', builtIn: true, place: 'main' },
  { id: 'about', label: L('About us', 'درباره ما'), hint: L('Story, numbers and promise', 'داستان، آمار و تعهد'), href: '/about', place: 'main' },
  { id: 'contact', label: L('Contact', 'تماس با ما'), hint: L('Main form, address, phone and hours', 'فرم اصلی، نشانی، تلفن و ساعت کاری'), href: '/contact', place: 'main' },
  { id: 'faq', label: L('FAQ', 'سؤالات متداول'), hint: L('Searchable questions and answers', 'پرسش و پاسخ با جستجو'), href: '/faq', place: 'more' },
  { id: 'blog', label: L('Blog / articles', 'وبلاگ / مطالب'), hint: L('Articles with dates and their own pages', 'مطالب با تاریخ و صفحه‌ی جدا'), href: '/blog', place: 'main' },
  { id: 'gallery', label: L('Gallery', 'گالری'), hint: L('Photos with categories (for projects with their own pages, use the Portfolio table)', 'عکس‌ها با دسته‌بندی (برای پروژه‌هایی با صفحه‌ی جدا، جدول نمونه‌کارها)'), href: '/gallery', place: 'more' },
  { id: 'team', label: L('Our team', 'تیم ما'), hint: L('People with photo and role', 'افراد با عکس و سمت'), href: '/team', place: 'more' },
  { id: 'pricing', label: L('Pricing / plans', 'تعرفه‌ها'), hint: L('Plans side by side', 'مقایسه‌ی پلن‌ها'), href: '/pricing', place: 'more' },
  { id: 'reviews', label: L('Customer reviews', 'نظرات مشتریان'), hint: L('What customers say', 'نظر مشتریان'), href: '/reviews', place: 'more' },
  { id: 'branches', label: L('Branches', 'شعبه‌ها'), hint: L('Addresses and hours of each branch', 'نشانی و ساعت کاری هر شعبه'), href: '/branches', place: 'more' },
  { id: 'terms', label: L('Terms and conditions', 'قوانین و مقررات'), hint: L('Standard terms text', 'متن استاندارد قوانین'), href: '/terms', place: 'footer' },
  { id: 'privacy', label: L('Privacy', 'حریم خصوصی'), hint: L('How personal data is used', 'نحوه‌ی استفاده از اطلاعات'), href: '/privacy', place: 'footer' },
  { id: 'shipping', label: L('Shipping and returns', 'شرایط ارسال و مرجوعی'), hint: L('Delivery times, costs and returns', 'زمان و هزینه‌ی ارسال و مرجوعی'), href: '/shipping', place: 'footer', needs: 'shop' },
  { id: 'track', label: L('Track an order / request', 'پیگیری سفارش و درخواست'), hint: L('By code and phone or email', 'با کد و موبایل یا ایمیل'), href: '/track', builtIn: true, place: 'footer' },
  { id: 'account', label: L('My account', 'حساب کاربری'), hint: L('Sign in, my orders and requests', 'ورود، سفارش‌ها و درخواست‌های من'), href: '/account', builtIn: true, place: 'none', needs: 'accounts' },
];

/* ---------- forms ---------- */

const field = (input: Partial<FormField> & { id: string; type: FormField['type']; label: Lbl }): FormField => formFieldSchema.parse(input);
const opts = (...list: [string, string, number?][]) => list.map(([en, fa, price]) => ({ en, fa, price: price ?? 0 }));
const message = (en = 'Your message', fa = 'پیام شما', required = true) => field({ id: 'message', type: 'textarea', label: L(en, fa), required, width: 'full' });

export interface SetupForm {
  id: string;
  label: Lbl;
  hint: Lbl;
  /** Page the form gets (its slug), and the menu label. */
  page: string;
  heading: Lbl;
  intro: Lbl;
  workflow: string;
  /** Contact questions besides the name. */
  contact: { phone: 'required' | 'optional' | 'off'; email: 'required' | 'optional' | 'off' };
  fields: () => FormField[];
  /** Built-in form layout these answers map to (older inbox views). */
  form: 'contact' | 'consultation' | 'reservation' | 'demo';
}

export const SETUP_FORMS: SetupForm[] = [
  {
    id: 'contact',
    label: L('Contact message', 'پیام تماس'),
    hint: L('Name, contact details and a message', 'نام، راه تماس و پیام'),
    page: 'contact',
    heading: L('Get in touch', 'با ما در تماس باشید'),
    intro: L('Send us a message and we will reply soon.', 'پیامتان را بفرستید؛ به‌زودی پاسخ می‌دهیم.'),
    workflow: 'question',
    contact: { phone: 'optional', email: 'required' },
    form: 'contact',
    fields: () => [field({ id: 'subject', type: 'select', label: L('Subject', 'موضوع'), options: opts(['General question', 'سؤال عمومی'], ['Sales', 'فروش'], ['Support', 'پشتیبانی'], ['Other', 'سایر']) }), message()],
  },
  {
    id: 'consultation',
    label: L('Consultation', 'درخواست مشاوره'),
    hint: L('Topic, budget and preferred time to call', 'موضوع، بودجه و زمان تماس'),
    page: 'consultation',
    heading: L('Book a free consultation', 'رزرو مشاوره‌ی رایگان'),
    intro: L('Tell us what you need and an adviser will call you.', 'نیازتان را بگویید تا مشاور ما با شما تماس بگیرد.'),
    workflow: 'standard',
    contact: { phone: 'required', email: 'optional' },
    form: 'consultation',
    fields: () => [
      field({ id: 'topic', type: 'select', label: L('Topic', 'موضوع مشاوره'), required: true, options: opts(['Choosing a product', 'انتخاب محصول'], ['Price and order', 'قیمت و سفارش'], ['After-sales', 'خدمات پس از فروش'], ['Other', 'سایر']) }),
      field({ id: 'budget', type: 'select', label: L('Approximate budget', 'بودجه‌ی تقریبی'), options: opts(['Under 50M rials', 'کمتر از ۵۰ میلیون ریال'], ['50M – 200M rials', '۵۰ تا ۲۰۰ میلیون ریال'], ['Over 200M rials', 'بیش از ۲۰۰ میلیون ریال'], ['Not sure', 'مشخص نیست']) }),
      field({ id: 'call-time', type: 'radio', label: L('Best time to call', 'زمان مناسب تماس'), options: opts(['Morning', 'صبح'], ['Afternoon', 'بعدازظهر'], ['Evening', 'عصر']) }),
      message('Tell us more', 'توضیح بیشتر', false),
    ],
  },
  {
    id: 'reservation',
    label: L('Reservation / appointment', 'رزرو / نوبت'),
    hint: L('Date, time and number of people', 'تاریخ، ساعت و تعداد نفرات'),
    page: 'reservation',
    heading: L('Make a reservation', 'رزرو آنلاین'),
    intro: L('Choose a day and time; we will confirm by SMS.', 'روز و ساعت را انتخاب کنید؛ تأیید را پیامک می‌کنیم.'),
    workflow: 'booking',
    contact: { phone: 'required', email: 'optional' },
    form: 'reservation',
    fields: () => [
      field({ id: 'date', type: 'date', label: L('Date', 'تاریخ'), required: true, min: 0, max: 60 }),
      field({ id: 'time', type: 'select', label: L('Time', 'ساعت'), required: true, options: opts(['10:00', '۱۰:۰۰'], ['12:00', '۱۲:۰۰'], ['14:00', '۱۴:۰۰'], ['16:00', '۱۶:۰۰'], ['18:00', '۱۸:۰۰'], ['20:00', '۲۰:۰۰']) }),
      field({ id: 'people', type: 'number', label: L('Number of people', 'تعداد نفرات'), required: true, min: 1, max: 30 }),
      field({ id: 'notes', type: 'textarea', label: L('Notes', 'توضیحات'), width: 'full' }),
    ],
  },
  {
    id: 'demo',
    label: L('Demo / sample request', 'درخواست دمو / نمونه'),
    hint: L('Company, needs and a date', 'شرکت، نیاز و تاریخ'),
    page: 'demo',
    heading: L('Request a demo or samples', 'درخواست دمو یا نمونه'),
    intro: L('Tell us about your business; we will arrange a demo.', 'از کسب‌وکارتان بگویید تا دمو هماهنگ کنیم.'),
    workflow: 'standard',
    contact: { phone: 'required', email: 'required' },
    form: 'demo',
    fields: () => [
      field({ id: 'company', type: 'text', label: L('Company', 'نام شرکت'), required: true }),
      field({ id: 'size', type: 'select', label: L('Team size', 'اندازه‌ی مجموعه'), options: opts(['1–10', '۱ تا ۱۰ نفر'], ['11–50', '۱۱ تا ۵۰ نفر'], ['Over 50', 'بیش از ۵۰ نفر']) }),
      field({ id: 'date', type: 'date', label: L('Preferred date', 'تاریخ پیشنهادی'), min: 1 }),
      message('What do you need?', 'به چه چیزی نیاز دارید؟', false),
    ],
  },
  {
    id: 'quote',
    label: L('Price quote', 'استعلام قیمت / پیش‌فاکتور'),
    hint: L('Product, quantity and delivery city; quote and payment follow', 'محصول، تعداد و شهر؛ پیش‌فاکتور و پرداخت'),
    page: 'quote',
    heading: L('Request a price quote', 'درخواست پیش‌فاکتور'),
    intro: L('Send the items and quantities; we will send a quote with a payment link.', 'اقلام و تعداد را بفرستید؛ پیش‌فاکتور با لینک پرداخت برایتان می‌فرستیم.'),
    workflow: 'quote',
    contact: { phone: 'required', email: 'optional' },
    form: 'contact',
    fields: () => [
      field({ id: 'company', type: 'text', label: L('Company (optional)', 'نام شرکت (اختیاری)') }),
      field({ id: 'items', type: 'textarea', label: L('Items and quantities', 'اقلام و تعداد'), required: true, width: 'full' }),
      field({ id: 'city', type: 'text', label: L('Delivery city', 'شهر تحویل'), required: true }),
      field({ id: 'invoice', type: 'checkbox', label: L('I need an official invoice', 'فاکتور رسمی نیاز دارم') }),
    ],
  },
  {
    id: 'callback',
    label: L('Call me back', 'درخواست تماس'),
    hint: L('Just a name and a phone number', 'فقط نام و شماره تماس'),
    page: 'callback',
    heading: L('We will call you', 'با شما تماس می‌گیریم'),
    intro: L('Leave your number and we will call you during working hours.', 'شماره‌تان را بگذارید تا در ساعت کاری تماس بگیریم.'),
    workflow: 'question',
    contact: { phone: 'required', email: 'off' },
    form: 'contact',
    fields: () => [field({ id: 'call-time', type: 'radio', label: L('Best time to call', 'زمان مناسب تماس'), options: opts(['Morning', 'صبح'], ['Afternoon', 'بعدازظهر'], ['Evening', 'عصر']) })],
  },
  {
    id: 'service',
    label: L('Service request (with files)', 'درخواست خدمات (با فایل)'),
    hint: L('Service, address, photos or documents', 'نوع خدمت، نشانی، عکس یا مدرک'),
    page: 'service-request',
    heading: L('Request a service', 'ثبت درخواست خدمات'),
    intro: L('Describe the job and attach photos; we will reply with a time and price.', 'کار را شرح دهید و عکس بفرستید؛ زمان و هزینه را اعلام می‌کنیم.'),
    workflow: 'quote',
    contact: { phone: 'required', email: 'optional' },
    form: 'contact',
    fields: () => [
      field({ id: 'service', type: 'select', label: L('Service', 'نوع خدمت'), required: true, options: opts(['Installation', 'نصب'], ['Repair', 'تعمیر'], ['Periodic service', 'سرویس دوره‌ای'], ['Consulting', 'مشاوره‌ی فنی']) }),
      field({ id: 'address', type: 'textarea', label: L('Address', 'نشانی'), required: true, width: 'full' }),
      field({ id: 'date', type: 'date', label: L('Preferred date', 'تاریخ پیشنهادی'), min: 0 }),
      field({ id: 'files', type: 'file', label: L('Photos or documents', 'عکس یا مدرک'), max: 3, width: 'full' }),
      message('Describe the job', 'شرح کار', true),
    ],
  },
  {
    id: 'registration',
    label: L('Course / event sign-up', 'ثبت‌نام دوره / رویداد'),
    hint: L('Course, level and payment with the form', 'دوره، سطح و پرداخت همراه فرم'),
    page: 'register',
    heading: L('Sign up', 'ثبت‌نام'),
    intro: L('Choose a course; your place is held once you pay.', 'دوره را انتخاب کنید؛ با پرداخت، جای شما رزرو می‌شود.'),
    workflow: 'paid',
    contact: { phone: 'required', email: 'optional' },
    form: 'contact',
    fields: () => [
      field({ id: 'course', type: 'select', label: L('Course', 'دوره'), required: true, options: opts(['Beginner course', 'دوره‌ی مقدماتی', 25_000_000], ['Advanced course', 'دوره‌ی پیشرفته', 40_000_000], ['Workshop (one day)', 'کارگاه یک‌روزه', 12_000_000]) }),
      field({ id: 'national-id', type: 'text', label: L('National ID', 'کد ملی'), pattern: 'nationalId', required: true }),
      field({ id: 'birth', type: 'date', label: L('Date of birth', 'تاریخ تولد'), max: 0 }),
    ],
  },
  {
    id: 'job',
    label: L('Job application', 'همکاری با ما / استخدام'),
    hint: L('Position, experience and CV upload', 'سمت، سابقه و ارسال رزومه'),
    page: 'careers',
    heading: L('Work with us', 'همکاری با ما'),
    intro: L('Send your CV; we will contact you if there is a match.', 'رزومه‌تان را بفرستید؛ در صورت تناسب تماس می‌گیریم.'),
    workflow: 'question',
    contact: { phone: 'required', email: 'required' },
    form: 'contact',
    fields: () => [
      field({ id: 'position', type: 'select', label: L('Position', 'سمت'), required: true, options: opts(['Sales', 'فروش'], ['Customer support', 'پشتیبانی مشتری'], ['Warehouse', 'انبار'], ['Other', 'سایر']) }),
      field({ id: 'experience', type: 'number', label: L('Years of experience', 'سال‌های سابقه'), min: 0, max: 50 }),
      field({ id: 'cv', type: 'file', label: L('CV (PDF)', 'رزومه (PDF)'), required: true, max: 1, files: { kinds: ['pdf'], maxMb: 5 } }),
      message('About you', 'درباره‌ی خودتان', false),
    ],
  },
  {
    id: 'complaint',
    label: L('Complaint / suggestion', 'شکایت و پیشنهاد'),
    hint: L('Kind, order number and description', 'نوع، شماره سفارش و شرح'),
    page: 'feedback',
    heading: L('Complaints and suggestions', 'انتقادات و پیشنهادات'),
    intro: L('Your feedback helps us improve; we answer every message.', 'نظر شما به بهتر شدن ما کمک می‌کند؛ به همه‌ی پیام‌ها پاسخ می‌دهیم.'),
    workflow: 'standard',
    contact: { phone: 'required', email: 'optional' },
    form: 'contact',
    fields: () => [
      field({ id: 'kind', type: 'radio', label: L('Kind', 'نوع'), required: true, options: opts(['Complaint', 'شکایت'], ['Suggestion', 'پیشنهاد'], ['Thanks', 'قدردانی']) }),
      field({ id: 'order', type: 'text', label: L('Order or request number', 'شماره سفارش یا درخواست') }),
      message('Description', 'شرح', true),
    ],
  },
];

/** A setup form as a site request type (every question an editable field). */
export function setupRequestType(form: SetupForm, choice: { access: 'anyone' | 'signed_in'; notify: boolean; workflow: string }) {
  const preset = WORKFLOW_PRESETS.find((w) => w.id === (choice.workflow || form.workflow)) ?? WORKFLOW_PRESETS[0];
  const workflow: Workflow = { ...preset.workflow, stages: preset.workflow.stages.map((s) => ({ ...s, notify: choice.notify && s.notify })) };
  const head = [nameField()];
  if (form.contact.phone !== 'off') head.push(phoneField(form.contact.phone === 'required'));
  if (form.contact.email !== 'off') head.push(emailField(form.contact.email === 'required'));
  const own = form.fields();
  const paid = own.some((f) => f.options.some((o) => o.price > 0) || f.price > 0);
  return {
    slug: form.id,
    label: form.label,
    form: form.form,
    fields: [...head, ...own, consentField()],
    workflow,
    contact: form.contact,
    payment: { onSubmit: paid, amountMinor: 0, currency: 'IRR' as const, title: paid ? form.label : L('', '') },
    access: choice.access,
    layout: {},
    formVersion: 2,
  };
}

/* ---------- content tables ---------- */

/** Ready-made tables, each with a list page; the blog and team pages use `articles` and `team`. */
export const SETUP_TABLES = COLLECTION_PRESETS.map((p) => ({ id: p.id, label: p.label, slug: p.collection.slug }));

/* ---------- the setup itself ---------- */

const count = (max: number, fallback: number) => z.number().int().min(0).max(max).default(fallback);

export const siteSetupSchema = z.object({
  /** Languages: Persian only, English only, or both (Persian first). */
  languages: z.enum(['fa', 'en', 'both']).default('both'),
  calendar: z.enum(['auto', 'jalali', 'gregorian']).default('auto'),
  /** Theme (empty = the business type's). */
  theme: z.enum(['', 'ivory', 'noir', 'sage']).default(''),
  /** Accent colour (empty = the business type's). */
  accent: z.string().regex(/^(#[0-9a-fA-F]{6})?$/).default(''),
  contact: z
    .object({
      phone: z.string().max(40).default(''),
      email: z.union([z.string().trim().email().max(254), z.literal('')]).default(''),
      address: z.string().max(400).default(''),
      hours: z.string().max(200).default(''),
      instagram: z.string().max(60).default(''),
      telegram: z.string().max(60).default(''),
      whatsapp: z.string().max(30).default(''),
    })
    .default({}),
  /** Chosen pages (SETUP_PAGES ids) and where each one's link goes. */
  pages: z.record(z.string().max(40), z.enum(MENU_PLACES)).default({}),
  /** Chosen forms; each gets a page of its own (the main one sits on /contact). */
  forms: z
    .array(
      z.object({
        id: z.string().max(40),
        menu: z.enum(MENU_PLACES).default('more'),
        access: z.enum(['anyone', 'signed_in']).default('anyone'),
        /** Tell the customer by SMS / email at each stage. */
        notify: z.boolean().default(true),
        /** A workflow preset id (empty = the form's own). */
        workflow: z.string().max(40).default(''),
      }),
    )
    .max(SETUP_FORMS.length)
    .default([]),
  /** The form on /contact, behind the header button and the home page's call to action. */
  mainForm: z.string().max(40).default('contact'),
  /** Content tables (SETUP_TABLES ids), each with a list page. */
  tables: z
    .array(z.object({ id: z.string().max(40), menu: z.enum(MENU_PLACES).default('main') }))
    .max(SETUP_TABLES.length)
    .default([]),
  header: z
    .object({
      /** The main form's button. */
      cta: z.boolean().default(true),
      phone: z.boolean().default(false),
      whatsapp: z.boolean().default(false),
      search: z.boolean().default(true),
      cart: z.boolean().default(true),
      account: z.boolean().default(true),
      language: z.boolean().default(true),
      theme: z.boolean().default(true),
      layout: z.enum(['standard', 'centered', 'menu-start']).default('standard'),
    })
    .default({}),
  footer: z
    .object({
      social: z.boolean().default(true),
      contact: z.boolean().default(true),
      menu: z.boolean().default(true),
      /** A short "about" text column. */
      about: z.boolean().default(true),
    })
    .default({}),
  shop: z
    .object({
      /** Cart and checkout (off = a catalogue with prices only). */
      orders: z.boolean().default(true),
      cod: z.boolean().default(true),
      /** Online payment through the sandbox gateway until a merchant id is set. */
      online: z.boolean().default(true),
      discounts: z.boolean().default(true),
      colors: z.boolean().default(true),
      stock: z.boolean().default(true),
      addToCart: z.boolean().default(true),
      columns: z.number().int().min(2).max(5).default(4),
    })
    .default({}),
  filters: z
    .object({
      search: z.boolean().default(true),
      category: z.boolean().default(true),
      sort: z.boolean().default(true),
      /** Price slider, price ranges and "in stock only" (the shop list becomes a filter page). */
      price: z.boolean().default(true),
      available: z.boolean().default(true),
      discount: z.boolean().default(false),
      layout: z.enum(['inline', 'stacked']).default('inline'),
      pagination: z.enum(['none', 'more', 'pages']).default('pages'),
    })
    .default({}),
  accounts: z
    .object({
      enabled: z.boolean().default(false),
      identifier: z.enum(['phone', 'email']).default('phone'),
      passwords: z.boolean().default(true),
    })
    .default({}),
  /** Sample data, marked as such so it can be removed in one go before delivery. */
  demo: z
    .object({
      enabled: z.boolean().default(true),
      /** Products in all (the business type's own first, then more made from them). */
      products: count(200, 16),
      /** Items per content table (and blog posts / team members). */
      items: count(100, 8),
      customers: count(500, 20),
      orders: count(1000, 30),
      /** Successful (test) payments among the orders and requests. */
      payments: count(1000, 15),
      requests: count(1000, 25),
      testimonials: count(20, 6),
      faq: count(40, 8),
      /** Spread over this many months back. */
      months: z.number().int().min(1).max(36).default(6),
    })
    .default({}),
});
export type SiteSetup = z.output<typeof siteSetupSchema>;
export type SiteSetupInput = z.input<typeof siteSetupSchema>;

/** Main form per business type. */
const MAIN_FORM: Record<string, string> = {
  cosmetics: 'consultation',
  fastfood: 'reservation',
  restaurant: 'reservation',
  cafe: 'reservation',
  furniture: 'consultation',
  appliances: 'service',
  plastics: 'quote',
  disposables: 'quote',
};

/** A sensible starting setup for a business type (or an empty site). */
export function defaultSetup(template = '', sells = !!template): SiteSetup {
  const main = MAIN_FORM[template] ?? 'contact';
  const forms = [...new Set([main, 'contact', 'callback', 'complaint'])].map((id) => ({ id, menu: (id === main ? 'main' : id === 'complaint' ? 'footer' : 'more') as MenuPlace }));
  const pages: Record<string, MenuPlace> = { shop: 'main', about: 'main', contact: 'main', faq: 'more', blog: 'more', gallery: 'more', reviews: 'more', terms: 'footer', privacy: 'footer', track: 'footer' };
  const orders = !!template && sells;
  if (orders) pages.shipping = 'footer';
  if (!template) {
    delete pages.shop;
    pages.services = 'main';
  }
  return siteSetupSchema.parse({ pages, forms, mainForm: main, shop: { orders }, accounts: { enabled: orders } });
}
