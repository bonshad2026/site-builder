import { z } from 'zod';
import { buttonSchema, hrefSchema } from './sections.js';

/**
 * Per-site options for the look of the site, its texts, forms, header, footer, shop page,
 * system pages and shop rules. Every option defaults to how sites looked before it existed,
 * so a site only changes when someone changes a setting.
 */

const loc = (max = 400) => z.object({ en: z.string().max(max).default(''), fa: z.string().max(max).default('') }).default({ en: '', fa: '' });
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1f5e4d');
const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/, 'Use lowercase English letters, numbers and hyphens');
/** A page of the site (its slug), or empty for none. */
const pageRef = z.string().max(64).default('');

/* ---------- design: fonts and themes ---------- */

/** Google Fonts that cover Latin text. */
export const EN_FONTS = ['Cormorant Garamond', 'Playfair Display', 'Lora', 'Libre Baskerville', 'Merriweather', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Poppins', 'Montserrat', 'DM Sans', 'Work Sans', 'Nunito', 'Raleway', 'Manrope', 'custom'] as const;
/** Google Fonts that cover Persian text. */
export const FA_FONTS = ['Vazirmatn', 'Noto Sans Arabic', 'Noto Naskh Arabic', 'Noto Kufi Arabic', 'Markazi Text', 'Lalezar', 'Amiri', 'Lateef', 'Cairo', 'Tajawal', 'Reem Kufi', 'Mirza', 'Harmattan', 'custom'] as const;

export const THEME_COLOR_KEYS = ['bg', 'surface', 'surface2', 'ink', 'inkSoft', 'line', 'accent', 'accentInk', 'accentSoft'] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

export const customThemeSchema = z.object({
  id: slug,
  name: loc(60),
  colors: z.object(Object.fromEntries(THEME_COLOR_KEYS.map((k) => [k, hex])) as Record<ThemeColorKey, typeof hex>),
});
export type CustomTheme = z.output<typeof customThemeSchema>;

export const designSchema = z
  .object({
    fonts: z
      .object({
        enDisplay: z.enum(EN_FONTS).default('Cormorant Garamond'),
        enBody: z.enum(EN_FONTS).default('Inter'),
        faDisplay: z.enum(FA_FONTS).default('Vazirmatn'),
        faBody: z.enum(FA_FONTS).default('Vazirmatn'),
      })
      .default({}),
    /** Themes made for this site, alongside the built-in ivory, noir and sage. */
    themes: z.array(customThemeSchema).max(10).default([]),
    /** An uploaded font file (woff2 / woff / ttf), used where a font is set to "custom" (e.g. a licensed Persian font). */
    customFont: z
      .object({ name: z.string().max(60).default(''), url: z.string().max(1000).refine((v) => v === '' || /^(https?:\/\/|\/(?!\/))/i.test(v)).default('') })
      .default({}),
  })
  .default({});

/* ---------- forms ---------- */

/** `heading` is a title and text inside the form; `step` starts a new page of a multi-step form. */
export const FORM_FIELD_TYPES = ['text', 'textarea', 'email', 'tel', 'number', 'date', 'time', 'select', 'radio', 'checkbox', 'checkboxes', 'file', 'heading', 'step'] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

/** What an answer means to the system: the customer's name, and the phone / email used to follow the request up. */
export const FIELD_ROLES = ['', 'name', 'phone', 'email'] as const;
/** Ready-made checks for text answers. */
export const FIELD_PATTERNS = ['', 'digits', 'nationalId', 'postalCode', 'iban', 'persian', 'latin'] as const;
export const FILE_KINDS = ['image', 'pdf'] as const;

/** A choice; `price` (smallest currency unit) is added to the form's total when it is chosen. */
const optionSchema = z.object({ en: z.string().max(120).default(''), fa: z.string().max(120).default(''), price: z.number().int().min(0).max(1e12).default(0) });

export const formFieldSchema = z.object({
  id: slug,
  type: z.enum(FORM_FIELD_TYPES).default('text'),
  label: loc(200),
  help: loc(600),
  required: z.boolean().default(false),
  /** Choices for select, radio and checkboxes fields. */
  options: z.array(optionSchema).max(50).default([]),
  /**
   * Choices taken from a content table instead (its slug): the titles of its published items,
   * filled in when the form is shown and when it is checked on the server.
   */
  optionsFrom: z.string().max(40).regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/).default(''),
  /** Shown only when another field has this answer (a choice's label in either language, or "✓" for a ticked box). */
  showIf: z.object({ field: slug, value: z.string().max(120) }).nullable().default(null),
  /** Width on wide screens: one column, the whole row, or automatic (long fields take the row). */
  width: z.enum(['auto', 'full', 'half']).default('auto'),
  /** The customer's name, or the phone / email the request is followed up with (SMS, email, tracking). */
  role: z.enum(FIELD_ROLES).default(''),
  placeholder: loc(120),
  /**
   * Limits: numbers → smallest / largest value; texts → fewest / most characters; dates → days from
   * today (0 = today, 30 = in a month, -365 = a year ago); files → –/most files. Null = no limit.
   */
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
  pattern: z.enum(FIELD_PATTERNS).default(''),
  /** Pricing: a ticked box adds this; a number adds this × the number (1 = the customer types the amount). */
  price: z.number().int().min(0).max(1e12).default(0),
  /** File questions: allowed kinds and size (MB) of each file. */
  files: z
    .object({ kinds: z.array(z.enum(FILE_KINDS)).min(1).default(['image', 'pdf']), maxMb: z.number().int().min(1).max(10).default(10) })
    .default({}),
});
export type FormField = z.output<typeof formFieldSchema>;
export type FieldOption = z.output<typeof optionSchema>;

