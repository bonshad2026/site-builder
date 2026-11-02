import { z } from 'zod';
import { collectionInputSchema, PRODUCT_SOURCE, savedCardSchema, type CollectionInput } from './collections.js';
import { MODULES } from './constants.js';
import { localizedSchema, siteSettingsSchema } from './schemas.js';
import { footerSchema, headerSchema } from './siteOptions.js';

/**
 * Starters (the studio's own starting points, control DB `starters`) are self-contained packs:
 * the pages and tables they hold with everything those need (other tables they point to, the
 * page of each item, forms, shared box designs, photos in the studio's storage) and sample items.
 * Whatever was left out is listed in `needs`, so using the starter on a site says what is missing.
 */

type Lbl = { en: string; fa: string };

/** Pages and tables, and a site's header or footer (its settings). */
export const STARTER_KINDS = ['page', 'table', 'header', 'footer'] as const;
export type StarterKind = (typeof STARTER_KINDS)[number];
/** Name of a starter's group (one per starter; empty = no group). */
export const starterGroupSchema = z.string().trim().max(60).default('');

/** `main`: the page the starter is about (gets the slug and title chosen when it is used). */
export const STARTER_PAGE_ROLES = ['main', 'detail', 'linked'] as const;
export type StarterPageRole = (typeof STARTER_PAGE_ROLES)[number];

const requestTypeSchema = siteSettingsSchema.shape.requestTypes.removeDefault().element;
export type StarterForm = z.output<typeof requestTypeSchema>;

const sampleItemSchema = z.object({
  /** Its id on the site it came from; references between sample items use it. */
  ref: z.string().max(64),
  slug: z.string().max(80),
  title: localizedSchema,
  data: z.record(z.unknown()).default({}),
  status: z.enum(['draft', 'published']).default('published'),
});

/** A product row as sample data (the shop as a list source). */
const sampleProductSchema = z.record(z.unknown());

export const starterPackSchema = z.object({
  version: z.literal(2),
  pages: z
    .array(
      z.object({
        slug: z.string().max(64),
        title: localizedSchema,
        role: z.enum(STARTER_PAGE_ROLES).default('linked'),
        /** Checked with the page schema when the starter is used. */
        document: z.object({ schemaVersion: z.literal(1), sections: z.array(z.record(z.unknown())).max(60) }),
      }),
    )
    .max(20)
    .default([]),
  tables: z.array(collectionInputSchema).max(20).default([]),
  forms: z.array(requestTypeSchema).max(30).default([]),
  cardDesigns: z.array(savedCardSchema).max(40).default([]),
  /** Sample items per table slug, and sample products. */
  samples: z
    .object({
      items: z.record(z.array(sampleItemSchema).max(100)).default({}),
      products: z.array(sampleProductSchema).max(48).default([]),
      categories: z.array(z.object({ slug: z.string().max(64), label: localizedSchema })).max(40).default([]),
    })
    .default({}),
  /** Header and footer starters: the site settings they set. */
  site: z.object({ header: headerSchema.optional(), footer: footerSchema.optional() }).default({}),
  /** Modules the pages use (shop, services, orders…). */
  modules: z.array(z.enum(MODULES)).default([]),
  /** What the pack uses but does not hold: the site must have these (or they are skipped). */
  needs: z
    .object({
      pages: z.array(z.object({ slug: z.string().max(64), title: localizedSchema })).max(60).default([]),
      tables: z.array(z.object({ slug: z.string().max(40), name: localizedSchema })).max(40).default([]),
      forms: z.array(z.object({ slug: z.string().max(40), label: localizedSchema })).max(30).default([]),
    })
    .default({}),
  /**
   * Photos copied into the studio's storage: `id` is the photo's id on the source site (item
   * fields and product images hold it), `url` the copy's address (page texts hold it).
   */
  photos: z.array(z.object({ id: z.string().max(64), key: z.string().max(200), contentType: z.string().max(80), url: z.string().max(1000) })).max(300).default([]),
});
export type StarterPack = z.output<typeof starterPackSchema>;
export type StarterPackInput = z.input<typeof starterPackSchema>;

/** A starter's pack; starters saved before packs (a page document, or one table) are converted. */
export function readStarterPack(kind: StarterKind, data: unknown): StarterPack {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.version === 2 || kind === 'header' || kind === 'footer') return starterPackSchema.parse({ version: 2, ...d });
  if (kind === 'page') return starterPackSchema.parse({ version: 2, pages: [{ slug: '', title: { en: '', fa: '' }, role: 'main', document: d.document ?? { schemaVersion: 1, sections: [] } }] });
  return starterPackSchema.parse({ version: 2, tables: [d] });
}

/** Short counts for lists of starters. */
export function packSummary(pack: StarterPack) {
  return {
    pages: pack.pages.length,
    sections: pack.pages.find((p) => p.role === 'main')?.document.sections.length ?? 0,
    tables: pack.tables.length,
    items: Object.values(pack.samples.items).reduce((n, list) => n + list.length, 0) + pack.samples.products.length,
    forms: pack.forms.length,
    photos: pack.photos.length,
    needs: pack.needs.pages.length + pack.needs.tables.length + pack.needs.forms.length,
  };
}

