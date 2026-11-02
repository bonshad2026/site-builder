import {
  collectionInputSchema,
  computeTotal,
  labelledAnswers,
  requestTypeConfig,
  type Answers,
  type CollectionField,
  type FormField,
  siteSettingsSchema,
  starterApplySchema,
  withSettingDefaults,
  type DemoRun,
  type SiteSettings,
  type Workflow,
  type WorkflowStage,
} from '@site-builder/shared';
import type pg from 'pg';
import { hashPassword } from '../../auth/auth.service.js';
import type { AppContext } from '../../../context.js';
import { getKitTable, loadBank, photoStore, type Bank, type BankEntry, type EntryValue, type PhotoStore } from '../../bank/bank.service.js';
import { applyPack } from '../../starters/pack.service.js';
import {
  ARTICLE_TITLES,
  CITIES,
  COURSE_TITLES,
  CUSTOMER_MESSAGES,
  EVENT_TITLES,
  PROJECT_TITLES,
  FIRST_NAMES,
  LAST_NAMES,
  PARAGRAPHS,
  STAFF_MESSAGES,
  STAFF_NOTES,
  STREETS,
  TEAM_ROLES,
  VARIANTS,
  type L,
} from './pools.js';

/**
 * Sample data for a new site, so it looks like it has been running for months: extra products,
 * items in every content table, customers with accounts, orders with their timelines, test
 * payments and requests at every stage of their workflows. Everything is marked `demo` and can
 * be removed with `clearDemoData`. The same site id always gives the same data.
 */

/** Password of every sample customer account (local testing only). */
export const DEMO_CUSTOMER_PASSWORD = '12345678';

const DAY = 86_400_000;
const j = (v: unknown) => JSON.stringify(v);

export function random(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)];
  const chance = (p: number) => next() < p;
  return { next, int, pick, chance };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const lx = (en: string, fa: string): L => ({ en, fa });

/** A valid Iranian national id (check digit included). */
function nationalId(rng: ReturnType<typeof random>) {
  for (;;) {
    const digits = Array.from({ length: 9 }, () => rng.int(0, 9));
    if (digits.every((d) => d === digits[0])) continue;
    const sum = digits.reduce((acc, d, i) => acc + d * (10 - i), 0) % 11;
    return `${digits.join('')}${sum < 2 ? sum : 11 - sum}`;
  }
}

interface Person {
  id: string | null;
  name: string;
  phone: string;
  email: string;
  address: string;
}

export interface DemoOptions {
  settings: SiteSettings;
  seed: string;
  /** Kit to draw from (the site's type, then general): table items, lists and photos. */
  bank: Bank;
  store: PhotoStore;
  run: DemoRun;
  shop: { sells: boolean; online: boolean; cod: boolean; stock: boolean; discounts: boolean; colors: boolean };
}

export interface DemoCounts {
  products: number;
  services: number;
  items: number;
  customers: number;
  orders: number;
  payments: number;
  requests: number;
}

const asL = (v: EntryValue | undefined): L | null => (v && typeof v === 'object' ? v : typeof v === 'string' && v ? { en: v, fa: v } : null);
const asNumber = (v: EntryValue | undefined): number | null => (typeof v === 'number' ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);