const choice = z.object({ value: slug, label: loc(80) });
export const formOptionsSchema = z
  .object({
    /** "Type of project" choices in consultation forms. */
    projectTypes: z
      .array(choice)
      .max(30)
      .default([
        { value: 'residential', label: { en: 'Residential interior', fa: 'طراحی داخلی مسکونی' } },
        { value: 'hospitality', label: { en: 'Hospitality or retail', fa: 'هتل، رستوران یا فروشگاه' } },
        { value: 'consultation', label: { en: 'Consultation', fa: 'مشاوره' } },
        { value: 'furniture', label: { en: 'Furniture enquiry', fa: 'استعلام مبلمان' } },
      ]),
    /** Budget choices in consultation forms. */
    budgets: z
      .array(choice)
      .max(30)
      .default([
        { value: 'small', label: { en: 'Under 2B IRR', fa: 'کمتر از ۲ میلیارد ریال' } },
        { value: 'medium', label: { en: '2B – 10B IRR', fa: '۲ تا ۱۰ میلیارد ریال' } },
        { value: 'large', label: { en: 'Over 10B IRR', fa: 'بیش از ۱۰ میلیارد ریال' } },
        { value: 'unsure', label: { en: 'Not sure yet', fa: 'هنوز مشخص نیست' } },
      ]),
  })
  .default({});

/* ---------- header & footer ---------- */

export const headerSchema = z
  .object({
    /** What the logo spot shows: the logo when there is one (else the name), or a fixed choice. */
    brand: z.enum(['auto', 'logo', 'name', 'both']).default('auto'),
    /** Where the logo links; empty = the home page. */
    logoHref: hrefSchema,
    /** `stacked`: logo and buttons on one row, the menu on a full row below. */
    layout: z.enum(['standard', 'centered', 'menu-start', 'stacked']).default('standard'),
    size: z.enum(['compact', 'normal', 'large']).default('normal'),
    showMenu: z.boolean().default(true),
    showCart: z.boolean().default(true),
    showLanguage: z.boolean().default(true),
    showTheme: z.boolean().default(true),
    showButton: z.boolean().default(true),
    /** A search box that opens the shop's results. */
    showSearch: z.boolean().default(false),
    /** "Sign in" / the customer's name (when the site has accounts). */
    showAccount: z.boolean().default(true),
    /** Header buttons; empty = the single header button (headerCta). */
    buttons: z.array(buttonSchema).max(4).default([]),
    /** See-through over the home page's hero until the visitor scrolls. */
    transparentOverHero: z.boolean().default(true),
  })
  .default({});

/** Footer columns a block can sit in, left to right. */
export const FOOTER_COLUMNS = 4;
const footerColumn = (fallback: number) => z.number().int().min(1).max(FOOTER_COLUMNS).default(fallback);

