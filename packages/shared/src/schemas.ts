import { z } from 'zod';
import { savedCardSchema } from './collections.js';
import { hrefSchema, parseSectionProps } from './sections.js';
import { designSchema, exportOptionsSchema, footerSchema, formFieldSchema, formOptionsSchema, headerSchema, shopPageSchema, shopSchema, systemPagesSchema, textsSchema } from './siteOptions.js';
import { DEFAULT_REQUEST_TYPES, FORM_TYPES, LEAD_STATUSES, LOCALES, MODULES, PAYMENT_METHODS, PERMISSIONS, PUBLISH_STATUSES, SOCIAL_ICONS } from './constants.js';

export const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');

export const localizedSchema = z.object({
  en: z.string().max(10_000),
  fa: z.string().max(10_000),
});

export const localizedRequiredSchema = z.object({
  en: z.string().trim().min(1).max(500),
  fa: z.string().trim().min(1).max(500),
});

export const seoSchema = z
  .object({
    title: localizedSchema.partial().optional(),
    description: localizedSchema.partial().optional(),
    noIndex: z.boolean().optional(),
    canonicalPath: z.string().startsWith('/').max(300).optional(),
  })
  .default({});

const mobileRegex = /^\+?[0-9]{8,15}$/;
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))
  .refine((v) => mobileRegex.test(v), 'Invalid phone number');

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/** A customer request type id; older built-in ones (e.g. service_request) use an underscore. */
export const requestTypeSlug = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/, 'Use lowercase English letters, numbers and hyphens');

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200)
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), 'Password must contain letters and numbers');

/* ---------- Site settings ---------- */

