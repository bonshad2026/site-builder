# دستورالعمل: تنظیم جدید برای سایت

> فصل ۵ — دستورالعمل‌ها · زمینه: [پکیج shared](../03-layers/shared.md#تنظیمات-سایت-یک-سند-بزرگ)

تنظیمات سایت یک سند jsonb است (`site_settings.settings`). برای افزودن تنظیم **migration لازم نیست**؛
سایت‌های قدیمی پیش‌فرض را از `withSettingDefaults` می‌گیرند.

مثال: نوار «اطلاعیه» (`announcement`)، که در کد وجود دارد و الگوی خوبی است.

## فایل‌ها
| # | فایل | چه چیزی |
|---|---|---|
| 1 | `packages/shared/src/siteOptions.ts` | schema گروه با پیش‌فرض‌ها |
| 2 | `packages/shared/src/schemas.ts` | افزودن به `siteSettingsSchema` **و** `optionSchemas` |
| 3 | `apps/api/src/modules/site/site.routes.ts` | آیا مشتری در cell اجازهٔ تغییرش را دارد؟ |
| 4 | `apps/api/src/modules/public/public.routes.ts` | اگر بخشی خصوصی است، از `GET /settings` عمومی حذفش کنید |
| 5 | `apps/web/src/admin/pages/SiteOptionsTabs.tsx` یا `SettingsPages.tsx` | فرم ویرایش |
| 6 | جایی که اثر دارد (مثلاً `components/layout/`) | استفاده |
| 7 | `deploy/control/server.mjs` (بخش design update) | اگر مال مشتری است و نباید با design update بازنویسی شود |

## ۱. schema
```ts
// packages/shared/src/siteOptions.ts
/** A strip above the header (offers, notices). */
export const announcementSchema = z
  .object({
    enabled: z.boolean().default(false),
    text: loc(300),
    href: z.string().max(500).default(''),
    dismissible: z.boolean().default(true),
  })
  .default({});            // ← کل گروه پیش‌فرض دارد
```

## ۲. ثبت در تنظیمات
```ts
// packages/shared/src/schemas.ts
export const siteSettingsSchema = z.object({
  // …
  announcement: announcementSchema,
});

const optionSchemas = {
  // …
  announcement: announcementSchema,   // ← بدون این، سایت‌های قدیمی مقدار undefined می‌گیرند
};
```
`withSettingDefaults` برای هر کلید `optionSchemas`، اگر مقدار نباشد یا parse نشود، پیش‌فرض می‌گذارد.
API (`GET /sites/:s/settings`، `GET /public/sites/:s/settings`) و وب (`useSiteSettings`) همه از آن
استفاده می‌کنند.

## ۳. چه کسی تغییرش می‌دهد؟
در `site.routes.ts`، `PUT /settings` در cell فقط فهرست مشخصی از کلیدها را از مشتری می‌پذیرد و بقیه را از
تنظیمات فعلی نگه می‌دارد:
```ts
const { name, tagline, logoAssetId, …, announcement, popup } = body;
body = { ...current.rows[0].settings, name, tagline, logoAssetId, …, announcement, popup };
```
- **محتوا** (مشتری عوض می‌کند): کلید را به این فهرست اضافه کنید.
- **طراحی یا ساختار** (فقط اپراتور): کاری نکنید. پیش‌فرض این است که مشتری نمی‌تواند تغییرش دهد.

یک تست در `apps/api/test/content.test.ts` بنویسید که رفتار مشتری را در حالت قفل بررسی کند. نمونهٔ
`settings.texts` آنجا هست.

## ۴. خصوصی است؟
`GET /public/sites/:s/settings` همه‌چیز را به بازدیدکننده می‌دهد، به‌جز `notifications` و `workflow`
فرم‌ها. اگر تنظیم شما رمز، آدرس کارکنان یا هر دادهٔ داخلی دیگری دارد، آن را آنجا حذف کنید.

## ۵. فرم پنل
```tsx
// apps/web/src/admin/pages/SiteOptionsTabs.tsx (الگوی موجود)
const bar = s.announcement;
const upBar = (patch: Partial<typeof bar>) => set('announcement', { ...bar, ...patch });
// … <Checkbox checked={bar.enabled} onChange={(v) => upBar({ enabled: v })} />
```
پنل کل سند تنظیمات را با `PUT /sites/:s/settings` ذخیره می‌کند.

## ۶. استفاده در سایت
```tsx
const { data: settings } = useSiteSettings();
if (settings?.announcement.enabled) { /* … */ }
```

## ۷. در تحویل
design update تنظیمات طراحی را از استودیو می‌برد و فقط چند کلید مشتری (نام، شعار، لوگو، تماس،
`notifications`…) را نگه می‌دارد. اگر تنظیم جدیدتان مال مشتری است، آن را به فهرست `jsonb_build_object`
در بخش design update `server.mjs` اضافه کنید.
