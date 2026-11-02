import { randomUUID } from 'node:crypto';
import {
  collectionInputSchema,
  designUses,
  documentUses,
  emptyUses,
  pageDocumentSchema,
  renameInPack,
  siteChromeUses,
  starterPackSchema,
  tableUses,
  type Collection,
  type CollectionInput,
  type PackRenames,
  type PackUses,
  type SavedCard,
  type StarterApply,
  type StarterCheck,
  type StarterCheckRow,
  type StarterChoice,
  type StarterForm,
  type StarterKind,
  type StarterPack,
  type StarterReason,
  type StarterScan,
  type StarterSelection,
} from '@site-builder/shared';
import type pg from 'pg';
import { badRequest, conflict, fromPgError } from '../../common/errors.js';
import { buildInsert, selectList } from '../../common/sql.js';
import type { AppContext } from '../../context.js';
import { withTransaction } from '../../database/tenant/pools.js';
import { BANK_STORAGE_ID } from '../bank/bank.service.js';
import { productsTable } from '../catalog/catalog.js';
import { loadCollections } from '../collections/collections.service.js';

/**
 * Starter packs (see `packages/shared/src/starters.ts`): built from a site's pages and tables
 * with everything they use, photos copied into the studio's storage; checked against a site and
 * applied to it in one transaction, with slugs mapped to what the site has.
 */

type Db = pg.Pool | pg.PoolClient;
type L = { en: string; fa: string };
type Settings = Record<string, unknown> & {
  header?: unknown;
  footer?: unknown;
  requestTypes?: StarterForm[];
  cardDesigns?: SavedCard[];
  modules?: Record<string, boolean>;
  productCategories?: { slug: string; label: L }[];
};

interface SitePage {
  id: string;
  slug: string;
  title: L;
  document: unknown;
}
interface Site {
  pages: SitePage[];
  tables: Collection[];
  settings: Settings;
}

/** Sample items and products kept per table. */
const MAX_ITEMS = 100;
const MAX_PRODUCTS = 48;
/** A storage key inside any text (photo addresses in pages, boxes and forms). */
const KEY_IN_TEXT = /public\/tenants\/[0-9a-f-]{36}\/\d{4}\/\d{2}\/([0-9a-f-]{36})\.([a-z0-9]{2,5})/g;
const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf' };

async function loadSite(db: Db): Promise<Site> {
  const pages = (await db.query<SitePage>('SELECT id, slug, title, draft AS document FROM pages ORDER BY position, created_at')).rows;
  const tables = await loadCollections(db);
  const settings = ((await db.query('SELECT settings FROM site_settings WHERE id = 1')).rows[0]?.settings ?? {}) as Settings;
  return { pages, tables, settings };
}

const tableDef = (t: Collection): CollectionInput => {
  const { id: _id, ...rest } = t;
  return collectionInputSchema.parse(rest);
};
const merge = (into: PackUses, from: PackUses) => {
  for (const k of ['tables', 'forms', 'links', 'cardDesigns', 'modules'] as const) (from[k] as Set<string>).forEach((v) => (into[k] as Set<string>).add(v));
};
const lbl = (slug: string): L => ({ en: slug, fa: slug });
/** JSON text with keys sorted (jsonb does not keep their order). */
const canonical = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v);

/* ---------- what goes in ---------- */

interface Resolved {
  main: string;
  pages: Map<string, StarterReason>;
  tables: Map<string, StarterReason>;
  /** Found but left out (offered pages, skipped tables and item pages). */
  offeredPages: Map<string, StarterReason>;
  offeredTables: Map<string, StarterReason>;
  designs: SavedCard[];
  uses: PackUses;
  /** Links to pages the site does not have. */
  missing: Set<string>;
}

/**
 * The chosen pages and tables plus, automatically, the tables they show or point to and each
 * table's item page; other linked pages are only offered. Anything in `skip` stays out.
 */