/* ---------- what pages and tables use ---------- */

export interface PackUses {
  /** Table slugs (not `products`). */
  tables: Set<string>;
  forms: Set<string>;
  /** Page slugs from internal links (`/about`, `/courses/x` → `courses`). */
  links: Set<string>;
  cardDesigns: Set<string>;
  modules: Set<(typeof MODULES)[number]>;
}

export const emptyUses = (): PackUses => ({ tables: new Set(), forms: new Set(), links: new Set(), cardDesigns: new Set(), modules: new Set() });

/** Built-in addresses and the modules they need. */
const BUILT_IN_PATHS: Record<string, (typeof MODULES)[number][]> = {
  products: ['products'],
  product: ['products'],
  services: ['services'],
  service: ['services'],
  cart: ['products', 'orders'],
  checkout: ['products', 'orders'],
};
const SYSTEM_SECTION_MODULES: Record<string, (typeof MODULES)[number][]> = {
  products: ['products'],
  productDetail: ['products'],
  services: ['services'],
  serviceDetail: ['services'],
  cart: ['products', 'orders'],
  checkout: ['products', 'orders'],
  checkoutResult: ['products', 'orders'],
};

/** The first path segment of an internal link, or null. */
export function linkSlug(href: string): string | null {
  const m = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:[/?#]|$)/.exec(href);
  return m ? m[1] : null;
}

/** Walks any JSON value with the key each value sits under. */
function walk(value: unknown, visit: (key: string, value: unknown, parent: Record<string, unknown>) => void, key = '', parent: Record<string, unknown> = {}) {
  if (Array.isArray(value)) value.forEach((v) => walk(v, visit, key, parent));
  else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      visit(k, v, obj);
      walk(v, visit, k, obj);
    }
  }
}

/** What a page document uses: tables, forms, other pages, box designs and modules. */
export function documentUses(document: unknown, into: PackUses = emptyUses()): PackUses {
  const sections = ((document as { sections?: { type?: string; props?: Record<string, unknown> }[] })?.sections ?? []) as { type?: string; props?: Record<string, unknown> }[];
  for (const s of sections) {
    const props = s.props ?? {};
    if (s.type === 'collection-list' || s.type === 'collection-item') {
      const source = typeof props.source === 'string' ? props.source : '';
      if (source === PRODUCT_SOURCE) into.modules.add('products');
      else if (source) into.tables.add(source);
    }
    if (s.type === 'products') into.modules.add('products');
    if (s.type === 'services') into.modules.add('services');
    if (s.type === 'system-page' && typeof props.page === 'string') SYSTEM_SECTION_MODULES[props.page]?.forEach((m) => into.modules.add(m));
    if (s.type === 'contact-form') into.modules.add('leads');
    walkUses(props, into);
  }
  return into;
}

/** Links, forms, designs and "add to cart" anywhere in a value (section props, box designs). */
function walkUses(value: unknown, into: PackUses) {
  walk(value, (key, v, parent) => {
    if (typeof v !== 'string' || !v) return;
    if (key === 'requestType') into.forms.add(v);
    else if (key === 'cardDesign') into.cardDesigns.add(v);
    else if (key === 'href') {
      const slug = linkSlug(v);
      if (!slug) return;
      if (BUILT_IN_PATHS[slug]) BUILT_IN_PATHS[slug].forEach((m) => into.modules.add(m));
      else into.links.add(slug);
      const item = /[?&]item=([a-z0-9-]+)\//.exec(v);
      if (item) into.tables.add(item[1]);
    } else if (key === 'action' && v === 'cart' && !('source' in parent && parent.source === 'field')) into.modules.add('orders');
  });
}

/** What a table uses: tables it points to, its item page, its request form and modules. */
export function tableUses(table: CollectionInput, into: PackUses = emptyUses()): PackUses {
  for (const f of table.fields) if (f.type === 'reference' && f.reference && f.reference !== table.slug) into.tables.add(f.reference);
  if (table.detailPage) into.links.add(table.detailPage);
  if (table.requestType) into.forms.add(table.requestType);
  if (table.commerce.enabled) into.modules.add('orders');
  return into;
}

/** What a header or footer uses (its buttons' and columns' links). */
export function siteChromeUses(site: StarterPack['site'], into: PackUses = emptyUses()): PackUses {
  walkUses(site, into);
  return into;
}

/** What a box design uses (its own buttons' forms and links). */
export function designUses(design: unknown, into: PackUses = emptyUses()): PackUses {
  walkUses(design, into);
  return into;
}

/* ---------- moving a pack to another site ---------- */

/** Slug changes when a pack is used: what it calls `x` is `y` on the site. */
export interface PackRenames {
  pages: Map<string, string>;
  tables: Map<string, string>;
  forms: Map<string, string>;
  cardDesigns: Map<string, string>;
  /** Photo addresses (studio copy → the site's copy). */
  urls: Map<string, string>;
}

