import type { AppContext } from '../../context.js';
import { IdpayGateway, SandboxGateway, ZarinpalGateway, ZibalGateway, type PaymentGateway } from './gateways.js';

/**
 * Every payment gateway the system knows. Adding a gateway means writing its class in
 * `gateways.ts` (or its own file) and one entry here: the admin panel builds its settings form
 * from `fields`, the studio catalog lists it, and checkout offers it once a site turns it on.
 */

type Text = { en: string; fa: string };

export interface DriverField {
  /** Key in the gateway's stored credentials. */
  key: string;
  label: Text;
  /** Example or help shown under the field. */
  hint?: Text;
  pattern: RegExp;
  /** Shown when the value does not match `pattern`. */
  invalid: string;
}

/** What a gateway sends back on the return URL, in this system's words. */
export interface CallbackAnswer {
  authority?: string;
  /** OK = the buyer paid (still to be verified server-side); NOK = cancelled or failed. */
  status?: 'OK' | 'NOK';
}

export interface PaymentDriver {
  key: string;
  name: Text;
  fields: DriverField[];
  /**
   * `toggle`: the gateway has a test mode the staff can turn on; `auto`: a test credential
   * (see the hint) makes it a test gateway; `always`: it never moves money.
   */
  testMode: 'toggle' | 'auto' | 'always';
  /** False when this server may not use it (the sandbox in production). */
  available(ctx: AppContext): boolean;
  create(ctx: AppContext, config: { credentials: Record<string, string>; testMode: boolean; siteSlug: string }): PaymentGateway;
  readCallback(answer: Record<string, string | undefined>): CallbackAnswer;
}

const uuidField = (key: string, label: Text, invalid: string): DriverField => ({
  key,
  label,
  hint: { en: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', fa: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
  pattern: /^[0-9a-f-]{36}$/i,
  invalid,
});
const okIf = (paid: boolean | undefined): CallbackAnswer['status'] => (paid === undefined ? undefined : paid ? 'OK' : 'NOK');

export const PAYMENT_DRIVERS: PaymentDriver[] = [
  {
    key: 'zarinpal',
    name: { en: 'Zarinpal', fa: 'زرین‌پال' },
    fields: [uuidField('merchantId', { en: 'Merchant id', fa: 'شناسه‌ی پذیرنده (Merchant ID)' }, 'Enter a valid Zarinpal merchant id (36 characters)')],
    testMode: 'toggle',
    available: () => true,
    create: (ctx, c) => new ZarinpalGateway(c.credentials.merchantId, c.testMode, ctx.httpFetch),
    readCallback: (q) => ({ authority: q.Authority, status: okIf(q.Status === undefined ? undefined : q.Status === 'OK') }),
  },
  {
    key: 'zibal',
    name: { en: 'Zibal', fa: 'زیبال' },
    fields: [
      {
        key: 'merchantId',
        label: { en: 'Merchant code', fa: 'کد پذیرنده (merchant)' },
        hint: { en: '"zibal" is Zibal\'s test merchant (no real money)', fa: '«zibal» پذیرنده‌ی آزمایشی زیبال است (بدون پول واقعی)' },
        pattern: /^[A-Za-z0-9_-]{3,64}$/,
        invalid: 'Enter your Zibal merchant code ("zibal" for testing)',
      },
    ],
    testMode: 'auto',
    available: () => true,
    create: (ctx, c) => new ZibalGateway(c.credentials.merchantId, ctx.httpFetch),
    readCallback: (q) => ({ authority: q.trackId, status: okIf(q.success === undefined ? undefined : q.success === '1') }),
  },
  {
    key: 'idpay',
    name: { en: 'IDPay', fa: 'آیدی‌پی' },
    fields: [uuidField('apiKey', { en: 'API key', fa: 'کلید API' }, 'Enter a valid IDPay API key (36 characters)')],
    testMode: 'toggle',
    available: () => true,
    create: (ctx, c) => new IdpayGateway(c.credentials.apiKey, c.testMode, ctx.httpFetch),
    // Status 10 = paid, waiting for verification.
    readCallback: (q) => ({ authority: q.id, status: okIf(q.status === undefined ? undefined : String(q.status) === '10') }),
  },
  {
    key: 'sandbox',
    name: { en: 'Test gateway (no real money)', fa: 'درگاه آزمایشی (بدون پول واقعی)' },
    fields: [],
    testMode: 'always',
    available: (ctx) => ctx.env.paymentSandboxEnabled,
    create: (ctx, c) => new SandboxGateway((authority) => `${ctx.env.PUBLIC_API_URL}/api/v1/payments/sandbox/${c.siteSlug}/${encodeURIComponent(authority)}`),
    readCallback: (q) => ({ authority: q.Authority, status: okIf(q.Status === undefined ? undefined : q.Status === 'OK') }),
  },
];

export const driverFor = (key: string) => PAYMENT_DRIVERS.find((d) => d.key === key);

/** The first credential that is missing or malformed, as an error message; null when all are fine. */
export function credentialProblem(driver: PaymentDriver, credentials: Record<string, string>): string | null {
  for (const f of driver.fields) if (!f.pattern.test(credentials[f.key] ?? '')) return f.invalid;
  return null;
}

/** A driver as the admin panel needs it (patterns and code stay on the server). */
export const driverView = (d: PaymentDriver, ctx: AppContext) => ({
  key: d.key,
  name: d.name,
  fields: d.fields.map(({ key, label, hint }) => ({ key, label, hint })),
  testMode: d.testMode,
  available: d.available(ctx),
});
