import { createHash, randomUUID } from 'node:crypto';
import { collectionInputSchema, GENERAL_BANK_TYPE, readStarterPack, type CollectionInput, type KitItem, type StarterPack } from '@site-builder/shared';
import type pg from 'pg';
import type { AppContext } from '../../context.js';
import { SITE_TEMPLATES, type L } from '../platform/templates/catalog.js';
import { templateImageStore, type StoredImage } from '../platform/templates/images.js';
import { FAQ, FIRST_NAMES, LAST_NAMES, ROLES, TESTIMONIALS } from '../platform/setup/pools.js';

/**
 * Site kits (see `packages/shared/src/bank.ts`): built-in texts and photos from the business
 * templates and word lists, plus the studio's own types, list entries, photos and kit tables
 * (copies of table starters) in the control database. Photos are files in the studio's storage
 * under a fixed "bank" folder.
 */

/** Bank photos live under this pseudo site id, so the usual storage keys and file routes apply. */
export const BANK_STORAGE_ID = '00000000-0000-4000-8000-000000000000';

/** A photo: a built-in template photo (`ref`, see images.ts) or a file uploaded to the bank. */
export type PhotoRef = { ref: string } | { key: string; contentType: string; id: string };
export type EntryValue = L | number | string;
export interface BankEntry {
  id: string | null;
  type: string;
  kind: string;
  data: Record<string, EntryValue>;
  photos: PhotoRef[];
  builtIn: boolean;
}

const Lx = (en: string, fa: string): L => ({ en, fa });

export async function listTypes(ctx: AppContext) {
  const { rows } = await ctx.control.query<{ key: string; label: L }>('SELECT key, label FROM bank_types ORDER BY created_at');
  return [
    { key: GENERAL_BANK_TYPE, label: Lx('General (every site)', 'عمومی (همه‌ی سایت‌ها)'), builtIn: true },
    ...SITE_TEMPLATES.map((t) => ({ key: t.key, label: t.label, builtIn: true })),
    ...rows.map((r) => ({ ...r, builtIn: false })),
  ];
}

/** Entries the code ships with, for a type and kind. */
/** A built-in entry's stable reference (it has no id): a hash of its texts. */
export const builtInRef = (e: Pick<BankEntry, 'data'>) => createHash('sha1').update(JSON.stringify(e.data)).digest('hex').slice(0, 16);

/** Built-in entries and photos the studio removed, as `type|kind|ref`. */
export async function hiddenBuiltIns(ctx: AppContext, types: string[]) {
  const { rows } = await ctx.control.query<{ type_key: string; kind: string; ref: string }>('SELECT type_key, kind, ref FROM bank_hidden WHERE type_key = ANY($1)', [types]);
  const set = new Set(rows.map((r) => `${r.type_key}|${r.kind}|${r.ref}`));
  return {
    entry: (e: BankEntry) => !set.has(`${e.type}|${e.kind}|${builtInRef(e)}`),
    photo: (type: string, p: PhotoRef) => !('ref' in p) || !set.has(`${type}||${p.ref}`),
  };
}

export function builtInEntries(type: string, kind: string): BankEntry[] {
  const entry = (data: Record<string, EntryValue>, photos: PhotoRef[] = []): BankEntry => ({ id: null, type, kind, data, photos, builtIn: true });
  const t = SITE_TEMPLATES.find((x) => x.key === type);
  if (t) {
    if (kind === 'product')
      return t.products.map((p) => entry({ title: p.name, description: p.description, category: t.categories.find((c) => c.slug === p.category)?.label ?? Lx(p.category, p.category), price: p.price }, [{ ref: p.image }]));
    if (kind === 'service') return t.features.map((x) => entry({ title: x.title, summary: x.text, body: x.text }, [{ ref: t.about.image }]));
    if (kind === 'testimonial') return t.testimonials.map((x) => entry({ title: x.name, role: x.role, quote: x.quote }));
    if (kind === 'faq') return t.faq.map((x) => entry({ title: x.question, answer: x.answer }));
    return [];
  }
  if (type !== GENERAL_BANK_TYPE) return [];
  const person = (i: number) => {
    const first = FIRST_NAMES[(i * 5) % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 3 + 1) % LAST_NAMES.length];
    return Lx(`${first.en} ${last.en}`, `${first.fa} ${last.fa}`);
  };
  if (kind === 'testimonial') return TESTIMONIALS.map((quote, i) => entry({ title: person(i + 3), role: ROLES[i % ROLES.length], quote }));
  if (kind === 'faq') return FAQ.map((x) => entry({ title: x.question, answer: x.answer }));
  return [];
}

/** Photos the code ships with for a type (the template's photos, files in var/demo-images). */
export function builtInPhotos(type: string): PhotoRef[] {
  const t = SITE_TEMPLATES.find((x) => x.key === type);
  return t ? [...new Set([t.hero.image, t.about.image, ...t.products.map((p) => p.image)])].map((ref) => ({ ref })) : [];
}