export const footerSchema = z
  .object({
    /** The site logo above the name (off by default). */
    showLogo: z.boolean().default(false),
    showBrand: z.boolean().default(true),
    showTagline: z.boolean().default(true),
    showSocial: z.boolean().default(true),
    showMenu: z.boolean().default(true),
    /** Submenu links under their menu item. */
    showSubmenu: z.boolean().default(true),
    showContact: z.boolean().default(true),
    /** Which column each built-in block sits in; blocks sharing a column stack in this order. */
    placement: z
      .object({
        brand: footerColumn(1),
        social: footerColumn(1),
        menu: footerColumn(2),
        contact: footerColumn(3),
      })
      .default({}),
    /** Extra columns with a title, some text and links. */
    columns: z
      .array(
        z.object({
          title: loc(80),
          text: loc(600),
          links: z.array(z.object({ label: loc(80), href: hrefSchema })).max(12).default([]),
          /** 1–4 = inside that column (after the built-in blocks); 0 = the full-width row below. */
          column: z.number().int().min(0).max(FOOTER_COLUMNS).default(0),
        }),
      )
      .max(6)
      .default([]),
    showCopyright: z.boolean().default(true),
    /** Empty = the built-in "© year name. All rights reserved"; {year} and {name} are filled in. */
    copyright: loc(200),
  })
  .default({});

/* ---------- shop page & cards ---------- */

export const SORT_OPTIONS = ['featured', 'price-asc', 'price-desc', 'newest', 'name'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];
export const IMAGE_RATIOS = ['portrait', 'square', 'landscape', 'tall'] as const;

export const productCardSchema = z
  .object({
    imageRatio: z.enum(IMAGE_RATIOS).default('portrait'),
    showImage: z.boolean().default(true),
    showCategory: z.boolean().default(true),
    showPrice: z.boolean().default(true),
    showDiscount: z.boolean().default(true),
    showColors: z.boolean().default(true),
    showStock: z.boolean().default(false),
    showAddToCart: z.boolean().default(false),
  })
  .default({});
export type ProductCardSettings = z.output<typeof productCardSchema>;

export const shopPageSchema = z
  .object({
    /** Products per row on large screens. */
    columns: z.number().int().min(1).max(6).default(4),
    showCategoryFilter: z.boolean().default(true),
    showSearch: z.boolean().default(true),
    showSort: z.boolean().default(true),
    sortOptions: z.array(z.enum(SORT_OPTIONS)).min(1).max(SORT_OPTIONS.length).default(['featured', 'price-asc', 'price-desc']),
    showCount: z.boolean().default(true),
    card: productCardSchema,
  })
  .default({});

/* ---------- system pages ---------- */

/** Builder pages shown above and below a built-in page (by slug; empty = none). */
const around = { before: pageRef, after: pageRef };
export const systemPagesSchema = z
  .object({
    products: z.object(around).default({}),
    productDetail: z
      .object({
        ...around,
        imageSide: z.enum(['start', 'end']).default('start'),
        showRelated: z.boolean().default(true),
        showDetails: z.boolean().default(true),
      })
      .default({}),
    /** `rows`: image beside text, alternating (the original look); `cards`: a grid of cards. */
    services: z.object({ ...around, layout: z.enum(['rows', 'cards']).default('rows') }).default({}),
    serviceDetail: z.object(around).default({}),
    cart: z.object(around).default({}),
    checkout: z.object(around).default({}),
    checkoutResult: z.object(around).default({}),
    /** A builder page shown instead of the built-in "page not found" content. */
    notFound: z.object({ page: pageRef }).default({}),
  })
  .default({});

/* ---------- shop rules ---------- */

export const CURRENCIES = ['IRR', 'IRT', 'USD', 'EUR', 'GBP', 'AED', 'TRY', 'IQD', 'AFN'] as const;

/** Digits after the decimal point; prices are stored in the smallest unit (cents for USD, rials for IRR). */
export const currencyDecimals = (code: string) => (['USD', 'EUR', 'GBP', 'AED', 'TRY'].includes(code) ? 2 : 0);

/** Statuses the order lifecycle relies on; they can be renamed but not removed. */
export const BUILT_IN_ORDER_STATUSES = ['pending', 'confirmed', 'fulfilled', 'cancelled'] as const;

