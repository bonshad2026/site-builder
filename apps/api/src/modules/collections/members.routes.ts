import { randomUUID } from 'node:crypto';
import { type Collection } from '@site-builder/shared';
import { fileTypeFromBuffer } from 'file-type';
import multer from 'multer';
import type pg from 'pg';
import { z } from 'zod';
import { randomDigits } from '../../common/crypto.js';
import { AppError, badRequest, fromPgError, notFound } from '../../common/errors.js';
import type { ApiRouter } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import { requirePermission } from '../../middleware/tenant.js';
import { auditTenant } from '../audit/audit.js';
import { requireCustomer, verifiedCustomer } from '../customers/customers.service.js';
import { loadSettings, siteBaseUrl } from '../interactions/context.js';
import { notifyStaff } from '../interactions/notify.js';
import { cleanItemData, ITEM_COLUMNS, loadCollections, publicCollection, ratingsOf, toPublicItems, type ItemRow } from './collections.service.js';

/**
 * Visitors' side of content tables beyond reading them:
 * - a customer whose account kind points to a table keeps one item of it (a trainer's profile),
 *   with photos and files they upload; new items wait as drafts until the staff publish them;
 * - customers rate and comment on items (a trainer), after a finished request when the table asks.
 */

/** What a customer may upload for their own item: images and PDF documents, found from the bytes. */
const UPLOAD_TYPES: Record<string, { ext: string; kind: 'image' | 'document' }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'application/pdf': { ext: 'pdf', kind: 'document' },
};
const MAX_UPLOADS_PER_CUSTOMER = 60;

const profileBody = z.object({
  title: z.object({ en: z.string().trim().max(300).default(''), fa: z.string().trim().max(300).default('') }),
  data: z.record(z.string().max(40), z.unknown()).default({}),
});
const reviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(1500).default(''),
  /** The finished request the review is about (tables that review after a request). */
  leadId: z.string().uuid().optional(),
});
const itemParams = z.object({ collection: z.string().max(40), slug: z.string().min(1).max(80) });

/** An item address from its title: letters (Persian too) and digits joined by hyphens, plus a short number. */
function itemSlug(title: { en: string; fa: string }) {
  const base = (title.fa || title.en)
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `${base || 'item'}-${randomDigits(4)}`;
}

/** Asset ids held by the image, gallery and file fields of item data. */
function assetIdsOf(table: Collection, data: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const f of table.fields) {
    const v = data[f.key];
    if (f.type === 'image' && typeof v === 'string') ids.push(v);
    if (f.type === 'gallery' && Array.isArray(v)) ids.push(...v.filter((x): x is string => typeof x === 'string'));
    if (f.type === 'files' && Array.isArray(v)) ids.push(...v.map((x) => (x as { id?: unknown })?.id).filter((x): x is string => typeof x === 'string'));
  }
  return ids;
}

/** The table a customer keeps their own item in (from their account kind), if it takes them. */
async function profileTableOf(db: pg.Pool, kind: string) {
  const settings = await loadSettings(db);
  const slug = settings.accounts.kinds.find((k) => k.key === kind)?.profileTable;
  if (!slug) return null;
  const table = (await loadCollections(db)).find((t) => t.slug === slug);
  return table?.selfService.enabled ? { table, settings } : null;
}