type PhotoRow = { id: string; type_key: string; kind: string; storage_key: string; content_type: string };
const photoRef = (r: PhotoRow): PhotoRef => ({ id: r.id, key: r.storage_key, contentType: r.content_type });

/**
 * Everything a sample-data run can draw from for one type: its entries and photos, then the
 * general ones. The studio's own entries come before the built-in ones.
 */
export async function loadBank(ctx: AppContext, type: string) {
  const types = type === GENERAL_BANK_TYPE ? [type] : [type, GENERAL_BANK_TYPE];
  const { rows: entries } = await ctx.control.query<{ id: string; type_key: string; kind: string; data: Record<string, EntryValue>; photos: string[] }>(
    'SELECT id, type_key, kind, data, photos FROM bank_entries WHERE type_key = ANY($1) ORDER BY created_at',
    [types],
  );
  const { rows: photos } = await ctx.control.query<PhotoRow>('SELECT id, type_key, kind, storage_key, content_type FROM bank_photos WHERE type_key = ANY($1) ORDER BY created_at', [types]);
  const byId = new Map(photos.map((p) => [p.id, p]));
  const own = (kind: string, t: string): BankEntry[] =>
    entries
      .filter((e) => e.kind === kind && e.type_key === t)
      .map((e) => ({ id: e.id, type: t, kind, data: e.data, photos: e.photos.map((id) => byId.get(id)).filter((p): p is PhotoRow => !!p).map(photoRef), builtIn: false }));
  const shown = await hiddenBuiltIns(ctx, types);
  // Kit tables by table address: the type's own first, then the general kit's.
  const tables = new Map<string, KitTableSource>();
  for (const k of await loadKitTables(ctx, types)) {
    for (const t of k.pack.tables) if (!tables.has(t.slug)) tables.set(t.slug, { kitId: k.id, table: t, items: k.pack.samples.items[t.slug] ?? [], photos: kitPhotos(k.pack) });
  }
  return {
    type,
    /** The kit table (with its items and photos) for a table address, if the kit has one. */
    table(slug: string): KitTableSource | null {
      return tables.get(slug) ?? null;
    },
    entries(kind: string): BankEntry[] {
      return types.flatMap((t) => [...own(kind, t), ...builtInEntries(t, kind).filter(shown.entry)]);
    },
    /** Photos for a kind: the type's photos of that kind, then its general photos, then the general type's. */
    photos(kind: string): PhotoRef[] {
      const uploaded = (t: string, k: string) => photos.filter((p) => p.type_key === t && p.kind === k).map(photoRef);
      return [...uploaded(type, kind), ...uploaded(type, ''), ...builtInPhotos(type).filter((p) => shown.photo(type, p)), ...(type === GENERAL_BANK_TYPE ? [] : [...uploaded(GENERAL_BANK_TYPE, kind), ...uploaded(GENERAL_BANK_TYPE, '')])];
    },
  };
}
export type Bank = Awaited<ReturnType<typeof loadBank>>;

/* ---------- kit tables ---------- */

export interface KitTable {
  id: string;
  typeKey: string;
  name: string;
  pack: StarterPack;
  position: number;
}
/** One table of a kit, as sample data reads it. */
export interface KitTableSource {
  kitId: string;
  table: CollectionInput;
  items: KitItem[];
  /** The kit's photos by id (item image fields hold these ids). */
  photos: Map<string, PhotoRef>;
}

const kitPhotos = (pack: StarterPack) => new Map(pack.photos.map((p): [string, PhotoRef] => [p.id, { id: p.id, key: p.key, contentType: p.contentType }]));

export async function loadKitTables(ctx: AppContext, types: string[]): Promise<KitTable[]> {
  const { rows } = await ctx.control.query<{ id: string; type_key: string; name: string; pack: unknown; position: number }>(
    'SELECT id, type_key, name, pack, position FROM kit_tables WHERE type_key = ANY($1) ORDER BY array_position($1, type_key), position, created_at',
    [types],
  );
  return rows.map((r) => ({ id: r.id, typeKey: r.type_key, name: r.name, pack: readStarterPack('table', r.pack), position: r.position }));
}

export async function getKitTable(ctx: AppContext, id: string): Promise<KitTable | null> {
  const { rows } = await ctx.control.query<{ id: string; type_key: string; name: string; pack: unknown; position: number }>('SELECT id, type_key, name, pack, position FROM kit_tables WHERE id = $1', [id]);
  const r = rows[0];
  return r ? { id: r.id, typeKey: r.type_key, name: r.name, pack: readStarterPack('table', r.pack), position: r.position } : null;
}