export const siteSettingsSchema = z.object({
  name: localizedRequiredSchema,
  tagline: localizedSchema,
  defaultLocale: z.enum(LOCALES),
  locales: z.array(z.enum(LOCALES)).min(1),
  /** A built-in theme (ivory, noir, sage) or one of `design.themes`. */
  themeId: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/),
  logoAssetId: z.string().uuid().nullable().default(null),
  /** Public URL of the logo image (shown in the header instead of the site name). */
  logoUrl: z
    .string()
    .max(1000)
    .refine((v) => v === '' || /^(https?:\/\/|\/(?!\/))/i.test(v), 'Use an uploaded image or an https:// URL')
    .default(''),
  contact: z.object({
    email: z.string().email().or(z.literal('')),
    phone: z.string().max(40),
    address: localizedSchema,
    hours: localizedSchema,
  }),
  social: z
    .array(
      z.object({
        label: z.string().max(40).default(''),
        href: z.string().url(),
        icon: z.enum(SOCIAL_ICONS).default('website'),
      }),
    )
    .max(12),
  /** How social links show: their name, their icon, or both. */
  socialDisplay: z.enum(['label', 'icon', 'both']).default('label'),
  /** Language of error messages in the admin and on the site (auto = the language being used). */
  errorLanguage: z.enum(['auto', 'fa', 'en']).default('auto'),
  /** Writing direction of the site's pages (auto = by language: Persian right to left). */
  direction: z.enum(['auto', 'rtl', 'ltr']).default('auto'),
  /** Writing direction of the site's admin panel (auto = by the panel's language). */
  adminDirection: z.enum(['auto', 'rtl', 'ltr']).default('auto'),
  /** Calendar for dates (auto = Persian (Jalali) in Persian, Gregorian in English). */
  calendar: z.enum(['auto', 'jalali', 'gregorian']).default('auto'),
  /** Language the site's admin panel opens in (auto = the user's own choice). */
  adminLanguage: z.enum(['auto', 'fa', 'en']).default('auto'),
  /** Box designs shared by list sections (see the box designer). */
  cardDesigns: z.array(savedCardSchema).max(40).default([]),
  /** Main menu in display order: pages of the site (/about) or full links, each with an optional submenu. */
  nav: z
    .array(
      z
        .object({
          href: hrefSchema,
          label: localizedSchema,
          children: z
            .array(z.object({ href: hrefSchema.refine((v) => v !== '', 'Choose a link'), label: localizedSchema }))
            .max(12)
            .default([]),
        })
        // An item with a submenu may be a heading only (no link of its own).
        .refine((item) => item.href !== '' || item.children.length > 0, { message: 'Choose a link', path: ['href'] }),
    )
    .max(20),
  /** Product categories with their display names (products refer to them by slug). */
  productCategories: z
    .array(z.object({ slug: slugSchema, label: localizedSchema }))
    .max(40)
    .default([]),
  /** Kinds of customer request (consultation, booking, demo…); forms send one and the inbox filters by it. */
  requestTypes: z
    .array(
      z.object({
        slug: requestTypeSlug,
        label: localizedSchema,
        form: z.enum(FORM_TYPES),
        /** Own questions; when set they replace the built-in ones of `form` (name and email are always asked). */
        fields: z.array(formFieldSchema).max(30).default([]),
      }),
    )
    .max(30)
    .default(DEFAULT_REQUEST_TYPES),
  /** Header button (default: a consultation request linking to /contact). */
  headerCta: z
    .object({ label: localizedSchema, href: z.string().max(200).regex(/^\/[a-z0-9/-]*$/, 'Use an internal path like /contact') })
    .nullable()
    .default(null),
  /** Heading of the /products page (default: the built-in collection texts). */
  catalogPage: z.object({ eyebrow: localizedSchema, heading: localizedSchema, intro: localizedSchema }).nullable().default(null),
  /** Optional brand accent overriding the theme's accent (hex). */
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  modules: z.record(z.enum(MODULES), z.boolean()),
  seo: z.object({
    titleTemplate: z.string().max(120).includes('%s'),
    defaultDescription: localizedSchema,
  }),
  business: z.object({
    founded: z.number().int().min(1800).max(2100).nullable(),
    stats: z.array(z.object({ value: z.string().max(20), label: localizedSchema })).max(8),
  }),
  design: designSchema,
  texts: textsSchema,
  formOptions: formOptionsSchema,
  header: headerSchema,
  footer: footerSchema,
  shopPage: shopPageSchema,
  systemPages: systemPagesSchema,
  shop: shopSchema,
  exportOptions: exportOptionsSchema,
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

const optionSchemas = {
  socialDisplay: siteSettingsSchema.shape.socialDisplay,
  cardDesigns: siteSettingsSchema.shape.cardDesigns,
  errorLanguage: siteSettingsSchema.shape.errorLanguage,
  direction: siteSettingsSchema.shape.direction,
  adminDirection: siteSettingsSchema.shape.adminDirection,
  calendar: siteSettingsSchema.shape.calendar,
  adminLanguage: siteSettingsSchema.shape.adminLanguage,
  productCategories: siteSettingsSchema.shape.productCategories,
  requestTypes: siteSettingsSchema.shape.requestTypes,
  design: designSchema,
  texts: textsSchema,
  formOptions: formOptionsSchema,
  header: headerSchema,
  footer: footerSchema,
  shopPage: shopPageSchema,
  systemPages: systemPagesSchema,
  shop: shopSchema,
  exportOptions: exportOptionsSchema,
};

/**
 * Stored settings with every optional group filled in (sites saved before an option existed
 * get its default, which keeps them looking as they did). Groups that do not parse also fall
 * back to their default rather than breaking the site.
 */
export function withSettingDefaults<T extends object>(raw: T): T & Pick<SiteSettings, keyof typeof optionSchemas> {
  const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  for (const [key, schema] of Object.entries(optionSchemas)) {
    const parsed = (schema as z.ZodTypeAny).safeParse((raw as Record<string, unknown>)[key]);
    out[key] = parsed.success ? parsed.data : (schema as z.ZodTypeAny).parse(undefined);
  }
  return out as T & Pick<SiteSettings, keyof typeof optionSchemas>;
}

/* ---------- Page document ---------- */

/**
 * A page is a versionable document: metadata plus an ordered list of typed
 * sections. Section props are validated per type by the section registry
 * (stage 2); here each section only needs a known shape and bounded size.
 */
export const sectionSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  props: z.record(z.unknown()),
  hidden: z.boolean().optional(),
});

export const pageDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  sections: z
    .array(sectionSchema)
    .max(60)
    .superRefine((sections, ctx) => {
      const ids = new Set<string>();
      sections.forEach((s, i) => {
        if (ids.has(s.id)) ctx.addIssue({ code: 'custom', path: [i, 'id'], message: 'Duplicate section id' });
        ids.add(s.id);
        const parsed = parseSectionProps(s.type, s.props);
        if (!parsed.success) ctx.addIssue({ code: 'custom', path: [i, 'props'], message: parsed.error });
      });
    })
    // Store the normalised props (defaults filled, unknown keys stripped).
    .transform((sections) => sections.map((s) => ({ ...s, props: (parseSectionProps(s.type, s.props) as { data: Record<string, unknown> }).data }))),
});
export type PageDocument = z.infer<typeof pageDocumentSchema>;

export const pageInputSchema = z.object({
  slug: slugSchema.or(z.literal('home')),
  title: localizedRequiredSchema,
  isHome: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
  seo: seoSchema,
  document: pageDocumentSchema.default({ schemaVersion: 1, sections: [] }),
});

/* ---------- Catalog ---------- */

export const serviceInputSchema = z.object({
  slug: slugSchema,
  title: localizedRequiredSchema,
  summary: localizedSchema,
  body: localizedSchema,
  imageAssetId: z.string().uuid().nullable().default(null),
  duration: localizedSchema.default({ en: '', fa: '' }),
  startingFrom: localizedSchema.default({ en: '', fa: '' }),
  deliverables: z.array(localizedSchema).max(30).default([]),
  process: z.array(z.object({ title: localizedSchema, text: localizedSchema })).max(20).default([]),
  status: z.enum(PUBLISH_STATUSES).default('draft'),
  position: z.number().int().min(0).default(0),
  seo: seoSchema,
});

