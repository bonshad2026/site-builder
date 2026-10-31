import {
  AVAILABLE_FILTER,
  collectionCommerceSchema,
  LOCALIZED_FIELD_TYPES,
  parseFieldValue,
  PRODUCT_SOURCE,
  PRODUCT_SOURCE_FIELDS,
  type Collection,
  type CollectionField,
  type CollectionFilter,
  type ListQuery,
  type PublicCollection,
  type PublicItem,
} from '@site-builder/shared';
import type pg from 'pg';
import { badRequest, notFound } from '../../common/errors.js';
import type { StorageAdapter } from '../../storage/storage.js';

type Db = pg.Pool | pg.PoolClient;

export const COLLECTION_COLUMNS = `id, slug, name, item_name AS "itemName", fields, detail_page AS "detailPage", image_field AS "imageField",
  commerce, request_type AS "requestType", position`;

export const ITEM_COLUMNS = `id, collection_id AS "collectionId", slug, title, data, status, position, created_at AS "createdAt", updated_at AS "updatedAt"`;

export interface ItemRow {
  id: string;
  collectionId: string;
  slug: string;
  title: { en: string; fa: string };
  data: Record<string, unknown>;
  status: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

function normalize(row: Collection): Collection {
  return { ...row, commerce: collectionCommerceSchema.parse(row.commerce ?? {}) };
}

export async function loadCollections(db: Db): Promise<Collection[]> {
  const { rows } = await db.query<Collection>(`SELECT ${COLLECTION_COLUMNS} FROM collections ORDER BY position, created_at`);
  return rows.map(normalize);
}

/** A table by slug or id. */
export async function loadCollection(db: Db, key: string): Promise<Collection> {
  const byId = /^[0-9a-f-]{36}$/i.test(key);
  const { rows } = await db.query<Collection>(`SELECT ${COLLECTION_COLUMNS} FROM collections WHERE ${byId ? 'id = $1' : 'slug = $1'}`, [key]);
  if (!rows[0]) throw notFound('Table');
  return normalize(rows[0]);
}

/** What visitors may know about a table (no positions or internal settings beyond what pages need). */
export function publicCollection(c: Collection): PublicCollection {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    itemName: c.itemName,
    fields: c.fields,
    detailPage: c.detailPage,
    imageField: c.imageField,
    requestType: c.requestType,
    commerce: { enabled: c.commerce.enabled, currency: c.commerce.currency, maxPerOrder: c.commerce.maxPerOrder },
  };
}

/** Checks item values against the table's fields; unknown keys are dropped. */
export function cleanItemData(collection: Collection, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const errors: { path: string; message: string }[] = [];
  for (const field of collection.fields) {
    const r = parseFieldValue(field, data[field.key]);
    if (r.ok) out[field.key] = r.value;
    else errors.push({ path: `data.${field.key}`, message: r.error });
  }
  if (errors.length) throw badRequest('Some values are not valid', errors);
  return out;
}

/* ---------- list queries ---------- */

