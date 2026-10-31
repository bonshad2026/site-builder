import { z } from 'zod';

/**
 * Content tables ("collections"): the operator defines a table and its fields per site (courses,
 * classes, teachers, news…); the site's owner adds the items. Pages list items with the
 * `collection-list` section, each item drawn by a box (card) designed from blocks, and an item's
 * own page is a builder page marked as that table's template.
 */

const loc = (max = 400) =>
  z.object({ en: z.string().max(max).default(''), fa: z.string().max(max).default('') }).default({ en: '', fa: '' });

export const collectionSlugSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase English letters, numbers and single hyphens');

/** A field key: how the field is stored and how `{{key}}` refers to it in texts. */
export const fieldKeySchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase English letters, numbers and underscores, starting with a letter');

/** Keys every item has without a field definition. */
export const BUILT_IN_FIELDS = ['title', 'slug'] as const;

export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'price',
  'date',
  'datetime',
  'boolean',
  'select',
  'multiselect',
  'image',
  'gallery',
  'link',
  'email',
  'phone',
  'reference',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Types whose value is written in both languages. */
export const LOCALIZED_FIELD_TYPES: readonly FieldType[] = ['text', 'textarea'];

export const collectionFieldSchema = z.object({
  key: fieldKeySchema.refine((k) => !(BUILT_IN_FIELDS as readonly string[]).includes(k), 'Every item already has a title and an address (slug); use another key'),
  label: loc(80),
  type: z.enum(FIELD_TYPES).default('text'),
  required: z.boolean().default(false),
  help: loc(200),
  /** Choices of select and multiselect fields. */
  options: z
    .array(z.object({ value: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, 'Use lowercase English letters, numbers and hyphens'), label: loc(80) }))
    .max(50)
    .default([]),
  /** Reference fields: the table they point to (its slug) and whether more than one item can be picked. */
  reference: collectionSlugSchema.or(z.literal('')).default(''),
  multiple: z.boolean().default(false),
});
export type CollectionField = z.output<typeof collectionFieldSchema>;

/** Selling or booking an item: which fields hold the price, the seats and the deadline. */
export const collectionCommerceSchema = z
  .object({
    /** Items can go in the cart and be paid for online (needs a price field). */
    enabled: z.boolean().default(false),
    priceField: z.string().max(40).default(''),
    /** A number field with a discount in percent (optional). */
    discountField: z.string().max(40).default(''),
    /** A number field with the number of seats (empty or no value = unlimited). */
    capacityField: z.string().max(40).default(''),
    /** A date or date-time field after which booking closes. */
    deadlineField: z.string().max(40).default(''),
    currency: z.string().regex(/^[A-Z]{3}$/).default('IRR'),
    /** Most seats one order can take. */
    maxPerOrder: z.number().int().min(1).max(999).default(10),
    /** Requests sent for an item also take a seat (not only orders). */
    requestsTakeSeat: z.boolean().default(false),
  })
  .default({});
export type CollectionCommerce = z.output<typeof collectionCommerceSchema>;

export const collectionInputSchema = z
  .object({
    slug: collectionSlugSchema,
    /** Name of the table (plural, e.g. Classes) and of one item (e.g. Class). */
    name: loc(80),
    itemName: loc(80),
    fields: z.array(collectionFieldSchema).max(40).default([]),
    /** The builder page used as the page of each item (its slug); empty = a simple built-in page. */
    detailPage: z.string().max(64).default(''),
    /** The field holding the main image (cards and sharing previews). */
    imageField: z.string().max(40).default(''),
    commerce: collectionCommerceSchema,
    /** Default request type of the "request" button. */
    requestType: z.string().max(40).default(''),
    position: z.number().int().min(0).max(10_000).default(0),
  })
  .superRefine((c, ctx) => {
    const keys = new Set<string>();
    c.fields.forEach((f, i) => {
      if (keys.has(f.key)) ctx.addIssue({ code: 'custom', path: ['fields', i, 'key'], message: 'Duplicate field key' });
      keys.add(f.key);
      if (f.type === 'reference' && !f.reference) ctx.addIssue({ code: 'custom', path: ['fields', i, 'reference'], message: 'Choose the table this field points to' });
    });
    const typed = (key: string, types: FieldType[]) => !key || c.fields.some((f) => f.key === key && types.includes(f.type));
    if (!typed(c.commerce.priceField, ['price', 'number'])) ctx.addIssue({ code: 'custom', path: ['commerce', 'priceField'], message: 'Choose a price field' });
    if (!typed(c.commerce.discountField, ['number'])) ctx.addIssue({ code: 'custom', path: ['commerce', 'discountField'], message: 'Choose a number field' });
    if (!typed(c.commerce.capacityField, ['number'])) ctx.addIssue({ code: 'custom', path: ['commerce', 'capacityField'], message: 'Choose a number field' });
    if (!typed(c.commerce.deadlineField, ['date', 'datetime'])) ctx.addIssue({ code: 'custom', path: ['commerce', 'deadlineField'], message: 'Choose a date field' });
    if (c.commerce.enabled && !c.commerce.priceField) ctx.addIssue({ code: 'custom', path: ['commerce', 'priceField'], message: 'Selling needs a price field' });
  });
