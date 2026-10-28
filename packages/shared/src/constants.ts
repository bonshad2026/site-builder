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
