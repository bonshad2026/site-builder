import { z } from 'zod';

/**
 * Site kits (the content bank): per site type (cosmetics, furniture, a school…, plus "general"
 * for every type) the studio keeps copies of table starters with their sample items, plain lists
 * of products, services, reviews and FAQ, and photos. Sample data for a site is made from the kit
 * of its type: each table takes the items of the kit table with the same address (else the
 * general kit's), and fields without a value are made up from their type.
 */

type Lbl = { en: string; fa: string };
const L = (en: string, fa: string): Lbl => ({ en, fa });

/** Field types an entry can have; text and long text are written in both languages. */
export const BANK_FIELD_TYPES = ['text', 'textarea', 'number', 'price', 'date'] as const;
export type BankFieldType = (typeof BANK_FIELD_TYPES)[number];

export const bankKeySchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9_-]*$/, 'Use lowercase English letters, numbers, - and _');

export const bankFieldSchema = z.object({
  /** Same key as the table field it fills (title is the item's title). */
  key: z.string().min(1).max(40).regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase English letters, numbers and _'),
  label: z.object({ en: z.string().max(80).default(''), fa: z.string().max(80).default('') }),
  type: z.enum(BANK_FIELD_TYPES).default('text'),
});
export type BankField = z.output<typeof bankFieldSchema>;

export interface BankKind {
  key: string;
  label: Lbl;
  fields: BankField[];
  builtIn?: boolean;
}

const f = (key: string, type: BankFieldType, en: string, fa: string): BankField => ({ key, type, label: L(en, fa) });
const title = (en: string, fa: string) => f('title', 'text', en, fa);

/** The plain lists every kit has (tables come from table starters instead). */
export const BUILT_IN_KINDS: BankKind[] = [
  { key: 'product', label: L('Products', 'محصولات'), fields: [title('Name', 'نام'), f('description', 'textarea', 'Description', 'توضیحات'), f('category', 'text', 'Category', 'دسته'), f('price', 'price', 'Price', 'قیمت')] },
  { key: 'service', label: L('Services', 'خدمات'), fields: [title('Title', 'عنوان'), f('summary', 'textarea', 'Summary', 'خلاصه'), f('body', 'textarea', 'Description', 'توضیحات')] },
  { key: 'testimonial', label: L('Reviews', 'نظرات مشتریان'), fields: [title('Customer name', 'نام مشتری'), f('role', 'text', 'Role', 'عنوان'), f('quote', 'textarea', 'Review', 'متن نظر')] },
  { key: 'faq', label: L('FAQ', 'سؤالات متداول'), fields: [title('Question', 'سؤال'), f('answer', 'textarea', 'Answer', 'پاسخ')] },
].map((k) => ({ ...k, builtIn: true }));
export const BANK_KINDS = BUILT_IN_KINDS.map((k) => k.key);

/** The type every site can use; its entries mix in with any other type's. */
export const GENERAL_BANK_TYPE = 'general';

export const bankTypeInputSchema = z.object({ key: bankKeySchema, label: z.object({ en: z.string().trim().max(80).default(''), fa: z.string().trim().max(80).default('') }) });

/** A kit table's sample item, as in a starter pack (`ref` links references between items). */
export const kitItemSchema = z.object({
  ref: z.string().min(1).max(64),
  slug: z.string().max(80).default(''),
  title: z.object({ en: z.string().max(300).default(''), fa: z.string().max(300).default('') }),
  data: z.record(z.unknown()).default({}),
  status: z.enum(['draft', 'published']).default('published'),
});
export type KitItem = z.output<typeof kitItemSchema>;

const localized = z.object({ en: z.string().max(8000).default(''), fa: z.string().max(8000).default('') });
/** An entry: values by field key ({ en, fa } for texts, numbers otherwise) and its photos (bank photo ids). */
export const bankEntryInputSchema = z.object({
  type: bankKeySchema,
  kind: z.enum(['product', 'service', 'testimonial', 'faq']),
  data: z.record(z.string().max(40), z.union([localized, z.number(), z.string().max(40)])).default({}),
  photos: z.array(z.string().uuid()).max(12).default([]),
});
export type BankEntryInput = z.input<typeof bankEntryInputSchema>;

/** What a sample-data run makes for a site (see the "Sample data" window). */
export const demoRunSchema = z.object({
  /** Kit (site type) to take items, texts and photos from. */
  type: bankKeySchema.default(GENERAL_BANK_TYPE),
  /** `add` keeps earlier sample data; `replace` removes it first. */
  mode: z.enum(['add', 'replace']).default('add'),
  products: z.number().int().min(0).max(500).default(0),
  services: z.number().int().min(0).max(100).default(0),
  /** Kit tables to add to the site first (kit table ids), with their item pages and forms. */
  addTables: z.array(z.string().uuid()).max(20).default([]),
  /** Items per content table, by table slug. */
  tables: z.record(z.string().max(40), z.number().int().min(0).max(500)).default({}),
  customers: z.number().int().min(0).max(1000).default(0),
  orders: z.number().int().min(0).max(2000).default(0),
  payments: z.number().int().min(0).max(2000).default(0),
  requests: z.number().int().min(0).max(2000).default(0),
  months: z.number().int().min(1).max(36).default(6),
});
export type DemoRun = z.output<typeof demoRunSchema>;