function resolve(site: Site, sel: StarterSelection, kind: StarterKind): Resolved {
  const pageBySlug = new Map(site.pages.map((p) => [p.slug, p]));
  const tableBySlug = new Map(site.tables.map((t) => [t.slug, t]));
  const skipPages = new Set(sel.skip.pages);
  const skipTables = new Set(sel.skip.tables);
  const main = kind === 'page' ? (sel.pages[0] ?? '') : (sel.tables[0] ?? '');
  const r: Resolved = { main, pages: new Map(), tables: new Map(), offeredPages: new Map(), offeredTables: new Map(), designs: [], uses: emptyUses(), missing: new Set() };
  sel.pages.forEach((s, i) => pageBySlug.has(s) && r.pages.set(s, i === 0 && kind === 'page' ? 'chosen' : 'link'));
  sel.tables.forEach((s) => tableBySlug.has(s) && r.tables.set(s, 'chosen'));
  if (kind === 'page' && !r.pages.has(main)) throw badRequest('Choose a page of this site');
  if (kind === 'table' && !r.tables.has(main)) throw badRequest('Choose a table of this site');
  // A header or footer: the pages its links open are offered.
  const chrome = kind === 'header' || kind === 'footer' ? siteChromeUses({ [kind]: site.settings[kind] }) : null;

  const addTable = (slug: string, why: StarterReason) => {
    if (r.tables.has(slug)) return false;
    if (!tableBySlug.has(slug) || skipTables.has(slug)) {
      if (tableBySlug.has(slug)) r.offeredTables.set(slug, why);
      return false;
    }
    r.tables.set(slug, why);
    return true;
  };
  const addPage = (slug: string, why: StarterReason) => {
    if (r.pages.has(slug)) return false;
    if (!pageBySlug.has(slug)) {
      if (!tableBySlug.has(slug)) r.missing.add(slug);
      return false;
    }
    if (why === 'link' || skipPages.has(slug)) {
      if (!r.offeredPages.has(slug) || why === 'detail') r.offeredPages.set(slug, why);
      return false;
    }
    r.pages.set(slug, why);
    return true;
  };
  const designs = new Map<string, SavedCard>();
  const useDesign = (id: string) => {
    const d = (site.settings.cardDesigns ?? []).find((x) => x.id === id);
    if (d && !designs.has(id)) designs.set(id, d);
  };

  // Repeats until nothing new comes in (a table's item page may show other tables…).
  for (let changed = true, rounds = 0; changed && rounds < 20; rounds++) {
    changed = false;
    // Tables shown by pages and boxes, and tables pointed to by tables.
    const shown = emptyUses();
    const pointed = emptyUses();
    for (const slug of r.pages.keys()) documentUses(pageBySlug.get(slug)!.document, shown);
    for (const slug of r.tables.keys()) {
      tableUses(tableDef(tableBySlug.get(slug)!), pointed);
      for (const d of site.settings.cardDesigns ?? []) if (d.source === slug) useDesign(d.id);
    }
    shown.cardDesigns.forEach(useDesign);
    for (const d of designs.values()) {
      designUses(d.design, shown);
      if (d.source && d.source !== 'products') shown.tables.add(d.source);
    }
    for (const t of shown.tables) changed = addTable(t, 'table') || changed;
    for (const t of pointed.tables) changed = addTable(t, 'reference') || changed;
    const uses = emptyUses();
    merge(uses, shown);
    merge(uses, pointed);
    if (chrome) merge(uses, chrome);
    for (const slug of r.tables.keys()) {
      const page = tableBySlug.get(slug)!.detailPage;
      if (page) changed = addPage(page, 'detail') || changed;
    }
    for (const link of uses.links) {
      // A link to an item (/courses/x) is a use of that table.
      if (tableBySlug.has(link) && !pageBySlug.has(link)) changed = addTable(link, 'table') || changed;
      else addPage(link, 'link');
    }
    r.uses = uses;
  }
  for (const s of r.pages.keys()) r.offeredPages.delete(s);
  for (const s of r.tables.keys()) r.offeredTables.delete(s);
  r.designs = [...designs.values()];
  return r;
}

const tableItemCounts = async (db: Db, ids: string[]) =>
  new Map((await db.query<{ id: string; n: number }>('SELECT collection_id AS id, count(*)::int AS n FROM collection_items WHERE collection_id = ANY($1::uuid[]) GROUP BY 1', [ids])).rows.map((x) => [x.id, x.n]));