export const productInputSchema = z.object({
  slug: slugSchema,
  name: localizedRequiredSchema,
  description: localizedSchema,
  category: slugSchema.nullable().default(null),
  /** Integer amount in the currency's minor unit (IRR has none, so rials). */
  priceMinor: z.number().int().min(0).nullable().default(null),
  currency: z.string().length(3).default('IRR'),
  stock: z.number().int().min(0).nullable().default(null),
  isAvailable: z.boolean().default(true),
  /** Percentage off the price (0 = none); applied by the server when an order is placed. */
  discountPercent: z.number().int().min(0).max(90).default(0),
  /** Colours the buyer can choose from (none = no choice). */
  colors: z
    .array(z.object({ name: localizedRequiredSchema, hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) }))
    .max(12)
    .default([]),
  /** Most units of this product in one order (empty = the shop's limit). */
  maxPerOrder: z.number().int().min(1).max(999).nullable().default(null),
  featured: z.boolean().default(false),
  materials: localizedSchema.default({ en: '', fa: '' }),
  dimensions: z.string().max(80).default(''),
  leadTime: localizedSchema.default({ en: '', fa: '' }),
  imageAssetId: z.string().uuid().nullable().default(null),
  /** More photos after the main one, in display order. */
  images: z.array(z.string().uuid()).max(12).default([]),
  /** Any number of name / value details (size, warranty, origin…). */
  attributes: z
    .array(z.object({ name: localizedSchema, value: localizedSchema }))
    .max(40)
    .default([]),
  status: z.enum(PUBLISH_STATUSES).default('draft'),
  position: z.number().int().min(0).default(0),
  seo: seoSchema,
});

/* ---------- Leads ---------- */

export const leadInputSchema = z.object({
  /** A request type slug from the site settings (or one of the built-in LEAD_TYPES). */
  type: requestTypeSlug.default('contact'),
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: z.union([phoneSchema, z.literal('')]).default(''),
  projectType: z.string().max(40).optional(),
  budget: z.string().max(80).optional(),
  message: z.string().trim().min(2).max(4000),
  sourcePath: z.string().max(300).optional(),
  /** The content-table item this request is about (a class, an event…). */
  item: z.object({ collection: z.string().max(40), slug: z.string().max(80) }).optional(),
  /** Reservation / demo answers. */
  details: z
    .object({
      date: z.string().max(40).optional(),
      time: z.string().max(20).optional(),
      people: z.number().int().min(1).max(500).optional(),
      company: z.string().max(120).optional(),
      /** Answers to a request type's own questions, as shown to the visitor. */
      answers: z
        .array(z.object({ label: z.string().max(200), value: z.string().max(2000) }))
        .max(30)
        .optional(),
    })
    .default({}),
  consent: z.literal(true),
  /** Honeypot: real visitors never fill this hidden field. */
  website: z.string().max(200).optional(),
});
export type LeadInput = z.input<typeof leadInputSchema>;

export const leadUpdateSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  note: z.string().max(2000).optional(),
});

/* ---------- Orders ---------- */

export const orderInputSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    phone: phoneSchema,
    address: z.string().trim().max(500).optional(),
  }),
  /**
   * Client sends only ids and quantities; prices are always read from the database. A line is a
   * product (`productId`) or an item of a content table that sells (`itemId`).
   */
  items: z
    .array(
      z
        .object({
          productId: z.string().uuid().optional(),
          itemId: z.string().uuid().optional(),
          quantity: z.number().int().min(1).max(999),
          option: z.string().trim().max(80).default(''),
        })
        .refine((l) => !!l.productId !== !!l.itemId, 'Each line needs a product or an item'),
    )
    .min(1)
    .max(100),
  note: z.string().max(1000).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default('online'),
});

/** A built-in status or one the shop added (see `shop.orderStatuses`). */
export const orderUpdateSchema = z.object({
  status: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/),
});

/* ---------- Memberships ---------- */

export const staffInviteSchema = z.object({
  email: emailSchema,
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
});

/* ---------- Payments ---------- */

export const PAYMENT_PROVIDERS = ['none', 'zarinpal', 'sandbox'] as const;

export const paymentSettingsSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS),
  /** Zarinpal merchant id (36-character UUID). Kept in a private table, never in public settings. */
  merchantId: z.string().trim().max(64).default(''),
  /** Use the Zarinpal sandbox host instead of production. */
  useSandboxHost: z.boolean().default(false),
  /** Let buyers pay on delivery (cash or card at the door). */
  allowCod: z.boolean().default(false),
});
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>;
