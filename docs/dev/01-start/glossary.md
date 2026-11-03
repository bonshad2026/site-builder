# واژه‌نامه

> فصل ۱ — شروع

این واژه‌ها در کد، مستندات و پیام‌ها همان‌طور که اینجا آمده‌اند به کار می‌روند.

## افراد و نقش‌ها
| واژه | معنی | در کد |
|---|---|---|
| **operator** (اپراتور) | سازندهٔ سایت‌ها، یعنی شما. به همهٔ سایت‌ها و ساختارشان دسترسی دارد | `users.is_platform_admin`، `requirePlatformAdmin` |
| **owner** (مالک) | صاحب کسب‌وکار؛ مشتریِ شما | `memberships.role = 'owner'` |
| **staff** (کارمند) | کسی که مالک اضافه کرده، با دسترسی‌های محدود | `memberships.role = 'staff'`، `permissions` |
| **customer** (مشتریِ سایت) | بازدیدکننده‌ای که در خود سایت حساب دارد | جدول `customers` در دیتابیس سایت |
| **client** | در متن‌ها همان owner و staff، یعنی هر کسی جز اپراتور که وارد پنل می‌شود | `isClient(req)` |

## محیط‌ها
| واژه | معنی |
|---|---|
| **studio** (استودیو) | جایی که همهٔ سایت‌ها ساخته می‌شوند: `deploy/docker-compose.yml`، http://admin.localhost |
| **preview** | نمایش زندهٔ یک سایت در استودیو: `http://<slug>.preview.localhost` |
| **deploy service** | صفحهٔ http://admin.localhost/deploy/ که برای هر سایت بستهٔ تحویل می‌سازد (`deploy/control/`) |
| **package** (بسته) | خروجی قابل نصب برای سرور مشتری: **install** (بار اول) یا **design update** |
| **cell** | API روی سرور مشتری که فقط یک سایت دارد. با `CELL_SLUG` شناخته می‌شود |
| **clientLocked** | در cell، مشتری فقط محتوا را تغییر می‌دهد و ساختار سایت قفل است |
| **legacy** | نسخهٔ اول پروژه (`docker-compose.yml` ریشه و مستندات قدیمی) |

## داده
| واژه | معنی | در کد |
|---|---|---|
| **site** = **tenant** | یک سایت مشتری. در کد بیشتر tenant گفته می‌شود | جدول `tenants` |
| **slug** | شناسهٔ متنی (`cafe-roya`). در آدرس‌های API، `:siteId` همان slug است | `slugSchema` |
| **control DB** | دیتابیس مرکزی `sb_control`: کاربران، sessionها، سایت‌ها، عضویت‌ها، starterها، kitها | `ctx.control` |
| **tenant DB** | دیتابیس جدای هر سایت (`sb_t_<slug>`): صفحه‌ها، محصولات، سفارش‌ها… | `req.tenant.db` |
| **site settings** | یک سند JSON بزرگ برای هر سایت: نام، منو، طراحی، ماژول‌ها، فرم‌ها، فروشگاه… | `site_settings.settings`، `siteSettingsSchema` |
| **module** | بخشی از سایت که خاموش و روشن می‌شود: products، orders، services، leads | `settings.modules`، `requireModule` |
| **demo** (دادهٔ نمونه) | ردیف‌های ساختگی با `demo = true` که با هم پاک می‌شوند و در بسته‌ها نمی‌روند | ستون `demo` |

## صفحه‌ها و طراحی
| واژه | معنی | در کد |
|---|---|---|
| **page** | صفحه‌ای که در builder ساخته می‌شود. یک **draft** (پیش‌نویس) و یک **published** (منتشرشده) دارد | جدول `pages` |
| **page version** | نسخهٔ ثبت‌شده در هر بار انتشار؛ قابل بازگردانی | `page_versions` |
| **section** | بلوکی از صفحه (hero، faq، فرم تماس…) با `type` و `props` | `sectionDefinitions` |
| **builder** | ویرایشگر صفحه در پنل | `apps/web/src/admin/builder/` |
| **system page** | صفحهٔ داخلی (فروشگاه، سبد، حساب، 404…) که با slug ثابت قابل ویرایش می‌شود | `SYSTEM_PAGES` |
| **collection** (جدول محتوا) | جدولی که اپراتور تعریف می‌کند (دوره‌ها، اخبار…) و مالک آیتم‌هایش را اضافه می‌کند | `collections`، `collection_items` |
| **card / box design** | طرح باکس هر آیتم در لیست‌ها | `settings.cardDesigns` |
| **header / footer** | سربرگ و پانویس سایت | `settings.header`، `settings.footer` |

## درخواست‌ها و فروش
| واژه | معنی | در کد |
|---|---|---|
| **request** = **lead** | درخواستی که بازدیدکننده با فرم می‌فرستد (مشاوره، رزرو…). در کد قدیمی‌تر lead نام دارد | جدول `leads` |
| **request type** | یک نوع فرم با سؤال‌ها و workflow خودش | `settings.requestTypes` |
| **workflow** | مراحلی که یک درخواست طی می‌کند | `stages` در request type |
| **case events** | خط زمانی یک درخواست یا سفارش: تغییر مرحله، پیام، یادداشت، پرداخت | `case_events` |
| **order** | سفارش فروشگاه | `orders`، `order_items` |
| **gateway / driver** | درگاه پرداخت؛ driver کدی است که یک نوع درگاه را می‌شناسد | `payments/drivers.ts` |
| **minor unit** | مبلغ به کوچک‌ترین واحد پول (برای IRR، ریال) | ستون‌های `*_minor` |

## ابزارهای استودیو
| واژه | معنی | در کد |
|---|---|---|
| **setup** | فرم ساخت سایت جدید که تنظیمات، صفحه‌ها، فرم‌ها و جدول‌ها را می‌سازد | `siteSetupSchema`، `applySetup` |
| **business type / template** | یکی از ۸ نوع کسب‌وکار آماده در setup | `templates/catalog.ts` |
| **starter** | نقطهٔ شروع آماده: صفحه، جدول، header یا footer، قابل اعمال روی هر سایت | جدول `starters`، `starterPackSchema` |
| **pack** | محتوای کامل یک starter: صفحه‌ها، جدول‌ها، فرم‌ها، عکس‌ها، نمونه‌ها | `starters.data` |
| **ready-made starter** | starterهای آمادهٔ خود کد که در هر شروع API اضافه می‌شوند | `starters/samples.ts` |
| **site kit** (= content bank) | دادهٔ نمونه برای هر نوع سایت؛ دادهٔ نمونهٔ سایت‌ها از آن ساخته می‌شود | `bank_types`، `kit_tables`، `bank_entries` |

## اگر بخواهید…
- ببینید این اجزا چطور کنار هم کار می‌کنند → [نمای کلی معماری](../02-architecture/overview.md)
