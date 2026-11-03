# دستورالعمل: مسیر یا ماژول API جدید

> فصل ۵ — دستورالعمل‌ها · زمینه: [API](../03-layers/api.md)، [مسیر یک درخواست](../02-architecture/request-path.md)

مثال: ماژول `notes` (یادداشت‌های داخلی سایت) با فهرست و افزودن، به‌علاوهٔ استفاده در پنل.

## فایل‌ها
| # | فایل | چه چیزی |
|---|---|---|
| 1 | `apps/api/src/database/tenant/migrations/012_notes.sql` | جدول (اگر لازم است) → [migration جدید](new-migration.md) |
| 2 | `packages/shared/src/schemas.ts` (یا فایل مرتبط) | schema ورودی |
| 3 | `apps/api/src/modules/notes/notes.routes.ts` | routeها |
| 4 | `apps/api/src/modules/notes/notes.service.ts` | منطق (اگر بیش از چند خط است) |
| 5 | `apps/api/src/app.ts` | وصل کردن router |
| 6 | `apps/api/test/notes.test.ts` | تست |
| 7 | `apps/web/src/admin/…` | hook و صفحه |
| 8 | `apps/web/src/lib/errorText.ts` | متن خطاهای جدید (اگر `code` تازه دارید) |

## ۱. schema در shared
```ts
// packages/shared/src/schemas.ts
export const noteInputSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  pinned: z.boolean().default(false),
});
export type NoteInput = z.infer<typeof noteInputSchema>;
```

## ۲. routeها
```ts
// apps/api/src/modules/notes/notes.routes.ts
import { noteInputSchema } from '@site-builder/shared';
import { ApiRouter, idParam, pageMeta, paginationQuery } from '../../common/http.js';
import { notFound } from '../../common/errors.js';
import { requirePermission } from '../../middleware/tenant.js';
import { auditTenant } from '../audit/audit.js';

/** Internal notes of a site, for its staff only. */
export function notesRoutes() {
  const r = new ApiRouter('/api/v1/sites/:siteId/notes', 'Notes', true);

  r.route(
    { method: 'get', path: '/', summary: 'List notes, pinned first', query: paginationQuery, middleware: [requirePermission('leads:read')] },
    async ({ req, query }) => {
      const { rows } = await req.tenant!.db.query(
        `SELECT id, body, pinned, created_at AS "createdAt", count(*) OVER()::int AS total
           FROM notes ORDER BY pinned DESC, created_at DESC LIMIT $1 OFFSET $2`,
        [query.pageSize, (query.page - 1) * query.pageSize],
      );
      return { data: rows.map(({ total: _t, ...n }) => n), meta: pageMeta(query.page, query.pageSize, rows[0]?.total ?? 0) };
    },
  );

  r.route(
    { method: 'post', path: '/', summary: 'Add a note', status: 201, body: noteInputSchema, middleware: [requirePermission('leads:write')] },
    async ({ req, body }) => {
      const { rows } = await req.tenant!.db.query(
        'INSERT INTO notes (body, pinned, created_by) VALUES ($1, $2, $3) RETURNING id, body, pinned, created_at AS "createdAt"',
        [body.body, body.pinned, req.auth!.user.id],
      );
      await auditTenant(req.tenant!.db, { actorUserId: req.auth!.user.id, action: 'note.created', target: rows[0].id });
      return { data: rows[0] };
    },
  );

  r.route({ method: 'delete', path: '/:id', summary: 'Delete a note', params: idParam, middleware: [requirePermission('leads:write')] }, async ({ req, params }) => {
    const { rowCount } = await req.tenant!.db.query('DELETE FROM notes WHERE id = $1', [params.id]);
    if (!rowCount) throw notFound('Note');
  });

  return r.router;
}
```

## ۳. وصل کردن در `app.ts`
```ts
// زیر بقیهٔ site.use(...)ها
site.use('/notes', notesRoutes());
```
router `site` پیش از این، ورود، CSRF و عضویت در سایت را بررسی کرده است. شما فقط مجوز را با
`requirePermission` اضافه می‌کنید.

| آدرس از چه نوعی است؟ | کجا وصل شود |
|---|---|
| مال یک سایت، برای کارکنان | `site.use('/…', …)` |
| مال یک سایت، برای بازدیدکننده | کنار `publicRoutes` با `loadPublicTenant(ctx)` و `loadCustomer()` |
| کل استودیو، فقط اپراتور | `app.use('/api/v1/platform/…', requirePlatformAdmin, …)` |
| ساختار سایت (در cell فقط اپراتور) | `operatorOnly` را به `middleware` اضافه کنید |
| بخشی که ماژول دارد | `r.router.use(requireModule('…'))` |

## ۴. تست
```ts
// apps/api/test/notes.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeContext } from '../src/context.js';
import { createAdmin, createTenant, createTestServer, signIn, type Client } from './helpers.js';

const { ctx, app } = createTestServer();
let owner: Client;
let base: string;

beforeAll(async () => {
  const admin = await createAdmin(ctx);
  const site = await createTenant(ctx, admin.id);
  owner = await signIn(app, site.ownerEmail);
  base = `/api/v1/sites/${site.slug}/notes`;
});
afterAll(() => closeContext(ctx));

describe('notes', () => {
  it('adds and lists notes, pinned first', async () => {
    expect((await owner.post(base, { body: 'later' })).status).toBe(201);
    expect((await owner.post(base, { body: 'first', pinned: true })).status).toBe(201);
    const list = await owner.get(base);
    expect(list.body.data.map((n: { body: string }) => n.body)).toEqual(['first', 'later']);
  });

  it('rejects an empty note', async () => {
    const res = await owner.post(base, { body: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
  });
});
```
```bash
docker start sb-test-pg
```
```bash
cd apps/api && npx vitest run test/notes.test.ts
```

## ۵. استفاده در وب
```ts
// apps/web/src/admin/notes/api.ts
export const notesKey = (siteId: string) => ['admin', siteId, 'notes'];
export function useNotes(siteId: string) {
  return useQuery({ queryKey: notesKey(siteId), queryFn: () => api.page<Note[]>(`/sites/${siteId}/notes`) });
}
export function useAddNote(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NoteInput) => api.post<Note>(`/sites/${siteId}/notes`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey(siteId) }),
  });
}
```
- صفحه را در `admin/pages/` بسازید، در `SitePages.tsx` یک `<Route path="notes">` بدهید و لینکش را
  در `SiteNav` (`AdminRoot.tsx`) بگذارید.
- برای نمایش خطا از اجزای موجود (`ErrorNote`، `useErrorLine` در `admin/ui.tsx`) استفاده کنید.
  این‌ها پیام را از `errorText.ts` می‌گیرند.
- متن‌ها را دوزبانه بنویسید: `L('Notes', 'یادداشت‌ها')`.

## ۶. پیش از تمام شدن
1. `npm run typecheck` و `npm test`
2. rebuild کانتینرها و بررسی در http://admin.localhost
3. مسیرها را در http://admin.localhost/api/v1/openapi.json ببینید؛ باید خودکار آمده باشند.
4. صفحهٔ قابلیت مربوط در `docs/dev/04-features/` و `docs/features/` را به‌روز کنید.
