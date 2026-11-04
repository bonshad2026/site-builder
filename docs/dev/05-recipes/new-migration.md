# دستورالعمل: migration جدید

> فصل ۵ — دستورالعمل‌ها · زمینه: [migrationها](../03-layers/migrations.md)، [مدل داده](../03-layers/data-model.md)

## ۱. کدام دیتابیس؟
| داده مال… | پوشه | شمارهٔ بعدی (2026-11-03) |
|---|---|---|
| یک سایت (صفحه، سفارش، مشتری…) | `apps/api/src/database/tenant/migrations/` | `012_…sql` |
| کل استودیو (کاربر، starter، kit…) | `apps/api/src/database/control-plane/migrations/` | `007_…sql` |

پیش از انتخاب شماره، فهرست پوشه را ببینید؛ شاید کس دیگری شماره را گرفته باشد.

## ۲. نوشتن
```sql
-- apps/api/src/database/tenant/migrations/012_notes.sql
-- Internal notes of a site, shown to its staff only.
CREATE TABLE IF NOT EXISTS notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  pinned      boolean NOT NULL DEFAULT false,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_pinned_created ON notes (pinned DESC, created_at DESC);
```
قواعد:
- `BEGIN` و `COMMIT` ننویسید؛ migrator هر فایل را در یک تراکنش اجرا می‌کند.
- **روی دیتابیس پر هم درست کار کند.** ستون `NOT NULL` جدید یا `DEFAULT` می‌خواهد، یا باید در همان فایل
  مقدار ردیف‌های موجود را پر کنید.
- ستون jsonb؟ ساختارش را در `packages/shared` با zod تعریف کنید.
- دادهٔ نمونه دارد؟ ستون `demo boolean NOT NULL DEFAULT false` بدهید و پاک‌کردنش را به
  `deploy/export/drop-demo.sql` و `clearDemoData` (`modules/platform/setup/demo.ts`) اضافه کنید.
- کلید `uuid` به جدول دیتابیس **کنترل** (مثلاً `users.id`) را نمی‌شود `REFERENCES` کرد، چون در دیتابیس
  دیگری است (مثل `created_by` بالا).
- serial یا bigserial دارد؟ کاری لازم نیست؛ `deploy/export/fix-sequences.sql` همهٔ sequenceها را
  خودکار پیدا و درست می‌کند.

## ۳. اجرا
migrationها در شروع API اجرا می‌شوند:
```bash
docker compose -f deploy/docker-compose.yml up -d --build studio-api
```
```bash
docker compose -f deploy/docker-compose.yml logs studio-api
```
تست‌ها هم دیتابیس‌های تازه با همهٔ migrationها می‌سازند:
```bash
npm test
```

## ۴. اگر اشتباه کردید
- **هنوز commit یا اجرا نشده:** فایل را ویرایش کنید.
- **روی استودیوی خودتان اجرا شده:** فایل را ویرایش نکنید، چون خطای checksum می‌گیرید. یک migration
  تازه بنویسید که اشتباه را اصلاح کند.
- **خطای `Migration … was modified after it was applied`:** فایل را به نسخهٔ commitشده برگردانید
  (`git checkout -- <file>`) و اصلاح را در یک فایل جدید بنویسید.

## ۵. مستندات
جدول را به [مدل داده](../03-layers/data-model.md) اضافه کنید و در `AGENTS.md` «latest» migration را
به‌روز کنید.