/** A new file key in the studio's storage. */
export function bankStorageKey(ext: string) {
  const now = new Date();
  return `public/tenants/${BANK_STORAGE_ID}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
}

/**
 * Adds a copy of a table starter to a kit. Its photos are copied too, so the kit keeps them
 * when the starter changes or is deleted, and editing the kit never touches the starter.
 */
export async function addKitTable(ctx: AppContext, type: string, name: string, source: StarterPack): Promise<KitTable> {
  let json = JSON.stringify(source);
  const photos: StarterPack['photos'] = [];
  for (const p of source.photos) {
    try {
      const key = bankStorageKey(p.key.split('.').pop() ?? 'jpg');
      await ctx.storage.put(key, await ctx.storage.get(p.key), p.contentType);
      const url = ctx.storage.publicUrl(key);
      // Page texts of the pack hold photo addresses; item fields hold the (unchanged) photo id.
      json = json.split(p.url).join(url).split(p.key).join(key);
      photos.push({ ...p, key, url });
    } catch {
      // A photo the studio no longer has: items keep an empty place.
    }
  }
  const pack = readStarterPack('table', { ...JSON.parse(json), photos });
  const position = Number((await ctx.control.query('SELECT coalesce(max(position), -1) + 1 AS n FROM kit_tables WHERE type_key = $1', [type])).rows[0].n);
  const { rows } = await ctx.control.query<{ id: string }>('INSERT INTO kit_tables (type_key, name, pack, position) VALUES ($1, $2, $3, $4) RETURNING id', [type, name, JSON.stringify(pack), position]);
  return { id: rows[0].id, typeKey: type, name, pack, position };
}

/** Deletes kit tables (by a condition on kit_tables) with their photo copies. */
export async function deleteKitTables(ctx: AppContext, where: string, values: unknown[]) {
  const { rows } = await ctx.control.query<{ pack: unknown }>(`DELETE FROM kit_tables WHERE ${where} RETURNING pack`, values);
  for (const r of rows) for (const p of readStarterPack('table', r.pack).photos) await ctx.storage.delete(p.key).catch(() => undefined);
}

/**
 * A kit table's main table. Packs also hold the tables it points to (classes → courses, teachers),
 * so the main one is the table no other table of the pack points to.
 */
export function kitMainTable(pack: StarterPack): CollectionInput | null {
  const pointed = new Set(pack.tables.flatMap((t) => t.fields.filter((f) => f.type === 'reference' && f.reference !== t.slug).map((f) => f.reference)));
  const main = pack.tables.find((t) => !pointed.has(t.slug)) ?? pack.tables[0];
  return main ? collectionInputSchema.parse(main) : null;
}

const GENERAL_KIT_KEY = 'general_kit_seeded';

/** Fills the general kit once with the ready-made table starters (run after they are added). */
export async function seedGeneralKit(ctx: AppContext): Promise<number> {
  if ((await ctx.control.query('SELECT 1 FROM app_settings WHERE key = $1', [GENERAL_KIT_KEY])).rowCount) return 0;
  const { rows } = await ctx.control.query<{ name: string; data: unknown }>(`SELECT name, data FROM starters WHERE kind = 'table' AND sample_key IS NOT NULL ORDER BY created_at`);
  for (const r of rows) await addKitTable(ctx, GENERAL_BANK_TYPE, r.name, readStarterPack('table', r.data));
  await ctx.control.query(`INSERT INTO app_settings (key, value) VALUES ($1, 'true') ON CONFLICT (key) DO NOTHING`, [GENERAL_KIT_KEY]);
  return rows.length;
}

/** Copies bank photos (and built-in template photos) into a site as its own files; one copy per photo per run. */
export function photoStore(ctx: AppContext, db: pg.Pool, tenantId: string, palette: [string, string] = ['#ece6dc', '#cdbfa9'], templates?: (ref: string) => Promise<StoredImage>) {
  // Reuses the setup's own photo copies when given, so a photo is stored once.
  const template = templates ?? templateImageStore(ctx, db, tenantId, palette);
  const cache = new Map<string, StoredImage>();
  return async function store(photo: PhotoRef): Promise<StoredImage> {
    if ('ref' in photo) return template(photo.ref);
    const hit = cache.get(photo.id);
    if (hit) return hit;
    const body = await ctx.storage.get(photo.key);
    const id = randomUUID();
    const now = new Date();
    const ext = photo.key.split('.').pop()!;
    const key = `public/tenants/${tenantId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${ext}`;
    await ctx.storage.put(key, body, photo.contentType);
    await db.query(`INSERT INTO assets (id, storage_key, original_name, content_type, size_bytes, visibility, kind) VALUES ($1, $2, $3, $4, $5, 'public', 'image')`, [
      id,
      key,
      `bank-${photo.id}.${ext}`,
      photo.contentType,
      body.length,
    ]);
    const stored = { id, url: ctx.storage.publicUrl(key) };
    cache.set(photo.id, stored);
    return stored;
  };
}
export type PhotoStore = ReturnType<typeof photoStore>;