export const orderStatusSchema = z.object({
  slug,
  label: loc(60),
  /** Tell the buyer (SMS / email) when the order reaches this stage. */
  notify: z.boolean().default(false),
  /** The text sent; {{number}}, {{name}}, {{stage}} and {{link}} are filled in. Empty = a standard text. */
  message: loc(500),
});
export type OrderStatusDef = z.output<typeof orderStatusSchema>;

export const DEFAULT_ORDER_STATUSES: OrderStatusDef[] = [
  { slug: 'pending', label: { en: 'Pending', fa: 'در انتظار' } },
  { slug: 'confirmed', label: { en: 'Confirmed', fa: 'تأییدشده' } },
  { slug: 'fulfilled', label: { en: 'Fulfilled', fa: 'تحویل‌شده' } },
  { slug: 'cancelled', label: { en: 'Cancelled', fa: 'لغوشده' } },
].map((s) => orderStatusSchema.parse(s));

/** Iran's provinces, for the address part of the checkout. */
export const IRAN_PROVINCES: { en: string; fa: string }[] = [
  ['Tehran', 'تهران'], ['Alborz', 'البرز'], ['Isfahan', 'اصفهان'], ['Fars', 'فارس'], ['Khorasan Razavi', 'خراسان رضوی'], ['East Azerbaijan', 'آذربایجان شرقی'],
  ['West Azerbaijan', 'آذربایجان غربی'], ['Khuzestan', 'خوزستان'], ['Mazandaran', 'مازندران'], ['Gilan', 'گیلان'], ['Kerman', 'کرمان'], ['Yazd', 'یزد'],
  ['Qom', 'قم'], ['Markazi', 'مرکزی'], ['Hamadan', 'همدان'], ['Kermanshah', 'کرمانشاه'], ['Kurdistan', 'کردستان'], ['Lorestan', 'لرستان'],
  ['Ilam', 'ایلام'], ['Zanjan', 'زنجان'], ['Qazvin', 'قزوین'], ['Semnan', 'سمنان'], ['Golestan', 'گلستان'], ['North Khorasan', 'خراسان شمالی'],
  ['South Khorasan', 'خراسان جنوبی'], ['Sistan and Baluchestan', 'سیستان و بلوچستان'], ['Hormozgan', 'هرمزگان'], ['Bushehr', 'بوشهر'],
  ['Kohgiluyeh and Boyer-Ahmad', 'کهگیلویه و بویراحمد'], ['Chaharmahal and Bakhtiari', 'چهارمحال و بختیاری'], ['Ardabil', 'اردبیل'],
].map(([en, fa]) => ({ en, fa }));

const need = z.enum(['off', 'optional', 'required']);

/** What the checkout asks: contact and address details, and the shop's own extra questions. */
export const checkoutSchema = z
  .object({
    email: need.default('optional'),
    address: need.default('optional'),
    /** Province and city as separate questions. */
    region: z.boolean().default(true),
    postalCode: need.default('optional'),
    note: z.boolean().default(true),
    /** Extra questions (answers are kept with the order). */
    fields: z
      .array(
        z.object({
          id: slug,
          label: loc(120),
          type: z.enum(['text', 'textarea', 'select']).default('text'),
          options: z.array(loc(80)).max(20).default([]),
          required: z.boolean().default(false),
        }),
      )
      .max(10)
      .default([]),
  })
  .default({});
export type CheckoutSettings = z.output<typeof checkoutSchema>;

/** A way of sending orders, with its price; free above `freeAbove` (smallest currency unit) when set. */
export const shippingMethodSchema = z.object({
  id: slug,
  label: loc(80),
  description: loc(200),
  priceMinor: z.number().int().min(0).max(1e13).default(0),
  freeAbove: z.number().int().min(0).max(1e13).nullable().default(null),
});
export type ShippingMethod = z.output<typeof shippingMethodSchema>;

/** The cost of a shipping method for an order of `subtotal`. */
export const shippingCost = (m: ShippingMethod, subtotal: number) => (m.freeAbove !== null && subtotal >= m.freeAbove ? 0 : m.priceMinor);