function renameHref(href: string, r: PackRenames): string {
  const slug = linkSlug(href);
  let out = href;
  if (slug) {
    const to = r.pages.get(slug) ?? r.tables.get(slug);
    if (to !== undefined && to !== slug) out = `/${to}${href.slice(slug.length + 1)}`;
  }
  return out.replace(/([?&]item=)([a-z0-9-]+)\//, (m, pre: string, table: string) => (r.tables.has(table) ? `${pre}${r.tables.get(table)}/` : m));
}

/** A copy of a value (page document, box design, table) with slugs and photo addresses changed. */
export function renameInPack<T>(value: T, r: PackRenames): T {
  const replaceUrls = (s: string) => {
    let out = s;
    for (const [from, to] of r.urls) if (out.includes(from)) out = out.split(from).join(to);
    return out;
  };
  const visit = (v: unknown, key: string): unknown => {
    if (Array.isArray(v)) return v.map((x) => visit(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, visit(x, k)]));
    if (typeof v !== 'string') return v;
    if (key === 'href') return replaceUrls(renameHref(v, r));
    if (key === 'requestType') return r.forms.get(v) ?? v;
    if (key === 'cardDesign') return r.cardDesigns.get(v) ?? v;
    // Box blocks also have `source` (static / field), which is never a table slug.
    if (key === 'source' && v !== 'static' && v !== 'field') return r.tables.get(v) ?? v;
    if (key === 'reference') return r.tables.get(v) ?? v;
    if (key === 'detailPage') return r.pages.get(v) ?? v;
    return replaceUrls(v);
  };
  return visit(value, '') as T;
}

/* ---------- check and apply ---------- */

export const STARTER_ACTIONS = ['create', 'use', 'skip'] as const;
export type StarterAction = (typeof STARTER_ACTIONS)[number];

/** One choice per thing the pack holds or needs: make it (with this slug), use the site's (this slug), or leave it out. */
export const starterChoiceSchema = z.object({ action: z.enum(STARTER_ACTIONS), slug: z.string().max(64).default('') });
export type StarterChoice = z.output<typeof starterChoiceSchema>;

export const starterApplySchema = z.object({
  /** The main page's address and title (packs that have one). */
  page: z.object({ slug: z.string().max(64), title: localizedSchema }).optional(),
  pages: z.record(starterChoiceSchema).default({}),
  tables: z.record(starterChoiceSchema.extend({ addFields: z.boolean().default(true) })).default({}),
  forms: z.record(starterChoiceSchema).default({}),
  /** Turn on the modules the pack needs. */
  modules: z.boolean().default(true),
  samples: z.boolean().default(true),
});
export type StarterApply = z.output<typeof starterApplySchema>;

/** How each thing of a pack stands on a site (`GET …/starters/:id/check`). */
export interface StarterCheckRow {
  slug: string;
  label: Lbl;
  /** In the pack (can be made) or only needed. */
  held: boolean;
  /** `exists`: the site has one with this slug; `differs`: it has, but lacks some fields. */
  state: 'missing' | 'exists' | 'differs';
  missingFields?: string[];
  items?: number;
  suggested: StarterChoice;
}
export interface StarterCheck {
  mainPage: { title: Lbl; sections: number } | null;
  pages: StarterCheckRow[];
  tables: StarterCheckRow[];
  forms: StarterCheckRow[];
  /** Modules the pack needs that are off on the site. */
  modules: (typeof MODULES)[number][];
  samples: { items: number; products: number };
  /** The site's own, to choose from for "use". */
  site: { pages: { slug: string; title: Lbl }[]; tables: { slug: string; name: Lbl }[]; forms: { slug: string; label: Lbl }[] };
}

/* ---------- saving ---------- */

/** What to put in a new starter: pages and tables (slugs) chosen, plus what to leave out. */
export const starterSelectionSchema = z.object({
  pages: z.array(z.string().max(64)).max(20).default([]),
  tables: z.array(z.string().max(40)).max(20).default([]),
  /** Things found automatically (tables, item pages) that should not go in. */
  skip: z.object({ pages: z.array(z.string().max(64)).max(60).default([]), tables: z.array(z.string().max(40)).max(40).default([]) }).default({}),
  samples: z.boolean().default(true),
});
export type StarterSelection = z.output<typeof starterSelectionSchema>;

export const starterSaveSchema = starterSelectionSchema.extend({
  kind: z.enum(STARTER_KINDS),
  group: starterGroupSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(''),
  /** Replace this starter's contents instead of making a new one. */
  replace: z.string().uuid().optional(),
});

/** Why a page or table is in a pack (or offered). */
export type StarterReason = 'chosen' | 'table' | 'detail' | 'reference' | 'link';

/** The answer of `POST …/starters/scan`: what would go in, and what is offered or left out. */
export interface StarterScan {
  pages: { slug: string; title: Lbl; reason: StarterReason; included: boolean; system: boolean }[];
  tables: { slug: string; name: Lbl; reason: StarterReason; included: boolean; items: number }[];
  forms: { slug: string; label: Lbl; found: boolean }[];
  modules: (typeof MODULES)[number][];
  /** Links to pages the site does not have. */
  missing: string[];
  samples: { items: number; products: number };
  photos: number;
}
