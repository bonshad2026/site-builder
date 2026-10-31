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
export const EN_FONTS = ['Cormorant Garamond', 'Playfair Display', 'Lora', 'Libre Baskerville', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Poppins', 'Montserrat', 'DM Sans', 'Work Sans'] as const;
/** Google Fonts that cover Persian text. */
export const FA_FONTS = ['Vazirmatn', 'Noto Sans Arabic', 'Noto Naskh Arabic', 'Markazi Text', 'Lalezar', 'Amiri', 'Lateef'] as const;

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
  })
  .default({});

/* ---------- forms ---------- */

export const FORM_FIELD_TYPES = ['text', 'textarea', 'email', 'tel', 'number', 'date', 'time', 'select', 'radio', 'checkbox'] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const formFieldSchema = z.object({
  id: slug,
  type: z.enum(FORM_FIELD_TYPES).default('text'),
  label: loc(120),
  help: loc(300),
  required: z.boolean().default(false),
  /** Choices for select and radio fields. */
  options: z.array(loc(120)).max(30).default([]),
});
export type FormField = z.output<typeof formFieldSchema>;

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
    layout: z.enum(['standard', 'centered', 'menu-start']).default('standard'),
    size: z.enum(['compact', 'normal', 'large']).default('normal'),
    showMenu: z.boolean().default(true),
    showCart: z.boolean().default(true),
    showLanguage: z.boolean().default(true),
    showTheme: z.boolean().default(true),
    showButton: z.boolean().default(true),
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

export const orderStatusSchema = z.object({ slug, label: loc(60) });
export type OrderStatusDef = z.output<typeof orderStatusSchema>;

export const DEFAULT_ORDER_STATUSES: OrderStatusDef[] = [
  { slug: 'pending', label: { en: 'Pending', fa: 'در انتظار' } },
  { slug: 'confirmed', label: { en: 'Confirmed', fa: 'تأییدشده' } },
  { slug: 'fulfilled', label: { en: 'Fulfilled', fa: 'تحویل‌شده' } },
  { slug: 'cancelled', label: { en: 'Cancelled', fa: 'لغوشده' } },
];

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
