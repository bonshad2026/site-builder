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

/** Hex colour, or empty for the theme's colour. */
const colorSchema = z.string().regex(/^(#[0-9a-fA-F]{6})?$/, 'Use a colour like #1f5e4d').default('');

export const BUTTON_STYLES = ['primary', 'secondary', 'link'] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

export const buttonSchema = z.object({
  label: loc(60),
  href: hrefSchema,
  style: z.enum(BUTTON_STYLES).default('primary'),
  newTab: z.boolean().default(false),
  /** `cart` adds `product` (a product slug) to the cart instead of following a link. */
  action: z.enum(['link', 'cart']).default('link'),
  product: z.string().max(64).default(''),
});
export type SectionButton = z.output<typeof buttonSchema>;

/** Any number of buttons or links (consultation, booking, view product, pay…). */
const buttons = z.array(buttonSchema).max(8).default([]);

export const SPACINGS = ['default', 'none', 'sm', 'md', 'lg', 'xl'] as const;
const pxSize = z.number().int().min(0).max(4000).nullable().default(null);

/** Look of a whole section: space above and below, colours, and where it shows. */
export const appearanceSchema = z
  .object({
    paddingTop: z.enum(SPACINGS).default('default'),
    paddingBottom: z.enum(SPACINGS).default('default'),
    /** Background and text colours (empty = the theme's). */
    background: colorSchema,
    textColor: colorSchema,
    width: z.enum(['default', 'narrow', 'wide', 'full']).default('default'),
    showOn: z.enum(['all', 'desktop', 'mobile']).default('all'),
  })
  .default({});
export type SectionAppearance = z.output<typeof appearanceSchema>;

/** Optional image size: width and/or height in pixels and how the image fills that box. */
export const imageSizeSchema = z
  .object({
    width: pxSize,
    height: pxSize,
    fit: z.enum(['cover', 'contain', 'fill']).default('cover'),
    radius: z.number().int().min(0).max(200).default(0),
  })
  .default({});
export type ImageSize = z.output<typeof imageSizeSchema>;
const imageSize = imageSizeSchema;

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Pages saved before sections had button lists used fixed single buttons (`cta`, `primaryCta`,
 * `secondaryCta`). This turns them into a `buttons` list so old pages keep their buttons.
 */
function legacyButtons(raw: Raw, keys: [string, ButtonStyle][]): Raw {
  if (raw.buttons !== undefined) return raw;
  const list = keys.flatMap(([key, style]) => {
    const old = raw[key];
    return isObj(old) && typeof old.href === 'string' && old.href ? [{ label: old.label, href: old.href, style }] : [];
  });
  return { ...raw, buttons: list };
}
const withLegacyButtons = <T extends z.ZodTypeAny>(schema: T, keys: [string, ButtonStyle][]) =>
  z.preprocess((raw) => (isObj(raw) ? legacyButtons(raw, keys) : raw), schema);

const eyebrowHeading = { eyebrow: loc(80), heading: loc(200) };

const heroSlide = z.object({ ...eyebrowHeading, text: loc(600), imageUrl: imageUrlSchema, buttons });

/** Older heroes were a single slide with two fixed buttons. */
function legacyHero(raw: unknown): unknown {
  if (!isObj(raw) || raw.slides !== undefined) return raw;
  if (!['eyebrow', 'heading', 'text', 'imageUrl', 'primaryCta', 'secondaryCta'].some((k) => raw[k] !== undefined)) return raw;
  const { eyebrow, heading, text, imageUrl, primaryCta, secondaryCta, ...rest } = raw;
  const slide = legacyButtons({ eyebrow, heading, text, imageUrl, primaryCta, secondaryCta }, [
    ['primaryCta', 'primary'],
    ['secondaryCta', 'secondary'],
  ]);
  delete slide.primaryCta;
  delete slide.secondaryCta;
  return { ...rest, slides: [slide] };
}

export const FEATURE_MARKERS = ['roman', 'number', 'bullet', 'none'] as const;
export const TEXT_SIZES = ['sm', 'md', 'lg', 'xl'] as const;

export const sectionDefinitions = {
  'page-header': z.object({ ...eyebrowHeading, intro: loc(600), buttons }),
  hero: z.preprocess(
    legacyHero,
    z.object({
      slides: z.array(heroSlide).max(10).default([{}]),
      /** One slide, or a slider that moves through all of them. */
      display: z.enum(['single', 'slider']).default('single'),
      /** Seconds per slide in a slider (0 = only the arrows move it). */
      autoplay: z.number().int().min(0).max(30).default(6),
      height: z.enum(['small', 'medium', 'large', 'full', 'custom']).default('full'),
      /** Exact height in pixels when `height` is custom (content that does not fit is cut off). */
      customHeight: z.number().int().min(0).max(2000).default(600),
      /** Edge to edge, or inside the page width with rounded corners. */
      frame: z.enum(['full', 'contained']).default('full'),
    }),
  ),
  'rich-text': z.object({ heading: loc(200), body: loc(8000), width: z.enum(['narrow', 'wide']).default('narrow'), buttons }),
  'image-text': withLegacyButtons(
    z.object({ ...eyebrowHeading, body: loc(3000), imageUrl: imageUrlSchema, imageSize, imageSide: z.enum(['start', 'end']).default('start'), buttons }),
    [['cta', 'link']],
  ),
  features: z.object({
    ...eyebrowHeading,
    imageUrl: imageUrlSchema,
    imageSize,
    items: z.array(z.object({ title: loc(120), text: loc(400) })).max(12).default([]),
    /** What numbers the points: I II III, 1 2 3, a bullet, or nothing. */
    marker: z.enum(FEATURE_MARKERS).default('roman'),
    /** The marker on its own line above the title, or beside it. */
    markerPosition: z.enum(['above', 'inline']).default('above'),
    titleColor: colorSchema,
    textColor: colorSchema,
    titleSize: z.enum(TEXT_SIZES).default('md'),
    textSize: z.enum(TEXT_SIZES).default('md'),
    buttons,
  }),
  stats: z.object({
    eyebrow: loc(80),
    items: z.array(z.object({ value: z.string().max(20).default(''), label: loc(80) })).max(8).default([]),
    publications: z.array(z.string().max(60)).max(10).default([]),
    buttons,
  }),
  services: z.object({ ...eyebrowHeading, intro: loc(600), limit: z.number().int().min(1).max(24).default(4), layout: z.enum(['cards', 'rows']).default('cards'), buttons }),
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
    showAddToCart: z.boolean().default(false),
    columns: z.number().int().min(1).max(6).default(4),
    buttons,
  }),
  gallery: z.object({
    ...eyebrowHeading,
    filterable: z.boolean().default(false),
    imageSize,
    items: z
      .array(z.object({ imageUrl: imageUrlSchema, title: loc(120), caption: loc(400), category: loc(60), meta: z.string().max(60).default(''), href: hrefSchema }))
      .max(40)
      .default([]),
    buttons,
  }),
  testimonials: z.object({
    ...eyebrowHeading,
    layout: z.enum(['slider', 'grid']).default('slider'),
    items: z.array(z.object({ quote: loc(800), name: loc(80), role: loc(120) })).max(20).default([]),
    buttons,
  }),
  faq: z.object({
    ...eyebrowHeading,
    searchable: z.boolean().default(false),
    items: z.array(z.object({ question: loc(300), answer: loc(2000) })).max(40).default([]),
    buttons,
  }),
  pricing: z.object({
    ...eyebrowHeading,
    plans: z
      .array(
        withLegacyButtons(
          z.object({
            name: loc(80),
            price: loc(40),
            period: loc(40),
            features: z.array(loc(160)).max(12).default([]),
            highlighted: z.boolean().default(false),
            buttons,
          }),
          [['cta', 'primary']],
        ),
      )
      .max(4)
      .default([]),
    buttons,
  }),
  cta: withLegacyButtons(z.object({ heading: loc(200), text: loc(400), buttons, tone: z.enum(['dark', 'accent']).default('dark') }), [['cta', 'primary']]),
  'contact-form': z.object({
    ...eyebrowHeading,
    intro: loc(600),
    showDetails: z.boolean().default(true),
    /** Older forms: which questions to ask when no request type is chosen. */
    formType: z.enum(['contact', 'consultation', 'reservation', 'demo']).default('consultation'),
    /** A request type from the site settings (its slug); it decides the questions and the inbox label. */
    requestType: z.string().max(40).default(''),
    submitLabel: loc(60),
    buttons,
  }),
} as const;

