# backup و restore

> فصل ۶ — عملیات · فایل‌ها: `deploy/backup/studio-backup.sh`، `studio-restore.sh`، `studio-restore.ps1`

## backup کل استودیو
استودیو باید روشن باشد:
```bash
deploy/backup/studio-backup.sh
```
خروجی: `backups/studio-backup-<time>.tar.gz` شامل
| بخش | از کجا |
|---|---|
| `studio-db.sql` | `pg_dumpall` از `sb-studio-db`: دیتابیس کنترل و همهٔ سایت‌ها |
| `uploads.tar.gz` | `/data/uploads` در `sb-studio-api` |
| `control-data.tar.gz` | `/data` در `sb-control` (اطلاعات deploy سایت‌ها) |
| `demo-images.tar.gz` | `var/demo-images` |
| `deploy/.env` | رمزها و کلیدها، از جمله `STUDIO_TENANT_SECRETS_KEY` |

> این فایل **دادهٔ مشتری و رمز** دارد. فقط خصوصی منتقلش کنید و هرگز commit نکنید (`backups/` و
> `/*.tar.gz` در `.gitignore` هستند).

## restore
Linux / macOS / Git Bash:
```bash
deploy/backup/studio-restore.sh backups/studio-backup-….tar.gz
```
Windows PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File deploy\backup\studio-restore.ps1 -Backup backups\studio-backup-….tar.gz
```
- اگر روی این سیستم دادهٔ استودیو وجود داشته باشد، restore **رد می‌شود**. برای پاک کردن دادهٔ فعلی و
  جایگزینی، `--replace` (یا `-Replace`) را اضافه کنید.
- بعد از restore استودیو خودش بالا می‌آید و migrationهای جدید را اجرا می‌کند.

## backup سایت مشتری
روی سرور مشتری، اسکریپت‌های داخل بسته: `backup.sh` / `backup.ps1` و `restore.sh` / `restore-db.sh`
(→ `deploy/export/README.md`).

## بعد از کپی داده بین دیتابیس‌ها
اگر داده را دستی از یک دیتابیس به دیگری بردید:
```bash
docker exec -i sb-studio-db psql -U sb_admin -d sb_t_<slug> < deploy/export/fix-sequences.sql
```
وگرنه insert بعدی با id تکراری 409 می‌دهد.
