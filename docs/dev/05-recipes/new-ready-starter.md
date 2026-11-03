# دستورالعمل: starter آماده جدید

> فصل ۵ — دستورالعمل‌ها · زمینه: [starterها](../04-features/starters.md) · فایل: `apps/api/src/modules/starters/samples.ts`

starterهای «آماده» در کد هستند و در هر شروع API به استودیو اضافه می‌شوند. برای starterی که فقط
روی استودیوی خودتان لازم است، کد ننویسید: آن را از یک سایت با «Save as starter» ذخیره کنید.

## ۱. افزودن به `SAMPLES`
```ts
// apps/api/src/modules/starters/samples.ts — داخل SAMPLES
{
  key: 'page-faq-simple',              // یکتا و دائمی؛ هرگز برای starter دیگری استفاده نشود
  kind: 'page',                        // 'page' | 'table' | 'header' | 'footer'
  group: G.about,                      // گروه در فهرست starterها (از شیء G)
  name: 'پرسش‌های پرتکرار / FAQ',
  description: 'Questions and answers with a contact button.',
  page: {
    slug: 'faq',
    title: Lx('FAQ', 'پرسش‌های پرتکرار'),
    sections: [
      header(Lx('Questions', 'پرسش‌ها'), Lx('Short answers to common questions.', 'پاسخ کوتاه به پرسش‌های رایج.')),
      sec('faq', { items: [ /* … */ ] }),
      sec('cta', { heading: Lx('Still unsure?', 'هنوز سؤال دارید؟'), buttons: [btn('Contact us', 'تماس با ما', '/contact')] }),
    ],
  },
},
```
کمکی‌های همین فایل: `Lx(en, fa)` (متن دوزبانه)، `sec(type, props)` (سکشن)، `header(…)`، `btn(…)`،
`photo(PHOTOS.x)`.

گزینه‌های دیگر `Sample`:

| فیلد | کار |
|---|---|
| `pages` | صفحه‌های همراه: `detail` (صفحهٔ آیتم یک جدول، با `detailOf`) یا `linked` |
| `tables` | slug جدول‌هایی از جدول‌های آماده که همراه starter می‌آیند |
| `products` | محصولات نمونه هم بیاید |
| `forms` | request typeهای همراه |
| `site` | برای header و footer: `site.header` یا `site.footer` |

اگر صفحه جای یک صفحهٔ داخلی را می‌گیرد، slug آن را از `SYSTEM_PAGES` بگذارید و در `description` بگویید
(«Use the address …»).

## ۲. اگر سکشن‌ها درست نباشند
همهٔ props با `parseSectionProps` اعتبارسنجی می‌شوند. تست `starters.test.ts` **همهٔ** `SAMPLES` را
روی یک سایت خالی می‌سازد و اعمال می‌کند، پس هر prop اشتباه آنجا پیدا می‌شود:
```bash
cd apps/api && npx vitest run test/starters.test.ts
```

## ۳. به استودیو رسیدن
```bash
docker compose -f deploy/docker-compose.yml up -d --build studio-api
```
`add-sample-starters` فقط `key`هایی را اضافه می‌کند که در `app_settings.starter_samples` نیستند.
- starter جدید اضافه می‌شود.
- **تغییر** یک starter موجود به استودیوهایی که آن را قبلاً گرفته‌اند **نمی‌رسد**. برای عرضهٔ نسخهٔ جدید،
  key تازه بدهید (مثلاً `page-faq-simple-2`) یا در پنل starter قدیمی را با «replace» به‌روز کنید.
- starterی که اپراتور حذف کرده، برنمی‌گردد.

## ۴. kit عمومی
جدول‌های starterهای آماده یک‌بار به kit عمومی اضافه می‌شوند (`seedGeneralKit`). جدول آمادهٔ جدید به
استودیویی که قبلاً seed شده خودکار اضافه نمی‌شود؛ از صفحهٔ Site kits اضافه‌اش کنید.
