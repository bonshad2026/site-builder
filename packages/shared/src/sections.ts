import { z } from 'zod';

/**
 * Section library: every section type has a props schema with defaults.
 * The API validates saved documents with these schemas, the builder uses the
 * defaults for new sections, and the renderer drops anything that does not
 * parse, so one bad section never takes the whole page down.
 */

const loc = (max = 400) =>
  z.object({ en: z.string().max(max).default(''), fa: z.string().max(max).default('') }).default({ en: '', fa: '' });

/** Internal path, https URL, mailto: or tel:. Never javascript: or data:. */
export const hrefSchema = z
  .string()
  .max(500)
  .refine((v) => v === '' || /^(\/(?!\/)|https?:\/\/|mailto:|tel:|#)/i.test(v), 'Use a path like /contact or a full https:// link')
  .default('');

/** Image URL: http(s) or a site-relative path. */
export const imageUrlSchema = z
  .string()
  .max(1000)
  .refine((v) => v === '' || /^(https?:\/\/|\/(?!\/))/i.test(v), 'Use an uploaded image or an https:// URL')
  .default('');

const cta = z.object({ label: loc(60), href: hrefSchema }).default({ label: { en: '', fa: '' }, href: '' });

const eyebrowHeading = { eyebrow: loc(80), heading: loc(200) };

export const sectionDefinitions = {
  'page-header': z.object({ ...eyebrowHeading, intro: loc(600) }),
  hero: z.object({
    ...eyebrowHeading,
    text: loc(600),
    imageUrl: imageUrlSchema,
    primaryCta: cta,
    secondaryCta: cta,
    height: z.enum(['full', 'medium']).default('full'),
  }),
  'rich-text': z.object({ heading: loc(200), body: loc(8000), width: z.enum(['narrow', 'wide']).default('narrow') }),
  'image-text': z.object({ ...eyebrowHeading, body: loc(3000), imageUrl: imageUrlSchema, imageSide: z.enum(['start', 'end']).default('start'), cta }),
  features: z.object({
    ...eyebrowHeading,
    imageUrl: imageUrlSchema,
    items: z.array(z.object({ title: loc(120), text: loc(400) })).max(12).default([]),
  }),
  stats: z.object({
    eyebrow: loc(80),
    items: z.array(z.object({ value: z.string().max(20).default(''), label: loc(80) })).max(8).default([]),
    publications: z.array(z.string().max(60)).max(10).default([]),
  }),
  services: z.object({ ...eyebrowHeading, intro: loc(600), limit: z.number().int().min(1).max(24).default(4), layout: z.enum(['cards', 'rows']).default('cards') }),
  products: z.object({
    ...eyebrowHeading,
    intro: loc(600),
    filter: z.enum(['featured', 'all']).default('featured'),
    limit: z.number().int().min(1).max(48).default(4),
    showFilters: z.boolean().default(false),
    /** Only this category (slug); empty = every category. */
    category: z.string().max(64).default(''),
    showDiscount: z.boolean().default(true),
    showColors: z.boolean().default(true),
    showStock: z.boolean().default(false),
    hideOutOfStock: z.boolean().default(false),
  }),
  gallery: z.object({
    ...eyebrowHeading,
    filterable: z.boolean().default(false),
    items: z
      .array(z.object({ imageUrl: imageUrlSchema, title: loc(120), caption: loc(400), category: loc(60), meta: z.string().max(60).default('') }))
      .max(40)
      .default([]),
  }),
  testimonials: z.object({
    ...eyebrowHeading,
    layout: z.enum(['slider', 'grid']).default('slider'),
    items: z.array(z.object({ quote: loc(800), name: loc(80), role: loc(120) })).max(20).default([]),
  }),
  faq: z.object({
    ...eyebrowHeading,
    searchable: z.boolean().default(false),
    items: z.array(z.object({ question: loc(300), answer: loc(2000) })).max(40).default([]),
  }),
  pricing: z.object({
    ...eyebrowHeading,
    plans: z
      .array(
        z.object({
          name: loc(80),
          price: loc(40),
          period: loc(40),
          features: z.array(loc(160)).max(12).default([]),
          highlighted: z.boolean().default(false),
          cta,
        }),
      )
      .max(4)
      .default([]),
  }),
  cta: z.object({ heading: loc(200), text: loc(400), cta, tone: z.enum(['dark', 'accent']).default('dark') }),
  'contact-form': z.object({
    ...eyebrowHeading,
    intro: loc(600),
    showDetails: z.boolean().default(true),
    /** Which request this form sends: contact, consultation, reservation or demo. */
    formType: z.enum(['contact', 'consultation', 'reservation', 'demo']).default('consultation'),
    submitLabel: loc(60),
  }),
} as const;

export type SectionType = keyof typeof sectionDefinitions;
export type SectionProps<T extends SectionType> = z.output<(typeof sectionDefinitions)[T]>;
export const SECTION_TYPES = Object.keys(sectionDefinitions) as SectionType[];

export const isSectionType = (type: string): type is SectionType => type in sectionDefinitions;

export function defaultProps<T extends SectionType>(type: T): SectionProps<T> {
  return sectionDefinitions[type].parse({}) as SectionProps<T>;
}

/**
 * Props that shape layout or behaviour rather than content. A content-only edit (what a
 * client may do on their own site) can change any other text or image, but not these,
 * nor numbers, switches, list lengths or the sections themselves.
 */
const STRUCTURE_KEYS = new Set(['href', 'height', 'width', 'imageSide', 'layout', 'tone', 'filter', 'category', 'formType', 'paymentMode', 'columns']);

/** Returns why `after` is more than a text/image change of `before`, or null when it is not. */
export function contentOnlyChange(
  before: { sections: { id: string; type: string; hidden?: boolean; props: Record<string, unknown> }[] },
  after: { sections: { id: string; type: string; hidden?: boolean; props: Record<string, unknown> }[] },
): string | null {
  if (before.sections.length !== after.sections.length) return 'Sections cannot be added or removed';
  const same = (a: unknown, b: unknown, key: string, path: string): string | null => {
    if (typeof a === 'string' && typeof b === 'string') return a === b || !STRUCTURE_KEYS.has(key) ? null : `${path} cannot be changed`;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return `${path}: items cannot be added or removed`;
      for (let i = 0; i < a.length; i++) {
        const r = same(a[i], b[i], key, `${path}.${i}`);
        if (r) return r;
      }
      return null;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) {
        const r = same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], k, `${path}.${k}`);
        if (r) return r;
      }
      return null;
    }
    return Object.is(a, b) ? null : `${path} cannot be changed`;
  };
  for (let i = 0; i < before.sections.length; i++) {
    const a = before.sections[i];
    const b = after.sections[i];
    if (a.id !== b.id || a.type !== b.type || !!a.hidden !== !!b.hidden) return 'Sections cannot be moved, hidden or replaced';
    const r = same(a.props, b.props, '', a.type);
    if (r) return r;
  }
  return null;
}

/** Validates (and fills defaults for) one section's props. */
export function parseSectionProps(type: string, props: unknown): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
  if (!isSectionType(type)) return { success: false, error: `Unknown section type "${type}"` };
  const result = sectionDefinitions[type].safeParse(props ?? {});
  if (!result.success) return { success: false, error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  return { success: true, data: result.data as Record<string, unknown> };
}
