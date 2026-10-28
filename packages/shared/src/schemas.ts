import { z } from 'zod';
import { parseSectionProps } from './sections.js';
import { LEAD_STATUSES, LEAD_TYPES, LOCALES, MODULES, ORDER_STATUSES, PAYMENT_METHODS, PERMISSIONS, PUBLISH_STATUSES, THEMES } from './constants.js';

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
  themeId: z.enum(THEMES),
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
  social: z.array(z.object({ label: z.string().min(1).max(40), href: z.string().url() })).max(12),
  /** Main menu: internal paths like /services or /about, in display order. */
  nav: z
    .array(z.object({ href: z.string().max(200).regex(/^\/[a-z0-9/-]*$/, 'Use an internal path like /about'), label: localizedSchema }))
    .max(20),
  /** Product categories with their display names (products refer to them by slug). */
  productCategories: z
    .array(z.object({ slug: slugSchema, label: localizedSchema }))
    .max(40)
    .default([]),
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
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

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
  /** Most units of this product in one order (empty = the global limit of 50). */
  maxPerOrder: z.number().int().min(1).max(50).nullable().default(null),
  featured: z.boolean().default(false),
  materials: localizedSchema.default({ en: '', fa: '' }),
  dimensions: z.string().max(80).default(''),
  leadTime: localizedSchema.default({ en: '', fa: '' }),
  imageAssetId: z.string().uuid().nullable().default(null),
  status: z.enum(PUBLISH_STATUSES).default('draft'),
  position: z.number().int().min(0).default(0),
  seo: seoSchema,
});

/* ---------- Leads ---------- */

export const leadInputSchema = z.object({
  type: z.enum(LEAD_TYPES).default('contact'),
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: z.union([phoneSchema, z.literal('')]).default(''),
  projectType: z.string().max(40).optional(),
  budget: z.string().max(40).optional(),
  message: z.string().trim().min(2).max(4000),
  sourcePath: z.string().max(300).optional(),
  /** Reservation / demo answers. */
  details: z
    .object({
      date: z.string().max(40).optional(),
      time: z.string().max(20).optional(),
      people: z.number().int().min(1).max(500).optional(),
      company: z.string().max(120).optional(),
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
  /** Client sends only product ids and quantities; prices are always read from the database. */
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(50), option: z.string().trim().max(80).default('') }))
    .min(1)
    .max(50),
  note: z.string().max(1000).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default('online'),
});

export const orderUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES),
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
