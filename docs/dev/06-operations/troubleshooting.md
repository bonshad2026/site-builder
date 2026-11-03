# عیب‌یابی

> فصل ۶ — عملیات

## نصب و build
| نشانه | علت | راه‌حل |
|---|---|---|
| `npm install` یا `docker build` روی `npm ci` می‌ماند یا خطای شبکه می‌دهد | lockfile به یک mirror اشاره می‌کند که در دسترس نیست | در `deploy/.env`: `NPM_REGISTRY=https://registry.npmjs.org/`؛ روی سیستم خودتان `npm install --registry=https://registry.npmjs.org/` |
| `variable is not set` هنگام `compose up` | کلیدی در `deploy/.env` خالی است | `deploy/.env.example` را با `deploy/.env` مقایسه کنید |
| API با `Must be 32 bytes, base64-encoded` بالا نمی‌آید | `STUDIO_TENANT_SECRETS_KEY` قالب درستی ندارد | یک کلید base64 ۳۲ بایتی بسازید ([راه‌اندازی](../01-start/setup.md#۲-ساخت-فایل-تنظیمات)). روی استودیوی پر، کلید را **عوض نکنید** |

## اجرا
| نشانه | علت | راه‌حل |
|---|---|---|
| تغییر کد در مرورگر دیده نمی‌شود | کانتینرها از image ساخته‌شده اجرا می‌شوند | `up -d --build studio-api studio-web`؛ بعد مرورگر را با Ctrl+F5 refresh کنید |
| API بالا نمی‌آید: `Migration … was modified after it was applied` | یک migration اجراشده ویرایش شده | فایل را برگردانید و تغییر را در migration جدید بنویسید ([migrationها](../03-layers/migrations.md)) |
| انتشار صفحه یا افزودن ردیف 409 می‌دهد | sequenceها بعد از کپی داده عقب مانده‌اند | `deploy/export/fix-sequences.sql` ([backup](backup.md)) |
| ورود با `admin` کار نمی‌کند | رمز در هر شروع API از `deploy/.env` تنظیم می‌شود | `CONTROL_ADMIN_*` را ببینید یا `set-password` بزنید ([CLI](docker.md#cli-api)) |
| `403 Missing or invalid CSRF token` | درخواست بدون هدر `X-CSRF-Token` یا با cookie قدیمی | از `api` در `lib/api.ts` استفاده کنید؛ در تست از `signIn()` |
| `403 module_disabled` | ماژول آن بخش برای سایت خاموش است | Settings ← Modules |
| آدرس `/products` در یک سایت 404 است | ماژول products خاموش است (سایت خالی) | ماژول را روشن کنید یا starter فروشگاه را اعمال کنید |
| سایتی که عضوش نیستید 404 می‌دهد | عمدی است؛ API وجود سایت را لو نمی‌دهد | با اپراتور وارد شوید یا عضو اضافه کنید |
| کد SMS یا ایمیل نمی‌رسد (محلی) | در محیط محلی فقط در لاگ چاپ می‌شود | `logs -f studio-api` |
| عکس‌های قالب گرادیانی هستند | Unsplash از Docker در دسترس نیست | `deploy/photos/download-photos.ps1`، بعد «Refresh photos» |

## ویندوز
| نشانه | راه‌حل |
|---|---|
| PowerShell 5.1 خروجی stderr داکر را خطا نشان می‌دهد | عادی است؛ اسکریپت‌ها `ErrorActionPreference=Continue` دارند. به exit code نگاه کنید |
| `tar` در Git Bash با مسیر `C:` خطا می‌دهد | `tar --force-local …` |
| مسیر داخل کانتینر در `docker exec` خراب می‌شود (`/data` ← `C:/Program Files/Git/data`) | `MSYS_NO_PATHCONV=1 docker exec …` |
| یک اسکریپت طولانی در heredoc Git Bash parse نمی‌شود | اسکریپت را در یک فایل بنویسید و آن را اجرا کنید |
| Node.js آدرس `admin.localhost` را resolve نمی‌کند | در اسکریپت‌ها از `http://127.0.0.1:4000` استفاده کنید |

## تست‌ها
| نشانه | راه‌حل |
|---|---|
| `ECONNREFUSED 127.0.0.1:5433` | `docker start sb-test-pg` |
| مقایسهٔ JSON از دیتابیس گاهی شکست می‌خورد | jsonb ترتیب کلیدها را نگه نمی‌دارد؛ ساختاری مقایسه کنید (`toEqual`) |
| تست‌ها خیلی کند هستند | هر فایل تست سایت‌های واقعی می‌سازد؛ با `npx vitest run test/<file>` یک فایل را اجرا کنید |

## جای دیگری برای نگاه کردن
- لاگ API: `docker compose -f deploy/docker-compose.yml logs -f studio-api`
- لاگ کار deploy: خود صفحهٔ http://admin.localhost/deploy/
- ساختار دقیق API: http://admin.localhost/api/v1/openapi.json
- console مرورگر: خطای سکشن‌ها در builder به‌صورت کادر قرمز نشان داده می‌شود