export function registerMemberRoutes(r: ApiRouter, ctx: AppContext) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2 } });

  /* ---------- the customer's own item ---------- */

  const ownItem = async (db: pg.Pool, table: Collection, customerId: string) => {
    const { rows } = await db.query<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM collection_items WHERE collection_id = $1 AND owner_customer_id = $2`, [table.id, customerId]);
    return rows[0] ?? null;
  };

  const profileView = async (db: pg.Pool, table: Collection, item: ItemRow | null) => {
    const preview = item ? (await toPublicItems(db, ctx.storage, table, [item]))[0] : null;
    return {
      table: { ...publicCollection(table), editable: table.selfService.fields.length ? table.selfService.fields : table.fields.map((f) => f.key), approval: table.selfService.approval },
      item: item ? { id: item.id, slug: item.slug, title: item.title, status: item.status, data: item.data, preview: preview?.data ?? {}, imageUrl: preview?.imageUrl ?? null } : null,
    };
  };

  r.route({ method: 'get', path: '/customer/profile', summary: "The signed-in customer's own item (e.g. a trainer's profile), or null", middleware: [requireCustomer] }, async ({ req }) => {
    const db = req.tenant!.db;
    const found = await profileTableOf(db, req.customer!.kind);
    if (!found) return { data: null };
    return { data: await profileView(db, found.table, await ownItem(db, found.table, req.customer!.id)) };
  });

  r.route(
    { method: 'put', path: '/customer/profile', summary: 'Create or change the customer’s own item; a new one waits for the staff when the table asks', body: profileBody, middleware: [requireCustomer] },
    async ({ req, body }) => {
      const db = req.tenant!.db;
      const customer = req.customer!;
      const found = await profileTableOf(db, customer.kind);
      if (!found) throw new AppError(403, 'no_profile', 'This account has no profile to fill');
      const { table, settings } = found;
      if (!body.title.fa && !body.title.en) throw new AppError(400, 'validation_failed', 'Invalid request body', [{ path: 'title', message: 'Required', code: 'too_small' }]);
      const existing = await ownItem(db, table, customer.id);
      // Only the fields the owner may fill come from them; the rest stay as the staff set them.
      const editable = new Set(table.selfService.fields.length ? table.selfService.fields : table.fields.map((f) => f.key));
      const merged: Record<string, unknown> = { ...(existing?.data ?? {}) };
      for (const f of table.fields) if (editable.has(f.key) && f.key in body.data) merged[f.key] = body.data[f.key];
      const data = cleanItemData(table, merged);
      // New photos and files must be the customer's own uploads.
      const before = new Set(existing ? assetIdsOf(table, existing.data) : []);
      const added = [...new Set(assetIdsOf(table, data).filter((id) => !before.has(id)))];
      if (added.length) {
        const { rows } = await db.query(`SELECT id FROM assets WHERE id = ANY($1::uuid[]) AND customer_id = $2 AND deleted_at IS NULL`, [added, customer.id]);
        if (rows.length !== added.length) throw badRequest('Upload the files again');
      }
      try {
        if (existing) {
          await db.query(`UPDATE collection_items SET title = $2, data = $3, updated_at = now() WHERE id = $1`, [existing.id, body.title, data]);
          await auditTenant(db, { action: 'item.updated_by_owner', target: existing.id, metadata: { collection: table.slug } });
        } else {
          const status = table.selfService.approval ? 'draft' : 'published';
          const { rows } = await db.query<{ id: string }>(
            `INSERT INTO collection_items (collection_id, slug, title, data, status, position, owner_customer_id)
             VALUES ($1, $2, $3, $4, $5, (SELECT coalesce(max(position), -1) + 1 FROM collection_items WHERE collection_id = $1), $6) RETURNING id`,
            [table.id, itemSlug(body.title), body.title, data, status, customer.id],
          );
          await auditTenant(db, { action: 'item.created_by_owner', target: rows[0].id, metadata: { collection: table.slug } });
          const base = await siteBaseUrl(ctx, req.tenant!);
          const what = table.itemName.fa || table.itemName.en || table.slug;
          await notifyStaff(
            ctx,
            req.tenant!,
            settings,
            `${what}: ${body.title.fa || body.title.en}`,
            `${customer.name} (${customer.phone ?? customer.email}) — ${status === 'draft' ? 'waiting for approval / در انتظار تأیید' : 'published'}\n\n${base}/admin/sites/${req.tenant!.slug}/collections/${table.id}`,
          );
        }
      } catch (err) {
        throw fromPgError(err) ?? err;
      }
      return { data: await profileView(db, table, await ownItem(db, table, customer.id)) };
    },
  );

  r.route(
    { method: 'post', path: '/customer/files', summary: 'Upload a photo or PDF for the customer’s own item (multipart: file)', status: 201, rawBody: true, middleware: [requireCustomer, upload.single('file')] },
    async ({ req }) => {
      const db = req.tenant!.db;
      const customer = req.customer!;
      if (!(await profileTableOf(db, customer.kind))) throw new AppError(403, 'no_profile', 'This account has no profile to fill');
      const file = req.file;
      if (!file) throw badRequest('Attach a file in the "file" field');
      const detected = await fileTypeFromBuffer(file.buffer);
      const allowed = detected && UPLOAD_TYPES[detected.mime];
      if (!allowed) throw new AppError(415, 'unsupported_file', 'Only JPEG, PNG, WebP images and PDF documents are allowed');
      const { rows: count } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM assets WHERE customer_id = $1 AND deleted_at IS NULL`, [customer.id]);
      if (count[0].n >= MAX_UPLOADS_PER_CUSTOMER) throw new AppError(429, 'too_many_files', 'Too many files uploaded');
      const now = new Date();
      const id = randomUUID();
      const key = `public/tenants/${req.tenant!.id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${allowed.ext}`;
      await ctx.storage.put(key, file.buffer, detected.mime);
      try {
        await db.query(
          `INSERT INTO assets (id, storage_key, original_name, content_type, size_bytes, visibility, kind, alt, customer_id) VALUES ($1, $2, $3, $4, $5, 'public', $6, '{}', $7)`,
          [id, key, file.originalname.slice(0, 200), detected.mime, file.size, allowed.kind, customer.id],
        );
      } catch (err) {
        await ctx.storage.delete(key).catch(() => {});
        throw err;
      }
      return { data: { id, url: ctx.storage.publicUrl(key), name: file.originalname.slice(0, 200), contentType: detected.mime, sizeBytes: file.size } };
    },
  );

  /* ---------- reviews ---------- */

  const reviewedItem = async (db: pg.Pool, params: z.output<typeof itemParams>) => {
    const table = (await loadCollections(db)).find((t) => t.slug === params.collection);
    if (!table || !table.reviews.enabled) throw notFound('Table');
    const { rows } = await db.query<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM collection_items WHERE collection_id = $1 AND slug = $2 AND status = 'published'`, [table.id, params.slug]);
    if (!rows[0]) throw notFound('Item');
    return { table, item: rows[0] };
  };

  /** Finished requests of this customer handled by the item and not reviewed yet. */
  const reviewableLeads = async (db: pg.Pool, itemId: string, customerId: string) => {
    const { rows } = await db.query<{ id: string; number: string }>(
      `SELECT l.id, l.number::text AS number FROM leads l
        WHERE l.assigned_item_id = $1 AND l.customer_id = $2 AND l.stage_kind = 'done'
          AND NOT EXISTS (SELECT 1 FROM item_reviews r WHERE r.lead_id = l.id)
        ORDER BY l.updated_at DESC LIMIT 20`,
      [itemId, customerId],
    );
    return rows.map((l) => ({ id: l.id, code: `R${l.number}` }));
  };

  r.route(
    { method: 'get', path: '/collections/:collection/items/:slug/reviews', summary: 'Ratings and comments of an item, and whether the visitor may add one', params: itemParams, query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }) },
    async ({ req, params, query }) => {
      const db = req.tenant!.db;
      const { table, item } = await reviewedItem(db, params);
      const rating = (await ratingsOf(db, [item.id])).get(item.id) ?? { average: 0, count: 0 };
      const { rows } = await db.query(
        `SELECT id, author_name AS "authorName", rating, body, created_at AS "createdAt" FROM item_reviews
          WHERE item_id = $1 AND status = 'published' ORDER BY created_at DESC LIMIT $2`,
        [item.id, query.limit],
      );
      const customer = req.customer;
      let mine: { signedIn: boolean; canReview: boolean; leads: { id: string; code: string }[] } = { signedIn: !!customer, canReview: false, leads: [] };
      if (customer) {
        if (table.reviews.afterDoneRequest) {
          const leads = await reviewableLeads(db, item.id, customer.id);
          mine = { signedIn: true, canReview: leads.length > 0, leads };
        } else {
          const { rows: had } = await db.query('SELECT 1 FROM item_reviews WHERE item_id = $1 AND customer_id = $2', [item.id, customer.id]);
          mine = { signedIn: true, canReview: !had.length, leads: [] };
        }
      }
      return { data: { ...rating, afterDoneRequest: table.reviews.afterDoneRequest, reviews: rows, mine } };
    },
  );

  r.route(
    { method: 'post', path: '/collections/:collection/items/:slug/reviews', summary: 'Rate and comment on an item (signed-in customers who may)', params: itemParams, body: reviewBody, status: 201, middleware: [requireCustomer] },
    async ({ req, params, body }) => {
      const db = req.tenant!.db;
      const customer = verifiedCustomer(req)!;
      const { table, item } = await reviewedItem(db, params);
      let leadId: string | null = null;
      if (table.reviews.afterDoneRequest) {
        const leads = await reviewableLeads(db, item.id, customer.id);
        const lead = body.leadId ? leads.find((l) => l.id === body.leadId) : leads[0];
        if (!lead) throw new AppError(403, 'review_not_allowed', 'Only customers whose request with this item is finished can review it');
        leadId = lead.id;
      } else {
        const { rows: had } = await db.query('SELECT 1 FROM item_reviews WHERE item_id = $1 AND customer_id = $2', [item.id, customer.id]);
        if (had.length) throw new AppError(409, 'already_reviewed', 'You have already reviewed this');
      }
      const { rows: who } = await db.query<{ name: string; organization: string }>('SELECT name, organization FROM customers WHERE id = $1', [customer.id]);
      const author = who[0]?.organization ? `${who[0].name} — ${who[0].organization}` : (who[0]?.name ?? customer.name);
      try {
        const { rows } = await db.query(
          `INSERT INTO item_reviews (item_id, customer_id, lead_id, author_name, rating, body) VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, author_name AS "authorName", rating, body, created_at AS "createdAt"`,
          [item.id, customer.id, leadId, author.slice(0, 200), body.rating, body.body],
        );
        await auditTenant(db, { action: 'review.created', target: rows[0].id, metadata: { item: item.id } });
        return { data: rows[0] };
      } catch (err) {
        throw fromPgError(err) ?? err;
      }
    },
  );
}

/** Staff side of reviews: every review of a table (shown and hidden), hide / show, delete. */
export function registerReviewAdminRoutes(r: ApiRouter) {
  const collectionParam = z.object({ collectionId: z.string().uuid() });
  const reviewParam = collectionParam.extend({ reviewId: z.string().uuid() });
  const write = requirePermission('catalog:write');

  r.route(
    { method: 'get', path: '/:collectionId/reviews', summary: 'Reviews of a table’s items', params: collectionParam, query: z.object({ itemId: z.string().uuid().optional() }) },
    async ({ req, params, query }) => {
      const { rows } = await req.tenant!.db.query(
        `SELECT r.id, r.item_id AS "itemId", i.title AS "itemTitle", r.author_name AS "authorName", r.rating, r.body, r.status, r.demo,
                r.lead_id AS "leadId", r.created_at AS "createdAt"
           FROM item_reviews r JOIN collection_items i ON i.id = r.item_id
          WHERE i.collection_id = $1 AND ($2::uuid IS NULL OR r.item_id = $2)
          ORDER BY r.created_at DESC LIMIT 500`,
        [params.collectionId, query.itemId ?? null],
      );
      return { data: rows };
    },
  );

  r.route(
    { method: 'patch', path: '/:collectionId/reviews/:reviewId', summary: 'Show or hide a review', params: reviewParam, body: z.object({ status: z.enum(['published', 'hidden']) }), middleware: [write] },
    async ({ req, params, body }) => {
      const db = req.tenant!.db;
      const { rows } = await db.query(
        `UPDATE item_reviews r SET status = $3 FROM collection_items i WHERE r.id = $1 AND i.id = r.item_id AND i.collection_id = $2 RETURNING r.id, r.status`,
        [params.reviewId, params.collectionId, body.status],
      );
      if (!rows[0]) throw notFound('Review');
      await auditTenant(db, { actorUserId: req.auth!.user.id, action: `review.${body.status}`, target: params.reviewId });
      return { data: rows[0] };
    },
  );

  r.route({ method: 'delete', path: '/:collectionId/reviews/:reviewId', summary: 'Delete a review', params: reviewParam, middleware: [write] }, async ({ req, params }) => {
    const db = req.tenant!.db;
    const { rowCount } = await db.query(`DELETE FROM item_reviews r USING collection_items i WHERE r.id = $1 AND i.id = r.item_id AND i.collection_id = $2`, [params.reviewId, params.collectionId]);
    if (!rowCount) throw notFound('Review');
    await auditTenant(db, { actorUserId: req.auth!.user.id, action: 'review.deleted', target: params.reviewId });
  });
}