export async function addDemoData(db: pg.Pool, o: DemoOptions): Promise<DemoCounts> {
  const rng = random(o.seed);
  const d = o.run;
  const now = Date.now();
  const span = d.months * 30 * DAY;
  /** A time in the past (most recent first in `ago` = 0..1). */
  const past = () => new Date(now - Math.floor(Math.pow(rng.next(), 1.3) * span));
  const counts: DemoCounts = { products: 0, services: 0, items: 0, customers: 0, orders: 0, payments: 0, requests: 0 };
  let paymentsLeft = d.payments;
  const fa = o.settings.defaultLocale === 'fa';
  const say = (l: L) => (fa ? l.fa : l.en);
  // Keys of this run's rows, so later runs never clash with earlier ones.
  const tag = (now % 1_000_000).toString(36);
  /** A photo for a kind of content: the entry's own, else one of the bank's for that kind / type. */
  const photoFor = async (entry: BankEntry | null, kind: string, i: number, n = 0) => {
    const own = entry?.photos[n];
    const list = o.bank.photos(kind);
    const photo = own ?? (list.length ? list[(i + n) % list.length] : null);
    return photo ? (await o.store(photo)).id : null;
  };
  /** The i-th entry of a kind, and which round through the list it is (later rounds get a variant name). */
  const nth = (entries: BankEntry[], i: number) => (entries.length ? { entry: entries[i % entries.length], round: Math.floor(i / entries.length) } : { entry: null, round: i });
  const variant = (title: L, round: number, i: number) => {
    if (round === 0) return title;
    const v = VARIANTS[(round - 1 + i) % VARIANTS.length];
    return { en: `${title.en} — ${v.en}`, fa: `${title.fa} — ${v.fa}` };
  };

  /* ----- products ----- */
  const { rows: existing } = await db.query<{ slug: string; name: L; description: L; category: string | null; price_minor: string | null; image_asset_id: string | null; colors: unknown[] }>(
    `SELECT slug, name, description, category, price_minor::text, image_asset_id, colors FROM products WHERE status = 'published' ORDER BY position`,
  );
  const bankProducts = o.bank.entries('product');
  const cats = o.settings.productCategories;
  const categoryOf = (v: EntryValue | undefined, i: number) => {
    const l = asL(v);
    const hit = l && cats.find((c) => [c.slug, c.label.en, c.label.fa].some((x) => x && (x === l.en || x === l.fa)));
    return hit ? hit.slug : cats.length ? cats[i % cats.length].slug : null;
  };
  for (let k = 0; k < d.products; k++) {
    const i = existing.length + k;
    let name: L;
    let description: L;
    let category: string | null;
    let price: number | null;
    let image: string | null;
    let colors: unknown[] = [];
    if (bankProducts.length) {
      const { entry, round } = nth(bankProducts, i);
      name = variant(asL(entry!.data.title) ?? lx(`Product ${i + 1}`, `محصول ${i + 1}`), round, i);
      description = asL(entry!.data.description) ?? lx('', '');
      category = categoryOf(entry!.data.category, i);
      const base = asNumber(entry!.data.price) ?? rng.int(2, 60) * 1_000_000;
      price = round === 0 ? base : Math.round((base * (0.7 + rng.next() * 0.8)) / 10_000) * 10_000;
      image = await photoFor(entry, 'product', i);
    } else if (existing.length) {
      // No product texts in the bank: variants of the site's own products.
      const b = existing[i % existing.length];
      name = variant(b.name, Math.floor(i / existing.length) || 1, i);
      description = b.description;
      category = b.category;
      price = b.price_minor ? Math.round((Number(b.price_minor) * (0.7 + rng.next() * 0.8)) / 10_000) * 10_000 : null;
      image = b.image_asset_id;
      colors = b.colors;
    } else {
      name = lx(`Product ${i + 1}`, `محصول نمونه ${i + 1}`);
      description = rng.pick(PARAGRAPHS);
      category = categoryOf(undefined, i);
      price = rng.int(2, 60) * 1_000_000;
      image = await photoFor(null, 'product', i);
    }
    const res = await db.query(
      `INSERT INTO products (slug, name, description, category, price_minor, currency, stock, is_available, featured, materials, lead_time, image_asset_id,
                             status, position, discount_percent, colors, demo, created_at)
       VALUES ($1, $2, $3, $4, $5, 'IRR', $6, true, false, '{"en":"","fa":""}', '{"en":"","fa":""}', $7, 'published', $8, $9, $10, true, $11)
       ON CONFLICT (slug) DO NOTHING`,
      [
        `item-${tag}-${i + 1}`,
        j(name),
        j(description),
        category,
        price,
        o.shop.stock ? (rng.chance(0.12) ? 0 : rng.int(3, 60)) : null,
        image,
        i,
        o.shop.discounts && rng.chance(0.3) ? rng.pick([5, 10, 15, 20, 25]) : 0,
        j(o.shop.colors ? colors : []),
        past(),
      ],
    );
    counts.products += res.rowCount ?? 0;
  }

  /* ----- services ----- */
  const bankServices = o.bank.entries('service');
  for (let i = 0; i < d.services; i++) {
    const { entry, round } = nth(bankServices, i);
    const title = variant(asL(entry?.data.title) ?? lx(`Service ${i + 1}`, `خدمت ${i + 1}`), round, i);
    const summary = asL(entry?.data.summary) ?? rng.pick(PARAGRAPHS);
    const res = await db.query(
      `INSERT INTO services (slug, title, summary, body, image_asset_id, duration, starting_from, status, position, demo, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', $8, true, $9) ON CONFLICT (slug) DO NOTHING`,
      [`service-${tag}-${i + 1}`, j(title), j(summary), j(asL(entry?.data.body) ?? summary), await photoFor(entry, 'service', i), j(lx('1–2 weeks', '۱ تا ۲ هفته')), j(lx('On request', 'بر اساس درخواست')), 100 + i, past()],
    );
    counts.services += res.rowCount ?? 0;
  }

  /* ----- content table items ----- */
  const { rows: tables } = await db.query<{ id: string; slug: string; name: L; item_name: L; fields: unknown; image_field: string; commerce: unknown; request_type: string }>(
    'SELECT id, slug, name, item_name, fields, image_field, commerce, request_type FROM collections ORDER BY position',
  );
  // Items already there can be pointed at by references (a class's course and teacher).
  const itemIds = new Map<string, string[]>();
  const { rows: known } = await db.query<{ slug: string; id: string }>('SELECT c.slug, i.id FROM collection_items i JOIN collections c ON c.id = i.collection_id ORDER BY i.position');
  for (const r of known) itemIds.set(r.slug, [...(itemIds.get(r.slug) ?? []), r.id]);
  // Kit items point at each other by `ref`; filled in once every table has its new items.
  const byRef = new Map<string, string>();
  const pendingRefs: { id: string; refs: Record<string, string[]>; fallback: Record<string, unknown> }[] = [];
  const kitPhoto = async (photos: Map<string, unknown>, id: unknown) => {
    const p = typeof id === 'string' ? photos.get(id) : undefined;
    return p ? (await o.store(p as Parameters<PhotoStore>[0])).id : null;
  };
  for (const t of tables) {
    const want = d.tables[t.slug] ?? 0;
    if (!want) continue;
    const c = collectionInputSchema.safeParse({ slug: t.slug, name: t.name, itemName: t.item_name, fields: t.fields, imageField: t.image_field, commerce: t.commerce, requestType: t.request_type });
    if (!c.success) continue;
    // The kit table with the same address (the site's type first, then general), else made-up items.
    const kit = o.bank.table(t.slug);
    const entries = kit?.items ?? [];
    const first = itemIds.get(t.slug)?.length ?? 0;
    const ids: string[] = [];
    for (let k = 0; k < want; k++) {
      const i = first + k;
      const entry = entries.length ? entries[i % entries.length] : null;
      const round = entries.length ? Math.floor(i / entries.length) : i;
      const own = entry && (entry.title.en || entry.title.fa) ? entry.title : null;
      const title = own ? (round ? { en: `${own.en} ${round + 1}`, fa: `${own.fa} ${round + 1}` } : own) : itemTitle(t.slug, c.data.itemName, i);
      const data: Record<string, unknown> = {};
      const refs: Record<string, string[]> = {};
      const fallback: Record<string, unknown> = {};
      let photoIndex = 0;
      for (const f of c.data.fields) {
        let v: unknown;
        const given = entry?.data[f.key];
        const has = given !== undefined && given !== null && given !== '';
        if (f.type === 'image') v = (has && kit ? await kitPhoto(kit.photos, given) : null) ?? (await photoFor(null, '', i, photoIndex++));
        else if (f.type === 'gallery') {
          const list: string[] = [];
          if (has && kit && Array.isArray(given)) for (const x of given) {
            const id = await kitPhoto(kit.photos, x);
            if (id && !list.includes(id)) list.push(id);
          }
          for (let n = 0; list.length < 3 && n < 3; n++) {
            const id = await photoFor(null, '', i, photoIndex++);
            if (id && !list.includes(id)) list.push(id);
          }
          v = list;
        } else if (f.type === 'reference') {
          // Moved to the new items' ids below; until then the site's own items fill in.
          if (has) refs[f.key] = (Array.isArray(given) ? given : [given]).filter((x): x is string => typeof x === 'string');
          v = fieldValue(f, i, rng, itemIds, title);
          fallback[f.key] = v;
        } else if (has && kitValueFits(f, given)) v = given;
        else v = fieldValue(f, i, rng, itemIds, title);
        if (v !== undefined && v !== null) data[f.key] = v;
      }
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO collection_items (collection_id, slug, title, data, status, position, demo, created_at)
         VALUES ($1, $2, $3, $4, 'published', $5, true, $6) ON CONFLICT (collection_id, slug) DO NOTHING RETURNING id`,
        [t.id, `${t.slug}-${tag}-${i + 1}`, j(title), j(data), i, past()],
      );
      if (!rows[0]) continue;
      ids.push(rows[0].id);
      // The first round of a kit's items stands for the kit's own refs.
      if (entry && round === 0) byRef.set(entry.ref, rows[0].id);
      if (Object.keys(refs).length) pendingRefs.push({ id: rows[0].id, refs, fallback });
    }
    itemIds.set(t.slug, [...(itemIds.get(t.slug) ?? []), ...ids]);
    counts.items += ids.length;
  }
  for (const p of pendingRefs) {
    const moved = Object.fromEntries(Object.entries(p.refs).map(([k, list]) => {
      const ids = list.flatMap((r) => (byRef.has(r) ? [byRef.get(r)!] : []));
      return [k, ids.length ? ids : p.fallback[k]];
    }));
    await db.query('UPDATE collection_items SET data = data || $2::jsonb WHERE id = $1', [p.id, j(moved)]);
  }

  /* ----- customers ----- */
  const people: Person[] = [];
  const passwordHash = await hashPassword(DEMO_CUSTOMER_PASSWORD);
  // Later runs continue the numbering, so phones and emails stay unique.
  const offset = Number((await db.query<{ n: string }>('SELECT count(*) AS n FROM customers')).rows[0].n);
  const person = (i: number): Omit<Person, 'id'> => {
    const first = FIRST_NAMES[(i * 7 + rng.int(0, 3)) % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 11 + rng.int(0, 5)) % LAST_NAMES.length];
    const city = rng.pick(CITIES);
    return {
      name: `${say(first)} ${say(last)}`,
      // 0912 000 0001… like the other local test accounts; unique per index.
      phone: `0912${String(1_000_000 + i * 37).padStart(7, '0').slice(-7)}`,
      email: `${first.en.toLowerCase()}.${last.en.toLowerCase()}${i + 1}@example.com`,
      address: fa ? `${city.fa}، ${rng.pick(STREETS).fa}، پلاک ${rng.int(1, 120)}` : `${rng.int(1, 120)} ${rng.pick(STREETS).en}, ${city.en}`,
    };
  };
  for (let k = 0; k < d.customers; k++) {
    const p = person(offset + k);
    const created = past();
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO customers (phone, email, name, password_hash, verified_at, last_login_at, demo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, $5, $5) ON CONFLICT DO NOTHING RETURNING id`,
      [p.phone, p.email, p.name, passwordHash, created, new Date(Math.min(now, created.getTime() + rng.int(0, 60) * DAY))],
    );
    if (rows[0]) {
      people.push({ id: rows[0].id, ...p });
      counts.customers++;
    }
  }
  // Orders and requests of a later run also come from customers made before.
  if (!people.length) {
    const { rows } = await db.query<{ id: string; name: string; phone: string | null; email: string | null }>('SELECT id, name, phone, email FROM customers WHERE demo ORDER BY random() LIMIT 200');
    for (const r of rows) people.push({ id: r.id, name: r.name, phone: r.phone ?? '', email: r.email ?? '', address: person(0).address });
  }
  let guests = 0;
  const someone = (): Person => (people.length && rng.chance(0.75) ? rng.pick(people) : { id: null, ...person(offset + d.customers + 500 + guests++) });

  /* ----- orders ----- */
  const { rows: products } = await db.query<{ id: string; slug: string; name: L; price_minor: string; discount_percent: number; colors: { name: L }[] }>(
    `SELECT id, slug, name, price_minor::text, discount_percent, colors FROM products WHERE status = 'published' AND price_minor IS NOT NULL`,
  );
  // Orders take at most 60% of the payments, so some requests are paid too.
  let orderPayments = o.settings.requestTypes.length && d.requests ? Math.ceil(d.payments * 0.6) : d.payments;
  if (o.shop.sells && products.length) {
    const times = Array.from({ length: d.orders }, past).sort((a, b) => a.getTime() - b.getTime());
    for (const at of times) {
      const who = someone();
      const age = (now - at.getTime()) / DAY;
      const lines = Array.from({ length: rng.int(1, 3) }, () => {
        const p = rng.pick(products);
        const unit = Math.floor((Number(p.price_minor) * (100 - p.discount_percent)) / 100);
        const quantity = rng.chance(0.75) ? 1 : rng.int(2, 3);
        return { p, unit, quantity, option: p.colors.length ? say(rng.pick(p.colors).name) : '' };
      });
      const total = lines.reduce((s, l) => s + l.unit * l.quantity, 0);
      const online = o.shop.online && (!o.shop.cod || rng.chance(0.65));
      const status = age > 7 ? (rng.chance(0.1) ? 'cancelled' : rng.chance(0.85) ? 'fulfilled' : 'confirmed') : age > 2 ? rng.pick(['confirmed', 'fulfilled', 'pending']) : rng.chance(0.6) ? 'pending' : 'confirmed';
      const paid = online && status !== 'cancelled' && orderPayments > 0 && (status !== 'pending' || rng.chance(0.3));
      const paymentStatus = paid ? 'test_paid' : online && status === 'cancelled' ? 'failed' : 'unpaid';
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO orders (status, payment_status, customer, note, currency, subtotal_minor, total_minor, payment_method, customer_id, unread, demo, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'IRR', $5, $5, $6, $7, $8, true, $9, $9) RETURNING id`,
        [status, paymentStatus, j({ name: who.name, email: who.email, phone: who.phone, address: who.address }), rng.chance(0.2) ? say(rng.pick(CUSTOMER_MESSAGES)) : null, total, online ? 'online' : 'cod', who.id, status === 'pending', at],
      );
      const id = rows[0].id;
      for (const l of lines) {
        await db.query(
          `INSERT INTO order_items (order_id, product_id, product_slug, product_name, unit_price_minor, quantity, line_total_minor, option) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, l.p.id, l.p.slug, j(l.p.name), l.unit, l.quantity, l.unit * l.quantity, l.option],
        );
      }
      let t = at.getTime();
      const later = (hours: number) => new Date((t = Math.min(now, t + hours * 3_600_000)));
      await event(db, { orderId: id }, 'created', true, '', { stage: 'pending' }, at, true);
      if (paid) {
        const when = later(0.1);
        await db.query(
          `INSERT INTO payments (order_id, provider, is_test, amount_minor, currency, status, authority, ref_id, card_pan, return_url, sandbox_decision, demo, created_at, verified_at, updated_at)
           VALUES ($1, 'sandbox', true, $2, 'IRR', 'succeeded', $3, $4, $5, '/checkout/result', 'approved', true, $6, $6, $6)`,
          [id, total, `DEMO-O-${id}`, String(rng.int(10_000_000, 99_999_999)), `6037-99**-****-${rng.int(1000, 9999)}`, when],
        );
        await event(db, { orderId: id }, 'payment', true, '', { ok: true, amountMinor: String(total), currency: 'IRR', test: true }, when, false);
        paymentsLeft--;
        orderPayments--;
        counts.payments++;
      }
      if (status !== 'pending') {
        const steps = status === 'fulfilled' ? ['confirmed', 'fulfilled'] : [status];
        let from = 'pending';
        for (const to of steps) {
          await event(db, { orderId: id }, 'stage', true, '', { from, to }, later(to === 'fulfilled' ? rng.int(20, 72) : rng.int(1, 6)), false);
          from = to;
        }
      }
      if (rng.chance(0.15)) await event(db, { orderId: id }, 'message', true, say(rng.pick(STAFF_MESSAGES)), {}, later(2), false);
      await db.query('UPDATE orders SET updated_at = $2 WHERE id = $1', [id, new Date(t)]);
      counts.orders++;
    }
  }

  /* ----- requests ----- */
  const types = o.settings.requestTypes.map((r) => requestTypeConfig(o.settings, r.slug)!).filter(Boolean);
  // The main form gets most requests; plain contact messages fewer.
  const weights = types.map((r, i) => (i === 0 ? 4 : r.slug === 'contact' ? 1.5 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const pickType = () => {
    let x = rng.next() * sum;
    for (let i = 0; i < types.length; i++) if ((x -= weights[i]) <= 0) return types[i];
    return types[0];
  };
  if (types.length) {
    const times = Array.from({ length: d.requests }, past).sort((a, b) => a.getTime() - b.getTime());
    for (const at of times) {
      const type = pickType();
      const who = someone();
      const fields = type.fields;
      const answers = answersFor(fields, who, at, rng, fa);
      const details = { answers: labelledAnswers(fields, answers, fa ? 'fa' : 'en') };
      const message = details.answers.filter((a) => !['name', 'phone', 'email', 'consent'].includes(a.field)).map((a) => `${a.label}: ${a.value}`).join(' · ').slice(0, 4000);
      const age = (now - at.getTime()) / DAY;
      let path = stagePath(type.workflow, age, rng);
      let total = type.payment.onSubmit ? computeTotal(fields, answers, type.payment.amountMinor) : 0;
      const asked = path.some((s) => s.askPayment);
      if (!total && asked) total = rng.int(5, 80) * 1_000_000;
      // Paid once the request moved past the stage that asked for payment (or straight away for paid forms).
      const askAt = path.findIndex((s) => s.askPayment);
      const pastAsk = asked && askAt < path.length - 1 && path[path.length - 1].kind !== 'cancelled';
      const pay = total > 0 && (type.payment.onSubmit ? path.length > 1 && path[path.length - 1].kind !== 'cancelled' : pastAsk) && paymentsLeft > 0;
      // Without a payment the request waits where payment was asked (or at the start for paid forms).
      if (total > 0 && !pay && path[path.length - 1].kind !== 'cancelled') path = path.slice(0, type.payment.onSubmit ? 1 : askAt + 1);
      const last = path[path.length - 1];
      const paymentStatus = total <= 0 ? 'none' : pay ? 'test_paid' : last.kind === 'cancelled' ? 'none' : 'due';
      const itemRef = await itemFor(db, type.slug, tables, itemIds, rng);
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO leads (type, name, email, phone, message, source_path, details, answers, status, stage_kind, customer_id, unread,
                            amount_due_minor, amount_title, paid_minor, currency, payment_status, item_ref, demo, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'IRR', $16, $17, true, $18, $18) RETURNING id`,
        [
          type.slug, who.name, answers.email ? who.email : '', answers.phone ? who.phone : '', message, '/contact', j(details), j(answers), last.key, last.kind, who.id,
          path.length === 1 && age < 3, total > 0 && paymentStatus !== 'none' ? total : 0, total > 0 ? say(type.label) : '', pay ? total : 0, paymentStatus, itemRef ? j(itemRef) : null, at,
        ],
      );
      const id = rows[0].id;
      let t = at.getTime();
      const later = (hours: number) => new Date((t = Math.min(now, t + hours * 3_600_000)));
      await event(db, { leadId: id }, 'created', true, '', { stage: path[0].key }, at, true);
      if (type.payment.onSubmit && total > 0) await event(db, { leadId: id }, 'payment_requested', true, '', { amountMinor: String(total), currency: 'IRR' }, at, false);
      for (let i = 1; i < path.length; i++) {
        const when = later(rng.int(2, 40));
        await event(db, { leadId: id }, 'stage', true, '', { from: path[i - 1].key, to: path[i].key }, when, false);
        if (path[i].askPayment && !type.payment.onSubmit) await event(db, { leadId: id }, 'payment_requested', true, say(type.label), { amountMinor: String(total), currency: 'IRR' }, when, false);
        if (pay && ((type.payment.onSubmit && i === 1) || (!type.payment.onSubmit && path[i - 1].askPayment))) {
          const paidAt = new Date(when.getTime() - 3_600_000);
          await db.query(
            `INSERT INTO payments (lead_id, provider, is_test, amount_minor, currency, status, authority, ref_id, card_pan, return_url, sandbox_decision, demo, created_at, verified_at, updated_at)
             VALUES ($1, 'sandbox', true, $2, 'IRR', 'succeeded', $3, $4, $5, '/track', 'approved', true, $6, $6, $6)`,
            [id, total, `DEMO-R-${id}`, String(rng.int(10_000_000, 99_999_999)), `6219-86**-****-${rng.int(1000, 9999)}`, paidAt],
          );
          await event(db, { leadId: id }, 'payment', true, '', { ok: true, amountMinor: String(total), currency: 'IRR', test: true }, paidAt, true);
        }
        if (i === 1 && rng.chance(0.5)) await event(db, { leadId: id }, 'message', true, say(rng.pick(STAFF_MESSAGES)), {}, later(1), false);
        if (i === 1 && rng.chance(0.3)) await event(db, { leadId: id }, 'customer_message', true, say(rng.pick(CUSTOMER_MESSAGES)), {}, later(3), true);
      }
      if (rng.chance(0.25)) await event(db, { leadId: id }, 'note', false, rng.pick(STAFF_NOTES), {}, later(1), false);
      if (pay) {
        paymentsLeft--;
        counts.payments++;
      }
      await db.query('UPDATE leads SET updated_at = $2 WHERE id = $1', [id, new Date(t)]);
      counts.requests++;
    }
  }
  return counts;
}

async function event(db: pg.Pool, subject: { leadId?: string; orderId?: string }, kind: string, isPublic: boolean, body: string, data: object, at: Date, byCustomer: boolean) {
  await db.query(`INSERT INTO case_events (lead_id, order_id, kind, public, body, data, by_customer, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
    subject.leadId ?? null,
    subject.orderId ?? null,
    kind,
    isPublic,
    body,
    j(data),
    byCustomer,
    at,
  ]);
}

/** Stages a request went through: older requests are further along, most end well. */
function stagePath(workflow: Workflow, ageDays: number, rng: ReturnType<typeof random>): WorkflowStage[] {
  const path = [workflow.stages[0]];
  const steps = ageDays > 14 ? 6 : ageDays > 4 ? rng.int(1, 3) : rng.int(0, 1);
  for (let i = 0; i < steps; i++) {
    const here = path[path.length - 1];
    const next = here.next.map((k) => workflow.stages.find((s) => s.key === k)!).filter((s) => s && !path.includes(s));
    if (!next.length) break;
    const good = next.filter((s) => s.kind !== 'cancelled' && s.visible);
    path.push(good.length && !rng.chance(0.12) ? rng.pick(good) : rng.pick(next));
  }
  return path;
}

/** Answers a real visitor could have given to these questions. */
function answersFor(fields: FormField[], who: Person, at: Date, rng: ReturnType<typeof random>, fa: boolean): Answers {
  const out: Answers = {};
  const label = (o: { en: string; fa: string }) => (fa ? o.fa || o.en : o.en || o.fa);
  for (const f of fields) {
    if (f.type === 'heading' || f.type === 'step' || f.type === 'file') continue;
    if (f.role === 'name') out[f.id] = who.name;
    else if (f.role === 'phone' || f.type === 'tel') out[f.id] = who.phone;
    else if (f.role === 'email' || f.type === 'email') out[f.id] = who.email;
    else if (f.type === 'checkbox') out[f.id] = f.id === 'consent' || f.required || rng.chance(0.4);
    else if (f.type === 'select' || f.type === 'radio') {
      if (f.options.length && (f.required || rng.chance(0.8))) out[f.id] = label(rng.pick(f.options));
    } else if (f.type === 'checkboxes') {
      if (f.options.length) out[f.id] = [...new Set([label(rng.pick(f.options)), label(rng.pick(f.options))])];
    } else if (f.type === 'number') out[f.id] = String(rng.int(f.min ?? 1, Math.min(f.max ?? 10, (f.min ?? 1) + 9)));
    else if (f.type === 'date') {
      const base = f.max !== null && f.max <= 0 ? new Date(Date.UTC(rng.int(1975, 2005), rng.int(0, 11), rng.int(1, 28))) : new Date(at.getTime() + rng.int(Math.max(0, f.min ?? 0), 14) * DAY);
      out[f.id] = ymd(base);
    } else if (f.type === 'time') out[f.id] = rng.pick(['10:00', '12:30', '16:00', '18:30']);
    else if (f.pattern === 'nationalId') out[f.id] = nationalId(rng);
    else if (f.pattern === 'postalCode') out[f.id] = String(rng.int(1_000_000_000, 9_999_999_999));
    else if (f.id === 'address') out[f.id] = who.address;
    else if (f.id === 'city') out[f.id] = label(rng.pick(CITIES));
    else if (f.id === 'company') out[f.id] = fa ? rng.pick(['شرکت آرمان', 'گروه نوآوران', 'فروشگاه پارس', 'کافه بهار', '']) : rng.pick(['Arman Co.', 'Novin Group', 'Pars Store', '']);
    else if (f.id === 'order') out[f.id] = rng.chance(0.5) ? String(rng.int(1001, 1100)) : '';
    else if (f.id === 'items') out[f.id] = fa ? `${rng.int(2, 20)} کارتن از محصول اصلی، ${rng.int(1, 5)} بسته نمونه` : `${rng.int(2, 20)} cartons of the main product, ${rng.int(1, 5)} sample packs`;
    else if (f.type === 'textarea') {
      if (f.required || rng.chance(0.6)) out[f.id] = label(rng.pick([...CUSTOMER_MESSAGES, ...PARAGRAPHS.slice(0, 2)]));
    } else if (f.required) out[f.id] = fa ? 'نمونه' : 'Sample';
    if (out[f.id] === '') delete out[f.id];
  }
  return out;
}

/** Sign-ups and seat requests point at an item of a table that takes them. */
async function itemFor(db: pg.Pool, typeSlug: string, tables: { slug: string; name: L; request_type: string }[], itemIds: Map<string, string[]>, rng: ReturnType<typeof random>) {
  const table = tables.find((t) => t.request_type === typeSlug && (itemIds.get(t.slug)?.length ?? 0) > 0);
  if (!table || !rng.chance(0.8)) return null;
  const id = rng.pick(itemIds.get(table.slug)!);
  const { rows } = await db.query<{ slug: string; title: L }>('SELECT slug, title FROM collection_items WHERE id = $1', [id]);
  return rows[0] ? { collection: table.slug, id, slug: rows[0].slug, title: rows[0].title } : null;
}

export function itemTitle(table: string, itemName: L, i: number): L {
  const n = i + 1;
  if (table === 'articles') return ARTICLE_TITLES[i % ARTICLE_TITLES.length];
  if (table === 'portfolio') return PROJECT_TITLES[i % PROJECT_TITLES.length];
  if (table === 'courses') return COURSE_TITLES[i % COURSE_TITLES.length];
  if (table === 'events') return EVENT_TITLES[i % EVENT_TITLES.length];
  if (table === 'classes') {
    const c = COURSE_TITLES[i % COURSE_TITLES.length];
    return lx(`${c.en} — group ${Math.floor(i / COURSE_TITLES.length) + 1}`, `${c.fa} — گروه ${Math.floor(i / COURSE_TITLES.length) + 1}`);
  }
  if (table === 'teachers' || table === 'team') {
    const first = FIRST_NAMES[(i * 5) % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 3 + 1) % LAST_NAMES.length];
    return lx(`${first.en} ${last.en}`, `${first.fa} ${last.fa}`);
  }
  return lx(`${itemName.en || 'Item'} ${n}`, `${itemName.fa || 'مورد'} ${n}`);
}

/** Whether a kit item's value suits a site table's field (the site's table may differ from the kit's). */
function kitValueFits(f: CollectionField, v: unknown): boolean {
  switch (f.type) {
    case 'text':
    case 'textarea':
      return !!v && typeof v === 'object' && ('en' in v || 'fa' in v);
    case 'number':
    case 'price':
      return typeof v === 'number';
    case 'boolean':
      return typeof v === 'boolean';
    case 'select':
      return typeof v === 'string' && f.options.some((o) => o.value === v);
    case 'multiselect':
      return Array.isArray(v) && v.every((x) => f.options.some((o) => o.value === x));
    default:
      return typeof v === 'string';
  }
}

/** A value for one field of a sample item. */
export function fieldValue(f: CollectionField, i: number, rng: ReturnType<typeof random>, items: Map<string, string[]>, title: L): unknown {
  const now = Date.now();
  switch (f.type) {
    case 'text':
      if (f.key === 'role') return TEAM_ROLES[i % TEAM_ROLES.length];
      if (f.key === 'client') return rng.pick([lx('Arman Co.', 'شرکت آرمان'), lx('Pars Hotel', 'هتل پارس'), lx('Private client', 'کارفرمای شخصی'), lx('Novin Group', 'گروه نوین')]);
      if (f.key === 'location') {
        const c = CITIES[i % 4];
        return lx(`${c.en}, ${STREETS[i % STREETS.length].en}`, `${c.fa}، ${STREETS[i % STREETS.length].fa}`);
      }
      if (f.key === 'duration') return rng.pick([lx('8 sessions', '۸ جلسه'), lx('12 sessions', '۱۲ جلسه'), lx('One day', 'یک روز'), lx('4 weeks', '۴ هفته')]);
      return lx(`${title.en}`, `${title.fa}`);
    case 'textarea': {
      const p = PARAGRAPHS[i % PARAGRAPHS.length];
      const q = PARAGRAPHS[(i + 2) % PARAGRAPHS.length];
      return f.key === 'summary' ? p : lx(`${p.en}\n\n${q.en}`, `${p.fa}\n\n${q.fa}`);
    }
    case 'number':
      return f.key === 'capacity' ? rng.pick([8, 12, 15, 20, 30]) : rng.int(1, 100);
    case 'price':
      return rng.int(5, 60) * 1_000_000;
    case 'date':
      // Deadlines and event dates in the coming weeks; news dates in the past months.
      return ymd(new Date(f.key === 'date' ? now - rng.int(1, 150) * DAY : now + rng.int(3, 45) * DAY));
    case 'datetime': {
      const day = new Date(now + rng.int(5, 60) * DAY);
      return `${ymd(day)}T${rng.pick(['10:00', '14:00', '17:00', '18:30'])}`;
    }
    case 'boolean':
      return rng.chance(0.5);
    case 'select':
      return f.options.length ? rng.pick(f.options).value : undefined;
    case 'multiselect':
      return f.options.length ? [rng.pick(f.options).value] : [];
    case 'image':
    case 'gallery':
      // Photos come from the bank (see addDemoData).
      return undefined;
    case 'link':
      return '/contact';
    case 'email':
      return `info${i + 1}@example.com`;
    case 'phone':
      return `021-8800${String(1000 + i).slice(-4)}`;
    case 'reference': {
      const ids = items.get(f.reference) ?? [];
      return ids.length ? [ids[i % ids.length]] : [];
    }
  }
}

/**
 * Sample data for a site that already exists (the "Sample data" window): from the kit of the
 * chosen type, with the site's own shop and payment options. Kit tables in `addTables` are added
 * to the site first (with their item pages and forms). `replace` removes earlier sample data first.
 */
export async function generateDemo(ctx: AppContext, db: pg.Pool, siteSlug: string, run: DemoRun) {
  const tenantId = (await ctx.control.query<{ id: string }>('SELECT id FROM tenants WHERE slug = $1', [siteSlug])).rows[0].id;
  for (const id of run.addTables) {
    const kit = await getKitTable(ctx, id);
    if (!kit) continue;
    // Only the tables and what they need: a kit table never adds a page of its own as the main one.
    const pack = { ...kit.pack, pages: kit.pack.pages.filter((p) => p.role !== 'main') };
    await applyPack(ctx, tenantId, db, pack, starterApplySchema.parse({ samples: false }));
  }
  if (run.mode === 'replace') await clearDemoData(db);
  const settings = withSettingDefaults(siteSettingsSchema.parse((await db.query('SELECT settings FROM site_settings WHERE id = 1')).rows[0].settings));
  const pay = (await db.query<{ online: boolean; allow_cod: boolean }>('SELECT EXISTS (SELECT 1 FROM payment_gateways WHERE enabled AND allowed) AS online, allow_cod FROM payment_settings WHERE id = 1')).rows[0];
  const sells = !!settings.modules.orders;
  return addDemoData(db, {
    settings,
    seed: `${siteSlug}-${Date.now()}`,
    bank: await loadBank(ctx, run.type),
    store: photoStore(ctx, db, tenantId),
    shop: { sells, online: sells && pay.online, cod: sells && pay.allow_cod, stock: true, discounts: true, colors: true },
    run,
  });
}

/** How much sample data a site holds. */
export async function demoCounts(db: pg.Pool | pg.PoolClient): Promise<DemoCounts> {
  const { rows } = await db.query(
    `SELECT (SELECT count(*) FROM products WHERE demo)::int AS products, (SELECT count(*) FROM services WHERE demo)::int AS services, (SELECT count(*) FROM collection_items WHERE demo)::int AS items,
            (SELECT count(*) FROM customers WHERE demo)::int AS customers, (SELECT count(*) FROM orders WHERE demo)::int AS orders,
            (SELECT count(*) FROM payments WHERE demo)::int AS payments, (SELECT count(*) FROM leads WHERE demo)::int AS requests`,
  );
  return rows[0];
}

/**
 * Removes every sample record (and what hangs off it: order lines, timelines, sessions). The
 * same statements run in `deploy/export/drop-demo.sql` when a package is built without demo data.
 */
export async function clearDemoData(db: pg.Pool): Promise<DemoCounts> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const before = await demoCounts(client);
    await client.query(`DELETE FROM payments WHERE demo OR order_id IN (SELECT id FROM orders WHERE demo) OR lead_id IN (SELECT id FROM leads WHERE demo)`);
    await client.query('DELETE FROM orders WHERE demo');
    await client.query('DELETE FROM leads WHERE demo');
    await client.query('DELETE FROM customers WHERE demo');
    await client.query('DELETE FROM collection_items WHERE demo');
    await client.query('DELETE FROM products WHERE demo AND id NOT IN (SELECT product_id FROM order_items WHERE product_id IS NOT NULL)');
    await client.query('DELETE FROM services WHERE demo');
    await client.query('COMMIT');
    return before;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