export const shopSchema = z
  .object({
    /** Currency for new products (existing products keep theirs). */
    currency: z.enum(CURRENCIES).default('IRR'),
    /** Most units of one product in an order (a product can set a lower limit). */
    maxPerProduct: z.number().int().min(1).max(999).default(50),
    /** Most units of all products together in one order (empty = no limit). */
    maxItemsPerOrder: z.number().int().min(1).max(9999).nullable().default(null),
    /** Order stages in display order; the built-in ones must stay. */
    orderStatuses: z
      .array(orderStatusSchema)
      .max(20)
      .default(DEFAULT_ORDER_STATUSES)
      .refine((list) => BUILT_IN_ORDER_STATUSES.every((s) => list.some((x) => x.slug === s)), 'Pending, confirmed, fulfilled and cancelled must stay in the list'),
    checkout: checkoutSchema,
    /** Ways of sending; empty = no choice and no shipping cost. */
    shipping: z.array(shippingMethodSchema).max(10).default([]),
    /** Email the staff when a product's (or variant's) stock falls to this or below (empty = never). */
    lowStock: z.number().int().min(0).max(10_000).nullable().default(null),
  })
  .default({});

/* ---------- product export ---------- */

/** Columns a product export can have, in this order. */
export const PRODUCT_EXPORT_FIELDS = [
  'slug',
  'nameFa',
  'nameEn',
  'category',
  'price',
  'discountPercent',
  'finalPrice',
  'currency',
  'stock',
  'isAvailable',
  'featured',
  'status',
  'colors',
  'attributes',
  'descriptionFa',
  'descriptionEn',
  'imageUrl',
  'galleryUrls',
  'pageUrl',
] as const;
export type ProductExportField = (typeof PRODUCT_EXPORT_FIELDS)[number];

/** The columns chosen for the last export, kept so the next one starts from them. */
export const exportOptionsSchema = z
  .object({
    productFields: z.array(z.enum(PRODUCT_EXPORT_FIELDS)).max(PRODUCT_EXPORT_FIELDS.length).default(['slug', 'nameFa', 'category', 'price', 'stock', 'imageUrl']),
  })
  .default({});

/* ---------- texts ---------- */

/** Replacements for the site's built-in texts, by key (e.g. "common.viewAll"). */
export const textsSchema = z.record(z.string().regex(/^[a-zA-Z0-9_.]{1,80}$/), z.object({ en: z.string().max(2000).default(''), fa: z.string().max(2000).default('') })).default({});

/* ---------- page code, icons, announcement bar and popup ---------- */

const urlOrPath = z.string().max(1000).refine((v) => v === '' || /^(https?:\/\/|\/(?!\/))/i.test(v), 'Use an uploaded image or an https:// URL').default('');

/** Browser icon, default share image, and the operator's own code (analytics, trust badges, chat). */
export const pageMetaSchema = z
  .object({
    faviconUrl: urlOrPath,
    /** Shown when a page is shared and has no image of its own. */
    shareImageUrl: urlOrPath,
    /** HTML put in <head> on every page (meta tags, analytics). */
    headCode: z.string().max(20_000).default(''),
    /** HTML put at the end of <body> (chat widgets, badges). */
    bodyCode: z.string().max(20_000).default(''),
  })
  .default({});

/** A strip above the header (offers, notices). */
export const announcementSchema = z
  .object({
    enabled: z.boolean().default(false),
    text: loc(300),
    href: z.string().max(500).default(''),
    background: z.string().regex(/^(#[0-9a-fA-F]{6})?$/).default(''),
    textColor: z.string().regex(/^(#[0-9a-fA-F]{6})?$/).default(''),
    /** Visitors can close it (it stays closed for them until the text changes). */
    dismissible: z.boolean().default(true),
  })
  .default({});

/** A window that opens once per visitor (or on every visit). */
export const popupSchema = z
  .object({
    enabled: z.boolean().default(false),
    title: loc(200),
    text: loc(1000),
    imageUrl: urlOrPath,
    buttonLabel: loc(60),
    buttonHref: z.string().max(500).default(''),
    /** Seconds after the page opens. */
    delay: z.number().int().min(0).max(120).default(3),
    /** Once per visitor (until the text changes), or every visit. */
    once: z.boolean().default(true),
    /** Every page, or the home page only. */
    pages: z.enum(['all', 'home']).default('home'),
  })
  .default({});
