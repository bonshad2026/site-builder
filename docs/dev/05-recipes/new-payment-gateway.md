# دستورالعمل: درگاه پرداخت جدید

> فصل ۵ — دستورالعمل‌ها · زمینه: [فروشگاه و پرداخت](../04-features/shop-and-payments.md) ·
> فایل‌ها: `apps/api/src/modules/payments/gateways.ts`، `drivers.ts`، `apps/api/test/payments.test.ts`

افزودن درگاه یعنی **یک کلاس** و **یک ردیف driver**. کاتالوگ استودیو، فرم تنظیمات سایت، فهرست
checkout و تراکنش‌ها خودکار آن را برمی‌دارند. migration لازم نیست، چون `payment_gateways` برای هر
`provider` یک ردیف دارد که هنگام نیاز ساخته می‌شود.

## ۱. کلاس gateway
```ts
// apps/api/src/modules/payments/gateways.ts
/**
 * Example Pay REST v1. Amounts are sent in rials (IRR).
 * Written against the provider's published API; tested with mocked HTTP only.
 */
export class ExamplePayGateway implements PaymentGateway {
  readonly name = 'examplepay';
  constructor(private readonly apiKey: string, readonly isTest: boolean, private readonly fetchFn: Fetch = fetch) {}

  async request(req: PaymentRequest) {
    const res = await this.fetchFn('https://api.examplepay.ir/v1/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': this.apiKey },
      body: JSON.stringify({ amount: Number(req.amountMinor), callback: req.callbackUrl, description: req.description, mobile: req.mobile }),
    });
    const json = await res.json();
    if (!res.ok || !json.token) throw new Error(`ExamplePay request failed: ${json.message ?? res.status}`);
    return { authority: json.token, redirectUrl: `https://pay.examplepay.ir/${json.token}` };
  }

  /** Server-to-server confirmation: the only thing that may mark a payment as paid. */
  async verify({ authority, amountMinor }: VerifyArgs): Promise<VerifyResult> {
    const res = await this.fetchFn('https://api.examplepay.ir/v1/verify', { /* … */ });
    const json = await res.json();
    if (json.status !== 'paid' || BigInt(json.amount) !== amountMinor) return { ok: false, reason: json.message ?? 'not paid' };
    return { ok: true, refId: String(json.refId), cardPan: json.card };
  }
}
```
قواعد:
- مبلغ‌ها `bigint` و به واحد کوچک هستند. اگر درگاه تومان می‌خواهد، تبدیل را **داخل کلاس** انجام دهید.
- `verify` باید **مبلغ** را هم بررسی کند.
- `fetchFn` را از constructor بگیرید (`ctx.httpFetch`) تا در تست با پاسخ ساختگی جایگزین شود.
- خطای شبکه را throw کنید؛ لایهٔ بالا آن را به پیام مناسب تبدیل می‌کند.

## ۲. ردیف driver
```ts
// apps/api/src/modules/payments/drivers.ts — داخل PAYMENT_DRIVERS
{
  key: 'examplepay',
  name: { en: 'Example Pay', fa: 'اگزمپل‌پی' },
  fields: [uuidField('apiKey', { en: 'API key', fa: 'کلید API' }, 'Enter a valid Example Pay API key (36 characters)')],
  testMode: 'toggle',                 // یا 'auto' / 'always'
  available: () => true,
  create: (ctx, c) => new ExamplePayGateway(c.credentials.apiKey, c.testMode, ctx.httpFetch),
  readCallback: (a) => ({ authority: a.token, status: okIf(a.status === undefined ? undefined : a.status === 'paid') }),
},
```
- `fields`: هر فیلد `key`، برچسب دوزبانه، `hint` اختیاری، `pattern` و پیام `invalid` دارد. فرم پنل از روی
  همین ساخته می‌شود و `credentialProblem` با همین‌ها اعتبارسنجی می‌کند.
- `readCallback`: پارامترهایی که درگاه به آدرس بازگشت
  (`/api/v1/payments/callback/:slug/:paymentId`، GET یا POST) می‌فرستد را به `authority` و `OK`/`NOK`
  تبدیل می‌کند. این فقط یک نشانه است؛ تصمیم نهایی با `verify` است.

## ۳. تست
در `apps/api/test/payments.test.ts` الگوی درگاه‌های موجود را دنبال کنید: `ctx.httpFetch` را با تابعی
جایگزین کنید که پاسخ‌های request و verify را شبیه‌سازی کند. این موارد را تست کنید:
1. پرداخت موفق: verify با مبلغ درست ← سفارش پرداخت‌شده،
2. لغو (`NOK`) ← ناموفق،
3. مبلغ متفاوت در verify ← ناموفق،
4. اطلاعات اتصال نامعتبر ← `PUT …/gateways/examplepay` با 400 رد شود.

## ۴. بررسی در استودیو
1. rebuild کانتینرها.
2. Platform ← Payment gateways: درگاه جدید در فهرست است.
3. یک سایت ← تنظیمات پرداخت: درگاه را با کلید تست روشن کنید و «Test connection» را بزنید.
4. در سایت پیش‌نمایش یک خرید کنید. فقط با کلید تست؛ هیچ‌وقت با اطلاعات واقعی.

## ۵. مستندات
نام درگاه را به فهرست driverها در [فروشگاه و پرداخت](../04-features/shop-and-payments.md) و
`docs/features/shop.md` اضافه کنید.