export type CollectionInput = z.output<typeof collectionInputSchema>;
export type Collection = CollectionInput & { id: string };

/* ---------- items ---------- */

export const ITEM_STATUSES = ['draft', 'published'] as const;

export const itemInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9؀-ۿ]+(?:-[a-z0-9؀-ۿ]+)*$/, 'Use letters, numbers and single hyphens'),
  title: z.object({ en: z.string().max(300).default(''), fa: z.string().max(300).default('') }),
  /** Field values by key (checked against the table's fields on the server). */
  data: z.record(fieldKeySchema, z.unknown()).default({}),
  status: z.enum(ITEM_STATUSES).default('draft'),
  position: z.number().int().min(0).max(1_000_000).default(0),
});
export type ItemInput = z.output<typeof itemInputSchema>;

const localized = z.object({ en: z.string().max(20_000).default(''), fa: z.string().max(20_000).default('') });
const uuid = z.string().uuid();

/** Validates one field value; returns the cleaned value or an error message. */
export function parseFieldValue(field: CollectionField, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  if (empty) {
    if (field.required) return { ok: false, error: 'Required' };
    return { ok: true, value: field.type === 'multiselect' || field.type === 'gallery' || field.type === 'reference' ? [] : null };
  }
  const check = <T>(schema: z.ZodType<T>) => {
    const r = schema.safeParse(value);
    return r.success ? ({ ok: true, value: r.data } as const) : ({ ok: false, error: r.error.issues[0]?.message ?? 'Invalid value' } as const);
  };
  switch (field.type) {
    case 'text':
    case 'textarea': {
      const r = check(localized);
      if (r.ok && field.required && !(r.value as { en: string; fa: string }).en && !(r.value as { en: string; fa: string }).fa) return { ok: false, error: 'Required' };
      return r;
    }
    case 'number':
      return check(z.number().finite().min(-1e12).max(1e12));
    case 'price':
      return check(z.number().int().min(0).max(1e15));
    case 'date':
      return check(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date'));
    case 'datetime':
      return check(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'Use a date and time'));
    case 'boolean':
      return check(z.boolean());
    case 'select':
      return check(z.string().refine((v) => field.options.some((o) => o.value === v), 'Not one of the choices'));
    case 'multiselect':
      return check(z.array(z.string().refine((v) => field.options.some((o) => o.value === v), 'Not one of the choices')).max(50));
    case 'image':
      return check(uuid);
    case 'gallery':
      return check(z.array(uuid).max(30));
    case 'link':
      return check(z.string().max(500).regex(/^(\/(?!\/)|https?:\/\/|mailto:|tel:|#)/i, 'Use a path like /contact or a full https:// link'));
    case 'email':
      return check(z.string().trim().email().max(254));
    case 'phone':
      return check(z.string().trim().max(30).regex(/^[+0-9 ()-]{4,30}$/, 'Invalid phone number'));
    case 'reference':
      // Always stored as a list of item ids (one for single references).
      return check(z.array(uuid).max(field.multiple ? 50 : 1).or(uuid.transform((v) => [v])));
  }
}

/* ---------- filters and sorting (list sections) ---------- */

/** `in`: one of several values (a JSON list or comma separated). */
export const FILTER_OPS = ['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte', 'set', 'notset', 'future', 'past', 'in'] as const;

/** A filter on this key keeps items that can still be booked or bought (open and not full). */
export const AVAILABLE_FILTER = '__available';
export type FilterOp = (typeof FILTER_OPS)[number];

export const collectionFilterSchema = z.object({
  /** A field key, or `title`. */
  field: z.string().max(40).default(''),
  op: z.enum(FILTER_OPS).default('eq'),
  value: z.string().max(200).default(''),
  /** `current`: compare with the item whose page this is (on a table's template page). */
  valueFrom: z.enum(['static', 'current']).default('static'),
});
export type CollectionFilter = z.output<typeof collectionFilterSchema>;

/**
 * How a visitor filter is shown. Which ones make sense depends on the field type:
 * text → search; choices/references → chips, select, checkboxes; numbers/prices → range, slider,
 * presets; dates → calendar, dateRange, datePresets; yes/no and availability → toggle.
 */
export const VISITOR_FILTER_DISPLAYS = ['chips', 'select', 'checkboxes', 'search', 'range', 'slider', 'presets', 'calendar', 'dateRange', 'datePresets', 'toggle'] as const;
export type VisitorFilterDisplay = (typeof VISITOR_FILTER_DISPLAYS)[number];

export const visitorFilterSchema = z.object({
  /** A field key, `title`, or `__available`. */
  field: z.string().max(40).default(''),
  display: z.enum(VISITOR_FILTER_DISPLAYS).default('chips'),
  label: loc(80),
  /** Ranges offered by `presets` (prices in the smallest unit; empty = open end). */
  presets: z
    .array(z.object({ label: loc(60), min: z.number().nullable().default(null), max: z.number().nullable().default(null) }))
    .max(8)
    .default([]),
  /** Calendar: always shown on the page, or opened by a button in a window. */
  calendarMode: z.enum(['inline', 'popup']).default('inline'),
  /** Slider bounds and step (null = taken from the items). */
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
  step: z.number().positive().nullable().default(null),
});
export type VisitorFilter = z.output<typeof visitorFilterSchema>;

export const listQuerySchema = z.object({
  filters: z.array(collectionFilterSchema).max(10).default([]),
  /** Visitor's choices: field key → value (older lists; same as `eq`). */
  choices: z.record(z.string().max(40), z.string().max(200)).default({}),
  /** Visitor's filters (ranges, several choices, availability…). */
  visitor: z.array(collectionFilterSchema).max(20).default([]),
  q: z.string().max(100).default(''),
  /** `position`, `newest`, `title` or a field key. */
  sort: z.string().max(40).default('position'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(60).default(12),
  /** Id of the current item (template pages), for `valueFrom: current`. */
  current: z.string().uuid().optional(),
});
export type ListQuery = z.output<typeof listQuerySchema>;

/* ---------- boxes (cards) ---------- */

export const BLOCK_TYPES = ['stack', 'image', 'text', 'badge', 'price', 'capacity', 'button', 'divider', 'spacer'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export const BLOCK_ACTIONS = ['view', 'cart', 'request', 'link', 'call'] as const;
export type BlockAction = (typeof BLOCK_ACTIONS)[number];
export const BLOCK_WIDTHS = ['auto', 'full', '1/4', '1/3', '1/2', '2/3', '3/4'] as const;
export const TEXT_STYLES = ['title', 'subtitle', 'body', 'small', 'eyebrow'] as const;

const color = z.string().regex(/^(#[0-9a-fA-F]{6})?$/, 'Use a colour like #1f5e4d').default('');
const scale = (max: number, fallback: number) => z.number().int().min(0).max(max).default(fallback);

/**
 * One block of a box. Every block has the same shape (only the props of its type matter), which
 * keeps saved designs simple; `children` is used by `stack` (a row or a column of blocks).
 */
export interface CardBlock {
  id: string;
  type: BlockType;
  // stack
  direction: 'row' | 'column';
  gap: number;
  align: 'start' | 'center' | 'end' | 'stretch';
  justify: 'start' | 'center' | 'end' | 'between';
  wrap: boolean;
  padding: number;
  background: string;
  radius: number;
  border: boolean;
  shadow: boolean;
  children: CardBlock[];
  /** stack: the whole block opens the item's page. */
  linkToItem: boolean;
  /** stack: writing direction inside it (auto = the site's language). */
  dir: 'auto' | 'rtl' | 'ltr';
  // content
  source: 'static' | 'field';
  field: string;
  text: { en: string; fa: string };
  /** Field label before the value (text) or button label. */
  label: { en: string; fa: string };
  showLabel: boolean;
  textStyle: (typeof TEXT_STYLES)[number];
  size: 'sm' | 'md' | 'lg' | 'xl';
  weight: 'normal' | 'medium' | 'bold';
  color: string;
  /** `start` follows the surrounding row/column (the box's own alignment); right/left are fixed. */
  textAlign: 'start' | 'center' | 'end' | 'right' | 'left';
  /** Cut long text after this many lines (0 = never). */
  lines: number;
  // image
  ratio: 'auto' | 'square' | 'portrait' | 'landscape' | 'wide';
  fit: 'cover' | 'contain' | 'fill';
  /** Image size in pixels (0 = automatic: the width of its place, the height from `ratio`). */
  imgWidth: number;
  imgHeight: number;
  /** Which part of the image stays in view when it is cropped. */
  position: 'center' | 'top' | 'bottom' | 'left' | 'right';
  /** Several images (a gallery, `*` = every image field): the first, all of them, or picked ones. */
  images: 'first' | 'all' | 'pick';
  /** At most this many (0 = no limit). */
  count: number;
  /** Picked images by number, e.g. "1,3,4". */
  pick: string;
  /** How several images are laid out. */
  display: 'grid' | 'slider' | 'row' | 'stack';
  /** Images per row in a grid. */
  columns: number;
  // button
  action: BlockAction;
  href: string;
  requestType: string;
  variant: 'primary' | 'secondary' | 'link';
  newTab: boolean;
  // spacer / any
  height: number;
  width: (typeof BLOCK_WIDTHS)[number];
}

const blockFields = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(BLOCK_TYPES),
  direction: z.enum(['row', 'column']).default('column'),
  gap: scale(12, 3),
  align: z.enum(['start', 'center', 'end', 'stretch']).default('stretch'),
  justify: z.enum(['start', 'center', 'end', 'between']).default('start'),
  wrap: z.boolean().default(false),
  padding: scale(12, 0),
  background: color,
  radius: scale(48, 0),
  border: z.boolean().default(false),
  shadow: z.boolean().default(false),
  children: z.array(z.unknown()).max(30).default([]),
  linkToItem: z.boolean().default(false),
  dir: z.enum(['auto', 'rtl', 'ltr']).default('auto'),
  source: z.enum(['static', 'field']).default('field'),
  field: z.string().max(40).default(''),
  text: loc(600),
  label: loc(80),
  showLabel: z.boolean().default(false),
  textStyle: z.enum(TEXT_STYLES).default('body'),
  size: z.enum(['sm', 'md', 'lg', 'xl']).default('md'),
  weight: z.enum(['normal', 'medium', 'bold']).default('normal'),
  color,
  textAlign: z.enum(['start', 'center', 'end', 'right', 'left']).default('start'),
  lines: scale(10, 0),
  ratio: z.enum(['auto', 'square', 'portrait', 'landscape', 'wide']).default('landscape'),
  fit: z.enum(['cover', 'contain', 'fill']).default('cover'),
  imgWidth: scale(2000, 0),
  imgHeight: scale(2000, 0),
  position: z.enum(['center', 'top', 'bottom', 'left', 'right']).default('center'),
  images: z.enum(['first', 'all', 'pick']).default('first'),
  count: scale(30, 0),
  pick: z.string().max(100).default(''),
  display: z.enum(['grid', 'slider', 'row', 'stack']).default('grid'),
  columns: z.number().int().min(1).max(6).default(3),
  action: z.enum(BLOCK_ACTIONS).default('view'),
  href: z.string().max(500).default(''),
  requestType: z.string().max(40).default(''),
  variant: z.enum(['primary', 'secondary', 'link']).default('primary'),
  newTab: z.boolean().default(false),
  height: scale(200, 16),
  width: z.enum(BLOCK_WIDTHS).default('auto'),
});

/**
 * Child blocks are parsed with the same schema in a transform rather than `z.lazy`, so the API's
 * OpenAPI generator (which cannot describe lazy schemas) still handles every route.
 */
export const cardBlockSchema: z.ZodType<CardBlock, z.ZodTypeDef, unknown> = blockFields.transform((block, ctx) => {
  const children: CardBlock[] = [];
  block.children.forEach((raw, i) => {
    const r = cardBlockSchema.safeParse(raw);
    if (r.success) children.push(r.data);
    else for (const issue of r.error.issues) ctx.addIssue({ ...issue, path: ['children', i, ...issue.path] });
  });
  return { ...block, children };
});

/** Counts blocks and nesting so a design stays a reasonable size. */
function measure(block: CardBlock, depth = 1): { count: number; depth: number } {
  return block.children.reduce(
    (acc, child) => {
      const m = measure(child, depth + 1);
      return { count: acc.count + m.count, depth: Math.max(acc.depth, m.depth) };
    },
    { count: 1, depth },
  );
}

export const cardDesignSchema = cardBlockSchema.superRefine((root, ctx) => {
  const m = measure(root);
  if (m.count > 80) ctx.addIssue({ code: 'custom', message: 'A box can have at most 80 blocks' });
  if (m.depth > 6) ctx.addIssue({ code: 'custom', message: 'Rows and columns can be nested at most 6 deep' });
});

export const newBlock = (type: BlockType, patch: Partial<CardBlock> = {}): CardBlock =>
  cardBlockSchema.parse({ id: Math.random().toString(36).slice(2, 10), type, ...patch });

/** The box a new list starts with: image, title and a "view" button. */
export function defaultCardDesign(): CardBlock {
  return newBlock('stack', {
    direction: 'column',
    gap: 3,
    border: true,
    radius: 12,
    padding: 0,
    linkToItem: false,
    children: [
      newBlock('image', { field: '', ratio: 'landscape' }),
      newBlock('stack', {
        direction: 'column',
        gap: 2,
        padding: 4,
        children: [
          newBlock('text', { field: 'title', textStyle: 'title', size: 'md', weight: 'medium' }),
          newBlock('button', { action: 'view', label: { en: 'View', fa: 'مشاهده' }, variant: 'secondary' }),
        ],
      }),
    ],
  });
}

/** A box design saved in the site settings so several lists can share it. */
export const savedCardSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/),
  name: z.string().max(80).default(''),
  /** The table (slug) or `products` it was made for; its fields are offered in the designer. */
  source: z.string().max(40).default(''),
  design: cardDesignSchema,
});
export type SavedCard = z.output<typeof savedCardSchema>;

/* ---------- the built-in products table as a list source ---------- */

/** Products shown by a list section look like items of a table with these fields. */
export const PRODUCT_SOURCE = 'products';
export const PRODUCT_SOURCE_FIELDS: CollectionField[] = (
  [
    ['image', 'image', 'Image', 'تصویر'],
    ['description', 'textarea', 'Description', 'توضیحات'],
    ['category', 'select', 'Category', 'دسته'],
    ['price', 'price', 'Price', 'قیمت'],
    ['discount', 'number', 'Discount %', 'تخفیف ٪'],
    ['stock', 'number', 'Stock', 'موجودی'],
    ['featured', 'boolean', 'Featured', 'ویژه'],
  ] as const
).map(([key, type, en, fa]) => collectionFieldSchema.parse({ key, type, label: { en, fa } }));

/* ---------- ready-made tables ---------- */

const f = (key: string, type: FieldType, en: string, fa: string, extra: Partial<CollectionField> = {}) =>
  collectionFieldSchema.parse({ key, type, label: { en, fa }, ...extra });

/** Starting points for common tables; everything can be changed after. */
export const COLLECTION_PRESETS: { id: string; label: { en: string; fa: string }; collection: z.input<typeof collectionInputSchema> }[] = [
  {
    id: 'courses',
    label: { en: 'Courses', fa: 'دوره‌ها' },
    collection: {
      slug: 'courses',
      name: { en: 'Courses', fa: 'دوره‌ها' },
      itemName: { en: 'Course', fa: 'دوره' },
      imageField: 'image',
      fields: [f('image', 'image', 'Image', 'تصویر'), f('summary', 'textarea', 'Summary', 'خلاصه'), f('body', 'textarea', 'Description', 'توضیحات'), f('duration', 'text', 'Duration', 'مدت'), f('level', 'select', 'Level', 'سطح', { options: [{ value: 'beginner', label: { en: 'Beginner', fa: 'مقدماتی' } }, { value: 'advanced', label: { en: 'Advanced', fa: 'پیشرفته' } }] })],
    },
  },
  {
    id: 'classes',
    label: { en: 'Classes (with booking)', fa: 'کلاس‌ها (با ثبت‌نام)' },
    collection: {
      slug: 'classes',
      name: { en: 'Classes', fa: 'کلاس‌ها' },
      itemName: { en: 'Class', fa: 'کلاس' },
      imageField: 'image',
      fields: [
        f('image', 'image', 'Image', 'تصویر'),
        f('course', 'reference', 'Course', 'دوره', { reference: 'courses' }),
        f('teacher', 'reference', 'Teacher', 'مدرس', { reference: 'teachers' }),
        f('starts_at', 'datetime', 'Starts', 'شروع'),
        f('location', 'text', 'Location', 'محل برگزاری'),
        f('price', 'price', 'Price', 'قیمت'),
        f('capacity', 'number', 'Seats', 'ظرفیت'),
        f('deadline', 'date', 'Registration deadline', 'مهلت ثبت‌نام'),
        f('body', 'textarea', 'Description', 'توضیحات'),
      ],
      commerce: { enabled: true, priceField: 'price', capacityField: 'capacity', deadlineField: 'deadline' },
    },
  },
  {
    id: 'teachers',
    label: { en: 'Teachers', fa: 'مدرسان' },
    collection: {
      slug: 'teachers',
      name: { en: 'Teachers', fa: 'مدرسان' },
      itemName: { en: 'Teacher', fa: 'مدرس' },
      imageField: 'photo',
      fields: [f('photo', 'image', 'Photo', 'عکس'), f('role', 'text', 'Role', 'سمت'), f('bio', 'textarea', 'Biography', 'بیوگرافی')],
    },
  },
  {
    id: 'news',
    label: { en: 'News', fa: 'اخبار' },
    collection: {
      slug: 'news',
      name: { en: 'News', fa: 'اخبار' },
      itemName: { en: 'News item', fa: 'خبر' },
      imageField: 'image',
      fields: [f('image', 'image', 'Image', 'تصویر'), f('date', 'date', 'Date', 'تاریخ'), f('summary', 'textarea', 'Summary', 'خلاصه'), f('body', 'textarea', 'Text', 'متن')],
    },
  },
  {
    id: 'events',
    label: { en: 'Events', fa: 'رویدادها' },
    collection: {
      slug: 'events',
      name: { en: 'Events', fa: 'رویدادها' },
      itemName: { en: 'Event', fa: 'رویداد' },
      imageField: 'image',
      fields: [f('image', 'image', 'Image', 'تصویر'), f('starts_at', 'datetime', 'Starts', 'شروع'), f('location', 'text', 'Location', 'محل'), f('capacity', 'number', 'Seats', 'ظرفیت'), f('body', 'textarea', 'Description', 'توضیحات')],
      commerce: { capacityField: 'capacity' },
    },
  },
];

/* ---------- what the public API returns ---------- */

export interface PublicItem {
  id: string;
  collection: string;
  slug: string;
  title: { en: string; fa: string };
  /** Field values; images as { id, url }, galleries as lists of them, references as small items. */
  data: Record<string, unknown>;
  /** Main image URL (the table's image field). */
  imageUrl: string | null;
  /** Booking state when the table sells or counts seats. */
  availability?: {
    priceMinor: number | null;
    discountPercent: number;
    finalPriceMinor: number | null;
    currency: string;
    capacity: number | null;
    remaining: number | null;
    closed: boolean;
    /** Why it cannot be booked: full, or past the deadline. */
    reason: '' | 'full' | 'deadline';
    canBuy: boolean;
  };
}

export interface PublicCollection {
  id: string;
  slug: string;
  name: { en: string; fa: string };
  itemName: { en: string; fa: string };
  fields: CollectionField[];
  detailPage: string;
  imageField: string;
  requestType: string;
  commerce: { enabled: boolean; currency: string; maxPerOrder: number };
}
