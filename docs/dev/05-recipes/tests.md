# دستورالعمل: نوشتن تست

> فصل ۵ — دستورالعمل‌ها · API: `apps/api/test/`، `apps/api/vitest.config.ts` · وب: `apps/web/src/test/`

## خلاصه
| | API | وب |
|---|---|---|
| ابزار | vitest + supertest | vitest + Testing Library (jsdom) |
| دیتابیس | **Postgres واقعی** روی 5433 | ندارد |
| تعداد (2026-11-02) | ۱۰۴ | ۴۳ |
| اجرا | `npm test` (ریشه، اول وب بعد API) | همان |

قاعدهٔ پروژه: **هر رفتار جدید API یک تست در `apps/api/test/` می‌خواهد.**

## تست‌های API
### آماده‌سازی
```bash
docker start sb-test-pg
```
(اگر وجود ندارد، دستور ساختنش در [راه‌اندازی](../01-start/setup.md#۴-دیتابیس-تست) است.)

`vitest.config.ts` محیط تست را تنظیم می‌کند:
- دیتابیس کنترل `sb_control_test`،
- پیشوند دیتابیس سایت‌ها `sb_test_`،
- کلیدهای ثابت و storage در `./var/test-uploads`.

`global-setup.ts` دیتابیس کنترل تست را از نو می‌سازد. هیچ تستی به استودیوی شما دست نمی‌زند.

### helperها (`test/helpers.ts`)
| helper | کار |
|---|---|
| `createTestServer()` | `{ ctx, app, emails, sms }`؛ ایمیل و SMS در حافظه جمع می‌شوند |
| `createAdmin(ctx)` | یک اپراتور |
| `createTenant(ctx, adminId, { modules })` | یک سایت واقعی با دیتابیس خودش و مالکی با رمز `PASSWORD` |
| `signIn(app, email)` | `Client` که cookie نگه می‌دارد و CSRF را خودکار می‌فرستد |
| `uid()` | پسوند یکتا برای slug و ایمیل |
| `product(slug)`، `lead(…)` | ورودی‌های نمونه |

### الگو
```ts
const { ctx, app } = createTestServer();
let owner: Client;
let base: string;

beforeAll(async () => {
  const admin = await createAdmin(ctx);
  const site = await createTenant(ctx, admin.id, { modules: { orders: true } });
  owner = await signIn(app, site.ownerEmail);
  base = `/api/v1/sites/${site.slug}`;
});
afterAll(() => closeContext(ctx));

it('keeps drafts private until published', async () => {
  const created = await owner.post(`${base}/pages`, { slug: 'about', title: { en: 'About', fa: 'درباره' }, document: doc('Draft') });
  expect(created.status).toBe(201);
  expect((await request(app).get(`/api/v1/public/sites/${site.slug}/pages/about`)).status).toBe(404);
});
```
- برای بازدیدکنندهٔ بی‌نام از `request(app)` (supertest) استفاده کنید.
- اعلان‌ها را از `emails.outbox`، `sms.outbox` (کدهای یک‌بارمصرف) و `sms.texts` (پیامک‌های متنی)
  بخوانید (`ConsoleEmailSender` / `ConsoleSmsSender` در `modules/auth/notifications.ts`).
- HTTP بیرونی (درگاه پرداخت) را با جایگزین کردن `ctx.httpFetch` شبیه‌سازی کنید (`payments.test.ts`).
- **حالت cell** (`clientLocked`): در `content.test.ts` یک app با `CELL_SLUG` ساخته می‌شود؛ همان الگو را
  دنبال کنید.
- JSONهای jsonb را **ساختاری** مقایسه کنید (`toEqual`، `toMatchObject`)، نه به‌صورت رشته.

### اجرای یک فایل
```bash
cd apps/api && npx vitest run test/content.test.ts
```
```bash
cd apps/api && npx vitest run test/content.test.ts -t "drafts"
```

## تست‌های وب
`apps/web/src/test/`:

| فایل | چه چیزی |
|---|---|
| `sections.test.tsx` | رندر سکشن‌ها، سکشن نامعتبر |
| `builder.test.ts` | reducer builder (`state.ts`) |
| `admin.test.tsx`، `api-mode.test.tsx`، `site.test.tsx` | پنل و سایت با API ساختگی |
| `calendar.test.ts`، `errorText.test.ts` | کمکی‌ها |
| `renderApp.tsx`، `setup.ts` | راه‌اندازی مشترک |

```bash
npm run test -w apps/web
```

## وقتی یک تست شکست خورد
- `connect ECONNREFUSED 127.0.0.1:5433` ← `docker start sb-test-pg`.
- تستی که قبلاً سبز بود و حالا قرمز است، مسئولیت تغییر شماست؛ تا توضیحش ندهید کار تمام نیست.
- برای debug، `LOG_LEVEL` در `vitest.config.ts` روی `silent` است؛ موقتاً عوضش کنید.

## نتیجهٔ بررسی در ۲۰۲۶-۱۱-۰۶

بررسی تایپ بدون خطا است. API: ۱۰۵ تست موفق از ۱۰۵؛ وب: ۴۸ موفق و ۴ شکست از قبل موجود (۵۲ تست). هر ۹ تست جدید ارسال سفارش موفق‌اند. شکست‌های قبلی شامل فیلتر محصول، ثبت سفارش آزمایشی و دو تست دسترسی پنل هستند.

وضعیت تکمیلی تست‌ها (۲۰۲۶-۱۱-۰۶): آخرین اجرای کامل وب ۵۰ موفق و ۴ خطای قبلی از ۵۴ تست بود.
بعداً دو تست ناوبری و یک تست شمارندهٔ سبد اضافه شدند و اجرای متمرکزشان موفق بود؛ تعداد فعلی
۵۷ است اما کل این مجموعه دوباره اجرا نشده است. آخرین اجرای کامل API برابر ۱۲۳ موفق بود.

نتیجهٔ اجرای ۲۰۲۶-۱۱-۰۷ پس از سازگاری فایرفایتر: اجرای کامل API، ۱۳۳ تست موفق؛ سپس تست
جدید ارتقای بستهٔ قدیمی به‌صورت مستقل موفق شد (اکنون ۱۳۴ تست). وب ۵۳ موفق و همان ۴ خطای
قبلی از ۵۷ تست. migration جدید 015_members_and_reviews.sql است؛ شماره‌های اعمال‌شده عوض نشدند.