class SqlBuilder {
  readonly values: unknown[] = [];
  param(v: unknown) {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

/** Values of an `in` filter: a JSON list or a comma separated text. */
function listValues(value: string): string[] {
  try {
    const v = JSON.parse(value);
    if (Array.isArray(v)) return v.map(String).filter(Boolean).slice(0, 50);
  } catch {
    // Not JSON: comma separated.
  }
  return value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
}

/** SQL for one filter on an item field (or the title / id). Field keys come from the table definition only. */
function filterSql(sql: SqlBuilder, fields: CollectionField[], filter: { field: string; op: CollectionFilter['op']; value: string }): string | null {
  const { op, value } = filter;
  if (op === 'in' && !listValues(value).length) return null;
  if (filter.field === 'id') {
    if (op === 'in') return `i.id::text = ANY(${sql.param(listValues(value))}::text[])`;
    if (op === 'eq') return `i.id = ${sql.param(value)}::uuid`;
    if (op === 'neq') return `i.id <> ${sql.param(value)}::uuid`;
    return null;
  }
  if (filter.field === 'title') {
    const v = sql.param(op === 'contains' ? `%${value}%` : value);
    const cmp = op === 'contains' ? 'ILIKE' : '=';
    if (op === 'eq' || op === 'contains') return `(i.title->>'en' ${cmp} ${v} OR i.title->>'fa' ${cmp} ${v})`;
    if (op === 'neq') return `NOT (i.title->>'en' = ${v} OR i.title->>'fa' = ${v})`;
    return null;
  }
  const field = fields.find((f) => f.key === filter.field);
  if (!field) return null;
  const key = sql.param(field.key);
  const raw = `i.data->>${key}`;
  const json = `i.data->${key}`;
  const isSet = LOCALIZED_FIELD_TYPES.includes(field.type)
    ? `(coalesce(${json}->>'en', '') <> '' OR coalesce(${json}->>'fa', '') <> '')`
    : `(${json} IS NOT NULL AND jsonb_typeof(${json}) <> 'null' AND ${json} <> '[]'::jsonb AND ${raw} <> '')`;
  if (op === 'set') return isSet;
  if (op === 'notset') return `NOT ${isSet}`;

  switch (field.type) {
    case 'text':
    case 'textarea': {
      if (op === 'contains') {
        const v = sql.param(`%${value}%`);
        return `(${json}->>'en' ILIKE ${v} OR ${json}->>'fa' ILIKE ${v})`;
      }
      const v = sql.param(value);
      if (op === 'eq') return `(${json}->>'en' = ${v} OR ${json}->>'fa' = ${v})`;
      if (op === 'neq') return `NOT coalesce(${json}->>'en' = ${v} OR ${json}->>'fa' = ${v}, false)`;
      return null;
    }
    case 'number':
    case 'price': {
      if (op === 'in') return `(${raw})::numeric = ANY(${sql.param(listValues(value).map(Number).filter(Number.isFinite))}::numeric[])`;
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      const cmp = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op as 'eq'];
      return cmp ? `(${raw})::numeric ${cmp} ${sql.param(n)}` : null;
    }
    case 'date':
    case 'datetime': {
      const cast = field.type === 'date' ? 'date' : 'timestamp';
      const now = field.type === 'date' ? 'current_date' : 'localtimestamp';
      if (op === 'future') return `(${raw})::${cast} >= ${now}`;
      if (op === 'past') return `(${raw})::${cast} < ${now}`;
      const cmp = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op as 'eq'];
      if (!cmp || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
      return `(${raw})::${cast} ${cmp} ${sql.param(value)}::${cast}`;
    }
    case 'boolean': {
      if (op !== 'eq' && op !== 'neq') return null;
      const v = sql.param(value === 'true');
      return op === 'eq' ? `coalesce((${raw})::boolean, false) = ${v}` : `coalesce((${raw})::boolean, false) <> ${v}`;
    }
    case 'multiselect':
    case 'reference':
    case 'gallery': {
      if (op === 'in') return `coalesce(${json} ?| ${sql.param(listValues(value))}::text[], false)`;
      if (op === 'eq' || op === 'contains') return `coalesce(${json} ? ${sql.param(value)}, false)`;
      if (op === 'neq') return `NOT coalesce(${json} ? ${sql.param(value)}, false)`;
      return null;
    }
    default: {
      if (op === 'in') return `${raw} = ANY(${sql.param(listValues(value))}::text[])`;
      const v = sql.param(op === 'contains' ? `%${value}%` : value);
      if (op === 'eq') return `${raw} = ${v}`;
      if (op === 'neq') return `${raw} IS DISTINCT FROM ${v}`;
      if (op === 'contains') return `${raw} ILIKE ${v}`;
      return null;
    }
  }
}

/**
 * Items that can still be booked or bought: before the deadline and with seats left (seats
 * counted like `seatsTaken`). Tables that count neither keep every item.
 */
function availableSql(sql: SqlBuilder, collection: Collection): string {
  const c = collection.commerce;
  const parts: string[] = [];
  const deadline = collection.fields.find((f) => f.key === c.deadlineField);
  if (deadline) {
    const raw = `i.data->>${sql.param(deadline.key)}`;
    parts.push(deadline.type === 'date' ? `(coalesce(${raw}, '') = '' OR (${raw})::date >= current_date)` : `(coalesce(${raw}, '') = '' OR (${raw})::timestamp >= localtimestamp)`);
  }
  if (c.capacityField) {
    const raw = `i.data->>${sql.param(c.capacityField)}`;
    const leads = c.requestsTakeSeat ? ` + (SELECT count(*) FROM leads l WHERE l.item_ref->>'id' = i.id::text AND l.status <> 'closed')` : '';
    parts.push(
      `(coalesce(${raw}, '') = '' OR (${raw})::numeric > (SELECT coalesce(sum(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.collection_item_id = i.id AND o.status <> 'cancelled')${leads})`,
    );
  }
  if (c.enabled && c.priceField) parts.push(`coalesce(i.data->>${sql.param(c.priceField)}, '') <> ''`);
  return parts.length ? `(${parts.join(' AND ')})` : 'true';
}

function orderSql(sql: SqlBuilder, fields: CollectionField[], sort: string, dir: 'asc' | 'desc'): string {
  const d = dir === 'desc' ? 'DESC' : 'ASC';
  if (sort === 'newest') return 'i.created_at DESC';
  if (sort === 'title') return `coalesce(nullif(i.title->>'fa', ''), i.title->>'en') ${d}`;
  const field = fields.find((f) => f.key === sort);
  if (!field) return 'i.position, i.created_at';
  const key = sql.param(field.key);
  if (field.type === 'number' || field.type === 'price') return `(i.data->>${key})::numeric ${d} NULLS LAST, i.position`;
  if (field.type === 'date') return `(i.data->>${key})::date ${d} NULLS LAST, i.position`;
  if (field.type === 'datetime') return `(i.data->>${key})::timestamp ${d} NULLS LAST, i.position`;
  if (LOCALIZED_FIELD_TYPES.includes(field.type)) return `coalesce(nullif(i.data->${key}->>'fa', ''), i.data->${key}->>'en') ${d} NULLS LAST`;
  return `i.data->>${key} ${d} NULLS LAST, i.position`;
}

/**
 * Resolves `valueFrom: current` filters against the item whose page is shown: a reference field
 * compares with that item's id; any other field with the same field of that item.
 */
function resolveFilters(filters: CollectionFilter[], fields: CollectionField[], current: ItemRow | null) {
  return filters.flatMap((f) => {
    if (f.valueFrom !== 'current') return [f];
    if (!current) return [];
    if (f.field === 'id') return [{ ...f, value: current.id }];
    const field = fields.find((x) => x.key === f.field);
    if (field?.type === 'reference') return [{ ...f, value: current.id }];
    const v = current.data[f.field];
    if (v === undefined || v === null) return [];
    if (typeof v === 'object' && !Array.isArray(v)) {
      const l = v as { fa?: string; en?: string };
      return [{ ...f, value: l.fa || l.en || '' }];
    }
    return [{ ...f, value: Array.isArray(v) ? String(v[0] ?? '') : String(v) }];
  });
}

export async function listItems(db: Db, collection: Collection, query: ListQuery, opts: { publishedOnly: boolean; status?: 'draft' | 'published' }) {
  const sql = new SqlBuilder();
  const where = [`i.collection_id = ${sql.param(collection.id)}`];
  if (opts.publishedOnly) where.push(`i.status = 'published'`);
  else if (opts.status) where.push(`i.status = ${sql.param(opts.status)}`);
  const current = query.current ? await findItemById(db, query.current) : null;
  for (const f of resolveFilters(query.filters, collection.fields, current)) {
    const clause = filterSql(sql, collection.fields, f);
    if (clause) where.push(clause);
  }
  for (const [field, value] of Object.entries(query.choices)) {
    if (!value) continue;
    const clause = filterSql(sql, collection.fields, { field, op: 'eq', value });
    if (clause) where.push(clause);
  }
  for (const f of [...query.filters.filter((x) => x.field === AVAILABLE_FILTER), ...query.visitor]) {
    if (f.field === AVAILABLE_FILTER) {
      if (f.value !== 'false') where.push(availableSql(sql, collection));
      continue;
    }
    if (f.valueFrom !== 'static' || (f.value === '' && !['set', 'notset', 'future', 'past'].includes(f.op))) continue;
    const clause = filterSql(sql, collection.fields, f);
    if (clause) where.push(clause);
  }
  if (query.q) {
    const v = sql.param(`%${query.q}%`);
    where.push(`(i.title->>'en' ILIKE ${v} OR i.title->>'fa' ILIKE ${v} OR i.data::text ILIKE ${v})`);
  }
  const order = orderSql(sql, collection.fields, query.sort, query.dir);
  const limit = sql.param(query.pageSize);
  const offset = sql.param((query.page - 1) * query.pageSize);
  const { rows } = await db.query<ItemRow & { total: number }>(
    `SELECT ${ITEM_COLUMNS.replace(/(^|, )(\w+)/g, '$1i.$2')}, count(*) OVER()::int AS total
       FROM collection_items i WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    sql.values,
  );
  return { rows: rows.map(({ total: _t, ...r }) => r as ItemRow), total: rows[0]?.total ?? 0 };
}

/** Smallest and largest value of a number, price or date field among published items. */
export async function fieldRange(db: Db, collection: Collection, key: string): Promise<{ min: number | string | null; max: number | string | null }> {
  const field = collection.fields.find((f) => f.key === key);
  if (!field || !['number', 'price', 'date', 'datetime'].includes(field.type)) return { min: null, max: null };
  const cast = field.type === 'date' ? 'date' : field.type === 'datetime' ? 'timestamp' : 'numeric';
  const { rows } = await db.query(
    `SELECT min((data->>$2)::${cast})::text AS min, max((data->>$2)::${cast})::text AS max
       FROM collection_items WHERE collection_id = $1 AND status = 'published' AND coalesce(data->>$2, '') <> ''`,
    [collection.id, key],
  );
  const num = (v: string | null) => (v === null ? null : cast === 'numeric' ? Number(v) : v);
  return { min: num(rows[0]?.min ?? null), max: num(rows[0]?.max ?? null) };
}

/** Days (YYYY-MM-DD) on which published items have a date field, between two days. */
export async function itemDays(db: Db, collection: Collection, key: string, from: string, to: string): Promise<string[]> {
  const field = collection.fields.find((f) => f.key === key);
  if (!field || (field.type !== 'date' && field.type !== 'datetime')) return [];
  const { rows } = await db.query<{ day: string }>(
    `SELECT DISTINCT left(data->>$2, 10) AS day FROM collection_items
      WHERE collection_id = $1 AND status = 'published' AND coalesce(data->>$2, '') <> ''
        AND left(data->>$2, 10) BETWEEN $3 AND $4
      ORDER BY 1 LIMIT 400`,
    [collection.id, key, from, to],
  );
  return rows.map((r) => r.day);
}

export async function findItemById(db: Db, id: string): Promise<ItemRow | null> {
  const { rows } = await db.query<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM collection_items WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/* ---------- seats and booking ---------- */

/** Seats taken per item: orders that are not cancelled, plus open requests when they count. */
export async function seatsTaken(db: Db, collection: Collection, itemIds: string[]): Promise<Map<string, number>> {
  const taken = new Map<string, number>();
  if (!itemIds.length) return taken;
  const { rows } = await db.query<{ id: string; n: number }>(
    `SELECT oi.collection_item_id AS id, sum(oi.quantity)::int AS n
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.collection_item_id = ANY($1::uuid[]) AND o.status <> 'cancelled'
      GROUP BY oi.collection_item_id`,
    [itemIds],
  );
  for (const r of rows) taken.set(r.id, r.n);
  if (collection.commerce.requestsTakeSeat) {
    const leads = await db.query<{ id: string; n: number }>(
      `SELECT item_ref->>'id' AS id, count(*)::int AS n FROM leads
        WHERE item_ref->>'id' = ANY($1::text[]) AND status <> 'closed' GROUP BY item_ref->>'id'`,
      [itemIds],
    );
    for (const r of leads.rows) taken.set(r.id, (taken.get(r.id) ?? 0) + r.n);
  }
  return taken;
}

function deadlinePassed(collection: Collection, item: ItemRow, now = new Date()): boolean {
  const key = collection.commerce.deadlineField;
  const v = key ? item.data[key] : null;
  if (typeof v !== 'string' || !v) return false;
  // A date deadline lasts to the end of that day.
  const end = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T23:59:59`) : new Date(v);
  return !Number.isNaN(end.getTime()) && end < now;
}

export function availabilityOf(collection: Collection, item: ItemRow, taken: number): NonNullable<PublicItem['availability']> {
  const c = collection.commerce;
  const num = (key: string) => {
    const v = key ? item.data[key] : null;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const price = num(c.priceField);
  const discount = Math.min(100, Math.max(0, num(c.discountField) ?? 0));
  const capacity = num(c.capacityField);
  const remaining = capacity === null ? null : Math.max(0, capacity - taken);
  const late = deadlinePassed(collection, item);
  const full = remaining !== null && remaining <= 0;
  return {
    priceMinor: price,
    discountPercent: discount,
    finalPriceMinor: price === null ? null : Math.floor((price * (100 - discount)) / 100),
    currency: c.currency,
    capacity,
    remaining,
    closed: late || full,
    reason: late ? 'deadline' : full ? 'full' : '',
    canBuy: c.enabled && price !== null && !late && !full,
  };
}

/** Whether a table counts seats or sells, so items need an availability block. */
const tracksBooking = (c: Collection) => c.commerce.enabled || !!c.commerce.capacityField || !!c.commerce.deadlineField;

/* ---------- public shape ---------- */

/**
 * Items as visitors see them: image ids turned into URLs, references into small linked items
 * (published ones only) and, for tables that sell or count seats, the booking state.
 */
export async function toPublicItems(db: Db, storage: StorageAdapter, collection: Collection, rows: ItemRow[], all?: Collection[]): Promise<PublicItem[]> {
  if (!rows.length) return [];
  const imageFields = collection.fields.filter((f) => f.type === 'image' || f.type === 'gallery');
  const refFields = collection.fields.filter((f) => f.type === 'reference');
  const strings = (v: unknown) => (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && !!x);

  const assetIds = new Set<string>();
  const refIds = new Set<string>();
  for (const r of rows) {
    for (const f of imageFields) strings(r.data[f.key]).forEach((id) => assetIds.add(id));
    for (const f of refFields) strings(r.data[f.key]).forEach((id) => refIds.add(id));
  }

  // Referenced items, with their own main image.
  const refs = new Map<string, { id: string; slug: string; title: unknown; collection: string; imageUrl: string | null }>();
  const refImage = new Map<string, string>();
  if (refIds.size) {
    const tables = all ?? (await loadCollections(db));
    const { rows: refRows } = await db.query<{ id: string; slug: string; title: unknown; data: Record<string, unknown>; collection_id: string }>(
      `SELECT id, slug, title, data, collection_id FROM collection_items WHERE id = ANY($1::uuid[]) AND status = 'published'`,
      [[...refIds]],
    );
    for (const r of refRows) {
      const table = tables.find((t) => t.id === r.collection_id);
      if (!table) continue;
      const mainKey = table.imageField || table.fields.find((f) => f.type === 'image' || f.type === 'gallery')?.key;
      const img = mainKey ? strings(r.data[mainKey])[0] : undefined;
      if (img) {
        assetIds.add(img);
        refImage.set(r.id, img);
      }
      refs.set(r.id, { id: r.id, slug: r.slug, title: r.title, collection: table.slug, imageUrl: null });
    }
  }

  const urls = new Map<string, string>();
  if (assetIds.size) {
    const { rows: assets } = await db.query<{ id: string; storage_key: string }>(
      `SELECT id, storage_key FROM assets WHERE id = ANY($1::uuid[]) AND visibility = 'public' AND deleted_at IS NULL`,
      [[...assetIds]],
    );
    for (const a of assets) urls.set(a.id, storage.publicUrl(a.storage_key));
  }
  for (const [id, img] of refImage) {
    const ref = refs.get(id);
    if (ref) ref.imageUrl = urls.get(img) ?? null;
  }

  const taken = tracksBooking(collection) ? await seatsTaken(db, collection, rows.map((r) => r.id)) : new Map<string, number>();

  return rows.map((r) => {
    const data: Record<string, unknown> = { ...r.data };
    for (const f of imageFields) {
      const ids = strings(r.data[f.key]);
      const list = ids.flatMap((id) => (urls.has(id) ? [{ id, url: urls.get(id)! }] : []));
      data[f.key] = f.type === 'image' ? (list[0] ?? null) : list;
    }
    for (const f of refFields) {
      const list = strings(r.data[f.key]).flatMap((id) => (refs.has(id) ? [refs.get(id)!] : []));
      data[f.key] = f.multiple ? list : (list[0] ?? null);
    }
    // Main image: the table's chosen field, else its first image field.
    const mainField = collection.imageField || imageFields[0]?.key;
    const main = mainField ? data[mainField] : null;
    const first = Array.isArray(main) ? main[0] : main;
    return {
      id: r.id,
      collection: collection.slug,
      slug: r.slug,
      title: r.title,
      data,
      imageUrl: first && typeof first === 'object' && 'url' in first ? (first as { url: string }).url : null,
      ...(tracksBooking(collection) ? { availability: availabilityOf(collection, r, taken.get(r.id) ?? 0) } : {}),
    };
  });
}

/* ---------- the shop's products as a list source ---------- */

const PRODUCT_COLUMN: Record<string, string> = {
  category: 'category',
  price: 'price_minor',
  discount: 'discount_percent',
  stock: 'stock',
  featured: 'featured',
};

/** Products filtered and sorted like table items, returned in the same public shape. */
export async function listProductsAsItems(db: Db, storage: StorageAdapter, query: ListQuery): Promise<{ data: PublicItem[]; total: number }> {
  const sql = new SqlBuilder();
  const where = [`status = 'published'`];
  const add = (field: string, op: CollectionFilter['op'], value: string) => {
    if (field === AVAILABLE_FILTER) {
      if (value !== 'false') where.push(`is_available AND price_minor IS NOT NULL AND (stock IS NULL OR stock > 0)`);
      return;
    }
    if (op === 'in') {
      const list = listValues(value);
      if (!list.length) return;
      if (field === 'category') where.push(`category = ANY(${sql.param(list)}::text[])`);
      else if (field === 'id') where.push(`id::text = ANY(${sql.param(list)}::text[])`);
      else if (PRODUCT_COLUMN[field]) where.push(`${PRODUCT_COLUMN[field]} = ANY(${sql.param(list.map(Number).filter(Number.isFinite))}::numeric[])`);
      return;
    }
    if (field === 'title') {
      const v = sql.param(op === 'contains' ? `%${value}%` : value);
      if (op === 'contains') where.push(`(name->>'en' ILIKE ${v} OR name->>'fa' ILIKE ${v})`);
      else if (op === 'eq') where.push(`(name->>'en' = ${v} OR name->>'fa' = ${v})`);
      return;
    }
    if (field === 'id' && (op === 'eq' || op === 'neq')) return void where.push(`id ${op === 'eq' ? '=' : '<>'} ${sql.param(value)}::uuid`);
    const col = PRODUCT_COLUMN[field];
    if (!col) return;
    if (op === 'set') return void where.push(`${col} IS NOT NULL`);
    if (op === 'notset') return void where.push(`${col} IS NULL`);
    if (field === 'featured') return void where.push(`featured = ${sql.param(value === 'true')}`);
    if (field === 'category') {
      if (op === 'eq') where.push(`category = ${sql.param(value)}`);
      if (op === 'neq') where.push(`category IS DISTINCT FROM ${sql.param(value)}`);
      return;
    }
    const n = Number(value);
    const cmp = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op as 'eq'];
    if (cmp && Number.isFinite(n)) where.push(`${col} ${cmp} ${sql.param(n)}`);
  };
  for (const f of query.filters) if (f.valueFrom === 'static') add(f.field, f.op, f.value);
  for (const [field, value] of Object.entries(query.choices)) if (value) add(field, 'eq', value);
  for (const f of query.visitor) if (f.valueFrom === 'static' && (f.value !== '' || ['set', 'notset'].includes(f.op))) add(f.field, f.op, f.value);
  if (query.q) {
    const v = sql.param(`%${query.q}%`);
    where.push(`(name->>'en' ILIKE ${v} OR name->>'fa' ILIKE ${v} OR description::text ILIKE ${v})`);
  }
  const d = query.dir === 'desc' ? 'DESC' : 'ASC';
  const order =
    query.sort === 'newest' ? 'created_at DESC' : query.sort === 'title' ? `coalesce(nullif(name->>'fa', ''), name->>'en') ${d}` : PRODUCT_COLUMN[query.sort] ? `${PRODUCT_COLUMN[query.sort]} ${d} NULLS LAST` : 'featured DESC, position, created_at';
  const { rows } = await db.query(
    `SELECT id, slug, name, description, category, price_minor::text AS price, currency, stock, is_available, discount_percent, featured, image_asset_id,
            count(*) OVER()::int AS total
       FROM products WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${sql.param(query.pageSize)} OFFSET ${sql.param((query.page - 1) * query.pageSize)}`,
    sql.values,
  );
  const ids = rows.map((r) => r.image_asset_id).filter(Boolean);
  const urls = new Map<string, string>();
  if (ids.length) {
    const { rows: assets } = await db.query<{ id: string; storage_key: string }>(
      `SELECT id, storage_key FROM assets WHERE id = ANY($1::uuid[]) AND visibility = 'public' AND deleted_at IS NULL`,
      [ids],
    );
    for (const a of assets) urls.set(a.id, storage.publicUrl(a.storage_key));
  }
  const data = rows.map((p): PublicItem => {
    const price = p.price === null ? null : Number(p.price);
    const discount = p.discount_percent ?? 0;
    const imageUrl = (p.image_asset_id && urls.get(p.image_asset_id)) || null;
    const soldOut = !p.is_available || (p.stock !== null && p.stock <= 0);
    return {
      id: p.id,
      collection: PRODUCT_SOURCE,
      slug: p.slug,
      title: p.name,
      data: { image: imageUrl ? { id: p.image_asset_id, url: imageUrl } : null, description: p.description, category: p.category, price, discount, stock: p.stock, featured: p.featured },
      imageUrl,
      availability: {
        priceMinor: price,
        discountPercent: discount,
        finalPriceMinor: price === null ? null : Math.floor((price * (100 - discount)) / 100),
        currency: p.currency,
        capacity: p.stock,
        remaining: p.stock,
        closed: soldOut,
        reason: soldOut ? 'full' : '',
        canBuy: price !== null && !soldOut,
      },
    };
  });
  return { data, total: rows[0]?.total ?? 0 };
}

/** Slider bounds for products (price, stock or discount). */
export async function productFieldRange(db: Db, key: string): Promise<{ min: number | null; max: number | null }> {
  const col = PRODUCT_COLUMN[key];
  if (!col || key === 'category' || key === 'featured') return { min: null, max: null };
  const { rows } = await db.query(`SELECT min(${col})::float8 AS min, max(${col})::float8 AS max FROM products WHERE status = 'published'`);
  return { min: rows[0]?.min ?? null, max: rows[0]?.max ?? null };
}

export const productSourceCollection = (currency = 'IRR'): PublicCollection => ({
  id: PRODUCT_SOURCE,
  slug: PRODUCT_SOURCE,
  name: { en: 'Products', fa: 'محصولات' },
  itemName: { en: 'Product', fa: 'محصول' },
  fields: PRODUCT_SOURCE_FIELDS,
  detailPage: '',
  imageField: 'image',
  requestType: '',
  commerce: { enabled: true, currency, maxPerOrder: 50 },
});
