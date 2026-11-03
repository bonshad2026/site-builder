# راهنمای تحویل پروژه (Site Builder)

## این سیستم چیست
- **Studio**: همه‌ی سایت‌های مشتری‌ها فقط این‌جا ساخته می‌شوند → http://admin.localhost
- **پیش‌نمایش هر سایت**: `http://<نام-سایت>.preview.localhost` (مثلاً http://cofe.preview.localhost)
- **تحویل به مشتری**: http://admin.localhost/deploy/ → برای هر سایت یک بسته‌ی نصب (بار اول) یا
  بسته‌ی به‌روزرسانی طراحی ساخته می‌شود و در پوشه‌ی `exports/` قرار می‌گیرد. هر بار فقط یک کار.
- **مشتری** روی سرور خودش فقط محتوا را تغییر می‌دهد: متن و عکس صفحه‌ها، لوگو، تماس، دسته‌بندی،
  محصولات، سفارش‌ها، درخواست‌ها و پرداخت. ساختار صفحه‌ها فقط دست ماست.

## پیش‌نیاز
Docker Desktop (روشن)، Git. برای توسعه‌ی کد: Node.js 20 به بالا.

## راه‌اندازی روی سیستم جدید (با داده‌های فعلی)
1. دریافت کد:
   ```bash
   git clone https://github.com/bonshad2026/site-builder.git
   cd site-builder
   git switch develop
   ```
2. فایل پشتیبان (`studio-backup-….tar.gz`) را که خصوصی دریافت کرده‌اید داخل پوشه‌ی پروژه بگذارید.
3. بازگردانی (ساخت اولیه چند دقیقه طول می‌کشد):
   - ویندوز: `powershell -ExecutionPolicy Bypass -File deploy\backup\studio-restore.ps1 studio-backup-….tar.gz`
   - لینوکس/مک: `deploy/backup/studio-restore.sh studio-backup-….tar.gz`
   - اگر قبلاً Studio داشته‌اید، آخرش `-Replace` (ویندوز) یا `--replace` اضافه کنید؛ داده‌ی قبلی پاک می‌شود.
4. ورود: http://admin.localhost با `admin` / `123456`

## راه‌اندازی خالی (بدون پشتیبان)
```bash
cp deploy/.env.example deploy/.env      # رمزها و کلیدها را پر کنید
docker compose -f deploy/docker-compose.yml up -d --build
```
عکس‌های قالب‌ها: `deploy/photos/download-photos.ps1` (یا `.sh`) → پوشه‌ی `var/demo-images`.
اگر عکس‌ها دانلود نشدند، فایل زیپ عکس‌ها را در `var/demo-images` باز کنید و در Studio دکمه‌ی
«Refresh photos» سایت را بزنید (این دکمه فقط برای سایت‌هایی دیده می‌شود که هنوز عکس جایگزین دارند).

## کارهای روزمره
| کار | کجا / چطور |
|---|---|
| ساخت سایت جدید با قالب کسب‌وکار | Studio → Platform → سایت جدید، انتخاب نوع کسب‌وکار |
| ویرایش صفحه‌ها | Studio → سایت → Pages / Builder |
| درخواست‌های مشاوره/رزرو/دمو | Studio → سایت → Inbox |
| پرداخت درب منزل | Studio → سایت → Settings → Payments |
| ساخت بسته‌ی تحویل | http://admin.localhost/deploy/ |
| نصب روی سرور مشتری | بسته را باز کنید و `install.cmd` (ویندوز) یا `install.sh` (لینوکس) را اجرا کنید؛ پورت‌ها را نشان می‌دهد |
| به‌روزرسانی طراحی مشتری | بسته‌ی update را روی سرور مشتری اجرا کنید (`update.cmd` / `update.sh`). متن و عکس‌هایی که مشتری در صفحه‌ها عوض کرده جایگزین می‌شوند؛ محصولات، سفارش‌ها و تنظیمات برند او می‌مانند |
| پشتیبان‌گیری از کل Studio | `deploy/backup/studio-backup.sh` → پوشه‌ی `backups/` |
| خاموش / روشن | `docker compose -f deploy/docker-compose.yml down` / `up -d` |

## حساب‌ها (فقط برای محیط محلی)
- Studio: `admin` / `123456`
- بسته‌های جدید: مدیر `admin` / `123456`، مشتری `owner` / `123456`
- برای تحویل واقعی در `deploy/.env` رمزهای قوی بگذارید (`SITE_OPERATOR_*`، `SITE_OWNER_*`).

## هرگز در Git نگذارید
`.env`، `deploy/.env`، `exports/`، `backups/`، `var/`، `var.rar` — شامل داده‌ی مشتری و رمزها هستند.
فایل پشتیبان را فقط خصوصی بفرستید.

## کار با Claude یا agentهای دیگر
- لازم نیست چیزی به agent بگویید: Claude Code (از طریق `CLAUDE.md`)، Codex، Cursor، GitHub Copilot و Gemini فایل راهنمای پروژه را خودکار می‌خوانند و همه به `AGENTS.md` می‌رسند.
- `AGENTS.md` بخش «Start here» دارد: agent اول وضعیت کار را در `docs/STATUS.md` می‌خواند (چه انجام شده، چه باز است، قدم بعدی چیست)، بعد برنچ Git را بررسی می‌کند و سند همان بخش را در `docs/features/` می‌خواند.
- اگر فقط بگویید «ادامه بده»، agent اولین مورد بخش «Next» در `docs/STATUS.md` را انجام می‌دهد (و اول در یک خط می‌گوید چه می‌کند).
- در پایان هر کار، agent موظف است `docs/STATUS.md` را به‌روز کند؛ اگر نحوه‌ی کار چیزی عوض شده، `AGENTS.md` یا سند همان بخش را هم.
- حافظه‌ی Claude فقط روی همان سیستم است و به agent دیگر نمی‌رسد؛ برای همین همه‌چیز مهم در همین فایل‌های داخل ریپو نوشته می‌شود.