/** What a starter made from this selection would hold (the save dialog). */
export async function scanSelection(db: Db, sel: StarterSelection, kind: StarterKind): Promise<StarterScan> {
  const site = await loadSite(db);
  const r = resolve(site, sel, kind);
  const pageBySlug = new Map(site.pages.map((p) => [p.slug, p]));
  const tableBySlug = new Map(site.tables.map((t) => [t.slug, t]));
  const counts = await tableItemCounts(db, site.tables.map((t) => t.id));
  const system = new Set(['products', 'product', 'services', 'service', 'cart', 'checkout', 'checkout-result', 'account', 'track', 'not-found']);
  const page = (slug: string, reason: StarterReason, included: boolean) => ({ slug, title: pageBySlug.get(slug)!.title, reason, included, system: system.has(slug) });
  const table = (slug: string, reason: StarterReason, included: boolean) => ({ slug, name: tableBySlug.get(slug)!.name, reason, included, items: counts.get(tableBySlug.get(slug)!.id) ?? 0 });
  const forms = [...r.uses.forms].map((slug) => {
    const f = (site.settings.requestTypes ?? []).find((x) => x.slug === slug);
    return { slug, label: f?.label ?? lbl(slug), found: !!f };
  });
  const products = r.uses.modules.has('products') ? Number((await db.query(`SELECT count(*)::int AS n FROM products WHERE status = 'published'`)).rows[0].n) : 0;
  const scan: StarterScan = {
    pages: [...[...r.pages].map(([s, why]) => page(s, why, true)), ...[...r.offeredPages].map(([s, why]) => page(s, why, false))],
    tables: [...[...r.tables].map(([s, why]) => table(s, why, true)), ...[...r.offeredTables].map(([s, why]) => table(s, why, false))],
    forms,
    modules: [...r.uses.modules],
    missing: [...r.missing],
    samples: { items: [...r.tables.keys()].reduce((n, s) => n + Math.min(MAX_ITEMS, counts.get(tableBySlug.get(s)!.id) ?? 0), 0), products: Math.min(products, MAX_PRODUCTS) },
    // Photos in the pages and boxes (item and product photos come on top).
    photos: new Set([...JSON.stringify([[...r.pages.keys()].map((s) => pageBySlug.get(s)!.document), r.designs]).matchAll(KEY_IN_TEXT)].map((m) => m[0])).size,
  };
  return scan;
}

/* ---------- saving ---------- */

interface PhotoCopy {
  id: string;
  key: string;
  contentType: string;
  url: string;
}