export type SectionType = keyof typeof sectionDefinitions;
/** A section's own props plus the look every section shares (`appearance`). */
export type SectionProps<T extends SectionType> = z.output<(typeof sectionDefinitions)[T]> & { appearance: SectionAppearance };
export const SECTION_TYPES = Object.keys(sectionDefinitions) as SectionType[];

export const isSectionType = (type: string): type is SectionType => type in sectionDefinitions;

export function defaultProps<T extends SectionType>(type: T): SectionProps<T> {
  return { ...sectionDefinitions[type].parse({}), appearance: appearanceSchema.parse({}) } as SectionProps<T>;
}

/**
 * Props that shape layout or behaviour rather than content. A content-only edit (what a
 * client may do on their own site) can change any other text or image, but not these,
 * nor numbers, switches, list lengths or the sections themselves.
 */
const STRUCTURE_KEYS = new Set([
  'href',
  'height',
  'width',
  'imageSide',
  'layout',
  'tone',
  'filter',
  'category',
  'formType',
  'requestType',
  'paymentMode',
  'paddingTop',
  'paddingBottom',
  'background',
  'showOn',
  'fit',
  'action',
  'product',
  'columns',
  'style',
  'display',
  'marker',
  'markerPosition',
  'titleColor',
  'textColor',
  'titleSize',
  'textSize',
]);

/**
 * Props as the current schema reads them (defaults filled, older shapes such as single `cta`
 * buttons converted), or unchanged when they do not parse. Editors load sections through this.
 */
export function normalizedProps(type: string, props: Record<string, unknown>): Record<string, unknown> {
  const parsed = parseSectionProps(type, props);
  return parsed.success ? parsed.data : props;
}
const normalized = normalizedProps;

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
    const r = same(normalized(a.type, a.props), normalized(b.type, b.props), '', a.type);
    if (r) return r;
  }
  return null;
}

/** Validates (and fills defaults for) one section's props. */
export function parseSectionProps(type: string, props: unknown): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
  if (!isSectionType(type)) return { success: false, error: `Unknown section type "${type}"` };
  const raw = (props ?? {}) as Record<string, unknown>;
  const result = sectionDefinitions[type].safeParse(raw);
  const look = appearanceSchema.safeParse(raw.appearance ?? {});
  const issues = [...(result.success ? [] : result.error.issues), ...(look.success ? [] : look.error.issues.map((i) => ({ ...i, path: ['appearance', ...i.path] })))];
  if (!result.success || !look.success) return { success: false, error: issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  return { success: true, data: { ...(result.data as Record<string, unknown>), appearance: look.data } };
}
