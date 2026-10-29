export const LOCALES = ['en', 'fa'] as const;
export type Locale = (typeof LOCALES)[number];

export const THEMES = ['ivory', 'noir', 'sage'] as const;
export type ThemeId = (typeof THEMES)[number];

/** Optional business modules a site can switch on or off. */
export const MODULES = ['services', 'products', 'projects', 'testimonials', 'faq', 'leads', 'orders'] as const;
export type ModuleId = (typeof MODULES)[number];

export const MEMBERSHIP_ROLES = ['owner', 'staff'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/** Fine-grained permissions granted to staff. Owners implicitly hold all of them. */
export const PERMISSIONS = [
  'site:write',
  'pages:write',
  'catalog:write',
  'assets:write',
  'leads:read',
  'leads:write',
  'orders:read',
  'orders:write',
  'payments:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const TENANT_STATUSES = ['provisioning', 'active', 'suspended', 'failed'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const LEAD_TYPES = ['contact', 'consultation', 'service_request', 'reservation', 'demo'] as const;
/** Request forms a page can show (the contact-form section's `formType`). */
export const FORM_TYPES = ['contact', 'consultation', 'reservation', 'demo'] as const;
export type FormType = (typeof FORM_TYPES)[number];

/** A customer request type as defined in site settings; `form` picks which questions the form asks. */
export interface RequestType {
  slug: string;
  label: { en: string; fa: string };
  form: FormType;
  /** Own questions (see siteOptions); empty or missing = the built-in questions of `form`. */
  fields?: import('./siteOptions.js').FormField[];
}

/** Request types a site starts with (and gets when its settings define none). */
export const DEFAULT_REQUEST_TYPES: RequestType[] = [
  { slug: 'consultation', label: { en: 'Consultation', fa: 'مشاوره' }, form: 'consultation' },
  { slug: 'reservation', label: { en: 'Reservation', fa: 'رزرو' }, form: 'reservation' },
  { slug: 'demo', label: { en: 'Demo', fa: 'دمو' }, form: 'demo' },
  { slug: 'question', label: { en: 'Question', fa: 'سؤال' }, form: 'contact' },
  { slug: 'payment', label: { en: 'Payment', fa: 'پرداخت' }, form: 'contact' },
  { slug: 'contact', label: { en: 'Contact message', fa: 'پیام تماس' }, form: 'contact' },
];

/** Icons a social link can show. */
export const SOCIAL_ICONS = ['instagram', 'telegram', 'whatsapp', 'linkedin', 'x', 'facebook', 'youtube', 'aparat', 'eitaa', 'bale', 'rubika', 'pinterest', 'github', 'email', 'phone', 'website'] as const;
export type SocialIcon = (typeof SOCIAL_ICONS)[number];

/** How a buyer pays: online through the gateway, or on delivery. */
export const PAYMENT_METHODS = ['online', 'cod'] as const;
export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'closed'] as const;

export const ORDER_STATUSES = ['pending', 'confirmed', 'fulfilled', 'cancelled'] as const;
/**
 * `paid` is only set after a real gateway verified the payment server-side.
 * `test_paid` marks sandbox payments, which move no real money.
 */
export const PAYMENT_STATUSES = ['unpaid', 'pending', 'paid', 'test_paid', 'failed', 'refunded'] as const;

export const PUBLISH_STATUSES = ['draft', 'published', 'archived'] as const;
