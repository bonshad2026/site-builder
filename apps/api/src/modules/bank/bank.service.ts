import { createHash, randomUUID } from 'node:crypto';
import { BUILT_IN_KINDS, GENERAL_BANK_TYPE, type BankField, type BankKind } from '@site-builder/shared';
import type pg from 'pg';
import type { AppContext } from '../../context.js';
import { SITE_TEMPLATES, type L } from '../platform/templates/catalog.js';
import { templateImageStore, type StoredImage } from '../platform/templates/images.js';
import {
  ARTICLE_TITLES,
  CITIES,
  COURSE_TITLES,
  EVENT_TITLES,
  FAQ,
  FIRST_NAMES,
  LAST_NAMES,
  PARAGRAPHS,
  PROJECT_TITLES,
  ROLES,
  TEAM_ROLES,
  TESTIMONIALS,
} from '../platform/setup/pools.js';

/**
 * The content bank (see `packages/shared/src/bank.ts`): built-in texts and photos from the
 * business templates and word lists, plus the studio's own types, kinds, entries and photos in
 * the control database. Photos are files in the studio's storage under a fixed "bank" folder.
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

export async function listKinds(ctx: AppContext): Promise<BankKind[]> {
  const { rows } = await ctx.control.query<{ key: string; label: L; fields: BankField[] }>('SELECT key, label, fields FROM bank_kinds ORDER BY created_at');
  return [...BUILT_IN_KINDS, ...rows.map((r) => ({ ...r, builtIn: false }))];
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
  const para = (i: number) => PARAGRAPHS[i % PARAGRAPHS.length];
  const two = (i: number) => Lx(`${para(i).en}\n\n${para(i + 2).en}`, `${para(i).fa}\n\n${para(i + 2).fa}`);
  const person = (i: number) => {
    const first = FIRST_NAMES[(i * 5) % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 3 + 1) % LAST_NAMES.length];
    return Lx(`${first.en} ${last.en}`, `${first.fa} ${last.fa}`);
  };
  switch (kind) {
    case 'article':
      return ARTICLE_TITLES.map((title, i) => entry({ title, summary: para(i), body: two(i) }));
    case 'portfolio':
      return PROJECT_TITLES.map((title, i) => entry({ title, summary: para(i), body: two(i) }));
    case 'course':
      return COURSE_TITLES.map((title, i) => entry({ title, summary: para(i), body: two(i), duration: [Lx('8 sessions', '۸ جلسه'), Lx('4 weeks', '۴ هفته'), Lx('One day', 'یک روز')][i % 3] }));
    case 'event':
      return EVENT_TITLES.map((title, i) => entry({ title, location: CITIES[i % CITIES.length], body: two(i) }));
    case 'person':
      return Array.from({ length: 10 }, (_, i) => entry({ title: person(i), role: TEAM_ROLES[i % TEAM_ROLES.length], bio: para(i) }));
    case 'testimonial':
      return TESTIMONIALS.map((quote, i) => entry({ title: person(i + 3), role: ROLES[i % ROLES.length], quote }));
    case 'faq':
      return FAQ.map((x) => entry({ title: x.question, answer: x.answer }));
    default:
      return [];
  }
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
  return {
    type,
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
