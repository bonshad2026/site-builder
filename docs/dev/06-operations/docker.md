# Docker و اجرای روزانه

> فصل ۶ — عملیات · فایل‌ها: `deploy/docker-compose.yml`، `deploy/studio/api-start.sh`، `apps/api/src/cli.ts`

## کانتینرها و volumeها
| کانتینر | کار |
|---|---|
| `sb-edge` | nginx روی پورت 80 |
| `sb-studio-db` | Postgres استودیو |
| `sb-studio-api` | API (پورت debug: `127.0.0.1:4000`) |
| `sb-studio-web` | وب (پورت debug: `127.0.0.1:5173`) |
| `sb-control` | سرویس deploy (پورت debug: `127.0.0.1:8080`) |

| volume | چه دارد |
|---|---|
| `site-builder_studio-pgdata` | همهٔ دیتابیس‌ها |
| `site-builder_studio-uploads` | فایل‌های آپلودشدهٔ همهٔ سایت‌ها |
| `site-builder_control-data` | اطلاعات deploy هر سایت (کلیدها، حساب‌ها، تاریخچهٔ بسته‌ها) |

> volumeهای قدیمی `sb-platform_*` و `sb-cell-*` پشتیبان‌های باقی‌مانده هستند. **بدون پرسیدن از مالک
> پروژه پاکشان نکنید.**

## دستورات روزانه
روشن کردن یا rebuild همه:
```bash
docker compose -f deploy/docker-compose.yml up -d --build
```
فقط برنامه‌ها، بعد از تغییر کد:
```bash
docker compose -f deploy/docker-compose.yml up -d --build studio-api studio-web
```
لاگ API (ایمیل‌ها، SMSها و کدهای محلی هم اینجا چاپ می‌شوند):
```bash
docker compose -f deploy/docker-compose.yml logs -f studio-api
```
خاموش کردن (داده‌ها می‌مانند):
```bash
docker compose -f deploy/docker-compose.yml down
```
وضعیت:
```bash
docker compose -f deploy/docker-compose.yml ps
```

> `down -v` همهٔ volumeها، یعنی **همهٔ سایت‌ها و فایل‌ها**، را پاک می‌کند. اگر backup ندارید، هرگز اجرایش نکنید.

| تغییر در… | چه چیزی را rebuild کنید |
|---|---|
| `apps/api` یا `packages/shared` | `studio-api` (و `studio-web` اگر shared است) |
| `apps/web` | `studio-web` |
| `deploy/control/server.mjs` | `control` |
| `deploy/edge/nginx.conf` | `docker compose -f deploy/docker-compose.yml restart edge` |
| `deploy/.env` | `up -d` دوباره (کانتینرها با متغیرهای جدید ساخته می‌شوند) |

## CLI API
داخل کانتینر:

تغییر رمز یک کاربر (`--admin` او را اپراتور می‌کند):
```bash
docker exec sb-studio-api node dist/cli.js set-password --email owner --password 123456
```
اجرای دوباره migrationها:
```bash
docker exec sb-studio-api node dist/cli.js migrate
```
ساخت سایت از خط فرمان:
```bash
docker exec sb-studio-api node dist/cli.js provision --slug demo-site --name "Demo" --owner owner@demo.local
```
افزودن starterهای آماده (در هر شروع خودکار اجرا می‌شود):
```bash
docker exec sb-studio-api node dist/cli.js add-sample-starters
```

## دسترسی مستقیم به دیتابیس
```bash
docker exec -it sb-studio-db psql -U sb_admin -d sb_control
```
در psql:
- `\l`: فهرست دیتابیس‌ها (`sb_t_<slug>` برای هر سایت)
- `\c sb_t_cafe_roya`: رفتن به دیتابیس یک سایت
- `\dt`: جدول‌ها

در Git Bash روی ویندوز، برای مسیرهای داخل کانتینر `MSYS_NO_PATHCONV=1` را جلوی دستور بگذارید.

## ابزارهای دیگر
| کار | دستور |
|---|---|
| عکس‌های قالب‌ها ← `var/demo-images` | `deploy/photos/download-photos.ps1` (یا `.sh`) |
| ویدیوهای راهنمای کاربر ← `docs/guide/media` | `node tools/guide-videos/record.mjs` (README همان پوشه) |
| backup کل استودیو | [backup و restore](backup.md) |

## اگر بخواهید…
- مشکلی را حل کنید → [عیب‌یابی](troubleshooting.md)