/** Copies a file into the studio's storage (the bank's folder), or null when it cannot be read. */
async function copyToStudio(ctx: AppContext, key: string, contentType: string): Promise<{ key: string; contentType: string } | null> {
  try {
    const body = await ctx.storage.get(key);
    const ext = key.split('.').pop()!;
    const now = new Date();
    const to = `public/tenants/${BANK_STORAGE_ID}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
    await ctx.storage.put(to, body, contentType);
    return { key: to, contentType };
  } catch {
    return null;
  }
}

/** Builds a pack from a site: definitions, sample items and copies of every photo they show. */
export async function buildPack(ctx: AppContext, db: Db, sel: StarterSelection, kind: StarterKind): Promise<StarterPack> {
  const site = await loadSite(db);
  const r = resolve(site, sel, kind);
  const pageBySlug = new Map(site.pages.map((p) => [p.slug, p]));
  const tableBySlug = new Map(site.tables.map((t) => [t.slug, t]));

  const tables = [...r.tables.keys()].map((s) => tableDef(tableBySlug.get(s)!));
  const pages = [...r.pages].map(([slug, why]) => ({
    slug,
    title: pageBySlug.get(slug)!.title,
    role: slug === r.main && kind === 'page' ? ('main' as const) : why === 'detail' ? ('detail' as const) : ('linked' as const),
    document: pageBySlug.get(slug)!.document as StarterPack['pages'][number]['document'],
  }));
  const forms = (site.settings.requestTypes ?? []).filter((f) => r.uses.forms.has(f.slug));
  const needs = {
    pages: [...r.offeredPages.keys()].map((slug) => ({ slug, title: pageBySlug.get(slug)!.title })).concat([...r.missing].map((slug) => ({ slug, title: lbl(slug) }))),
    tables: [...r.offeredTables.keys()].map((slug) => ({ slug, name: tableBySlug.get(slug)!.name })),
    forms: [...r.uses.forms].filter((s) => !forms.some((f) => f.slug === s)).map((slug) => ({ slug, label: lbl(slug) })),
  };

  /* sample items and products */
  const items: Record<string, { ref: string; slug: string; title: L; data: Record<string, unknown>; status: 'draft' | 'published' }[]> = {};
  let products: Record<string, unknown>[] = [];
  let categories: { slug: string; label: L }[] = [];
  const assetIds = new Set<string>();
  const strings = (v: unknown) => (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && !!x);
  if (sel.samples) {
    for (const t of r.tables.keys()) {
      const table = tableBySlug.get(t)!;
      const { rows } = await db.query('SELECT id AS ref, slug, title, data, status FROM collection_items WHERE collection_id = $1 ORDER BY position, created_at LIMIT $2', [table.id, MAX_ITEMS]);
      items[t] = rows;
      const images = table.fields.filter((f) => f.type === 'image' || f.type === 'gallery');
      for (const row of rows) for (const f of images) strings(row.data[f.key]).forEach((id) => assetIds.add(id));
    }
    if (r.uses.modules.has('products')) {
      const { rows } = await db.query(`SELECT ${selectList(productsTable)} FROM products WHERE status = 'published' ORDER BY featured DESC, position, created_at LIMIT $1`, [MAX_PRODUCTS]);
      products = rows.map(({ id: _i, createdAt: _c, updatedAt: _u, ...p }) => p);
      for (const p of products) [...strings(p.imageAssetId), ...strings(p.images)].forEach((id) => assetIds.add(id));
      const used = new Set(products.map((p) => p.category));
      categories = (site.settings.productCategories ?? []).filter((c) => used.has(c.slug));
    }
  }

  /* photos: assets by id (items, products) and storage keys in texts (pages, boxes, forms) */
  const photos: PhotoCopy[] = [];
  const keyMap = new Map<string, string>();
  const known = assetIds.size ? (await db.query<{ id: string; storage_key: string; content_type: string }>('SELECT id, storage_key, content_type FROM assets WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL', [[...assetIds]])).rows : [];
  for (const a of known) {
    const copy = await copyToStudio(ctx, a.storage_key, a.content_type);
    if (!copy) continue;
    photos.push({ id: a.id, ...copy, url: ctx.storage.publicUrl(copy.key) });
    keyMap.set(a.storage_key, copy.key);
  }
  const chrome = kind === 'header' || kind === 'footer' ? { [kind]: site.settings[kind] ?? {} } : {};
  const texts = JSON.stringify([pages, r.designs, forms, tables, chrome]);
  for (const m of texts.matchAll(KEY_IN_TEXT)) {
    const key = m[0];
    if (keyMap.has(key)) continue;
    const row = (await db.query<{ id: string; content_type: string }>('SELECT id, content_type FROM assets WHERE storage_key = $1', [key])).rows[0];
    const copy = await copyToStudio(ctx, key, row?.content_type ?? TYPES[m[2]] ?? 'application/octet-stream');
    if (!copy) continue;
    keyMap.set(key, copy.key);
    photos.push({ id: row?.id ?? m[1], ...copy, url: ctx.storage.publicUrl(copy.key) });
  }
  const renames: PackRenames = { pages: new Map(), tables: new Map(), forms: new Map(), cardDesigns: new Map(), urls: keyMap };

  return starterPackSchema.parse({
    version: 2,
    pages: renameInPack(pages, renames),
    tables: renameInPack(tables, renames),
    forms: renameInPack(forms, renames),
    cardDesigns: renameInPack(r.designs, renames),
    site: renameInPack(chrome, renames),
    samples: { items, products, categories },
    modules: [...r.uses.modules],
    needs,
    photos,
  });
}

/** Removes a pack's photo copies from the studio's storage, except those another starter still uses (ready-made ones share theirs). */
export async function deletePackPhotos(ctx: AppContext, pack: StarterPack | null) {
  for (const p of pack?.photos ?? []) {
    const used = await ctx.control.query('SELECT 1 FROM starters WHERE strpos(data::text, $1) > 0 LIMIT 1', [p.key]);
    if (!used.rowCount) await ctx.storage.delete(p.key).catch(() => {});
  }
}

/* ---------- checking a site ---------- */

const missingFields = (have: Collection, want: CollectionInput) => want.fields.filter((f) => !have.fields.some((x) => x.key === f.key)).map((f) => f.key);

/** How the pack stands on this site, with a suggested choice for each row. */
export async function checkPack(db: Db, pack: StarterPack): Promise<StarterCheck> {
  const site = await loadSite(db);
  const pageSlugs = new Set(site.pages.map((p) => p.slug));
  const forms = site.settings.requestTypes ?? [];
  const choice = (action: StarterChoice['action'], slug: string): StarterChoice => ({ action, slug });

  const pages: StarterCheckRow[] = [
    ...pack.pages
      .filter((p) => p.role !== 'main')
      .map((p) => {
        const exists = pageSlugs.has(p.slug);
        return { slug: p.slug, label: p.title, held: true, state: exists ? ('exists' as const) : ('missing' as const), suggested: choice(exists ? 'use' : 'create', p.slug) };
      }),
    ...pack.needs.pages.map((p) => {
      const exists = pageSlugs.has(p.slug);
      return { slug: p.slug, label: p.title, held: false, state: exists ? ('exists' as const) : ('missing' as const), suggested: choice(exists ? 'use' : 'skip', exists ? p.slug : '') };
    }),
  ];
  const tables: StarterCheckRow[] = [
    ...pack.tables.map((t) => {
      const have = site.tables.find((x) => x.slug === t.slug);
      const missing = have ? missingFields(have, t) : [];
      return {
        slug: t.slug,
        label: t.name,
        held: true,
        state: !have ? ('missing' as const) : missing.length ? ('differs' as const) : ('exists' as const),
        missingFields: missing,
        items: pack.samples.items[t.slug]?.length ?? 0,
        suggested: choice(have ? 'use' : 'create', t.slug),
      };
    }),
    ...pack.needs.tables.map((t) => {
      const exists = site.tables.some((x) => x.slug === t.slug);
      return { slug: t.slug, label: t.name, held: false, state: exists ? ('exists' as const) : ('missing' as const), suggested: choice(exists ? 'use' : 'skip', exists ? t.slug : '') };
    }),
  ];
  const formRows: StarterCheckRow[] = [
    ...pack.forms.map((f) => {
      const exists = forms.some((x) => x.slug === f.slug);
      return { slug: f.slug, label: f.label, held: true, state: exists ? ('exists' as const) : ('missing' as const), suggested: choice(exists ? 'use' : 'create', f.slug) };
    }),
    ...pack.needs.forms.map((f) => {
      const exists = forms.some((x) => x.slug === f.slug);
      return { slug: f.slug, label: f.label, held: false, state: exists ? ('exists' as const) : ('missing' as const), suggested: choice(exists ? 'use' : 'skip', exists ? f.slug : '') };
    }),
  ];
  const main = pack.pages.find((p) => p.role === 'main');
  return {
    mainPage: main ? { title: main.title, sections: main.document.sections.length } : null,
    pages,
    tables,
    forms: formRows,
    modules: pack.modules.filter((m) => site.settings.modules?.[m] !== true),
    samples: { items: Object.values(pack.samples.items).reduce((n, l) => n + l.length, 0), products: pack.samples.products.length },
    site: {
      pages: site.pages.map((p) => ({ slug: p.slug, title: p.title })),
      tables: site.tables.map((t) => ({ slug: t.slug, name: t.name })),
      forms: forms.map((f) => ({ slug: f.slug, label: f.label })),
    },
  };
}

/* ---------- using a pack ---------- */

export interface ApplyResult {
  pageId: string | null;
  pages: number;
  tables: number;
  forms: number;
  items: number;
  products: number;
  photos: number;
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw fromPgError(err) ?? err;
  }
}

/**
 * Puts a pack into a site: photos copied in, then in one transaction the forms, box designs,
 * modules, tables (made or extended), pages (the main one as a draft, the others published)
 * and the sample items and products (marked as demo).
 */
export async function applyPack(ctx: AppContext, tenantId: string, db: pg.Pool, pack: StarterPack, body: StarterApply): Promise<ApplyResult> {
  const check = await checkPack(db, pack);
  const pick = (rows: StarterCheckRow[], given: Record<string, StarterChoice>) =>
    new Map(rows.map((row) => {
      const c = given[row.slug] ?? row.suggested;
      // Only what the pack holds can be made.
      const action = c.action === 'create' && !row.held ? 'skip' : c.action;
      return [row.slug, { ...c, action, slug: c.slug || row.slug }] as const;
    }));
  const pageChoice = pick(check.pages, body.pages);
  const tableChoice = pick(check.tables, body.tables);
  const formChoice = pick(check.forms, body.forms);
  const main = pack.pages.find((p) => p.role === 'main');
  if (main && !body.page) throw badRequest('Choose the address and title of the new page');
  const site = await loadSite(db);
  const pageSlugs = new Set(site.pages.map((p) => p.slug));
  if (main && pageSlugs.has(body.page!.slug)) throw conflict('A page with this address already exists');
  for (const [slug, c] of pageChoice) {
    if (c.action === 'create' && pageSlugs.has(c.slug)) throw conflict(`A page with the address /${c.slug} already exists (${slug})`);
    if (c.action === 'use' && !pageSlugs.has(c.slug)) throw badRequest(`The site has no page /${c.slug}`);
  }
  for (const [, c] of tableChoice) {
    if (c.action === 'create' && site.tables.some((t) => t.slug === c.slug)) throw conflict(`A table with the address ${c.slug} already exists`);
    if (c.action === 'use' && !site.tables.some((t) => t.slug === c.slug)) throw badRequest(`The site has no table ${c.slug}`);
  }

  /* renames: what the pack calls x is y here */
  const renames: PackRenames = { pages: new Map(), tables: new Map(), forms: new Map(), cardDesigns: new Map(), urls: new Map() };
  if (main?.slug && body.page) renames.pages.set(main.slug, body.page.slug);
  for (const [slug, c] of pageChoice) if (c.action !== 'skip') renames.pages.set(slug, c.slug);
  for (const [slug, c] of tableChoice) if (c.action !== 'skip') renames.tables.set(slug, c.slug);
  for (const [slug, c] of formChoice) if (c.action !== 'skip') renames.forms.set(slug, c.slug);

  /* photos: copied in before the transaction (files are not part of it) */
  const assetMap = new Map<string, string>();
  const assets: { id: string; key: string; contentType: string; size: number; from: string }[] = [];
  for (const p of pack.photos) {
    try {
      const body = await ctx.storage.get(p.key);
      const id = randomUUID();
      const now = new Date();
      const key = `public/tenants/${tenantId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${p.key.split('.').pop()}`;
      await ctx.storage.put(key, body, p.contentType);
      assets.push({ id, key, contentType: p.contentType, size: body.length, from: p.id });
      assetMap.set(p.id, id);
      renames.urls.set(p.key, key);
    } catch {
      // A photo the studio no longer has: its places stay empty.
    }
  }

  /* box designs: the same one is reused, a different one with the same id gets a new id */
  const designs = [...(site.settings.cardDesigns ?? [])];
  const designsToAdd: SavedCard[] = [];
  for (const d of pack.cardDesigns) {
    const moved = { ...renameInPack(d, renames), id: d.id };
    const same = designs.find((x) => x.id === d.id);
    if (same && canonical(same.design) === canonical(moved.design) && same.source === moved.source) continue;
    let id = d.id;
    for (let n = 2; designs.some((x) => x.id === id) || designsToAdd.some((x) => x.id === id); n++) id = `${d.id.slice(0, 36)}-${n}`;
    renames.cardDesigns.set(d.id, id);
    designsToAdd.push({ ...moved, id });
  }

  const result: ApplyResult = { pageId: null, pages: 0, tables: 0, forms: 0, items: 0, products: 0, photos: assets.length };
  try {
    await withTransaction(db, async (tx) => {
      for (const a of assets) {
        await tx.query(`INSERT INTO assets (id, storage_key, original_name, content_type, size_bytes, visibility, kind) VALUES ($1, $2, $3, $4, $5, 'public', $6)`, [
          a.id,
          a.key,
          `starter-${a.from}.${a.key.split('.').pop()}`.slice(0, 200),
          a.contentType,
          a.size,
          a.contentType.startsWith('image/') ? 'image' : 'document',
        ]);
      }

      /* settings: forms, designs, modules, product categories */
      const settings = { ...(((await tx.query('SELECT settings FROM site_settings WHERE id = 1 FOR UPDATE')).rows[0]?.settings ?? {}) as Settings) };
      const requestTypes = [...(settings.requestTypes ?? [])];
      for (const f of pack.forms) {
        const c = formChoice.get(f.slug);
        if (c?.action !== 'create') continue;
        if (requestTypes.some((x) => x.slug === c.slug)) throw conflict(`A form with the address ${c.slug} already exists`);
        requestTypes.push({ ...renameInPack(f, renames), slug: c.slug });
        result.forms++;
      }
      settings.requestTypes = requestTypes;
      settings.cardDesigns = [...designs, ...designsToAdd].slice(0, 40);
      // A header or footer starter replaces the site's own.
      for (const part of ['header', 'footer'] as const) if (pack.site[part]) settings[part] = renameInPack(pack.site[part], renames);
      if (body.modules && pack.modules.length) settings.modules = { ...(settings.modules ?? {}), ...Object.fromEntries(pack.modules.map((m) => [m, true])) };
      if (body.samples && pack.samples.products.length) {
        const cats = [...(settings.productCategories ?? [])];
        for (const c of pack.samples.categories) if (!cats.some((x) => x.slug === c.slug)) cats.push(c);
        settings.productCategories = cats.slice(0, 40);
      }
      await tx.query('UPDATE site_settings SET settings = $1, updated_at = now() WHERE id = 1', [settings]);

      /* tables: made, or the site's own extended with the fields it lacks */
      const position = Number((await tx.query('SELECT coalesce(max(position), -1) + 1 AS n FROM collections')).rows[0].n);
      for (const [i, t] of pack.tables.entries()) {
        const c = tableChoice.get(t.slug)!;
        if (c.action === 'skip') continue;
        const moved = collectionInputSchema.parse({ ...renameInPack(t, renames), slug: c.slug, position: position + i });
        if (c.action === 'create') {
          await run(() =>
            tx.query(
              `INSERT INTO collections (slug, name, item_name, fields, detail_page, image_field, commerce, request_type, position) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [moved.slug, moved.name, moved.itemName, JSON.stringify(moved.fields), moved.detailPage, moved.imageField, moved.commerce, moved.requestType, moved.position],
            ),
          );
          result.tables++;
        } else if ((body.tables[t.slug]?.addFields ?? true) !== false) {
          const have = site.tables.find((x) => x.slug === c.slug)!;
          const extra = moved.fields.filter((f) => !have.fields.some((x) => x.key === f.key));
          if (extra.length) await tx.query('UPDATE collections SET fields = $2, updated_at = now() WHERE id = $1', [have.id, JSON.stringify([...have.fields, ...extra].slice(0, 40))]);
        }
      }

      /* pages */
      const nextPosition = Number((await tx.query('SELECT coalesce(max(position), -1) + 1 AS n FROM pages')).rows[0].n);
      let n = 0;
      for (const p of pack.pages) {
        const isMain = p.role === 'main';
        const c = isMain ? null : pageChoice.get(p.slug)!;
        if (c && c.action !== 'create') continue;
        const parsed = pageDocumentSchema.safeParse(renameInPack(p.document, renames));
        if (!parsed.success) throw badRequest(`The starter's page /${p.slug || body.page?.slug} is not valid: ${parsed.error.issues[0]?.message ?? ''}`);
        const slug = isMain ? body.page!.slug : c!.slug;
        const title = isMain ? body.page!.title : p.title;
        if (isMain) {
          const { rows } = await run(() => tx.query('INSERT INTO pages (slug, title, position, seo, draft) VALUES ($1, $2, $3, $4, $5) RETURNING id', [slug, title, nextPosition + n++, {}, parsed.data]));
          result.pageId = rows[0].id;
        } else {
          // Pages the main one needs are published, so its links and items work at once.
          const { rows } = await run(() =>
            tx.query(
              `INSERT INTO pages (slug, title, position, seo, draft, published, published_title, published_seo, published_at, published_version)
               VALUES ($1, $2, $3, '{}', $4, $4, $2, '{}', now(), 1) RETURNING id`,
              [slug, title, nextPosition + n++, parsed.data],
            ),
          );
          await tx.query('INSERT INTO page_versions (page_id, version, document, title, seo) VALUES ($1, 1, $2, $3, $4)', [rows[0].id, parsed.data, title, {}]);
        }
        result.pages++;
      }

      if (!body.samples) return;

      /* sample items: photos and references moved to the new ids */
      const tables = await loadCollections(tx);
      const itemIds = new Map<string, string>();
      const pending: { id: string; table: Collection; refs: Record<string, unknown> }[] = [];
      for (const [packSlug, list] of Object.entries(pack.samples.items)) {
        const c = tableChoice.get(packSlug);
        const table = c && c.action !== 'skip' ? tables.find((t) => t.slug === c.slug) : undefined;
        if (!table) continue;
        for (const [i, item] of list.entries()) {
          const data: Record<string, unknown> = {};
          const refs: Record<string, unknown> = {};
          for (const f of table.fields) {
            const v = item.data[f.key];
            if (v === undefined) continue;
            if (f.type === 'image') data[f.key] = typeof v === 'string' ? (assetMap.get(v) ?? null) : null;
            else if (f.type === 'gallery') data[f.key] = (Array.isArray(v) ? v : []).flatMap((x) => (typeof x === 'string' && assetMap.has(x) ? [assetMap.get(x)!] : []));
            else if (f.type === 'reference') refs[f.key] = v;
            else data[f.key] = v;
          }
          const { rows } = await tx.query(
            `INSERT INTO collection_items (collection_id, slug, title, data, status, position, demo) VALUES ($1, $2, $3, $4, $5, $6, true)
             ON CONFLICT (collection_id, slug) DO NOTHING RETURNING id`,
            [table.id, item.slug, item.title, data, item.status, i],
          );
          if (!rows[0]) continue;
          itemIds.set(item.ref, rows[0].id);
          result.items++;
          if (Object.keys(refs).length) pending.push({ id: rows[0].id, table, refs });
        }
      }
      for (const p of pending) {
        const refs = Object.fromEntries(Object.entries(p.refs).map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).flatMap((x) => (typeof x === 'string' && itemIds.has(x) ? [itemIds.get(x)!] : []))]));
        await tx.query('UPDATE collection_items SET data = data || $2::jsonb WHERE id = $1', [p.id, JSON.stringify(refs)]);
      }

      /* sample products */
      for (const p of pack.samples.products) {
        const images = Array.isArray(p.images) ? p.images.flatMap((x) => (typeof x === 'string' && assetMap.has(x) ? [assetMap.get(x)!] : [])) : undefined;
        const row = { ...p, imageAssetId: typeof p.imageAssetId === 'string' ? (assetMap.get(p.imageAssetId) ?? null) : null, ...(images ? { images } : {}) };
        const { sql, values } = buildInsert(productsTable, row);
        const { rows } = await tx.query(sql.replace(/ RETURNING .*/s, ' ON CONFLICT (slug) DO NOTHING RETURNING id'), values);
        if (!rows[0]) continue;
        await tx.query('UPDATE products SET demo = true WHERE id = $1', [rows[0].id]);
        result.products++;
      }
    });
  } catch (err) {
    for (const a of assets) await ctx.storage.delete(a.key).catch(() => {});
    throw err;
  }
  return result;
}
