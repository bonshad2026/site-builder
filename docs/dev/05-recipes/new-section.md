# دستورالعمل: نوع سکشن جدید

> فصل ۵ — دستورالعمل‌ها · زمینه: [صفحات و سکشن‌ها](../04-features/pages-and-sections.md)

مثال: سکشنی به نام `quote` (یک نقل‌قول با نام گوینده و عکس).

## فایل‌هایی که عوض می‌شوند
| # | فایل | چه چیزی |
|---|---|---|
| 1 | `packages/shared/src/sections.ts` | schema در `sectionDefinitions` |
| 2 | `apps/web/src/sections/renderers.tsx` (یا فایل جدید کنارش) | کامپوننت + ثبت در `sectionRenderers` |
| 3 | `apps/web/src/admin/builder/fields.ts` | `sectionMeta`: نام، توضیح، فیلدها |
| 4 | `apps/web/src/test/sections.test.tsx` | تست رندر |
| 5 | `packages/shared/src/sections.ts` → `STRUCTURE_KEYS` | اگر کلیدی ساختاری است (اختیاری) |

API تغییری لازم ندارد، چون سندهای صفحه را با همین schema اعتبارسنجی می‌کند.

## ۱. schema در shared
```ts
// packages/shared/src/sections.ts — داخل sectionDefinitions
quote: z.object({
  text: loc(600),                  // متن دوزبانه، حداکثر ۶۰۰ نویسه
  author: loc(120),
  photoUrl: imageUrlSchema,        // آدرس تصویر (همان قواعد بقیهٔ سکشن‌ها)
  align: z.enum(['start', 'center']).default('center'),
}),
```
- **هر فیلد پیش‌فرض داشته باشد.** `defaultProps(type)` با `parse({})` سکشن تازه را می‌سازد و سندهای
  قدیمی هم باید بدون خطا parse شوند.
- از کمکی‌های موجود در همین فایل استفاده کنید: `loc(n)`، `eyebrowHeading`، `buttons`، `imageUrlSchema`،
  `hrefSchema`.
- `appearance` (فاصله، پس‌زمینه) را اضافه نکنید؛ برای همهٔ سکشن‌ها خودکار است.
- اگر بعداً شکل یک prop را عوض کردید، تبدیل شکل قدیمی را با `z.preprocess` در همین schema بنویسید.
  (نمونه: `hero` دکمهٔ تکی قدیمی را به `buttons` تبدیل می‌کند.)

## ۲. renderer در وب
```tsx
// apps/web/src/sections/renderers.tsx
function QuoteSection({ props }: { props: SectionProps<'quote'> }) {
  const { l } = usePreferences();            // متن زبان جاری از { en, fa }
  if (!l(props.text)) return null;
  return (
    <Section>
      <Container>
        <blockquote className={cn('text-xl text-ink', props.align === 'center' && 'text-center')}>
          {l(props.text)}
          {l(props.author) && <footer className="mt-4 text-sm text-ink-soft">{l(props.author)}</footer>}
        </blockquote>
      </Container>
    </Section>
  );
}

export const sectionRenderers: Record<SectionType, AnyRenderer> = {
  // …
  quote: QuoteSection,
};
```
- props **قبلاً اعتبارسنجی شده‌اند** و پیش‌فرض‌ها پر شده‌اند. دوباره بررسی نکنید.
- از کلاس‌های token (`text-ink`، `bg-surface`…) استفاده کنید، نه رنگ ثابت.
- برای تصویر از `components/ui/Image.tsx` استفاده کنید.

## ۳. ویرایشگر در builder
```ts
// apps/web/src/admin/builder/fields.ts — داخل sectionMeta
quote: {
  label: L('Quote', 'نقل‌قول'),
  description: L('A short quote with its author', 'یک نقل‌قول کوتاه با نام گوینده'),
  fields: [
    { key: 'text', kind: 'loc', label: L('Quote', 'متن'), multiline: true },
    { key: 'author', kind: 'loc', label: L('Author', 'گوینده') },
    { key: 'photoUrl', kind: 'image', label: L('Photo', 'عکس') },
    { key: 'align', kind: 'select', label: L('Alignment', 'چینش'), options: [
      { value: 'start', label: L('Start', 'ابتدا') },
      { value: 'center', label: L('Center', 'وسط') },
    ] },
  ],
},
```
انواع فیلد (`FieldDef`) در بالای همین فایل فهرست شده‌اند: `loc`، `text`، `href`، `image`، `number`،
`bool`، `select`، `buttons`، `list` (فهرست با زیرفیلدها)، `color`، `source`، `card` و…
`Inspector.tsx` فرم را از روی همین تعریف می‌سازد.

## ۴. محتوای ساختاری یا محتوایی؟
در cell، مشتری فقط متن و تصویر را عوض می‌کند. کلیدهای `STRUCTURE_KEYS` (مثل `layout`، `columns`،
`href`) برای مشتری قفل‌اند. عدد، switch و طول فهرست‌ها هم به‌طور پیش‌فرض قفل‌اند. اگر prop رشته‌ای
جدیدی دارید که طرح را تعیین می‌کند (مثلاً `align` در مثال بالا)، آن را به `STRUCTURE_KEYS` اضافه کنید.

## ۵. تست و بررسی
```tsx
// apps/web/src/test/sections.test.tsx
it('renders a quote', () => {
  wrap(<SectionRenderer section={{ id: 'q', type: 'quote', props: { text: { en: 'Less is more', fa: '' } } }} />);
  expect(screen.getByText('Less is more')).toBeInTheDocument();
});
```
```bash
npm run typecheck
```
```bash
npm test
```
TypeScript اگر renderer یا meta را جا انداخته باشید خطا می‌دهد (`Record<SectionType, …>`).
بعد کانتینرها را rebuild کنید و در builder سکشن را اضافه، ویرایش و منتشر کنید.

## اگر سکشن داده از API می‌خواند
مثل `products` یا `collection-list`: در renderer با یک hook از `features/…/data.ts` داده را بخوانید
(`useQuery` با کلید `['public', site, …]`)، و در `sectionMeta` مقدار `dynamic: true` بگذارید. اگر
route عمومی جدید لازم است → [مسیر API جدید](new-api-route.md).
